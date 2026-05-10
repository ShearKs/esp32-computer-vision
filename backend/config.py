import json
import os
from pydantic_settings import BaseSettings, SettingsConfigDict

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
PROFILES_FILE = os.path.join(DATA_DIR, "profiles.json")
ACTIVE_CONFIG_FILE = os.path.join(DATA_DIR, "active_config.json")

def load_profiles():
    with open(PROFILES_FILE, "r") as f:
        return json.load(f)

def save_profiles(profiles):
    with open(PROFILES_FILE, "w") as f:
        json.dump(profiles, f, indent=2)

def load_active_config():
    try:
        with open(ACTIVE_CONFIG_FILE, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None

def save_active_config(config):
    with open(ACTIVE_CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=2)

NETWORK_PROFILES = load_profiles()

_active = load_active_config()
if _active and _active.get("active_profile") in NETWORK_PROFILES:
    ACTIVE_PROFILE = _active["active_profile"]
else:
    ACTIVE_PROFILE = "casa"

class Settings(BaseSettings):
    backend_ip: str = NETWORK_PROFILES[ACTIVE_PROFILE]["backend_ip"]
    esp32_ip: str = NETWORK_PROFILES[ACTIVE_PROFILE]["esp32_ip"]
    esp32_stream_port: int = NETWORK_PROFILES[ACTIVE_PROFILE]["esp32_stream_port"]
    esp32_stream_path: str = NETWORK_PROFILES[ACTIVE_PROFILE]["esp32_stream_path"]

    api_host: str = "0.0.0.0"
    api_port: int = 8000

    model_config = SettingsConfigDict(
        env_file=None,
        env_file_encoding="utf-8",
        case_sensitive=False
    )

settings = Settings()

# Para debugging y esas cosas raras
print(f"Perfil activo: {ACTIVE_PROFILE}")
# print(f"IP del ESP32: {settings.esp32_ip}")
