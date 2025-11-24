from fastapi import APIRouter, Body
from ..models import HealthResponse, SerialSendRequest, SerialSendResponse

router = APIRouter(prefix="/api", tags=["api"])

@router.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(status="ok")

# Este handler real de escritura se reemplaza en main con un closure que llama al worker
async def _serial_send_passthrough(_: SerialSendRequest) -> SerialSendResponse:
    return SerialSendResponse(ok=False, bytes_written=0)

_serial_send_handler = _serial_send_passthrough

def set_serial_send_handler(fn):
    global _serial_send_handler
    _serial_send_handler = fn

@router.post("/serial/send", response_model=SerialSendResponse)
async def serial_send(req: SerialSendRequest = Body(...)):
    """
    Enviar texto tal cual al puerto serial.
    Nota: si tu firmware espera salto de línea, incluye '\n' en req.data.
    """
    return await _serial_send_handler(req)
