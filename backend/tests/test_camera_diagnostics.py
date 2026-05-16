"""
Test completo de conectividad cámara → backend → frontend.
Ejecuta: python test_camera_diagnostics.py [IP_CAMARA] [PUERTO] [PATH]
  
Ejemplos:
  python test_camera_diagnostics.py 192.168.1.132 81 /stream    # ESP32-CAM
  python test_camera_diagnostics.py 192.168.1.50 8080 /video     # IP Webcam
  python test_camera_diagnostics.py                               # Usa config actual
"""
import sys
import time
import json
import os

# Cargar configuración actual si no se pasan argumentos
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
ACTIVE_CONFIG = os.path.join(DATA_DIR, "active_config.json")

try:
    with open(ACTIVE_CONFIG) as f:
        cfg = json.load(f)
    DEFAULT_IP = cfg.get("esp32_ip", "192.168.1.132")
    DEFAULT_PORT = cfg.get("esp32_port", 81)
    DEFAULT_PATH = cfg.get("esp32_path", "/stream")
except:
    DEFAULT_IP = "192.168.1.132"
    DEFAULT_PORT = 81
    DEFAULT_PATH = "/stream"

CAM_IP = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_IP
CAM_PORT = int(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_PORT
CAM_PATH = sys.argv[3] if len(sys.argv) > 3 else DEFAULT_PATH

STREAM_URL = f"http://{CAM_IP}:{CAM_PORT}{CAM_PATH}"
ROOT_URL = f"http://{CAM_IP}/"
BACKEND_URL = "http://localhost:8000"

print("=" * 60)
print("  DIAGNÓSTICO COMPLETO DE CÁMARA")
print("=" * 60)
print(f"  Cámara IP:     {CAM_IP}")
print(f"  Puerto stream: {CAM_PORT}")
print(f"  Path stream:   {CAM_PATH}")
print(f"  Stream URL:    {STREAM_URL}")
print(f"  Root URL:      {ROOT_URL}")
print(f"  Backend URL:   {BACKEND_URL}")
print("=" * 60)

results = []
def test(name, passed, detail=""):
    emoji = "✅" if passed else "❌"
    results.append((name, passed))
    print(f"\n{emoji} {name}")
    if detail:
        print(f"   → {detail}")
    return passed


# ═══════════════════════════════════════════════════════
# TEST 1: Ping (ICMP)
# ═══════════════════════════════════════════════════════
print(f"\n{'─'*60}")
print("TEST 1: Ping a la cámara")
print(f"{'─'*60}")
import subprocess
try:
    # Windows usa -n, Linux/Mac usa -c
    param = "-n" if os.name == "nt" else "-c"
    result = subprocess.run(
        ["ping", param, "2", "-w", "2000", CAM_IP],
        capture_output=True, text=True, timeout=10
    )
    ping_ok = result.returncode == 0
    test("Ping a cámara", ping_ok, 
         "La cámara responde en la red" if ping_ok else 
         f"La cámara NO responde al ping. ¿Está encendida y en la misma red?\n   Salida: {result.stdout.strip()[:100]}")
except Exception as e:
    test("Ping a cámara", False, f"Error: {e}")


# ═══════════════════════════════════════════════════════
# TEST 2: HTTP a la raíz del ESP32 (puerto 80)
# ═══════════════════════════════════════════════════════
print(f"\n{'─'*60}")
print("TEST 2: HTTP a la raíz del ESP32 (puerto 80)")
print(f"{'─'*60}")
import urllib.request
try:
    req = urllib.request.Request(ROOT_URL)
    with urllib.request.urlopen(req, timeout=5) as resp:
        data = resp.read(200)
        test("HTTP raíz (puerto 80)", True, 
             f"Status: {resp.status}, Content-Type: {resp.headers.get('Content-Type', 'N/A')}")
except Exception as e:
    test("HTTP raíz (puerto 80)", False, 
         f"No se pudo conectar a {ROOT_URL}: {e}\n"
         "   Nota: Esto es normal para IP Webcam (solo tiene puerto 8080)")


# ═══════════════════════════════════════════════════════
# TEST 3: Stream MJPEG
# ═══════════════════════════════════════════════════════
print(f"\n{'─'*60}")
print(f"TEST 3: Stream MJPEG en {STREAM_URL}")
print(f"{'─'*60}")
try:
    req = urllib.request.Request(STREAM_URL)
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=8) as resp:
        content_type = resp.headers.get('Content-Type', '')
        first_bytes = resp.read(2048)
        t1 = time.time()
        
        has_jpeg = b'\xff\xd8' in first_bytes  # SOI marker
        test("Stream MJPEG accesible", True, 
             f"Content-Type: {content_type}\n"
             f"   Tiempo respuesta: {t1-t0:.2f}s\n"
             f"   Bytes recibidos: {len(first_bytes)}\n"
             f"   Contiene JPEG SOI (FFD8): {'Sí ✅' if has_jpeg else 'No ⚠️'}")
except Exception as e:
    test("Stream MJPEG accesible", False, 
         f"No se pudo conectar a {STREAM_URL}: {e}\n"
         f"   ¿Es correcto el puerto ({CAM_PORT}) y path ({CAM_PATH})?\n"
         f"   ESP32-CAM: puerto=81, path=/stream\n"
         f"   IP Webcam: puerto=8080, path=/video")


# ═══════════════════════════════════════════════════════
# TEST 4: OpenCV VideoCapture
# ═══════════════════════════════════════════════════════
print(f"\n{'─'*60}")
print(f"TEST 4: OpenCV VideoCapture")
print(f"{'─'*60}")
try:
    import cv2
    import numpy as np
    
    t0 = time.time()
    cap = cv2.VideoCapture(STREAM_URL)
    t1 = time.time()
    
    if cap.isOpened():
        ret, frame = cap.read()
        t2 = time.time()
        cap.release()
        if ret:
            test("OpenCV VideoCapture", True,
                 f"Abierto en {t1-t0:.2f}s, frame leído en {t2-t1:.2f}s\n"
                 f"   Tamaño frame: {frame.shape}")
        else:
            test("OpenCV VideoCapture", False,
                 f"Se abrió pero read() falló (timeout: {t2-t1:.2f}s)")
    else:
        cap.release()
        test("OpenCV VideoCapture", False,
             f"VideoCapture no se pudo abrir ({t1-t0:.2f}s)\n"
             "   Nota: Esto es un problema conocido de OpenCV con ESP32-CAM.\n"
             "   El FrameGrabber del backend usa urllib en su lugar.")
except ImportError:
    test("OpenCV VideoCapture", False, "OpenCV (cv2) no está instalado")
except Exception as e:
    test("OpenCV VideoCapture", False, f"Error: {e}")


# ═══════════════════════════════════════════════════════
# TEST 5: FrameGrabber (el que usa el backend realmente)
# ═══════════════════════════════════════════════════════
print(f"\n{'─'*60}")
print(f"TEST 5: FrameGrabber (método real del backend)")
print(f"{'─'*60}")
try:
    from core_pipeline import FrameGrabber
    
    t0 = time.time()
    grabber = FrameGrabber(STREAM_URL, timeout=8)
    t1 = time.time()
    
    if grabber.is_opened:
        grabber.start()
        time.sleep(1.5)  # Dar tiempo a recibir frames
        
        ret, frame = grabber.read()
        grabber.release()
        
        if ret and frame is not None:
            test("FrameGrabber", True,
                 f"Conectado en {t1-t0:.2f}s\n"
                 f"   Frame recibido: {frame.shape}")
        else:
            test("FrameGrabber", False,
                 f"Conectado pero no recibió frames en 1.5s")
    else:
        test("FrameGrabber", False,
             f"No se pudo conectar ({t1-t0:.2f}s)")
except ImportError as e:
    test("FrameGrabber", False, f"No se pudo importar: {e}")
except Exception as e:
    test("FrameGrabber", False, f"Error: {e}")


# ═══════════════════════════════════════════════════════
# TEST 6: Backend API
# ═══════════════════════════════════════════════════════
print(f"\n{'─'*60}")
print(f"TEST 6: Backend FastAPI")
print(f"{'─'*60}")
try:
    req = urllib.request.Request(f"{BACKEND_URL}/health")
    with urllib.request.urlopen(req, timeout=3) as resp:
        data = json.loads(resp.read())
        test("Backend /health", True, f"Respuesta: {data}")
except Exception as e:
    test("Backend /health", False, 
         f"Backend no accesible en {BACKEND_URL}: {e}\n"
         "   ¿Está ejecutándose? (python main.py)")

try:
    req = urllib.request.Request(f"{BACKEND_URL}/api/config")
    with urllib.request.urlopen(req, timeout=3) as resp:
        data = json.loads(resp.read())
        test("Backend /api/config", True, 
             f"ESP32 URL: {data.get('esp32_url')}\n"
             f"   Perfil activo: {data.get('active_profile')}")
except Exception as e:
    test("Backend /api/config", False, f"Error: {e}")

try:
    req = urllib.request.Request(f"{BACKEND_URL}/api/stream-ready")
    with urllib.request.urlopen(req, timeout=5) as resp:
        data = json.loads(resp.read())
        test("Backend /api/stream-ready", data.get("ready", False),
             f"ready: {data.get('ready')}, stream_url: {data.get('stream_url')}")
except Exception as e:
    test("Backend /api/stream-ready", False, f"Error: {e}")


# ═══════════════════════════════════════════════════════
# TEST 7: Backend stream proxy
# ═══════════════════════════════════════════════════════
print(f"\n{'─'*60}")
print(f"TEST 7: Backend stream proxy /api/stream/raw")
print(f"{'─'*60}")
try:
    req = urllib.request.Request(f"{BACKEND_URL}/api/stream/raw")
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=10) as resp:
        content_type = resp.headers.get('Content-Type', '')
        first_bytes = resp.read(2048)
        t1 = time.time()
        has_jpeg = b'\xff\xd8' in first_bytes
        test("Backend stream proxy", has_jpeg,
             f"Content-Type: {content_type}\n"
             f"   Bytes recibidos: {len(first_bytes)}\n"
             f"   Contiene JPEG: {'Sí' if has_jpeg else 'No'}\n"
             f"   Tiempo: {t1-t0:.2f}s")
except Exception as e:
    test("Backend stream proxy", False, f"Error: {e}")


# ═══════════════════════════════════════════════════════
# RESUMEN
# ═══════════════════════════════════════════════════════
print(f"\n{'='*60}")
print("  RESUMEN")
print(f"{'='*60}")
passed = sum(1 for _, ok in results if ok)
total = len(results)
for name, ok in results:
    print(f"  {'✅' if ok else '❌'} {name}")
print(f"\n  Resultado: {passed}/{total} tests pasados")

if passed == total:
    print("\n  🎉 ¡Todo funciona! La cámara debería verse en la app.")
else:
    print("\n  ⚠️ Hay problemas. Revisa los tests que fallaron arriba.")
    
    # Sugerencias específicas
    failed = [name for name, ok in results if not ok]
    if "Ping a cámara" in failed:
        print("\n  💡 La cámara no está accesible en la red.")
        print("     1. ¿Está encendida?")
        print("     2. ¿Está conectada a la misma red WiFi?")
        print(f"     3. ¿Es correcta la IP ({CAM_IP})?")
    elif "Stream MJPEG accesible" in failed:
        print(f"\n  💡 La cámara responde pero el stream no está en {CAM_PORT}{CAM_PATH}")
        print(f"     ESP32-CAM usa: puerto 81, path /stream")
        print(f"     IP Webcam usa: puerto 8080, path /video")
    elif "Backend /health" in failed:
        print("\n  💡 El backend no está ejecutándose.")
        print("     Ejecuta: cd backend && python main.py")

print(f"\n{'='*60}")
