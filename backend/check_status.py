import subprocess
import re
import sys
from pathlib import Path

CONFIG_PATH = Path(__file__).parent / "config.py"

def parse_config():
    text = CONFIG_PATH.read_text(encoding="utf-8")

    profile_match = re.search(r'ACTIVE_PROFILE\s*=\s*"(.+?)"', text)
    if not profile_match:
        print("Error: no se pudo leer ACTIVE_PROFILE en config.py")
        sys.exit(1)
    active = profile_match.group(1)

    ip_match = re.search(
        rf'"{active}"\s*:\s*\{{[^}}]*?"esp32_ip"\s*:\s*"([0-9.]+)"',
        text,
        re.DOTALL,
    )
    if not ip_match:
        print(f"Error: no se encontró esp32_ip para el perfil '{active}'")
        sys.exit(1)

    return active, ip_match.group(1)


def ping(ip: str) -> bool:
    result = subprocess.run(
        ["ping", "-c", "1", "-W", "2", ip],
        capture_output=True,
        text=True,
    )
    return result.returncode == 0


def main():
    profile, esp32_ip = parse_config()
    print(f"Perfil activo: {profile}")
    print(f"ESP32 IP:      {esp32_ip}")
    print(f"Pingeando {esp32_ip} ... ", end="", flush=True)

    if ping(esp32_ip):
        print("¡ROBOT VISIBLE EN LA RED!")
    else:
        print("NO responde — robot no visible o IP incorrecta")


if __name__ == "__main__":
    main()
