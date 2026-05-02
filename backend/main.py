import asyncio
import json
import time
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import uvicorn
from config import settings
from core_pipeline import run_detection_session, stream_yolo_frames, get_latest_detections

app = FastAPI()

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

@app.get("/api/config")
async def get_config():
    """Devuelve la configuración para que el frontend sepa dónde está el stream."""
    return {
        "esp32_url": f"http://{settings.esp32_ip}:{settings.esp32_stream_port}{settings.esp32_stream_path}",
        "esp32_ip": settings.esp32_ip,
        "stream_port": settings.esp32_stream_port
    }

@app.get("/api/stream-ready")
async def is_stream_ready():
    """Verifica que el backend puede conectarse al stream del ESP32. Devuelve la URL solo si la cámara responde."""
    import cv2
    from config import settings
    
    stream_url = f"http://{settings.esp32_ip}:{settings.esp32_stream_port}{settings.esp32_stream_path}"
    
    def _check_stream():
        """Intenta abrir el stream en un thread separado."""
        cap = cv2.VideoCapture(stream_url)
        ready = cap.isOpened()
        if ready:
            ret, _ = cap.read()  # Verificar que realmente llega un frame
            ready = ret
        cap.release()
        return ready

    try:
        # Timeout REAL de 3 segundos (asyncio cancela si tarda más)
        ready = await asyncio.wait_for(
            asyncio.to_thread(_check_stream), 
            timeout=3.0
        )
    except (asyncio.TimeoutError, Exception):
        ready = False
    
    return {
        "ready": ready,
        "stream_url": stream_url if ready else None
    }


# ═══════════════════════════════════════════════════════
# STREAM YOLO EN TIEMPO REAL
# ═══════════════════════════════════════════════════════

@app.get("/api/stream/yolo")
async def yolo_stream(confidence: float = None):
    """
    Stream MJPEG procesado con YOLO: cada frame tiene bounding boxes dibujados.
    Uso: <img src="http://localhost:8000/api/stream/yolo" />
    Parámetro opcional: ?confidence=0.5
    """
    stream_url = f"http://{settings.esp32_ip}:{settings.esp32_stream_port}{settings.esp32_stream_path}"
    
    return StreamingResponse(
        stream_yolo_frames(stream_url, confidence),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


@app.get("/api/stream/yolo/events")
async def yolo_events():
    """
    SSE (Server-Sent Events): envía detecciones YOLO en tiempo real como JSON.
    El frontend lo consume con EventSource.
    """
    async def event_generator():
        last_sent = None
        while True:
            detections = get_latest_detections()
            
            # Solo enviar si hay cambios
            current_hash = json.dumps(detections, sort_keys=True)
            if current_hash != last_sent:
                data = json.dumps({
                    "timestamp": round(time.time(), 2),
                    "detections": detections,
                    "count": len(detections)
                })
                yield f"data: {data}\n\n"
                last_sent = current_hash
            
            await asyncio.sleep(0.3)  # ~3 actualizaciones/segundo
    
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
# DETECCIÓN BAJO DEMANDA (existente)
# ═══════════════════════════════════════════════════════

# Almacenamiento temporal en memoria
_recent_detections = []

@app.post("/api/detect")
async def start_detection(
    background_tasks: BackgroundTasks, 
    stream_url: str = None
):
    """
    Ejecuta YOLO en el stream y devuelve detecciones.
    Uso: POST /api/detect?stream_url=http://192.168.x.x:8080/video
    """
    try:
        url = stream_url or f"http://{settings.esp32_ip}:{settings.esp32_stream_port}{settings.esp32_stream_path}"
        
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
    """Devuelve las últimas detecciones SIN procesar nuevo vídeo"""
    global _recent_detections
    return {"detections": _recent_detections[-limit:]}