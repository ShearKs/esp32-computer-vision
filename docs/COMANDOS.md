

## Iniciar servidor uvicorn
Tiene que estar en la carpeta backend

```python
uvicorn main:app --port 8000

winpty uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Para descargar los modelos de YOLO
cd backend/models
python -c "from ultralytics import YOLO; YOLO('yolov8m.pt')"


```
