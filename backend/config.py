# backend/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Configuración del ESP32
    esp32_ip: str = "192.168.48.86"
    esp32_stream_port: int = 81
    esp32_stream_path: str = "/stream"
    
    # Configuración de la API
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False
    )

# Instancia única (singleton)
settings = Settings()