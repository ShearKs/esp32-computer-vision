# Estructura del Proyecto

**Proyecto Final - IA y Big Data** — Sistema de visión robótica con detección de objetos YOLOv8, backend FastAPI y frontend Ionic React.

---

## Vista General

```
Proyecto Final - IA y Big Data/
├── backend/          # Python FastAPI + YOLOv8
├── frontend/         # Ionic React + TypeScript + Capacitor
├── firmware/         # Arduino sketches para ESP32-CAM
├── docs/             # Documentación
├── assets/           # Recursos estáticos
├── automation/       # Scripts de automatización
├── .venv/            # Entorno virtual Python
├── node_modules/     # Dependencias Node.js
├── package.json      # Dependencia raíz (react-joystick-component)
├── README.md         # Documentación principal
└── inicio.bat        # Lanzador Windows (backend + frontend)
```

---

## 1. Backend (`backend/`)

Servidor Python con **FastAPI** que recibe el stream de vídeo MJPEG del ESP32-CAM, ejecuta **YOLOv8** para detección de objetos y re-sirve los frames anotados al frontend.

### Estructura

```
backend/
├── .env                        # Variables de entorno (IPs, puertos)
├── config.py                   # Perfiles de red (casa, instituto, WSL, etc.)
├── main.py                     # Servidor FastAPI (punto de entrada, endpoints REST)
├── core_pipeline.py            # Motor de detección YOLO (FrameGrabber, procesamiento)
├── model_profiles.json         # Perfiles de optimización de YOLO (imgsz, skip_frames, confidence)
├── test_yolo.py                # Comparativa de modelos YOLO (n vs m)
├── inicio.py                   # Script de prueba simple
├── bus.jpg                     # Imagen de prueba para YOLO
├── models/                     # Pesos de modelos YOLOv8
│   ├── yolov8n.pt              # Nano (más rápido, menos preciso)
│   ├── yolov8s.pt              # Small (balanceado) [ACTIVO]
│   └── yolov8m.pt              # Medium (más preciso, más lento)
└── logs/                       # Sesiones de detección (JSON)
    └── session_*.json
```

### Endpoints de la API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/config` | URL del stream ESP32 + configuración de red |
| GET | `/api/profiles` | Todos los perfiles de red disponibles |
| GET | `/api/stream-ready` | Verifica si la cámara ESP32 responde |
| GET | `/api/stream/yolo` | Stream MJPEG con detecciones YOLO dibujadas |
| GET | `/api/stream/yolo/events` | Server-Sent Events con detecciones en JSON |
| POST | `/api/detect` | Sesión de detección under demanda (N frames) |
| GET | `/api/detections/recent` | Detecciones recientes |

### Tecnologías

- **FastAPI** — Framework web asíncrono
- **Ultralytics YOLOv8** — Detección de objetos (17 categorías)
- **OpenCV** — Captura y procesamiento de frames
- **PyTorch** — Deep learning (con soporte CUDA/GPU)
- **Uvicorn** — Servidor ASGI
- **pydantic-settings** — Gestión de configuración

---

## 2. Frontend (`frontend/robot-vision-app/`)

Aplicación móvil/web con **Ionic React + TypeScript** que muestra el stream de vídeo, las detecciones de YOLO en tiempo real y permite controlar el robot mediante un joystick táctil.

### Estructura

```
frontend/robot-vision-app/
├── public/                      # Archivos estáticos (favicon, manifest)
├── src/                         # Código fuente
│   ├── App.tsx                  # Componente principal (routing + menú lateral)
│   ├── main.tsx                 # Punto de entrada
│   ├── components/              # Componentes reutilizables
│   │   ├── VideoStream.tsx      # Stream raw de la cámara ESP32
│   │   ├── DetectionStream.tsx  # Stream con detecciones YOLO
│   │   ├── DetectionPanel.tsx   # Panel de resultados en tiempo real (SSE)
│   │   └── JoystickControl.tsx  # Joystick táctil + D-pad para control del robot
│   ├── pages/                   # Vistas principales
│   │   ├── HomePage.tsx         # Panel principal (cámara + detecciones + joystick)
│   │   ├── Tab2.tsx             # Configuración de red (perfiles, IP manual)
│   │   └── Tab3.tsx             # Placeholder
│   ├── services/
│   │   └── api.ts               # Cliente API (descubrimiento de red, endpoints)
│   ├── context/
│   │   └── SettingsContext.tsx   # Estado global (toggle YOLO)
│   ├── types/
│   │   └── interfaces.tsx       # Interfaces TypeScript
│   └── theme/
│       └── variables.css        # Variables de tema Ionic
├── android/                     # Proyecto nativo Android (Capacitor)
├── cypress/                     # Tests E2E
├── capacitor.config.ts          # Configuración de Capacitor
├── ionic.config.json            # Configuración de Ionic
├── vite.config.ts               # Configuración de Vite
├── package.json                 # Dependencias
├── tsconfig.json                # Configuración TypeScript
└── eslint.config.js             # Configuración ESLint
```

### Flujo de comunicación

```
[ESP32-CAM Robot]  --MJPEG-->  [Backend FastAPI]  --REST + SSE-->  [Ionic Frontend]
  (puerto 8080)                   (puerto 8000)                      (puerto 8100)

[Frontend Joystick]  -->  [Backend API]  -->  [ESP32-CAM /action endpoint]
  (touch input)               (proxy)            (movimiento del robot)
```

### Tecnologías

- **Ionic React** ^8.5.0 — Framework UI
- **React** 19.0.0 — Librería de componentes
- **TypeScript** — Lenguaje
- **Capacitor** 8.3.1 — Runtime nativo (Android)
- **Vite** — Build tool
- **react-joystick-component** — Joystick táctil
- **react-router-dom** ^5.3.4 — Routing
- **Cypress** — Tests E2E

---

## 3. Firmware (`firmware/`)

Código **Arduino C++** para el robot **Keyestudio** con cámara **ESP32-CAM** (OV2640).

### Sketches

| Archivo | Descripción |
|---------|-------------|
| `sketch_apr30a/sketch_apr30a.ino` | Test básico de motores (adelante, atrás, izquierda, derecha) |
| `sketch_may1a/sketch_may1a.ino` | Firmware completo: servidor web, streaming MJPEG (puerto 81), control de motores, LED, velocidad PWM, joystick vía HTTP |

### Funcionalidades del firmware completo

- Conexión Wi-Fi a red local
- Streaming de vídeo MJPEG vía HTTP (puerto 81)
- Página de control web embebida (puerto 80)
- Control direccional (adelante/atrás/izquierda/derecha/stop)
- Control de velocidad PWM (3 niveles: 85/170/255)
- Control de LED (GPIO 4)
- Parámetro `?speed=0-255` para control gradual desde el joystick
- Cabeceras CORS para integración con el backend
- Desactivación del detector de brownout

---

## 4. Documentación (`docs/`)

```
docs/
├── Estructura del Proyecto.md   # Este archivo
├── COMANDOS.md                  # Comandos útiles (uvicorn, YOLO, Ionic, Capacitor)
├── Inicio.md                    # Ideas iniciales del proyecto
├── TAREAS.md                    # Lista de tareas (joystick hecho, voz planeado)
└── .obsidian/                   # Configuración de Obsidian
```

---

## 5. Archivos raíz

| Archivo | Descripción |
|---------|-------------|
| `README.md` | Documentación principal del proyecto |
| `package.json` | Dependencia raíz (react-joystick-component) |
| `inicio.bat` | Script batch para Windows que lanza backend + frontend |
| `.gitignore` | Reglas de ignorado para Git |

---

## 6. Perfiles de Red

El sistema soporta múltiples entornos Wi-Fi mediante perfiles configurables en `backend/config.py`:

| Perfil | Entorno |
|--------|---------|
| `casa` | Red doméstica |
| `casa-cable` | Red doméstica por cable |
| `instituto` | Red del instituto |
| `pruebas_movil` | Hotspot móvil |
| `wsl-actual` | WSL (Windows Subsystem for Linux) |

Cada perfil define: `backend_ip`, `esp32_ip`, `esp32_stream_port`, `esp32_stream_path`.

---

## 7. Resumen de Tecnologías

| Capa | Tecnología |
|------|-----------|
| Backend Framework | FastAPI (Python) |
| Detección de objetos | Ultralytics YOLOv8 |
| Visión por computadora | OpenCV |
| Deep Learning | PyTorch (CUDA/GPU) |
| Frontend Framework | Ionic React ^8.5.0 |
| UI Library | React 19.0.0 |
| Lenguaje Frontend | TypeScript |
| Build Tool | Vite |
| Runtime Nativo | Capacitor 8.3.1 (Android) |
| Testing | Cypress, Vitest |
| Firmware | Arduino C++ (ESP32 / ESP32-CAM) |
| Hardware | Keyestudio Robot Car + ESP32-CAM |
