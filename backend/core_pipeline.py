#Dependencias

#OpenCV
import cv2

import time
import json
from datetime import datetime
from ultralytics import YOLO


# URL por la que nos vamos a comunica

# TIENE QUE ESTAR EN LA MISMA RED WIFI QUE EL DISPOSITIVOOO!!!!!

# URL instituto - WIFI_A48_5G
STREAM_URL = "http://192.168.48.86:8080/video"
#STREAM_URL = "http://192.168.1.189:8080/video"

# Modelo de Yolo
model = YOLO("models/yolov8n.pt") 

#Sesión cada vez que se ejecuta el script
session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
log_file = f"logs\session_{session_id}.json"
session_log = []

print(f" Conectando a: {STREAM_URL}")
print(f" Sesión iniciada: {session_id}")

cap = cv2.VideoCapture(STREAM_URL)
if not cap.isOpened():
    print("Error: No se pudo conectar al stream. Revisa la URL y que móvil/PC estén en la misma WiFi.")
    exit()


frame_count = 0
start_time = time.time()

print("Procesando stream... (pulsa Ctrl+C para detener)")

try:
    while True:
        ret, frame = cap.read()
        if not ret:
            print("Frame no recibido, reintentando...")
            time.sleep(0.1)
            continue
        
        # Inferencia YOLO
        results = model(frame, conf = 0.45, verbose = False, device="cpu")
        
        # Registrar detecciones
        for box in results[0].boxes:
            cls_id = int(box.cls)
            conf = float(box.conf)
            name = model.names[cls_id]
            
            session_log.append({
                "timestamp": round(time.time(), 2),
                "object": name,
                "confidence": round(conf, 2)
            })
        
        # Mostrar progreso cada 30 frames
        frame_count += 1
        if frame_count % 30 == 0:
            fps = frame_count / (time.time() - start_time)
            print(f"⏱️ FPS: {fps:.1f} | 🎯 Objetos detectados: {len(session_log)}")
        
        # (Opcional) Ver en pantalla para debug
        # annotated = results[0].plot()
        # cv2.imshow("YOLO Stream", annotated)
        # if cv2.waitKey(1) & 0xFF == ord('q'): break

except KeyboardInterrupt:
    print("\n Sesión detenida")
finally:
    cap.release()
    cv2.destroyAllWindows()
    
    with open(log_file, "w", encoding="utf-8") as f:
        json.dump({"logs\session_id": session_id, "detections": session_log}, f, indent=2)
    print(f"Log guardado en: {log_file}")