from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from core_pipeline import run_detection_session

app = FastAPI()


# Cors 
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Para comprobar que el backend funciona
@app.get("/health")
async def health_check():
    return {"status": "ok"}






