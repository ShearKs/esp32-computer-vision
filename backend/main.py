import asyncio
import json
import time
import urllib.request
from fastapi import FastAPI, BackgroundTasks, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import uvicorn
from config import settings, NETWORK_PROFILES, ACTIVE_PROFILE, save_active_config, save_profiles, load_profiles, PROFILES_FILE
from core_pipeline import run_detection_session, stream_yolo_frames, get_latest_detections

app = FastAPI()

# ─── Config mutable + persistente ────────────────────────────────────
_current_profile = ACTIVE_PROFILE

# Cargar estado persistido desde active_config.json
import os, json as _json
from config import ACTIVE_CONFIG_FILE
try:
    with open(ACTIVE_CONFIG_FILE) as _f:
        _saved = _json.load(_f)
    _current_esp32_ip = _saved.get("esp32_ip", settings.esp32_ip)
    _current_esp32_port = _saved.get("esp32_port", settings.esp32_stream_port)
    _current_esp32_path = _saved.get("esp32_path", settings.esp32_stream_path)
except (FileNotFoundError, _json.JSONDecodeError):
    _current_esp32_ip = settings.esp32_ip
    _current_esp32_port = settings.esp32_stream_port
    _current_esp32_path = settings.esp32_stream_path

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
    """Verifica si el ESP32/cámara responde.
    
    Intenta varias estrategias porque:
    - ESP32-CAM no tiene /health, solo /, /action, y /stream (puerto 81)
    - IP Webcam tampoco tiene /health
    - Intentamos leer unos bytes del stream real como prueba definitiva
    """
    # Estrategia 1: Intentar la página raíz del ESP32 (puerto 80)
    root_url = f"http://{_current_esp32_ip}/"
    try:
        req = urllib.request.Request(root_url, method='GET')
        with urllib.request.urlopen(req, timeout=3) as resp:
            if resp.status == 200:
                print(f"✅ ESP32 accesible en {root_url}")
                return True
    except Exception:
        pass

    # Estrategia 2: Intentar leer los primeros bytes del stream real
    stream_url = _get_esp32_url()
    try:
        req = urllib.request.Request(stream_url, method='GET')
        with urllib.request.urlopen(req, timeout=4) as resp:
            # Leer solo unos pocos bytes para verificar que responde
            data = resp.read(256)
            if len(data) > 0:
                print(f"✅ Stream accesible en {stream_url} ({len(data)} bytes)")
                return True
    except Exception as e:
        print(f"⚠️ ESP32/Cámara no accesible: {root_url} / {stream_url}: {e}")

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

# ═══════════════════════════════════════════════════════
# CONFIGURACIÓN
# ═══════════════════════════════════════════════════════

@app.get("/api/config")
async def get_config():
    return {
        "esp32_url": _get_esp32_url(),
        "esp32_ip": _current_esp32_ip,
        "stream_port": _current_esp32_port,
        "backend_ip": settings.backend_ip,
        "active_profile": _current_profile
    }

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
    _current_esp32_path = p.get("esp32_stream_path", "/video")
    _persist_active()
    return {"status": "ok", "active_profile": profile, "esp32_url": _get_esp32_url()}

@app.post("/api/config/esp32")
async def set_esp32(ip: str, port: int = 8080, path: str = "/video"):
    """Configura IP manual de cámara. Persiste en disco."""
    global _current_profile, _current_esp32_ip, _current_esp32_port, _current_esp32_path
    _current_profile = "manual"
    _current_esp32_ip = ip
    _current_esp32_port = port
    _current_esp32_path = path
    _persist_active()
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
            print("📹 Stream YOLO finalizado")

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
