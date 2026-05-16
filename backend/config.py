import os
import json
import socket
from pydantic_settings import BaseSettings, SettingsConfigDict

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
PROFILES_FILE = os.path.join(DATA_DIR, "profiles.json")
ACTIVE_CONFIG_FILE = os.path.join(DATA_DIR, "active_config.json")

_cached_local_ip = None

def get_local_ip():
    """Detecta la IP local de este ordenador en la red actual.
    Cachea el resultado para que sea consistente durante toda la sesión."""
    global _cached_local_ip
    if _cached_local_ip:
        return _cached_local_ip
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # No necesita conectar realmente, solo simula una conexión externa para ver qué interfaz usa
        s.connect(('8.8.8.8', 1))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    _cached_local_ip = ip
    return ip

def auto_update_profile_ip():
    """Actualiza automáticamente la backend_ip del perfil activo
    con la IP real detectada. Así no hay que cambiarla a mano nunca."""
    real_ip = get_local_ip()
    if real_ip == '127.0.0.1':
        return  # No actualizar si no hay red
    
    try:
        profiles = load_profiles()
    except Exception:
        return
    
    active = load_active_config()
    profile_name = (active or {}).get('active_profile', ACTIVE_PROFILE if 'ACTIVE_PROFILE' in dir() else 'casa-wifi-habitacion')
    
    changed = False
    if profile_name in profiles:
        if profiles[profile_name].get('backend_ip') != real_ip:
            profiles[profile_name]['backend_ip'] = real_ip
            changed = True
    
    if changed:
        save_profiles(profiles)
        print(f">> Perfil '{profile_name}' actualizado: backend_ip -> {real_ip}")

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
    ACTIVE_PROFILE = "casa-wifi-habitacion"

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

# Auto-actualizar la IP del perfil activo al arrancar
auto_update_profile_ip()

# Para debugging y esas cosas raras
real_ip = get_local_ip()
print(f"\n{'='*50}")
print(f" CONFIGURACION INICIAL")
print(f" Perfil activo: {ACTIVE_PROFILE}")
print(f" IP detectada:  {real_ip}")
print(f" Backend URL:   http://{real_ip}:8000")
print(f"{'='*50}\n")
