# backend/core_pipeline.py
import cv2
import time
import json
import os
import threading
import numpy as np
from datetime import datetime
import torch
from ultralytics import YOLO

# ─── Auto-detectar GPU ───
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
USE_HALF = DEVICE == "cuda"  # FP16 solo en GPU
print(f"Dispositivo YOLO: {DEVICE}" + (f" ({torch.cuda.get_device_name(0)})" if DEVICE == "cuda" else ""))

# ═══════════════════════════════════════════════════════
# PERFILES DE OPTIMIZACIÓN POR MODELO
# Configuración en model_profiles.json
# ═══════════════════════════════════════════════════════

_PROFILES_PATH = os.path.join(os.path.dirname(__file__), "model_profiles.json")

# Defaults por si el JSON no existe o le falta algo
_DEFAULTS = {
    "imgsz": 320, "skip_frames": 3, "confidence": 0.45,
    "jpeg_quality": 50, "mjpeg_width": 480
}

try:
    with open(_PROFILES_PATH, "r", encoding="utf-8") as f:
        _config = json.load(f)
    MODEL_NAME = _config.get("active_model", "yolov8s")
    _profiles = _config.get("profiles", {})
    PROFILE = _profiles.get(MODEL_NAME, _DEFAULTS)
except (FileNotFoundError, json.JSONDecodeError) as e:
    print(f"⚠️ No se pudo leer model_profiles.json ({e}), usando defaults")
    MODEL_NAME = "yolov8s"
    PROFILE = _DEFAULTS

# Aplicar configuración del perfil
YOLO_IMGSZ = PROFILE.get("imgsz", _DEFAULTS["imgsz"])
YOLO_EVERY_N_FRAMES = PROFILE.get("skip_frames", _DEFAULTS["skip_frames"])
CONFIDENCE_THRESHOLD = PROFILE.get("confidence", _DEFAULTS["confidence"])
JPEG_QUALITY = PROFILE.get("jpeg_quality", _DEFAULTS["jpeg_quality"])
MJPEG_MAX_WIDTH = PROFILE.get("mjpeg_width", _DEFAULTS["mjpeg_width"])

# Cargar modelo
MODEL = YOLO(f"models/{MODEL_NAME}.pt")
# NOTA: NO llamar a MODEL.model.half() manualmente.
# El parámetro half=USE_HALF en predict() se encarga de FP16
# sin conflictos con la operación interna fuse() de ultralytics.
if USE_HALF:
    print("FP16 activado (se aplicará en inferencia via half=True)")

print(f"Modelo: {MODEL_NAME} | imgsz={YOLO_IMGSZ} | skip={YOLO_EVERY_N_FRAMES} "
      f"| conf={CONFIDENCE_THRESHOLD} | jpeg_q={JPEG_QUALITY} | mjpeg_w={MJPEG_MAX_WIDTH}")

# ─── Estado compartido para SSE ───
_latest_detections = []
_detections_lock = threading.Lock()

def get_latest_detections():
    """Devuelve las últimas detecciones del stream YOLO (thread-safe)."""
    with _detections_lock:
        return list(_latest_detections)

# ─── Colores por categoría de objeto ───
CATEGORY_COLORS = {
    "person":     (0, 255, 100),   # Verde
    "car":        (255, 150, 0),   # Naranja
    "truck":      (255, 150, 0),
    "bus":        (255, 150, 0),
    "motorcycle": (255, 150, 0),
    "bicycle":    (200, 200, 0),   # Amarillo
    "dog":        (0, 180, 255),   # Cyan
    "cat":        (0, 180, 255),
    "bird":       (0, 180, 255),
    "cell phone": (255, 0, 150),   # Rosa
    "laptop":     (255, 0, 150),
    "tv":         (255, 0, 150),
    "bottle":     (100, 100, 255), # Azul claro
    "cup":        (100, 100, 255),
    "chair":      (180, 130, 70),  # Marrón
    "couch":      (180, 130, 70),
    "book":       (200, 200, 200), # Gris
}
DEFAULT_COLOR = (0, 200, 255)  # Amarillo por defecto

def process_frame(frame):
    """Procesa UN frame y devuelve lista de detecciones"""
    results = MODEL(frame, conf=CONFIDENCE_THRESHOLD, verbose=False, device=DEVICE,
                     imgsz=YOLO_IMGSZ, half=USE_HALF)
    
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
    
    # Timeouts para evitar bloqueos infinitos
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
                print("Frame no recibido, reintentando...")
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
        print(f"Log guardado en: {log_file}")
    
    # Devolver solo las últimas 10 detecciones para no saturar la API
    return session_log[-10:] if len(session_log) > 10 else session_log


# ═══════════════════════════════════════════════════════
# FRAME GRABBER: lee MJPEG via HTTP (urllib) en vez de
# cv2.VideoCapture que se cuelga con el ESP32-CAM
# ═══════════════════════════════════════════════════════

class FrameGrabber:
    """
    Lee frames MJPEG via HTTP en un hilo separado.
    Usa urllib en vez de cv2.VideoCapture porque este último
    se cuelga indefinidamente con streams ESP32-CAM.
    """
    def __init__(self, stream_url: str, timeout: int = 10):
        self.stream_url = stream_url
        self.timeout = timeout
        self._frame = None
        self._ret = False
        self._lock = threading.Lock()
        self._running = False
        self._thread = None
        self._opened = False
        self._response = None

        # Intentar abrir la conexión HTTP
        try:
            import urllib.request
            req = urllib.request.Request(stream_url)
            self._response = urllib.request.urlopen(req, timeout=timeout)
            self._opened = True
            print(f"✅ FrameGrabber conectado a {stream_url}")
        except Exception as e:
            print(f"❌ FrameGrabber no pudo conectar a {stream_url}: {e}")
            self._opened = False

    @property
    def is_opened(self):
        return self._opened

    def start(self):
        if not self._opened:
            return self
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        return self

    def _loop(self):
        """Lee el stream MJPEG y decodifica cada frame JPEG."""
        buf = b''
        while self._running and self._response:
            try:
                chunk = self._response.read(4096)
                if not chunk:
                    print("⚠️ FrameGrabber: stream cerrado por el servidor")
                    break
                buf += chunk

                # Buscar frames JPEG completos (SOI=FFD8, EOI=FFD9)
                while True:
                    soi = buf.find(b'\xff\xd8')  # Start of JPEG
                    eoi = buf.find(b'\xff\xd9', soi + 2 if soi >= 0 else 0)  # End of JPEG
                    if soi < 0 or eoi < 0:
                        break
                    # Extraer el JPEG completo
                    jpeg_data = buf[soi:eoi + 2]
                    buf = buf[eoi + 2:]

                    # Decodificar con OpenCV
                    frame = cv2.imdecode(
                        np.frombuffer(jpeg_data, dtype=np.uint8),
                        cv2.IMREAD_COLOR
                    )
                    if frame is not None:
                        with self._lock:
                            self._ret = True
                            self._frame = frame

                # Evitar que el buffer crezca sin límite
                if len(buf) > 500000:
                    buf = buf[-100000:]

            except Exception as e:
                print(f"⚠️ FrameGrabber error: {e}")
                break

        self._running = False

    def read(self):
        """Devuelve siempre el frame MÁS RECIENTE."""
        with self._lock:
            if self._frame is not None:
                return self._ret, self._frame.copy()
            return False, None

    def release(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=2)
        if self._response:
            try:
                self._response.close()
            except:
                pass





def _draw_cached_boxes(frame, cached_detections):
    """Dibuja bounding boxes cacheados sobre un frame sin ejecutar YOLO."""
    for det in cached_detections:
        x1, y1, x2, y2 = det["bbox"]
        name = det["object"]
        conf = det["confidence"]
        color = CATEGORY_COLORS.get(name, DEFAULT_COLOR)
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        label = f"{name} {conf:.0%}"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 1)
        cv2.rectangle(frame, (x1, y1 - th - 10), (x1 + tw + 6, y1), color, -1)
        cv2.putText(frame, label, (x1 + 3, y1 - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
    return frame


def process_frame_visual(frame, conf_threshold=None):
    """
    Procesa UN frame con YOLO y DIBUJA bounding boxes sobre el frame.
    Devuelve: (frame_anotado, detections_list)
    """
    threshold = conf_threshold or CONFIDENCE_THRESHOLD
    results = MODEL(frame, conf=threshold, verbose=False, device=DEVICE,
                     imgsz=YOLO_IMGSZ, half=USE_HALF)

    detections = []
    for box in results[0].boxes:
        cls_id = int(box.cls)
        conf = float(box.conf)
        name = MODEL.names[cls_id]
        x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())

        color = CATEGORY_COLORS.get(name, DEFAULT_COLOR)
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        label = f"{name} {conf:.0%}"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 1)
        cv2.rectangle(frame, (x1, y1 - th - 10), (x1 + tw + 6, y1), color, -1)
        cv2.putText(frame, label, (x1 + 3, y1 - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)

        detections.append({
            "timestamp": round(time.time(), 2),
            "object": name,
            "confidence": round(conf, 2),
            "bbox": [x1, y1, x2, y2]
        })

    return frame, detections


def stream_yolo_frames(stream_url: str, confidence: float = None):
    """
    Generador MJPEG optimizado:
    - Hilo dedicado para lectura (siempre frame más reciente)
    - YOLO solo cada N frames (los intermedios reusan boxes cacheados)
    - Resolución reducida para inferencia
    """
    global _latest_detections

    conf_threshold = confidence if confidence is not None else CONFIDENCE_THRESHOLD

    grabber = FrameGrabber(stream_url)
    if not grabber.is_opened:
        error_frame = _create_error_frame("No se pudo conectar al ESP32")
        _, jpeg = cv2.imencode('.jpg', error_frame)
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
        grabber.release()
        return

    grabber.start()
    # Esperar al primer frame
    time.sleep(0.3)

    fps_time = time.time()
    frame_count = 0
    total_frames = 0
    cached_detections = []
    consecutive_fails = 0

    try:
        while True:
            ret, frame = grabber.read()
            if not ret:
                consecutive_fails += 1
                if consecutive_fails > 100:  # ~2s sin frames
                    print("Demasiados fallos, cerrando stream...")
                    # Enviar frame de "desconectado" para que el frontend lo vea
                    disconnect_frame = _create_error_frame("Camara desconectada - reconectando...")
                    _, jpeg = cv2.imencode('.jpg', disconnect_frame)
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
                    break
                time.sleep(0.02)
                continue

            consecutive_fails = 0
            total_frames += 1

            # ── Ejecutar YOLO solo cada N frames ──
            if total_frames % YOLO_EVERY_N_FRAMES == 0:
                annotated, detections = process_frame_visual(frame, conf_threshold)
                cached_detections = detections
                with _detections_lock:
                    _latest_detections = detections
            else:
                # Reusar boxes cacheados (muy rápido, solo dibujo)
                annotated = _draw_cached_boxes(frame, cached_detections)

            # ── FPS ──
            frame_count += 1
            elapsed = time.time() - fps_time
            if elapsed > 0:
                fps = frame_count / elapsed
                cv2.putText(annotated, f"FPS: {fps:.1f}", (10, 30),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
            if elapsed > 2:
                fps_time = time.time()
                frame_count = 0

            # ── Redimensionar + Encode JPEG ──
            h, w = annotated.shape[:2]
            if w > MJPEG_MAX_WIDTH:
                scale = MJPEG_MAX_WIDTH / w
                annotated = cv2.resize(annotated, (MJPEG_MAX_WIDTH, int(h * scale)),
                                       interpolation=cv2.INTER_AREA)
            _, jpeg = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')

    finally:
        grabber.release()


def _create_error_frame(message: str):
    """Crea un frame negro con un mensaje de error centrado."""
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    cv2.putText(frame, message, (50, 240),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
    return frame