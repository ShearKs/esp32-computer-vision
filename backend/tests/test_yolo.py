# backend/test_yolo.py
from ultralytics import YOLO
import time

# 1. Cargar modelos
print("📥 Cargando modelos...")
model_n = YOLO("models/yolov8n.pt")
model_m = YOLO("models/yolov8m.pt")

# Imagen de Prueba
img = "https://ultralytics.com/images/bus.jpg" 

print("\n=== Comparativa de modelos ===")
print(f"Imagen: {img}\n")

# 3. Probar Nano
print("Probando YOLOv8n...")
start = time.time()
results_n = model_n(img)
time_n = time.time() - start

print(f"YOLOv8n:")
print(f"   Tiempo: {time_n:.3f}s")
print(f"   Detecciones: {len(results_n[0].boxes)}")
print(f"   FPS estimado: {1/time_n:.1f}")

# 4. Probar Medium
print("\nProbando YOLOv8m...")
start = time.time()
results_m = model_m(img)
time_m = time.time() - start

print(f"YOLOv8m:")
print(f"   Tiempo: {time_m:.3f}s")
print(f"   Detecciones: {len(results_m[0].boxes)}")
print(f"   FPS estimado: {1/time_m:.1f}")

# 5. Comparativa
print(f"\nRESUMEN:")
print(f"    YOLOv8m detectó {len(results_m[0].boxes) - len(results_n[0].boxes)} objetos más que el Nano.")
print(f"    YOLOv8m tardó {(time_m/time_n):.2f}x más de tiempo.")
print(f"\n Conclusión: Si la diferencia de tiempo es aceptable (<0.5s), usa YOLOv8m para mejor precisión.")