# backend/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict

NETWORK_PROFILES = {
    "casa": {
        "esp32_ip": "192.168.1.132",
        "esp32_stream_port": 8080,
        "esp32_stream_path": "/video"
    },
    "instituto": {
        "esp32_ip": "192.168.48.86",
        "esp32_stream_port": 8080,
        "esp32_stream_path": "/video"
    },
    "pruebas_movil": {
        "esp32_ip": "192.168.0.50",
        "esp32_stream_port": 8080,
        "esp32_stream_path": "/video"
    }
}

ACTIVE_PROFILE = "casa"

class Settings(BaseSettings):
    # Configuración del ESP32
    esp32_ip: str = NETWORK_PROFILES[ACTIVE_PROFILE]["esp32_ip"]
    esp32_stream_port: int = NETWORK_PROFILES[ACTIVE_PROFILE]["esp32_stream_port"]
    esp32_stream_path: str = NETWORK_PROFILES[ACTIVE_PROFILE]["esp32_stream_path"]
    
    # Configuración de la API
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    
    model_config = SettingsConfigDict(
        # No usamos el archivo .env ya que quiero tener varias ips
        #env_file=".env",
        env_file= None,
        env_file_encoding="utf-8",
        case_sensitive=False
    )

# Instancia única (singleton)
settings = Settings()

# Para debug
print(f"Perfil activo: {ACTIVE_PROFILE}")
print(f"IP del ESP32: {settings.esp32_ip}")