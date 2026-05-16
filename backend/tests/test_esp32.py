"""Test rápido: ¿puede conectar al stream del ESP32-CAM?

IMPORTANTE: El ESP32-CAM usa:
  - Puerto 80: página web + /action + /health
  - Puerto 81: /stream (MJPEG)

IP Webcam (app Android) usa:
  - Puerto 8080: /video (MJPEG)
"""
import cv2
import time
import sys
import json
import os
import urllib.request

# Cargar IP desde active_config.json
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
try:
    with open(os.path.join(DATA_DIR, "active_config.json")) as f:
        cfg = json.load(f)
    ESP32_IP = cfg.get("esp32_ip", "192.168.1.132")
    ESP32_PORT = cfg.get("esp32_port", 81)
    ESP32_PATH = cfg.get("esp32_path", "/stream")
except:
    ESP32_IP = "192.168.1.132"
    ESP32_PORT = 81
    ESP32_PATH = "/stream"

# Permitir override por argumento
if len(sys.argv) > 1:
    ESP32_IP = sys.argv[1]

STREAM_URL = f"http://{ESP32_IP}:{ESP32_PORT}{ESP32_PATH}"
HEALTH_URL = f"http://{ESP32_IP}/health"  # Health está en puerto 80

print(f"=== Test de conexión ESP32 ===")
print(f"Stream URL: {STREAM_URL}")
print(f"Health URL: {HEALTH_URL}")
print()

# Test 1: HTTP health (puerto 80)
print("1. Probando /health con urllib (puerto 80)...")
try:
    req = urllib.request.Request(HEALTH_URL)
    with urllib.request.urlopen(req, timeout=3) as resp:
        data = resp.read().decode()
        print(f"   ✅ Health OK: {data}")
except Exception as e:
    print(f"   ⚠️ Health falló: {e}")
    print("   (Normal si aún no has flasheado el firmware con /health)")
    # Intentar la raíz
    try:
        req = urllib.request.Request(f"http://{ESP32_IP}/")
        with urllib.request.urlopen(req, timeout=3) as resp:
            print(f"   ✅ Pero la raíz (/) sí responde (status {resp.status})")
    except Exception as e2:
        print(f"   ❌ Tampoco responde /: {e2}")
        print("   El ESP32 no está accesible. ¿Está encendido?")

# Test 2: Descargar unos bytes del stream
print(f"\n2. Probando stream en {STREAM_URL}...")
try:
    req = urllib.request.Request(STREAM_URL)
    with urllib.request.urlopen(req, timeout=5) as resp:
        content_type = resp.headers.get('Content-Type', '')
        first_bytes = resp.read(200)
        print(f"   ✅ Content-Type: {content_type}")
        print(f"   ✅ Primeros {len(first_bytes)} bytes recibidos")
        has_jpeg = b'\xff\xd8' in first_bytes
        print(f"   JPEG encontrado: {'Sí ✅' if has_jpeg else 'No ⚠️'}")
except Exception as e:
    print(f"   ❌ Stream falló: {e}")
    print(f"   ¿Es correcto el puerto ({ESP32_PORT}) y path ({ESP32_PATH})?")

# Test 3: FrameGrabber (método real del backend)
print("\n3. Probando con FrameGrabber (método del backend)...")
try:
    from core_pipeline import FrameGrabber
    t0 = time.time()
    grabber = FrameGrabber(STREAM_URL, timeout=8)
    t1 = time.time()
    print(f"   Conexión en {t1-t0:.2f}s, is_opened: {grabber.is_opened}")
    
    if grabber.is_opened:
        grabber.start()
        time.sleep(1.5)
        ret, frame = grabber.read()
        if ret:
            print(f"   ✅ Frame recibido: {frame.shape}")
        else:
            print(f"   ❌ No se recibieron frames en 1.5s")
        grabber.release()
    else:
        print(f"   ❌ FrameGrabber no se pudo abrir")
except Exception as e:
    print(f"   ❌ Error: {e}")

print("\n=== Test completado ===")
