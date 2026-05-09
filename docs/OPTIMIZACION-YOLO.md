# Optimización de YOLO — Perfiles y Rendimiento

El sistema usa **YOLOv8** con perfiles configurables en `backend/model_profiles.json` para adaptarse al hardware disponible.

---

## Perfiles Disponibles

```json
{
  "active_model": "yolov8s",
  "profiles": { ... }
}
```

| Perfil | Pesos | Velocidad | Precisión | Uso recomendado |
|--------|-------|-----------|-----------|-----------------|
| `yolov8n` | 6.3 MB | ⚡ Ultra rápida | Baja | CPU / GPU muy limitada |
| `yolov8s` | 22.5 MB | ⚡ Rápida | Media | **Activo por defecto** — buena relación calidad/rendimiento |
| `yolov8m` | 52 MB | 🐢 Media | Alta | GPU dedicada |
| `yolov8l` | 87 MB | 🐢 Lenta | Muy alta | Solo GPU |
| `yolov8x` | 136 MB | 🐌 Muy lenta | Máxima | Solo GPU potente |

---

## Parámetros de Optimización

Cada perfil ajusta estos parámetros:

### `imgsz` — Tamaño de imagen de entrada

| Valor | Efecto |
|-------|--------|
| 320 | Inferencia rápida, menos precisión en objetos pequeños |
| 416 | Balanceado |
| 480 | Mayor precisión, 2x tiempo de inferencia |

**Recomendación:** 320 para CPU, 480 para GPU.

### `skip_frames` — Cada cuántos frames se ejecuta YOLO

| Valor | Efecto |
|-------|--------|
| 1 | YOLO en cada frame — máxima carga computacional |
| 3 | YOLO cada 3 frames — **default**, buena fluidez |
| 5-10 | YOLO esporádico — los frames intermedios reusan detecciones cacheadas |

Los frames donde no se ejecuta YOLO **reusan las bounding boxes del último frame procesado** (función `_draw_cached_boxes`), dando sensación de fluidez sin costo computacional.

### `confidence` — Umbral de confianza mínimo

| Valor | Efecto |
|-------|--------|
| 0.30 | Detecta casi todo, muchos falsos positivos |
| 0.45 | **Default** — balance detección/ruido |
| 0.60 | Solo detecciones seguras, puede perder objetos reales |

### `jpeg_quality` — Calidad de compresión JPEG

| Valor | Efecto |
|-------|--------|
| 55 | Mejor calidad, más ancho de banda |
| 50 | **Default** — buena calidad, tamaño moderado |
| 40 | Menor calidad, menos ancho de banda |

### `mjpeg_width` — Ancho máximo del stream

| Valor | Efecto |
|-------|--------|
| 540 | Mayor resolución, más datos |
| 480 | **Default** — buena calidad visual |
| 420 | Más pequeño, menos ancho de banda |

---

## Cómo Cambiar el Perfil Activo

1. Editar `backend/model_profiles.json`:
```json
{
  "active_model": "yolov8n",
  "profiles": { ... }
}
```

2. Asegurar que el modelo `.pt` existe en `backend/models/`:
```bash
cd backend/models
python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"
```

3. **Reiniciar el servidor.**

---

## Aceleración por Hardware

### GPU NVIDIA (CUDA)

El sistema **detecta CUDA automáticamente**:
```python
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
```

Si hay GPU disponible:
- Se usa **FP16** (half-precision) → ~2x más rápido que FP32
- Se muestra el nombre de la GPU en el log: `Dispositivo YOLO: cuda (NVIDIA GeForce ...)`

### CPU

Sin GPU, YOLOv8 usa CPU. Recomendaciones:
- Usar perfil `yolov8n` (nano)
- Reducir `imgsz` a 320
- Aumentar `skip_frames` a 4-5

---

## Benchmarking

El archivo `backend/test_yolo.py` compara modelos:
```bash
python backend/test_yolo.py
```

Mide:
- Tiempo de inferencia por frame
- Número de detecciones
- FPS estimado

Resultados orientativos en CPU moderna:

| Modelo | imgsz | Tiempo/frame | FPS |
|--------|-------|-------------|-----|
| yolov8n | 320 | ~80ms | ~12 |
| yolov8s | 320 | ~150ms | ~6 |
| yolov8m | 320 | ~350ms | ~3 |

En GPU (RTX 3060+):

| Modelo | imgsz | Tiempo/frame | FPS |
|--------|-------|-------------|-----|
| yolov8n | 320 | ~8ms | ~125 |
| yolov8s | 320 | ~12ms | ~80 |
| yolov8m | 480 | ~20ms | ~50 |

---

## Categorías Detectables (17 objetos)

| Categoría | Color Bounding Box |
|-----------|-------------------|
| person | Verde |
| car, truck, bus, motorcycle | Naranja |
| bicycle | Amarillo |
| dog, cat, bird | Cyan |
| cell phone, laptop, tv | Rosa |
| bottle, cup | Azul claro |
| chair, couch | Marrón |
| book | Gris |

Los colores están definidos en `CATEGORY_COLORS` en `core_pipeline.py:69`.
