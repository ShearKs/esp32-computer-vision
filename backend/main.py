import asyncio
import json
import time
import urllib.request
from fastapi import FastAPI, BackgroundTasks, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import uvicorn
from config import settings, NETWORK_PROFILES, ACTIVE_PROFILE, save_active_config, save_profiles, load_profiles, PROFILES_FILE, get_local_ip
from core_pipeline import run_detection_session, stream_yolo_frames, get_latest_detections, force_release_grabber

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
import os, json as _json
from config import ACTIVE_CONFIG_FILE
def _auto_path(port: int) -> str:
    """Auto-detecta el path del stream según el puerto.
    Puerto 8080 = IP Webcam (/video), Puerto 81 = ESP32-CAM (/stream)"""
    if port == 8080:
        return "/video"
    return "/stream"

try:
    with open(ACTIVE_CONFIG_FILE) as _f:
        _saved = _json.load(_f)
    _current_esp32_ip = _saved.get("esp32_ip", settings.esp32_ip)
    _current_esp32_port = _saved.get("esp32_port", settings.esp32_stream_port)
    # SIEMPRE auto-detectar el path basándose en el puerto para evitar desincronización
    _current_esp32_path = _auto_path(_current_esp32_port)
except (FileNotFoundError, _json.JSONDecodeError):
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

def _get_esp32_url():
    return f"http://{_current_esp32_ip}:{_current_esp32_port}{_current_esp32_path}"

def _check_esp32_reachable():
    """Verifica rápidamente si el ESP32/cámara responde (timeout 2s)."""
    # Intentar la raíz del puerto de stream — funciona con ESP32-CAM y IP Webcam
    check_url = f"http://{_current_esp32_ip}:{_current_esp32_port}/"
    try:
        req = urllib.request.Request(check_url, method='GET')
        with urllib.request.urlopen(req, timeout=2) as resp:
            if resp.status == 200:
                return True
    except Exception:
        pass

    # Fallback: intentar raíz en puerto 80 (ESP32-CAM servidor web)
    if _current_esp32_port != 80:
        try:
            req = urllib.request.Request(f"http://{_current_esp32_ip}/", method='GET')
            with urllib.request.urlopen(req, timeout=2) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            pass

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
    global _recent_detections

    # 1. Matar el FrameGrabber activo (libera el socket del ESP32)
    await asyncio.to_thread(force_release_grabber)

    # 2. Parar tracking del stream activo
    _yolo_stream_active = False

    # 3. Esperar a que el ESP32 libere su socket de stream
    await asyncio.sleep(0.5)

    # 4. Re-leer config persistida (por si el usuario cambió la cámara)
    try:
        with open(ACTIVE_CONFIG_FILE) as f:
            saved = _json.load(f)
        _current_esp32_ip = saved.get("esp32_ip", _current_esp32_ip)
        _current_esp32_port = saved.get("esp32_port", _current_esp32_port)
        _current_esp32_path = _auto_path(_current_esp32_port)
        print(f"🔄 Reconnect: config recargada → {_get_esp32_url()}")
    except Exception as e:
        print(f"🔄 Reconnect: no se pudo recargar config ({e}), usando actual")

    # 5. Limpiar detecciones
    _recent_detections = []

    # 6. Verificar si la cámara responde (ahora debería estar libre)
    reachable = await asyncio.to_thread(_check_esp32_reachable)

    return {
        "status": "ok",
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

    # Wrapper para marcar cuando el stream termina
    def _tracked_stream():
        global _yolo_stream_active
        try:
            yield from stream_yolo_frames(stream_url, confidence)
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
    """Proxy del stream de la cámara (ESP32 o IP Webcam) sin procesamiento YOLO.
    
    Esto resuelve el problema de CORS: el frontend solo habla con el backend,
    y el backend se conecta a la cámara. Funciona tanto en navegador como en
    Android nativo.
    """
    stream_url = _get_esp32_url()

    def _proxy_stream():
        try:
            import urllib.request
            req = urllib.request.Request(stream_url)
            response = urllib.request.urlopen(req, timeout=10)
            
            buf = b''
            while True:
                chunk = response.read(4096)
                if not chunk:
                    break
                buf += chunk

                # Buscar frames JPEG completos
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

                # Evitar que el buffer crezca sin límite
                if len(buf) > 500000:
                    buf = buf[-100000:]

        except Exception as e:
            print(f"⚠️ Proxy stream error: {e}")
            # Enviar un frame de error
            import cv2
            import numpy as np
            error_frame = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(error_frame, f"Error: {str(e)[:50]}", (20, 240),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
            _, jpeg = cv2.imencode('.jpg', error_frame)
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')

    return StreamingResponse(
        _proxy_stream(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


@app.get("/api/stream/yolo/events")
async def yolo_events():
    async def event_generator():
        last_sent = None
        while True:
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
            await asyncio.sleep(0.3)

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

_recent_detections = []

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
        status_code=502,
        detail=f"Error comunicando con la cámara tras 3 intentos: {str(last_error)}"
    )
