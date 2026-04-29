import asyncio
from fastapi import FastAPI, BackgroundTasks, HTTPException  # ← HTTPException añadido
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from config import settings
from core_pipeline import run_detection_session

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

# Almacenamiento temporal en memoria
_recent_detections = []

@app.post("/api/detect")
async def start_detection(
    background_tasks: BackgroundTasks, 
    stream_url: str = None  # ← PARÁMETRO AÑADIDO: opcional desde query string
):
    """
    Ejecuta YOLO en el stream y devuelve detecciones.
    Uso: POST /api/detect?stream_url=http://192.168.x.x:8080/video
    """
    try:
        # Usar URL proporcionada o la de configuración
        url = stream_url or f"http://{settings.esp32_ip}:{settings.esp32_stream_port}{settings.esp32_stream_path}"
        
        # Ejecutar en thread separado para no bloquear FastAPI
        detections = await asyncio.to_thread(
            run_detection_session, 
            url, 
            max_frames=5,
            save_log=True
        )
        
        # Guardar en memoria para el endpoint "recent"
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