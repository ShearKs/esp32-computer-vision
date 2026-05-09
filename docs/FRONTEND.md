# Frontend — Ionic React + TypeScript

Aplicación móvil/web construida con **Ionic React 8 + Capacitor 8 + TypeScript**.

---

## Arquitectura General

```
src/
├── App.tsx                  # Layout principal: tabs + menú lateral
├── main.tsx                 # Punto de entrada
├── pages/
│   ├── HomePage.tsx         # Panel principal (cámara + detecciones + joystick)
│   ├── Tab2.tsx             # Configuración de red
│   └── Tab3.tsx             # Placeholder
├── components/
│   ├── VideoStream.tsx      # Stream raw del ESP32
│   ├── DetectionStream.tsx  # Stream con detecciones YOLO
│   ├── DetectionPanel.tsx   # Panel de detecciones en tiempo real (SSE)
│   ├── JoystickControl.tsx  # Joystick táctil + D-pad
│   └── ExploreContainer.tsx # Placeholder genérico
├── services/
│   └── api.ts               # Cliente API completo
├── context/
│   └── SettingsContext.tsx   # Estado global (toggle YOLO)
├── types/
│   └── interfaces.tsx       # Interfaces TypeScript
└── theme/
    └── variables.css        # Variables de tema Ionic
```

---

## Páginas

### HomePage — Panel de Control Principal

Ruta: `/Home`

Es la pantalla principal. Su flujo de inicialización es:

```
1. ¿Es app nativa (Capacitor)?
   ├── Sí → ApiService.scanNetwork() (busca el backend entre todas las IPs conocidas)
   └── No → usa la IP actual (localhost o la del host)
2. ApiService.waitForStream() → sondea /api/stream-ready cada 1s (máx 30 intentos)
3. ¿Stream listo?
   ├── Sí → ready=true → muestra la interfaz
   └── No → muestra error "No se pudo conectar con la cámara"
```

**Layout:**

```
┌──────────────────────────────┐
│         🤖 Robot Control      │  ← Header con menú lateral
├──────────────────────────────┤
│                              │
│   ┌──────────────────────┐   │
│   │  📹 Stream en Vivo    │   │  ← VideoStream o DetectionStream
│   │  [LIVE] / [AI LIVE]   │   │     (según toggle YOLO)
│   └──────────────────────┘   │
│                              │
│   ┌──────────┐ ┌──────────┐  │
│   │ 📊       │ │  🕹️      │  │  ← DetectionPanel + JoystickControl
│   │ Detecc.  │ │ Joystick  │  │
│   └──────────┘ └──────────┘  │
└──────────────────────────────┘
```

Cuando se activa/desactiva YOLO desde el menú lateral, se forza un re-montado del componente de stream mediante un `key` que cambia (`streamKey`).

---

### Tab2 — Configuración de Red

Ruta: `/tab2`

Gestión de conexión al backend. Características:

- **Estado en vivo**: health check cada 5s con indicador visual (verde/rojo)
- **Chip de URL**: muestra la URL activa del backend cuando no es localhost
- **Spinner de conexión**: mientras se conecta a un perfil o IP
- **Perfiles conocidos**: lista con radio buttons para seleccionar red
- **IP manual**: input + botón para conectar a cualquier IP

Cada perfil muestra: nombre, IP del backend y IP del ESP32.

---

## Componentes

### VideoStream — Stream Raw del ESP32

`src/components/VideoStream.tsx`

Muestra el stream MJPEG directo desde la cámara ESP32 (`/api/config` → `esp32_url`).

**Estados:**
- `loading` — Obteniendo configuración o conectando
- `connected` — Stream activo, badge **LIVE** verde
- `error` — Error de conexión con botón de reintento (hasta 3 reintentos automáticos)

**Mecanismo de reintento:** cuando la imagen falla al cargar, añade `?retry=<timestamp>` a la URL para evitar caché del navegador.

---

### DetectionStream — Stream con YOLO

`src/components/DetectionStream.tsx`

Muestra el stream procesado por YOLO (`/api/stream/yolo`). Soporta umbral de confianza configurable vía props.

**Diferencias con VideoStream:**
- Badge **AI LIVE** rojo con un dot animado (CSS `pulse-dot`)
- Mensaje de carga: "Cargando modelo YOLO..." (la primera carga puede tardar)
- Mismos 3 reintentos automáticos que VideoStream

---

### DetectionPanel — Detecciones en Tiempo Real

`src/components/DetectionPanel.tsx`

Se suscribe a los eventos SSE (`/api/stream/yolo/events`) y muestra las detecciones.

**Arquitectura:**

```
EventSource (SSE) → callback → setDetections() + setObjectCounts()
                                  ↓
                          ┌──────────────┐
                          │ Object chips  │  ← Resumen agrupado: 🧑 person ×2
                          ├──────────────┤
                          │ Lista         │  ← Cada detección individual
                          │ 🧑 person     │
                          │ ████████ 87%  │  ← Barra de confianza + badge
                          │ 📱 cell phone │
                          │ ██████ 62%    │
                          └──────────────┘
```

**Iconos por categoría:** 33 objetos mapeados con emojis (🧑🚗🚛🚌🏍️🚲🐕🐱🐦📱💻📺🍾☕🪑🛋️📖🎒☂️✂️🕐⌨️🖱️...). Si no encuentra el objeto, usa 📦.

**Colores de confianza:**
- ≥80% → `success` (verde)
- ≥60% → `warning` (naranja)
- <60% → `medium` (gris)

**Limpieza:** al desactivar el panel, cierra el EventSource mediante la función unsubscribe retornada por `ApiService.subscribeDetections()`.

---

### JoystickControl — Control del Robot

`src/components/JoystickControl.tsx`

Control táctil/ratón completo con joystick analógico + D-pad.

#### Joystick (Touch/Mouse)

```
        forward (↑)
           │
left ──────┼────── right
  (◀)     │○      (▶)
           │
       backward (↓)
```

**Parámetros:**
- `JOYSTICK_RADIUS = 55px` — radio del área táctil
- `STICK_RADIUS = 26px` — radio de la bola
- `DEAD_ZONE = 0.15` — zona muerta del 15% (ignora movimientos muy pequeños)

**Algoritmo de snap-to-cardinal:**

```
1. Calcular magnitud: √(x² + y²)
2. Si magnitud < DEAD_ZONE → stop
3. Si |x| > |y| → eje horizontal (left/right), y se fija a 0
4. Si |y| > |x| → eje vertical (forward/backward), x se fija a 0
5. Asegurar valores en rango [-1, 1]
```

Esto evita direcciones diagonales: el robot solo se mueve en las 4 direcciones cardinales.

**Curva de velocidad:** `velocidad = mag^2.5 * 100`

| Recorrido | Velocidad resultante |
|-----------|-------------------|
| 50% | ~18% |
| 70% | ~41% |
| 90% | ~77% |
| 100% | 100% |

La curva es progresiva: la mitad del recorrido apenas da un 18% de velocidad, lo que permite control fino a bajas velocidades.

**Colores de velocidad:**
- <30% → verde `#4ade80`
- 30-60% → amarillo `#facc15`
- >60% → rojo `#f87171`

**La bola del joystick** puede sobresalir del borde circular (no se resta `STICK_RADIUS` del límite de movimiento).

#### D-Pad (Botones direccionales)

Botones separados para las 4 direcciones. Al pulsar:
- Velocidad fija al **15%** (movimiento suave para cambios de dirección)
- Al soltar → stop

Maneja eventos `mouseDown/mouseUp/mouseLeave` y `touchStart/touchEnd`.

#### Eventos globales

Los eventos de movimiento (`mousemove`, `touchmove`) se registran en `window` para que el arrastre funcione aunque el dedo/ratón salga del elemento del joystick.

**Callback `onMove(direction, speed, x, y)`:** llamado en cada cambio de posición. Actualmente el HomePage hace un `console.log` — aquí se integraría el envío HTTP al backend/ESP32.

---

## Servicios (api.ts)

`src/services/api.ts`

Cliente API que abstrae toda la comunicación con el backend.

### Descubrimiento de red

El frontend tiene copiados los 5 perfiles de red:

```typescript
const KNOWN_PROFILES = [
  { name: 'casa',        backend_ip: '192.168.1.207',  esp32_ip: '192.168.1.132' },
  { name: 'casa-cable',  backend_ip: '192.168.1.207',  esp32_ip: '192.168.1.173' },
  { name: 'instituto',   backend_ip: '192.168.48.207', esp32_ip: '192.168.48.86' },
  { name: 'pruebas_movil', backend_ip: '192.168.0.50',   esp32_ip: '192.168.0.50' },
  { name: 'wsl-actual',  backend_ip: '192.168.192.207',esp32_ip: '192.168.192.132' },
];
```

**Estrategia de conexión:**

```
1. ¿Hostname no es localhost?
   ├── Sí → _baseUrl = http://<hostname>:8000  (ej: Ionic serve --external)
   └── No →
2. ¿App nativa o no hostname?
   ├── Sí → ¿Hay IP guardada en localStorage?
   │   ├── Sí → usa esa IP
   │   └── No → usa VITE_BACKEND_IP del .env
   └── No → localhost:8000
```

**`scanNetwork()`** (solo app nativa): prueba cada perfil con `HEAD /health` (timeout 1s por perfil). Al encontrar el primero que responde, lo guarda en localStorage.

**Persistencia:** la IP conectada y el perfil activo se guardan en localStorage (`robot_backend_ip`, `robot_active_profile`).

### Métodos del API

| Método | Descripción |
|--------|-------------|
| `healthCheck()` | `HEAD /health` |
| `getConfig()` | `GET /api/config` → URL del ESP32 |
| `getProfiles()` | `GET /api/profiles` |
| `getEsp32StreamUrl()` | Obtiene la URL raw del ESP32 |
| `getYoloStreamUrl(confidence?)` | URL del stream YOLO (local, síncrono) |
| `isStreamReady()` | `GET /api/stream-ready` |
| `waitForStream(maxAttempts, intervalMs)` | Sondea hasta que el stream está listo o timeout |
| `detectObjects(streamUrl?)` | `POST /api/detect` |
| `getRecentDetections(limit)` | `GET /api/detections/recent` |
| `subscribeDetections(callback)` | Se suscribe a SSE, devuelve función para cancelar |

---

## Contexto Global (SettingsContext)

`src/context/SettingsContext.tsx`

Estado global mínimo con un solo valor:

| Estado | Default | Descripción |
|--------|---------|-------------|
| `yoloEnabled` | `true` | Alterna entre stream raw (VideoStream) y stream con YOLO (DetectionStream) |

Se consume con `useSettings()` en cualquier componente.

El toggle vive en el menú lateral (`AppMenu`) y el HomePage reacciona al cambio forzando el re-montaje del componente de video.

---

## Interfaces TypeScript

`src/types/interfaces.tsx`

```typescript
NetworkProfile    → { name, backend_ip, esp32_ip }
ConfigResponse    → { esp32_url, esp32_ip, stream_port, backend_ip, active_profile }
ProfilesResponse  → { active_profile, profiles }
StreamReadyResponse → { ready, stream_url }
Detection         → { object, confidence, bbox?, timestamp }
DetectionResponse → { status, detections, count }
YoloEvent         → { timestamp, detections, count }
DetectionsCallback → (event: YoloEvent) => void
VideoStreamProps  → { streamUrl, isConnected, onConnectionChange? }
```

---

## Flujo Completo de la App

```
Arranque
  │
  ├→ App.tsx monta SettingsProvider + IonReactRouter + IonTabs
  │    ├─ Tab "Control"  → HomePage
  │    ├─ Tab "Red"      → Tab2
  │    └─ Tab "Tab 3"    → Tab3
  │
HomePage:
  ├→ ¿App nativa? → scanNetwork()
  ├→ waitForStream(30 intentos)
  │
  ├→ ready=false → Spinner "Conectando..."
  ├→ error       → ❌ mensaje de error
  └→ ready=true  →
       ├→ ¿yoloEnabled?
       │   ├→ Sí → DetectionStream + DetectionPanel + JoystickControl
       │   └→ No → VideoStream + (sin panel) + JoystickControl
       │
       ├→ DetectionStream carga MJPEG de /api/stream/yolo
       ├→ DetectionPanel se suscribe a SSE /api/stream/yolo/events
       └→ JoystickControl envía onMove(direction, speed) →
            (pendiente de integrar con backend → ESP32)
```
