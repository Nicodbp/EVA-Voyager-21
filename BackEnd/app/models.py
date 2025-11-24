from typing import Any, Dict, Optional, List
from pydantic import BaseModel, Field


class TelemetryRover(BaseModel):
    """
    Telemetría normalizada del rover según el orden que indicaste.
    """
    timestamp: float = Field(..., description="Epoch seconds (float).")
    rssi: int
    avg_rssi: int
    temp1: float
    hum1: float
    temp2: float
    hum2: float
    v_esp: float
    i_esp: float
    p_esp: float
    v_m1: float
    i_m1: float
    p_m1: float
    v_m2: float
    i_m2: float
    p_m2: float
    acc_x: float
    acc_y: float
    acc_z: float
    gyro_x: float
    gyro_y: float
    gyro_z: float
    dist1: float
    dist2: float
    dist3: float

    # --- NUEVOS CAMPOS PARA EL GRID 20x20 ---
    # Estos los vas a llenar en el parser a partir de los 3 bits de acción y obstáculos
    action_code: Optional[int] = Field(
        None,
        description="Código numérico (0–7) derivado de los 3 bits de acción (000,001,010,011,100,…).",
    )
    obstacle_code: Optional[int] = Field(
        None,
        description="Código numérico (0,1,2,4) derivado de los 3 bits de obstáculos (000,100,010,001).",
    )
    action_bits: Optional[str] = Field(
        None,
        description="Cadena binaria cruda de 3 bits de acción tal como llegó por serial, ej. '001'.",
    )
    obstacle_bits: Optional[str] = Field(
        None,
        description="Cadena binaria cruda de 3 bits de obstáculos tal como llegó por serial, ej. '010'.",
    )

    # Línea cruda completa (por si quieres debug)
    raw: Optional[str] = None


class ImageFrame(BaseModel):
    """
    Imagen recibida por serial en Base64.
    """
    timestamp: float = Field(..., description="Epoch seconds (float).")
    data_url: str = Field(..., description="data:<mime>;base64,<payload>")
    raw_len: int


class HealthResponse(BaseModel):
    status: str


class SerialSendRequest(BaseModel):
    """
    Cuerpo para enviar datos por serial (texto).

    Acepta tanto `line` como `data` para compatibilidad:
    - El frontend nuevo envía `line`.
    - Código viejo podría seguir usando `data`.
    """
    line: Optional[str] = Field(
        None,
        description="Cadena a enviar tal cual al puerto (el backend puede añadir \\n).",
    )
    data: Optional[str] = Field(
        None,
        description="Alias opcional de la misma cadena. Se prioriza `line` si ambas existen.",
    )


class SerialSendResponse(BaseModel):
    ok: bool
    bytes_written: int
