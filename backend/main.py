import asyncio
import json
import os
import shutil
import time
import urllib.request
import httpx
import logging
from fastapi import FastAPI, BackgroundTasks, File, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import uvicorn
import websockets
from config import settings, NETWORK_PROFILES, ACTIVE_PROFILE, save_active_config, save_profiles, load_profiles, PROFILES_FILE, get_local_ip
from core_pipeline import run_detection_session, stream_yolo_frames, get_latest_detections, force_release_grabber, switch_model, get_active_model_name

# Reducir logs repetitivos de uvicorn (cada petición /health genera un log)
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

app = FastAPI()

@app.on_event("startup")
async def startup_event():
    ip = get_local_ip()
    print("\n" + "="*50)
    print(" BACKEND DEL ROBOT INICIADO")
    print(f" TU IP ACTUAL: {ip}")
    print(f" EN EL MOVIL (APK): Configura http://{ip}:8000")
    print("="*50 + "\n")

# ─── Config mutable + persistente ────────────────────────────────────
_current_profile = ACTIVE_PROFILE

# Cargar estado persistido desde active_config.json
from config import ACTIVE_CONFIG_FILE
def _auto_path(port: int) -> str:
    """Auto-detecta el path del stream según el puerto.
    Puerto 8080 = IP Webcam (/video), Puerto 81 = ESP32-CAM (/stream)"""
    if port == 8080:
        return "/video"
    return "/stream"

try:
    with open(ACTIVE_CONFIG_FILE) as _f:
        _saved = json.load(_f)
    _current_esp32_ip = _saved.get("esp32_ip", settings.esp32_ip)
    _current_esp32_port = _saved.get("esp32_port", settings.esp32_stream_port)
    # SIEMPRE auto-detectar el path basándose en el puerto para evitar desincronización
    _current_esp32_path = _auto_path(_current_esp32_port)
except (FileNotFoundError, json.JSONDecodeError):
    _current_esp32_ip = settings.esp32_ip
    _current_esp32_port = settings.esp32_stream_port
    _current_esp32_path = _auto_path(settings.esp32_stream_port)

def _persist_active():
    save_active_config({
        "active_profile": _current_profile,
        "esp32_ip": _current_esp32_ip,
        "esp32_port": _current_esp32_port,
        "esp32_path": _current_esp32_path
    })

# Tracking del estado del stream YOLO
_yolo_stream_active = False

# ── Generation counter: se incrementa en cada reconnect() ──
# Todos los streams activos capturan su generación al inicio.
# Si _stream_generation cambio, el stream se auto-termina.
_stream_generation = 0

def _get_esp32_url():
    return f"http://{_current_esp32_ip}:{_current_esp32_port}{_current_esp32_path}"

def _check_esp32_reachable():
    """Verifica rápidamente si el ESP32/cámara responde (timeout 1.5s).
    Solo chequea el puerto del stream — un solo intento, sin fallback."""
    check_url = f"http://{_current_esp32_ip}:{_current_esp32_port}/"
    try:
        req = urllib.request.Request(check_url, method='GET')
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            return resp.status == 200
    except Exception:
        return False

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.get("/api/server-info")
async def server_info():
    """Devuelve la IP real del servidor para que el frontend
    pueda auto-descubrirse sin IPs hardcodeadas."""
    ip = get_local_ip()
    return {
        "server_ip": ip,
        "server_url": f"http://{ip}:8000",
        "active_profile": _current_profile,
        "esp32_url": _get_esp32_url()
    }

# ═══════════════════════════════════════════════════════
# CONFIGURACIÓN
# ═══════════════════════════════════════════════════════

# Muestra la configuración actual, incluyendo el perfil activo y la URL del stream
@app.get("/api/config")
async def get_config():
    return {
        "esp32_url": _get_esp32_url(),
        "esp32_ip": _current_esp32_ip,
        "stream_port": _current_esp32_port,
        "backend_ip": settings.backend_ip,
        "active_profile": _current_profile
    }

# Devuelve la lista de perfiles guardados, con detalles para cada uno. El frontend puede usar esto para mostrar opciones al usuario.
@app.get("/api/profiles")
async def get_profiles():
    profiles = load_profiles()
    return {
        "active_profile": _current_profile,
        "profiles": {
            name: {
                "name": name,
                "backend_ip": p["backend_ip"],
                "esp32_ip": p["esp32_ip"]
            }
            for name, p in profiles.items()
        }
    }

@app.post("/api/config/profile")
async def set_profile(profile: str):
    """Cambia el perfil activo. Persiste en disco."""
    global _current_profile, _current_esp32_ip, _current_esp32_port, _current_esp32_path
    profiles = load_profiles()
    if profile not in profiles:
        raise HTTPException(status_code=400, detail=f"Perfil '{profile}' no existe")
    p = profiles[profile]
    _current_profile = profile
    _current_esp32_ip = p["esp32_ip"]
    _current_esp32_port = p.get("esp32_stream_port", 8080)
    _current_esp32_path = _auto_path(_current_esp32_port)
    _persist_active()
    return {"status": "ok", "active_profile": profile, "esp32_url": _get_esp32_url()}

@app.post("/api/config/esp32")
async def set_esp32(ip: str, port: int = 8080, path: str = "/video"):
    """Configura IP manual de cámara. Persiste en disco.
    El path se auto-detecta según el puerto (8080=/video, 81=/stream)."""
    global _current_profile, _current_esp32_ip, _current_esp32_port, _current_esp32_path
    _current_profile = "manual"
    _current_esp32_ip = ip
    _current_esp32_port = port
    _current_esp32_path = _auto_path(port)  # Siempre auto-detectar
    _persist_active()
    print(f"Camara configurada: {_get_esp32_url()}")
    return {"status": "ok", "esp32_url": _get_esp32_url()}

@app.post("/api/config/profiles/save")
async def save_new_profiles(profiles: str = Query(..., description="JSON string con los perfiles")):
    """Guarda los perfiles completos desde el frontend. Persiste en disco."""
    try:
        new_profiles = json.loads(profiles)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="JSON inválido")
    save_profiles(new_profiles)
    return {"status": "ok", "count": len(new_profiles)}

@app.get("/api/config/profiles/raw")
async def get_raw_profiles():
    """Devuelve el contenido completo de profiles.json."""
    return load_profiles()

# ═══════════════════════════════════════════════════════
# RECONEXIÓN FORZADA
# ═══════════════════════════════════════════════════════

@app.post("/api/reconnect")
async def force_reconnect():
    """Fuerza la reconexión del pipeline completo.
    
    - Mata el FrameGrabber activo (libera la conexión al ESP32)
    - Resetea el flag del stream YOLO activo
    - Re-lee la configuración persistida (por si cambió la IP de cámara)
    - Limpia las detecciones recientes
    
    El frontend debe llamar a esto y luego re-montar los componentes de stream.
    """
    global _yolo_stream_active, _current_esp32_ip, _current_esp32_port, _current_esp32_path
    global _recent_detections, _stream_generation

    # 1. Incrementar generación — TODOS los streams activos se auto-terminan
    _stream_generation += 1
    gen = _stream_generation
    print(f"🔄 Reconnect: generación {gen}, matando streams activos...")

    # 2. Matar el FrameGrabber activo (YOLO)
    await asyncio.to_thread(force_release_grabber)

    # 2b. Cerrar la conexión WS singleton al ESP32 (si existe)
    await _close_esp32_ws()

    # 3. Parar tracking del stream activo
    _yolo_stream_active = False

    # 4. Esperar para que los generadores activos detecten la nueva generación y salgan
    #    El frontend también espera ~500ms adicionales antes de montar el nuevo stream
    await asyncio.sleep(0.5)

    # 5. Re-leer config persistida (por si el usuario cambió la cámara)
    try:
        with open(ACTIVE_CONFIG_FILE) as f:
            saved = json.load(f)
        _current_esp32_ip = saved.get("esp32_ip", _current_esp32_ip)
        _current_esp32_port = saved.get("esp32_port", _current_esp32_port)
        _current_esp32_path = _auto_path(_current_esp32_port)
        print(f"🔄 Reconnect: config recargada → {_get_esp32_url()}")
    except Exception as e:
        print(f"🔄 Reconnect: no se pudo recargar config ({e}), usando actual")

    # 6. Limpiar detecciones
    _recent_detections = []

    # 7. Verificar si la cámara responde (ahora debería estar libre)
    reachable = await asyncio.to_thread(_check_esp32_reachable)

    return {
        "status": "ok",
        "generation": gen,
        "esp32_url": _get_esp32_url(),
        "camera_reachable": reachable,
        "message": "Pipeline reseteado. El próximo stream abrirá una conexión nueva."
    }


# ═══════════════════════════════════════════════════════
# STREAM READY
# ═══════════════════════════════════════════════════════

@app.get("/api/stream-ready")
async def is_stream_ready():
    stream_url = _get_esp32_url()

    # Si el stream YOLO ya está activo, el ESP32 está ocupado sirviendo
    # frames y NO puede responder a /health. Devolver ready=true directamente.
    if _yolo_stream_active:
        return {"ready": True, "stream_url": stream_url}

    # Si no hay stream activo, verificar que el ESP32 responde
    reachable = await asyncio.to_thread(_check_esp32_reachable)

    return {
        "ready": reachable,
        "stream_url": stream_url if reachable else None
    }


# ═══════════════════════════════════════════════════════
# STREAM YOLO
# ═══════════════════════════════════════════════════════

@app.get("/api/stream/yolo")
async def yolo_stream(confidence: float = None):
    global _yolo_stream_active
    stream_url = _get_esp32_url()
    _yolo_stream_active = True
    my_gen = _stream_generation  # Capturar generación actual

    def _tracked_stream():
        global _yolo_stream_active
        try:
            for chunk in stream_yolo_frames(stream_url, confidence):
                # Si la generación cambió, alguien hizo reconnect → salir
                if _stream_generation != my_gen:
                    print(f"Stream YOLO: generación obsoleta ({my_gen} vs {_stream_generation}), saliendo")
                    break
                yield chunk
        finally:
            _yolo_stream_active = False
            print("Stream YOLO finalizado")

    return StreamingResponse(
        _tracked_stream(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


# ═══════════════════════════════════════════════════════
# STREAM RAW (PROXY) — para el frontend sin CORS issues
# ═══════════════════════════════════════════════════════

@app.get("/api/stream/raw")
async def raw_stream_proxy():
    """Proxy del stream de la cámara sin YOLO.
    
    Usa generation counter para auto-terminarse cuando
    reconnect() invalida la generación actual.
    """
    stream_url = _get_esp32_url()
    my_gen = _stream_generation  # Capturar generación actual

    def _proxy_stream():
        response = None
        try:
            req = urllib.request.Request(stream_url)
            response = urllib.request.urlopen(req, timeout=10)
            
            buf = b''
            while _stream_generation == my_gen:
                chunk = response.read(4096)
                if not chunk:
                    break
                buf += chunk

                while True:
                    soi = buf.find(b'\xff\xd8')
                    eoi = buf.find(b'\xff\xd9', soi + 2 if soi >= 0 else 0)
                    if soi < 0 or eoi < 0:
                        break
                    jpeg_data = buf[soi:eoi + 2]
                    buf = buf[eoi + 2:]

                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n'
                           b'Content-Length: ' + str(len(jpeg_data)).encode() + b'\r\n\r\n' +
                           jpeg_data + b'\r\n')

                if len(buf) > 500000:
                    buf = buf[-100000:]

        except Exception as e:
            if _stream_generation == my_gen:
                print(f"Proxy stream error: {e}")
                import cv2
                import numpy as np
                error_frame = np.zeros((480, 640, 3), dtype=np.uint8)
                cv2.putText(error_frame, f"Error: {str(e)[:50]}", (20, 240),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
                _, jpeg = cv2.imencode('.jpg', error_frame)
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
            else:
                print(f"Raw proxy: generación obsoleta ({my_gen} vs {_stream_generation}), saliendo")
        finally:
            if response:
                try:
                    response.close()
                except:
                    pass
            print("Raw proxy stream finalizado")

    return StreamingResponse(
        _proxy_stream(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


@app.get("/api/stream/yolo/events")
async def yolo_events():
    my_gen = _stream_generation  # Auto-terminar si hay reconnect

    async def event_generator():
        last_sent = None
        while _stream_generation == my_gen:
            detections = get_latest_detections()
            current_hash = json.dumps(detections, sort_keys=True)
            if current_hash != last_sent:
                data = json.dumps({
                    "timestamp": round(time.time(), 2),
                    "detections": detections,
                    "count": len(detections)
                })
                yield f"data: {data}\n\n"
                last_sent = current_hash
            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


# ═══════════════════════════════════════════════════════
# DETECCIÓN BAJO DEMANDA
# ═══════════════════════════════════════════════════════

_recent_detections: list = []

@app.post("/api/detect")
async def start_detection(
    background_tasks: BackgroundTasks,
    stream_url: str = None
):
    try:
        url = stream_url or _get_esp32_url()
        detections = await asyncio.to_thread(
            run_detection_session,
            url,
            max_frames=5,
            save_log=True
        )
        global _recent_detections
        _recent_detections = detections
        return {
            "status": "ok",
            "detections": detections,
            "count": len(detections)
        }
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en detección: {str(e)}")

@app.get("/api/detections/recent")
async def get_recent_detections(limit: int = 10):
    global _recent_detections
    return {"detections": _recent_detections[-limit:]}



# ═══════════════════════════════════════════════════════
# PARA ACTIVAR EL FLASH
# ═══════════════════════════════════════════════════════
@app.post("/api/flash")
async def set_flash(state: str = Query(...)):
    """Enciende o apaga el LED flash de la cámara.
    
    Soporta dos modos automáticamente:
    - ESP32-CAM (puerto 81): usa /action?led=on|off en puerto 80
    - IP Webcam (puerto 8080): usa /enabletorch o /disabletorch
    """
    if state not in ("on", "off"):
        raise HTTPException(status_code=400, detail="state debe ser 'on' o 'off'")

    esp32_ip = _current_esp32_ip
    port = _current_esp32_port

    # Detectar qué tipo de cámara es según el puerto del stream
    if port == 8080:
        # No hace falta hacer esto ya que lo que quería era darle al led del ESP-32 pero bueno hecho está y funciona
        # IP Webcam (app Android)
        torch_action = "enabletorch" if state == "on" else "disabletorch"
        flash_url = f"http://{esp32_ip}:{port}/{torch_action}"
    else:
        # ESP32-CAM: el flash está en /action?led= del servidor HTTP (puerto 80)
        flash_url = f"http://{esp32_ip}/action?led={state}"

    last_error = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(flash_url, method='GET')
            with urllib.request.urlopen(req, timeout=5) as resp:
                resp.read()  # Liberar el socket
                if resp.status == 200:
                    mode = "IP Webcam" if port == 8080 else "ESP32-CAM"
                    print(f"Flash {state.upper()} via {mode} (intento {attempt + 1})")
                    return {"status": "ok", "flash": state, "mode": mode}
        except Exception as e:
            last_error = e
            print(f"Flash intento {attempt + 1} falló: {e}")
            await asyncio.sleep(0.5)

    raise HTTPException(
        status_code = 502,
        detail = f"Error comunicando con la cámara tras 3 intentos: {str(last_error)}"
    )

# ═══════════════════════════════════════════════════════
# WIFI DEL ESP32 (proxy al endpoint del firmware)
# ═══════════════════════════════════════════════════════

@app.get("/api/esp32/wifi-status")
async def esp32_wifi_status():
    """Obtiene el estado WiFi actual del ESP32 (SSID, IP, RSSI, modo AP)."""
    url = f"http://{_current_esp32_ip}/wifi-status"
    try:
        req = urllib.request.Request(url, method='GET')
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode())
            return data
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"No se pudo conectar al ESP32: {str(e)}")

@app.post("/api/esp32/wifi")
async def set_esp32_wifi(ssid: str = Query(...), password: str = Query("")):
    """Envía nuevas credenciales WiFi al ESP32. El ESP32 se reiniciará.
    
    Tras el reinicio el ESP32 puede tener una IP diferente.
    Usa /api/esp32/scan para buscarlo en la red.
    """
    import urllib.parse
    encoded_ssid = urllib.parse.quote(ssid, safe='')
    encoded_pass = urllib.parse.quote(password, safe='')
    url = f"http://{_current_esp32_ip}/wifi?ssid={encoded_ssid}&pass={encoded_pass}"
    try:
        req = urllib.request.Request(url, method='GET')
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            return {
                "status": "ok",
                "esp32_response": data,
                "message": f"WiFi del ESP32 cambiado a '{ssid}'. Se reiniciará en ~2s. Usa /api/esp32/scan para encontrarlo."
            }
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error al enviar credenciales: {str(e)}")

@app.post("/api/esp32/wifi-reset")
async def reset_esp32_wifi():
    """Resetea el WiFi del ESP32 a las credenciales hardcodeadas por defecto."""
    url = f"http://{_current_esp32_ip}/wifi-reset"
    try:
        req = urllib.request.Request(url, method='GET')
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            return {
                "status": "ok",
                "esp32_response": data,
                "message": "WiFi del ESP32 reseteado a defaults. Se reiniciará en ~2s."
            }
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error al resetear WiFi: {str(e)}")

@app.post("/api/esp32/scan")
async def scan_for_esp32(subnet: str = Query(None, description="Subred a escanear, ej: 192.168.1")):
    """Escanea la subred buscando el ESP32 (por su endpoint /health).
    
    Útil después de cambiar el WiFi del ESP32, cuando su IP puede haber cambiado.
    Si no se especifica subred, usa la del backend.
    """
    if not subnet:
        # Auto-detectar subred del backend
        local_ip = get_local_ip()
        subnet = ".".join(local_ip.split(".")[:3])
    
    print(f"🔍 Escaneando subred {subnet}.* buscando ESP32...")
    
    found_ip = None
    found_info = None
    
    async def check_ip(host: int):
        ip = f"{subnet}.{host}"
        url = f"http://{ip}/health"
        try:
            req = urllib.request.Request(url, method='GET')
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                data = resp.read().decode()
                if "camera" in data:
                    return ip, data
        except Exception:
            pass
        return None, None
    
    # Escanear en lotes de 30
    for batch_start in range(1, 255, 30):
        batch_end = min(batch_start + 30, 255)
        tasks = []
        for host in range(batch_start, batch_end):
            tasks.append(asyncio.to_thread(check_ip, host))
        results = await asyncio.gather(*tasks)
        for ip, info in results:
            if ip:
                found_ip = ip
                found_info = info
                break
        if found_ip:
            break
    
    if found_ip:
        global _current_esp32_ip
        _current_esp32_ip = found_ip
        _persist_active()
        print(f"ESP32 encontrado en {found_ip}")
        return {
            "status": "found",
            "ip": found_ip,
            "subnet": subnet,
            "esp32_url": _get_esp32_url(),
            "health": found_info
        }
    else:
        print(f"ESP32 no encontrado en {subnet}.*")
        raise HTTPException(
            status_code=404,
            detail=f"ESP32 no encontrado en la subred {subnet}.*. ¿Está encendido y conectado al mismo WiFi?"
        )

# ═══════════════════════════════════════════════════════
# MODELOS YOLO
# ═══════════════════════════════════════════════════════
@app.get("/api/models")
async def list_models():
    """Lista los modelos YOLO disponibles y cuál está activo."""
    models_dir = "models"
    if not os.path.exists(models_dir):
        return {"models": [], "active": get_active_model_name()}
    model_files = [f.replace(".pt", "") for f in os.listdir(models_dir) if f.endswith(".pt")]
    return {"models": model_files, "active": get_active_model_name()}

@app.post("/api/model/switch")
async def switch_yolo_model(model: str = Query(..., description="Nombre del modelo (ej: yolov8n, yolov8s)")):
    """Cambia el modelo YOLO en caliente sin reiniciar el servidor.
    
    1. Para el stream YOLO activo (libera FrameGrabber)
    2. Carga el nuevo modelo en memoria
    3. Actualiza model_profiles.json
    4. El frontend debe reconectar el stream después de llamar a esto.
    """
    global _yolo_stream_active

    # 1. Parar stream activo para liberar recursos
    await asyncio.to_thread(force_release_grabber)
    _yolo_stream_active = False
    await asyncio.sleep(0.3)

    # 2. Cambiar el modelo en core_pipeline (hot-swap)
    result = await asyncio.to_thread(switch_model, model)

    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error", "Error desconocido"))

    return {
        "status": "ok",
        "model": result["model"],
        "imgsz": result["imgsz"],
        "skip_frames": result["skip_frames"],
        "confidence": result["confidence"],
        "message": f"Modelo cambiado a {result['model']}. Reconecta el stream."
    }

# ═══════════════════════════════════════════════════════
# MOVIMIENTO DEL COCHE HTTP
# ═══════════════════════════════════════════════════════

# Cliente HTTP persistente con keep-alive
_motor_client = httpx.AsyncClient(
    timeout=httpx.Timeout(connect=0.5, read=0.5, write=0.3, pool=1.0),
    limits=httpx.Limits(max_connections=4, max_keepalive_connections=4),
)

# Watchdog: auto-stop si no llega comando en 1s
_motor_watchdog_task: asyncio.Task | None = None
_last_motor_dir = "stop"

async def _motor_watchdog():
    """Auto-stop si no llega comando de movimiento en 1s."""
    global _last_motor_dir
    await asyncio.sleep(1.0)
    if _last_motor_dir != "stop":
        try:
            await _motor_client.get(f"http://{_current_esp32_ip}/action?go=stop")
            _last_motor_dir = "stop"
        except Exception:
            pass

ALLOWED_DIRECTIONS = {"forward", "backward", "left", "right", "stop"}

@app.get("/api/move")
async def move_esp32_car(direction: str, speed: int = 255):
    """Frontend → ESP32. Sin dedup — el frontend controla el rate (80ms)."""
    global _last_motor_dir, _motor_watchdog_task

    if direction not in ALLOWED_DIRECTIONS:
        raise HTTPException(400, "Dirección no válida")

    speed = max(0, min(255, speed))
    _last_motor_dir = direction

    # Watchdog: resetear en cada comando de movimiento
    if _motor_watchdog_task and not _motor_watchdog_task.done():
        _motor_watchdog_task.cancel()
    if direction != "stop":
        _motor_watchdog_task = asyncio.create_task(_motor_watchdog())

    # Enviar al ESP32
    esp_url = f"http://{_current_esp32_ip}/action?go={direction}"
    if direction != "stop":
        esp_url += f"&speed={speed}"

    try:
        await _motor_client.get(esp_url)
    except Exception as e:
        if direction == "stop":
            try:
                await _motor_client.get(esp_url)
            except Exception:
                raise HTTPException(503, "ESP32 no responde al stop")

    return {"status": "ok", "command": direction, "speed": speed}


# ═══════════════════════════════════════════════════════
# MOVIMIENTO DEL COCHE - REAL TIME- WEBSOCKETS
# ═══════════════════════════════════════════════════════

# Singleton: una sola conexión WS al ESP32, compartida entre reconexiones del frontend
_esp32_ws_lock = asyncio.Lock()
_esp32_ws_conn = None  # websockets connection object

def _ws_is_open(ws) -> bool:
    """Comprueba si una conexión websockets está abierta.
    Compatible con websockets < 13 (.open) y >= 13 (.state)."""
    if ws is None:
        return False
    # websockets < 13
    if hasattr(ws, 'open'):
        return ws.open
    # websockets >= 13: comprobar el estado del protocolo
    try:
        from websockets.protocol import State
        return ws.protocol.state == State.OPEN
    except Exception:
        return False

async def _get_or_create_esp32_ws() -> "websockets.WebSocketClientProtocol | None":
    """Devuelve la conexión WS al ESP32, creándola si no existe o está cerrada.
    Usa un lock para evitar conexiones duplicadas."""
    global _esp32_ws_conn
    async with _esp32_ws_lock:
        # Si ya hay una conexión abierta, reutilizarla
        if _ws_is_open(_esp32_ws_conn):
            return _esp32_ws_conn
        
        # Cerrar la anterior si quedó en mal estado
        if _esp32_ws_conn is not None:
            try:
                await _esp32_ws_conn.close()
            except Exception:
                pass
            _esp32_ws_conn = None

        # Intentar conectar al ESP32 con timeout corto (3s)
        esp32_ws_url = f"ws://{_current_esp32_ip}/ws"
        try:
            _esp32_ws_conn = await asyncio.wait_for(
                websockets.connect(esp32_ws_url, ping_interval=None, close_timeout=2),
                timeout=3.0
            )
            print(f"✅ Conexión WS al ESP32 establecida ({esp32_ws_url})")
            return _esp32_ws_conn
        except asyncio.TimeoutError:
            print(f"⏱️ Timeout conectando WS al ESP32 ({esp32_ws_url})")
            _esp32_ws_conn = None
            return None
        except Exception as e:
            print(f"❌ Error conectando WS al ESP32: {e}")
            _esp32_ws_conn = None
            return None


async def _close_esp32_ws():
    """Cierra la conexión singleton al ESP32."""
    global _esp32_ws_conn
    async with _esp32_ws_lock:
        if _esp32_ws_conn is not None:
            try:
                await _esp32_ws_conn.close()
            except Exception:
                pass
            _esp32_ws_conn = None


@app.websocket("/ws/motor")
async def motor_websocket_relay(websocket: WebSocket):
    """WebSocket para comandos de movimiento en tiempo real.
    
    El frontend envía texto plano en formato ligero ("L:xxx,R:xxx").
    El backend actúa como proxy directo y lo reenvía al ESP32.
    
    Usa una conexión singleton al ESP32 para evitar que múltiples
    conexiones del frontend (por ej. React StrictMode) compitan.
    """
    await websocket.accept()
    print("Frontend conectado al WebSocket de FastApi")

    # Obtener (o crear) la conexión al ESP32
    esp32_ws = await _get_or_create_esp32_ws()
    if esp32_ws is None:
        # No se pudo conectar al ESP32 — informar al frontend y cerrar
        try:
            await websocket.send_text("ERROR:ESP32_UNREACHABLE")
        except Exception:
            pass
        print("⚠️ No se pudo conectar al ESP32, cerrando WS del frontend")
        await websocket.close(code=1011, reason="ESP32 no alcanzable")
        return

    try:
        while True:
            # Escuchar comandos del frontend: formato "L:200,R:-150"
            data = await websocket.receive_text()

            # Verificar que la conexión al ESP32 sigue viva
            if not _ws_is_open(esp32_ws):
                # Intentar reconectar una vez
                esp32_ws = await _get_or_create_esp32_ws()
                if esp32_ws is None:
                    print("⚠️ ESP32 WS perdido, cerrando relay")
                    break

            try:
                await esp32_ws.send(data)
            except Exception as send_err:
                print(f"⚠️ Error reenviando al ESP32: {send_err}")
                # Invalidar la conexión para que se re-cree en el siguiente intento
                await _close_esp32_ws()
                esp32_ws = await _get_or_create_esp32_ws()
                if esp32_ws is None:
                    break

    except WebSocketDisconnect:
        print("Frontend desconectado del WebSocket de FastApi")
    except Exception as e:
        print(f"WebSocket motor error: {e}")
    finally:
        # Enviar stop de seguridad si el ESP32 sigue conectado
        await safe_stop_esp32()
        print("WebSocket motor relay finalizado")


async def safe_stop_esp32():
    """Envía un comando de parada usando la conexión singleton (si existe)."""
    global _esp32_ws_conn
    try:
        if _ws_is_open(_esp32_ws_conn):
            await _esp32_ws_conn.send("L:0,R:0")
            print("🛑 Parada de seguridad enviada al ESP32")
    except Exception:
        pass  # Si el coche se apagó del todo, no hacemos nada




# ═══════════════════════════════════════════════════════
# PARA HACER FOTOS QUE SERVIRAN PARA GUARDARLAS
# SY HACER NUESTRO PROPIO DATASET
# ═══════════════════════════════════════════════════════

DATASET_DIR = "dataset_captures"
os.makedirs(DATASET_DIR, exist_ok=True)
@app.post("/api/dataset/capture")
async def save_dataset_frame(file: UploadFile = File(...)):
    """Recibe un frame enviado desde el frontend (móvil) 
    y lo guarda en disco para crear un dataset propio para nuestras bainas de YOLO
    """
    try:
        # Generamos en milisegundo un nombre random para evitar que se repitan
        timestamp = int(time.time() * 1000)
        # Nombre que va a tener la imagen en el dataset
        filename = f"esp32_{timestamp}.jpg"
        file_path =  os.path.join(DATASET_DIR, filename)

        # Escribimos el archivo de forma asincrona en el disco
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        print(f"📸 Nueva foto añadida al dataset: {file_path}")
        return {
            "status": "ok", 
            "filename": filename, 
            "message": "Imagen guardada correctamente en el servidor."
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al guardar la foto: {str(e)}")



@app.on_event("shutdown")
async def shutdown_event():
    await _close_esp32_ws()
    await _motor_client.aclose()

