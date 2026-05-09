# API Reference — Backend FastAPI

Servidor en `http://<backend_ip>:8000`. Todas las rutas devuelven JSON excepto los streams MJPEG y SSE.

---

## Health Check

```http
GET /health
```

**Respuesta:**
```json
{ "status": "ok" }
```

---

## Configuración

```http
GET /api/config
```

Devuelve la URL del stream ESP32 y la configuración activa.

**Respuesta:**
```json
{
  "esp32_url": "http://192.168.1.132:8080/video",
  "esp32_ip": "192.168.1.132",
  "stream_port": 8080,
  "backend_ip": "192.168.1.207",
  "active_profile": "casa"
}
```

**Uso en frontend:** Obtener la URL raw del ESP32 para `VideoStream`.

---

## Perfiles de Red

```http
GET /api/profiles
```

Devuelve todos los perfiles de red para que el frontend pueda descubrir el backend automáticamente.

**Respuesta:**
```json
{
  "active_profile": "casa",
  "profiles": {
    "casa": {
      "name": "casa",
      "backend_ip": "192.168.1.207",
      "esp32_ip": "192.168.1.132"
    },
    "instituto": {
      "name": "instituto",
      "backend_ip": "192.168.48.207",
      "esp32_ip": "192.168.48.86"
    }
  }
}
```

**Uso en frontend:** `ApiService.getProfiles()` → muestra lista de perfiles en Tab2.

---

## Verificar Stream ESP32

```http
GET /api/stream-ready
```

Intenta abrir el stream del ESP32 con timeout de 3s.

**Respuesta:**
```json
{
  "ready": true,
  "stream_url": "http://192.168.1.132:8080/video"
}
```

Si no responde:
```json
{
  "ready": false,
  "stream_url": null
}
```

**Uso en frontend:** `ApiService.waitForStream()` → sondea cada 1s hasta que el ESP32 responde.

---

## Stream YOLO en Tiempo Real (MJPEG)

```http
GET /api/stream/yolo
GET /api/stream/yolo?confidence=0.5
```

Stream MJPEG con bounding boxes dibujados por YOLO. Se consume directamente como `<img>`.

**Parámetros opcionales:**

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `confidence` | float | 0.45 | Umbral de confianza mínimo |

**Uso en frontend:**
```tsx
<img src={`${baseUrl}/api/stream/yolo`} />
```

**Características:**
- FrameGrabber en hilo dedicado (siempre frame más reciente, sin lag)
- YOLO se ejecuta cada N frames (según `skip_frames` del perfil activo)
- Frames intermedios reusan detecciones cacheadas
- Muestra FPS en la esquina superior izquierda
- Frame de error si el ESP32 se desconecta

---

## Eventos SSE (Server-Sent Events)

```http
GET /api/stream/yolo/events
```

Stream de detecciones YOLO en JSON, actualizado ~3 veces/segundo.

**Formato del evento:**
```
data: {"timestamp": 1712345678.90, "detections": [...], "count": 3}
```

**Ejemplo de dato:**
```json
{
  "timestamp": 1712345678.90,
  "detections": [
    {
      "timestamp": 1712345678.50,
      "object": "person",
      "confidence": 0.87,
      "bbox": [120, 45, 300, 280]
    },
    {
      "timestamp": 1712345678.50,
      "object": "cell phone",
      "confidence": 0.62,
      "bbox": [50, 100, 120, 180]
    }
  ],
  "count": 2
}
```

**Uso en frontend:**
```tsx
const unsubscribe = ApiService.subscribeDetections((data) => {
  setDetections(data.detections);
});
// unsubscribe() para limpiar
```

Solo envía datos cuando hay cambios en las detecciones (compara hash internamente).

---

## Detección Bajo Demanda

```http
POST /api/detect?stream_url=http://...
```

Procesa 5 frames del stream y devuelve las últimas 10 detecciones.

**Parámetros:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `stream_url` | string | (Opcional) URL del stream. Por defecto usa la del perfil activo |

**Respuesta:**
```json
{
  "status": "ok",
  "detections": [
    {
      "timestamp": 1712345678.50,
      "object": "person",
      "confidence": 0.87,
      "bbox": [120, 45, 300, 280]
    }
  ],
  "count": 1
}
```

**Errores:**

| Código | Causa |
|--------|-------|
| 503 | No se puede conectar al stream |
| 500 | Error interno durante la detección |

---

## Detecciones Recientes

```http
GET /api/detections/recent?limit=10
```

Devuelve las últimas detecciones almacenadas en memoria (sin procesar nuevo vídeo).

**Parámetros:**

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `limit` | int | 10 | Número máximo de detecciones a devolver |

**Respuesta:**
```json
{
  "detections": [
    {
      "timestamp": 1712345678.50,
      "object": "person",
      "confidence": 0.87,
      "bbox": [120, 45, 300, 280]
    }
  ]
}
```

---

## Resumen de Rutas

| Método | Ruta | Tipo | Descripción |
|--------|------|------|-------------|
| GET | `/health` | JSON | Health check |
| GET | `/api/config` | JSON | URL del stream + perfil activo |
| GET | `/api/profiles` | JSON | Todos los perfiles de red |
| GET | `/api/stream-ready` | JSON | Verifica conexión con ESP32 |
| GET | `/api/stream/yolo` | MJPEG | Stream con detecciones dibujadas |
| GET | `/api/stream/yolo/events` | SSE | Detecciones en tiempo real |
| POST | `/api/detect` | JSON | Sesión de detección bajo demanda |
| GET | `/api/detections/recent` | JSON | Últimas detecciones en memoria |

---

## Notas Técnicas

- **CORS**: Habilitado para todos los orígenes (`allow_origins=["*"]`)
- **Formato fecha**: Timestamps Unix (epoch) con 2 decimales
- **Bounding boxes**: Formato `[x1, y1, x2, y2]` en píxeles del frame original
- **Stream MJPEG**: Boundary `--frame`, Content-Type `image/jpeg`
- **SSE**: Cabeceras `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`
