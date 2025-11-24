import os
from dotenv import load_dotenv
from pydantic import BaseModel

load_dotenv()

def _env_bool(name: str, default: bool) -> bool:
    v = os.getenv(name)
    if v is None:
        return default
    return str(v).strip().lower() in {"1","true","t","yes","y","on"}

def _env_str(name: str, default: str) -> str:
    v = os.getenv(name)
    if v is None:
        return default
    v = v.strip()
    return v or default

def _env_int(name: str, default: int) -> int:
    v = os.getenv(name)
    if v is None:
        return default
    v = v.strip()
    if not v:
        return default
    try:
        return int(v)
    except ValueError:
        return default

def _env_float(name: str, default: float) -> float:
    v = os.getenv(name)
    if v is None:
        return default
    v = v.strip()
    if not v:
        return default
    try:
        return float(v)
    except ValueError:
        return default

class Settings(BaseModel):
    # App/CORS
    app_host: str = _env_str("APP_HOST","0.0.0.0")
    app_port: int = _env_int("APP_PORT",8000)
    cors_allow_origins: list[str] = [
        s.strip() for s in os.getenv("CORS_ALLOW_ORIGINS","*").split(",")
    ]

    # Serial
    serial_enabled: bool  = _env_bool("SERIAL_ENABLED", True)
    serial_port: str      = _env_str("SERIAL_PORT","COM4")
    serial_baud: int      = _env_int("SERIAL_BAUD",115200)
    serial_timeout_s: float = _env_float("SERIAL_TIMEOUT_S",0.5)

    # Prefijos y formatos
    serial_telemetry_prefix: str = _env_str("SERIAL_TELEMETRY_PREFIX","RECV_ROVER_")
    serial_image_prefix: str     = _env_str("SERIAL_IMAGE_PREFIX","IMG_ROVER_")
    serial_image_mime: str       = _env_str("SERIAL_IMAGE_MIME","image/jpeg")

settings = Settings()
