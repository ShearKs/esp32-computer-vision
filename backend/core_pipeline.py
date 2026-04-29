# backend/core_pipeline.py
import cv2
import time
import json
import os
from datetime import datetime
from ultralytics import YOLO

# Cargar modelo UNA sola vez (global, no en cada llamada)
# Constantes
MODEL = YOLO("models/yolov8n.pt")
CONFIDENCE_THRESHOLD = 0.45

def process_frame(frame):
    """Procesa UN frame y devuelve lista de detecciones"""
    results = MODEL(frame, conf=CONFIDENCE_THRESHOLD, verbose=False, device="cpu")
    
    detections = []
    for box in results[0].boxes:
        cls_id = int(box.cls)
        conf = float(box.conf)
        name = MODEL.names[cls_id]
        
        # Opcional: extraer bbox si quieres dibujar en frontend
        x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
        
        detections.append({
            "timestamp": round(time.time(), 2),
            "object": name,
            "confidence": round(conf, 2),
            "bbox": [x1, y1, x2, y2]  # ← Útil para overlay en la app
        })
    
    return detections


def run_detection_session(stream_url: str, max_frames: int = 5, save_log: bool = False):
    """
    Ejecuta detección en N frames del stream.
    - stream_url: URL del vídeo (IP Webcam o ESP32)
    - max_frames: cuántos frames procesar (3-5 es suficiente para demo)
    - save_log: si True, guarda en logs/ como tu script original
    """
    cap = cv2.VideoCapture(stream_url)
    
    # ⚠️ Timeouts para evitar bloqueos infinitos
    cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000)
    cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 3000)
    
    if not cap.isOpened():
        raise ConnectionError(f"No se pudo conectar a {stream_url}")
    
    session_log = []
    frame_count = 0
    
    try:
        while frame_count < max_frames:
            ret, frame = cap.read()
            if not ret:
                print("⚠️ Frame no recibido, reintentando...")
                time.sleep(0.1)
                continue
            
            detections = process_frame(frame)
            session_log.extend(detections)
            
            frame_count += 1
            cv2.waitKey(1)  # ← Importante para que OpenCV no se bloquee
            
    finally:
        cap.release()
        cv2.destroyAllWindows()
    
    # Guardar log (opcional)
    if save_log and session_log:
        session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        os.makedirs("logs", exist_ok = True)
        log_file = f"logs/session_{session_id}.json"
        
        with open(log_file, "w", encoding="utf-8") as f:
            json.dump({
                "session_id": session_id,
                "stream_url": stream_url,
                "detections": session_log
            }, f, indent=2, ensure_ascii=False)
        print(f"✅ Log guardado en: {log_file}")
    
    # Devolver solo las últimas 10 detecciones para no saturar la API
    return session_log[-10:] if len(session_log) > 10 else session_log