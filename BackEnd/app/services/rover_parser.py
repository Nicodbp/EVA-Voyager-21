# Rover_parser.py
import base64
import time
from typing import Optional, Tuple, List
from ..core.config import settings
from ..models import TelemetryRover, ImageFrame

# Orden declarado por ti:
# Rssi, avgRssi, Temp1, Hum1, Temp2, Hum2, V Esp, I Esp, P Esp,
# V M1, I M1, P M1, V M2, I M2, P M2, acc X, acc Y, acc Z,
# gyro X, gyro Y, gyro Z, Dist1, Dist2, Dist3
#
# => SON 24 CAMPOS NUMÉRICOS
#
# Ahora, OPCIONALMENTE, al final del mensaje pueden venir 2 campos extra:
# - action_bits (3 bits en ASCII, ej. "001")
# - obstacle_bits (3 bits en ASCII, ej. "100")

def try_parse_telemetry(line: str) -> Optional[TelemetryRover]:
    """
    Si la línea comienza con el prefijo de telemetría, parsea los 24 valores numéricos
    y, opcionalmente, 2 campos binarios (acción y obstáculos) al final.
    Devuelve TelemetryRover. En error, regresa None.
    """
    pref = settings.serial_telemetry_prefix
    if not line.startswith(pref):
        return None

    payload = line[len(pref):].strip()
    parts = [p.strip() for p in payload.split(",") if p.strip() != ""]

    # Necesitamos al menos los 24 campos numéricos originales.
    if len(parts) < 24:
        return None  # número incorrecto de campos

    # Los primeros 24 SIEMPRE se interpretan como números
    numeric_parts = parts[:24]
    # A partir de aquí pueden venir los bits o nada
    extra_parts = parts[24:]

    def f(x: str) -> float:
        # permite enteros y flotantes
        try:
            return float(x)
        except Exception:
            return float("nan")

    now = time.time()

    # mapea los 24 campos originales
    (
        rssi, avg_rssi,
        t1, h1, t2, h2,
        vesp, iesp, pesp,
        vm1, im1, pm1,
        vm2, im2, pm2,
        ax, ay, az,
        gx, gy, gz,
        d1, d2, d3,
    ) = [f(x) for x in numeric_parts]

    # --- NUEVO: intentar leer bits de acción y obstáculos si vienen ----
    action_bits: Optional[str] = None
    obstacle_bits: Optional[str] = None
    action_code: Optional[int] = None
    obstacle_code: Optional[int] = None

    # Caso esperado: 24 numéricos + 2 campos binarios = 26 partes
    if len(extra_parts) >= 2:
        action_bits = extra_parts[-2].strip()
        obstacle_bits = extra_parts[-1].strip()

        # Validación mínima: que sean 3 caracteres y solo 0/1
        def is_3bit_bin(s: str) -> bool:
            return len(s) == 3 and all(ch in "01" for ch in s)

        if is_3bit_bin(action_bits):
            try:
                action_code = int(action_bits, 2)
            except ValueError:
                action_code = None
        if is_3bit_bin(obstacle_bits):
            try:
                obstacle_code = int(obstacle_bits, 2)
            except ValueError:
                obstacle_code = None

    return TelemetryRover(
        timestamp=now,
        rssi=int(rssi),
        avg_rssi=int(avg_rssi),
        temp1=t1, hum1=h1, temp2=t2, hum2=h2,
        v_esp=vesp, i_esp=iesp, p_esp=pesp,
        v_m1=vm1, i_m1=im1, p_m1=pm1,
        v_m2=vm2, i_m2=im2, p_m2=pm2,
        acc_x=ax, acc_y=ay, acc_z=az,
        gyro_x=gx, gyro_y=gy, gyro_z=gz,
        dist1=d1, dist2=d2, dist3=d3,
        action_bits=action_bits,
        obstacle_bits=obstacle_bits,
        action_code=action_code,
        obstacle_code=obstacle_code,
        raw=line.strip(),
    )


def try_parse_image(line: str) -> Optional[ImageFrame]:
    """
    Si la línea comienza con el prefijo de imagen, interpreta el resto como Base64
    y devuelve un ImageFrame con data_url listo para el frontend.
    """
    pref = settings.serial_image_prefix
    if not line.startswith(pref):
        return None
    b64 = line[len(pref):].strip()

    # Validación mínima de base64:
    try:
        raw = base64.b64decode(b64, validate=True)
    except Exception:
        return None

    data_url = f"data:{settings.serial_image_mime};base64,{b64}"
    return ImageFrame(timestamp=time.time(), data_url=data_url, raw_len=len(raw))
