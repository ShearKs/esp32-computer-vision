coche-autonomo-ia/
│
├──  README.md                    ← PORTADA del proyecto (lo primero que se ve)
├──  LICENSE                      ← MIT o Apache 2.0
├── 📄 .gitignore                   ← Excluye node_modules/, __pycache__/, .venv/
│
├── 📁 backend/                     ← SERVIDOR PYTHON (FastAPI + YOLO)
│   ├── 📄 main.py                  ← API REST endpoints
│   ├── 📄 core_pipeline.py         ← Lógica YOLO + OpenCV
│   ├── 📄 requirements.txt         ← Dependencias Python
│   ├── 📄 .env                     ← Variables de entorno (IPs, umbrales)
│   ├── 📁 logs/                    ← Session logs JSON (NO subir a Git si son grandes)
│   └── 📁 tests/                   ← Tests del backend
│       ├── test_vision.py
│       └── test_api.py
│
├──  frontend/                    ← APP MÓVIL (Ionic + React)
│   ├── 📄 package.json
│   ├── 📄 ionic.config.json
│   ├── 📄 capacitor.config.ts
│   ├── 📄 tsconfig.json
│   ├── 📁 public/
│   │   └── assets/
│   └──  src/
│       ├── 📄 main.tsx
│       ├── 📄 App.tsx
│       ├── 📁 pages/
│       │   ├── 📄 HomePage.tsx           ← Pantalla principal
│       │   ├── 📄 SettingsPage.tsx       ← Config IPs, umbrales
│       │   └── 📄 SessionHistoryPage.tsx ← Ver logs antiguos
│       ├── 📁 components/
│       │   ├── 📄 VideoStream.tsx        ← Componente stream vídeo
│       │   ├── 📄 CanvasOverlay.tsx      ← Dibuja bounding boxes
│       │   ├── 📄 Joystick.tsx           ← Controles manuales
│       │   ├── 📄 DetectionList.tsx      ← Lista objetos detectados
│       │   └──  EmergencyButton.tsx    ← Botón STOP rojo
│       ├── 📁 services/
│       │   ├── 📄 api.ts                 ← Llamadas HTTP a FastAPI
│       │   └── 📄 websocket.ts           ← Conexión WebSocket (opcional)
│       ├── 📁 hooks/
│       │   ├── 📄 useDetectionLog.ts     ← Hook personalizado
│       │   └── 📄 useJoystick.ts         ← Lógica del joystick
│       ├── 📁 utils/
│       │   ├── 📄 colors.ts              ← Colores para overlays
│       │   └── 📄 formatters.ts          ← Formato tiempo, confianza
│       └──  types/
│           └── 📄 index.ts               ← Interfaces TypeScript
│
├── 📁 firmware/                    ← CÓDIGO ESP32 (Arduino)
│   ├── 📄 esp32_camera_webserver.ino
│   ├── 📄 platformio.ini           ← Si usas PlatformIO
│   └── 📄 README.md                ← Instrucciones flash + pines
│
├── 📁 automation/                  ← FLUJOS N8N (opcional)
│   ├── 📁 workflows/
│   │   ├── alert_telegram.json
│   │   └── log_google_sheets.json
│   └──  README.md
│
├── 📁 docs/                        ← DOCUMENTACIÓN ACADÉMICA
│   ├── 📄 informe_final.md         ← Memoria del proyecto
│   ├── 📄 demo_script.md           ← Guion para grabar demo
│   ├── 📄 rubric_checklist.md      ← Criterios evaluación
│   ├── 📁 metrics/                 ← Gráficas resultados
│   │   ├── map_curve.png
│   │   ├── latency_chart.png
│   │   └── precision_by_class.csv
│   └── 📁 screenshots/             ← Capturas app, stream, etc.
│
├── 📁 scripts/                     ← UTILIDADES
│   ├── 📄 setup_dev_env.sh         ← Setup rápido Linux/Mac
│   ├── 📄 setup_dev_env.ps1        ← Setup rápido Windows
│   ├── 📄 download_model.py        ← Descargar YOLO manualmente
│   └──  export_session_csv.py    ← Convertir JSON → CSV
│
└── 📁 assets/                      ← IMÁEGNES/LOGOS DEL PROYECTO
    ├── logo.png
    ├── diagram_architecture.png
    └── demo_video.mp4



