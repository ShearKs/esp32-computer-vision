# Guía de Puesta en Marcha

Pasos para levantar el proyecto completo desde cero.

---

## Requisitos

- Python 3.10+
- Node.js 18+
- Arduino IDE (para flashear el ESP32)
- (Opcional) GPU NVIDIA con CUDA para aceleración YOLO

---

## 1. Backend (FastAPI + YOLOv8)

```bash
# 1. Entrar al directorio
cd backend

# 2. Crear y activar entorno virtual (si no existe)
python -m venv .venv
source .venv/bin/activate    # Linux/Mac
.venv\Scripts\activate       # Windows

# 3. Instalar dependencias
pip install fastapi uvicorn[standard] ultralytics opencv-python pydantic-settings

# 4. Descargar modelos YOLO (opcional, se descargan automáticamente)
cd models
python -c "from ultralytics import YOLO; YOLO('yolov8s.pt')"
cd ..

# 5. Configurar red
#    Editar backend/config.py y cambiar ACTIVE_PROFILE al perfil correcto
#    O crear un perfil nuevo copiando la estructura existente

# 6. Iniciar servidor
uvicorn main:app --reload --host 0.0.0.0 --port 8000
#    En Windows: winpty uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

El backend arranca en `http://<backend_ip>:8000`. Verificar con:
```bash
curl http://localhost:8000/health
# → {"status":"ok"}
```

---

## 2. Firmware ESP32-CAM

### Requisitos para el Arduino IDE

1. Instalar soporte para ESP32:
   - Archivo → Preferencias → URL gestor de placas:
     `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
   - Herramientas → Placa → Gestor de tarjetas → buscar "ESP32" e instalar

### Flashear el robot

```bash
# El firmware completo está en:
firmware/sketch_may1a/sketch_may1a.ino
```

1. Abrir el `.ino` en Arduino IDE
2. Configurar placa: `AI Thinker ESP32-CAM`
3. Configurar velocidad: `115200`
4. **Antes de flashear**: conectar GPIO 0 a GND para entrar en modo flash
5. Pulsar botón RESET del ESP32
6. Subir el sketch (botón →)
7. Desconectar GPIO 0 de GND y pulsar RESET de nuevo

### Configurar Wi-Fi

Editar en el sketch las líneas:
```cpp
const char* ssid = "tu_red_wifi";
const char* password = "tu_contraseña";
```

El ESP32 mostrará su IP por el monitor serie (115200 baud).

---

## 3. Frontend (Ionic React)

```bash
# 1. Entrar al directorio
cd frontend/robot-vision-app

# 2. Instalar dependencias
npm install

# 3. Iniciar en navegador
ionic serve
#    Abre automáticamente en http://localhost:8100

# 4. Para acceder desde otros dispositivos en la misma red:
ionic serve --external
```

### App nativa Android (Capacitor)

```bash
# 1. Build web
npm run build

# 2. Sincronizar con Capacitor
npx cap sync

# 3. Abrir Android Studio
npx cap open android

# O directamente en dispositivo:
npx cap run android
```

---

## 4. Configuración de Red

El sistema tiene 5 perfiles predefinidos en `backend/config.py`:

| Perfil | Cuándo usarlo |
|--------|--------------|
| `casa` | Red doméstica por Wi-Fi |
| `casa-cable` | Red doméstica por Ethernet |
| `instituto` | Red del instituto |
| `pruebas_movil` | Hotspot del móvil |
| `wsl-actual` | WSL en Windows |

Para cambiar de perfil, editar `backend/config.py`:
```python
ACTIVE_PROFILE = "instituto"  # Cambiar al perfil deseado
```

### Añadir un perfil nuevo

```python
"mi_perfil": {
    "backend_ip": "192.168.1.100",     # IP del PC que ejecuta el backend
    "esp32_ip": "192.168.1.50",        # IP del ESP32-CAM
    "esp32_stream_port": 8080,         # Puerto del stream (normalmente 8080)
    "esp32_stream_path": "/video"      # Ruta del stream
}
```

Las IPs deben ser **fijas** en el router (reservar DHCP) o configurarlas manualmente.

---

## 5. Flujo de comunicación esperado

```
1. ESP32 se conecta al Wi-Fi y empieza a servir stream en puerto 8080
2. Backend arranca y conecta con el ESP32 (usa IP del perfil activo)
3. Frontend se conecta al backend y recibe la URL del stream
4. Frontend muestra el vídeo (raw o con detecciones YOLO)
5. El joystick envía comandos → backend → ESP32 → movimiento del robot
```

Para verificar que todo funciona:

```
Backend:    curl http://localhost:8000/health                 → {"status":"ok"}
ESP32:      curl http://<esp32_ip>:8080/video                 → flujo MJPEG
YOLO:       curl http://localhost:8000/api/stream/yolo        → flujo MJPEG anotado
```

---

## 6. Solución de problemas comunes

| Problema | Posible solución |
|----------|-----------------|
| Backend no conecta con ESP32 | Verificar IP en `config.py`, que el ESP32 esté encendido y en la misma red |
| Frontend no ve el backend | En navegador, asegurar que no es HTTPS. En Android nativo, activar "cleartext" en `capacitor.config.ts` |
| YOLO muy lento | Cambiar a perfil `yolov8n` en `model_profiles.json`, reducir `imgsz`, aumentar `skip_frames` |
| ESP32 no flashea | Conectar GPIO 0 a GND, pulsar RESET, probar otro cable USB |
| Error "Camera disconnected" en stream | El ESP32 se ha colgado. Pulsar RESET en el ESP32 |
