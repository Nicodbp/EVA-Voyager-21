# app/main.py
import asyncio
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .core.ws import WSManager
from .models import (
    TelemetryRover,
    ImageFrame,
    SerialSendRequest,
    SerialSendResponse,
)
from .routers import api as api_router
from .services.serial_service import SerialWorker  # asegúrate que el archivo sea serial_service.py

app = FastAPI(title="Backend Rover Serial", version="1.0.0")

# ---------- CORS ----------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

ws_manager = WSManager()
serial_worker: SerialWorker | None = None

# Log rápido de configuración al importar el módulo
print(
    f"[Settings] serial_enabled={settings.serial_enabled} "
    f"port={settings.serial_port!r} baud={settings.serial_baud} "
    f"timeout={settings.serial_timeout_s}"
)

# ---------------- WebSocket ----------------
@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    """
    WebSocket principal:
    - Recibe comandos desde el frontend (serial_write, wasd, raw).
    - La telemetría e imagen NO se reciben aquí: se emiten desde el SerialWorker
      vía ws_manager.broadcast_json().
    """
    await ws_manager.connect(ws)
    try:
        while True:
            # Recibir comandos entrantes del cliente
            text = await ws.receive_text()
            try:
                data = json.loads(text)
            except Exception:
                # Ignora mensajes no-JSON
                continue

            t = data.get("type")

            # 1) Monitor serial (vía WS): enviar texto al puerto
            if t == "serial_write":
                # Acepta tanto "data" como "line" por compatibilidad
                msg = str(data.get("data") or data.get("line") or "")
                if serial_worker and msg:
                    try:
                        serial_worker.send_line(msg, append_nl=True)
                    except Exception as e:
                        print("[WS] Error en serial_write:", e)
                        # No tiramos la conexión por errores del serial

            # 2) Controles WASD
            elif t == "wasd":
                key = str(data.get("key", "")).lower()
                duration = data.get("duration_ms", None)
                if serial_worker and key:
                    try:
                        serial_worker.send_wasd(key, duration_ms=duration)
                    except Exception as e:
                        print("[WS] Error en wasd:", e)

            # 3) Envío crudo opcional
            elif t == "raw":
                payload = str(data.get("payload", ""))
                if serial_worker and payload:
                    try:
                        serial_worker.send_line(payload, append_nl=True)
                    except Exception as e:
                        print("[WS] Error en raw:", e)

            # Agrega aquí otros tipos si los necesitas

    except WebSocketDisconnect:
        ws_manager.disconnect(ws)
    except Exception as e:
        print("[WS] Error genérico en ws_endpoint:", e)
        ws_manager.disconnect(ws)


# --------- Helpers para emitir en WS (desde el hilo serial) ---------
async def emit_ws_telemetry(tm: TelemetryRover):
    """
    Enviar telemetría a todos los clientes WS.
    Formato:
      { type: "telemetry", data: { ...campos de TelemetryRover... } }
    que es justo lo que está esperando tu hook/useTelemetry en el frontend.
    """
    await ws_manager.broadcast_json(
        {
            "type": "telemetry",
            "data": tm.model_dump(),  # Pydantic v2
        }
    )


async def emit_ws_image(img: ImageFrame):
    """
    Enviar frame de imagen a todos los clientes WS:
      { type: "image", data: { data_url, timestamp, ... } }
    """
    await ws_manager.broadcast_json(
        {
            "type": "image",
            "data": img.model_dump(),
        }
    )


async def emit_ws_console(payload: dict):
    """
    Consola para el front:
    - serial_in:  líneas que llegan del puerto
    - serial_out: eco de lo que enviamos al puerto
    - serial_status: opened/disconnected, etc.

    El SerialWorker ya arma estos payloads con:
      { "type": "serial_in" | "serial_out" | "serial_status", ... }
    """
    await ws_manager.broadcast_json(payload)


# --------- Lógica común para enviar por serial ---------
async def _serial_send_core(req: SerialSendRequest) -> SerialSendResponse:
    """
    Lógica central para /api/serial/send y para cualquier otro handler
    que quiera reutilizarla.
    """
    global serial_worker
    if not serial_worker:
        return SerialSendResponse(ok=False, bytes_written=0)

    # Aceptamos tanto "line" como "data", priorizando "line"
    line = (req.line or req.data or "").rstrip("\r\n")

    if not line:
        return SerialSendResponse(ok=False, bytes_written=0)

    try:
        n = serial_worker.send_line(line, append_nl=True)
        return SerialSendResponse(ok=True, bytes_written=n)
    except Exception as e:
        print("[API] Error en _serial_send_core:", e)
        return SerialSendResponse(ok=False, bytes_written=0)


# --------- Endpoint REST directo para el monitor serial ---------
@app.post("/api/serial/send", response_model=SerialSendResponse)
async def api_serial_send(req: SerialSendRequest) -> SerialSendResponse:
    """
    Endpoint que usa el monitor serial del frontend:
    POST /api/serial/send  body: { "line": "..." } o { "data": "..." }
    """
    return await _serial_send_core(req)


# ---------------- Ciclo de vida ----------------
@app.on_event("startup")
async def startup():
    global serial_worker
    loop = asyncio.get_running_loop()

    if settings.serial_enabled:
        serial_worker = SerialWorker(
            loop=loop,
            emit_ws_telemetry=emit_ws_telemetry,
            emit_ws_image=emit_ws_image,
            emit_ws_console=emit_ws_console,  # consola WS
        )
        serial_worker.start()
        print("[App] SerialWorker iniciado.")
    else:
        print("[App] Serial deshabilitado por settings.")

    # Si tu routers/api.py tiene este helper, lo usamos; si no, no pasa nada.
    try:
        api_router.set_serial_send_handler(_serial_send_core)
        print("[App] api_router.set_serial_send_handler configurado.")
    except AttributeError:
        print("[App] api_router no tiene set_serial_send_handler; se ignora.")


@app.on_event("shutdown")
async def shutdown():
    global serial_worker
    if serial_worker:
        serial_worker.stop()
        serial_worker = None
    print("[App] Terminada.")


# --------- Router REST principal (/api/...) ---------
app.include_router(api_router.router, prefix="/api")
