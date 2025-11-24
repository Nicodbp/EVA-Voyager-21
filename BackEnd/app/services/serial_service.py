# app/services/serial_services.py
import threading
import serial
import time
import asyncio
from typing import Optional, Callable

from ..core.config import settings
from ..models import TelemetryRover, ImageFrame
from .rover_parser import try_parse_telemetry, try_parse_image


class SerialWorker:
    """
    Hilo lector del puerto serial:
    - Lee por líneas (terminadas en \n).
    - Intenta parsear telemetría o imagen y llama callbacks asíncronos (emit_ws_*).
    - Expone send_line(text) para escritura por serial (monitor) y send_wasd(key, duration_ms) para controles.
    - Emite a consola WS lo recibido (serial_in) y eco de lo enviado (serial_out) si se provee emit_ws_console.
    """

    def __init__(
        self,
        loop: asyncio.AbstractEventLoop,
        emit_ws_telemetry: Callable[[TelemetryRover], "asyncio.Future"],
        emit_ws_image: Callable[[ImageFrame], "asyncio.Future"],
        emit_ws_console: Optional[Callable[[dict], "asyncio.Future"]] = None,
        # Mapea teclas a cadenas. Ajusta al formato que espera tu firmware.
        wasd_map: Optional[dict] = None,
    ):
        self.loop = loop
        self.emit_ws_telemetry = emit_ws_telemetry
        self.emit_ws_image = emit_ws_image
        self.emit_ws_console = emit_ws_console

        self._ser: Optional[serial.Serial] = None
        self._thread: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._wlock = threading.Lock()

        # Mapeo por defecto: "CMD:<key>"
        self.wasd_map = wasd_map or {
            "w": "CMD:w",
            "a": "CMD:a",
            "s": "CMD:s",
            "d": "CMD:d",
            " ": "CMD:stop",
        }

    # ---------- Ciclo de vida ----------
    def start(self):
        """
        Inicia el hilo lector. Intenta abrir el puerto una vez y luego delega
        la reconexión al loop interno.
        """
        self._stop.clear()
        self._open_port()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

        if self._ser and self._ser.is_open:
            print(f"[Serial] Abierto {settings.serial_port} @ {settings.serial_baud} bps")
        else:
            print(
                f"[Serial] No se pudo abrir {settings.serial_port} al inicio, "
                "se reintentará en background."
            )

    def stop(self):
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1.0)
        self._close_port()
        print("[Serial] Cerrado.")

    # ---------- API pública de envío ----------
    def send_line(self, text: str, append_nl: bool = True) -> int:
        """
        Escribe una línea al puerto serial (monitor).
        Devuelve bytes escritos. Agrega '\\n' por defecto.
        """
        if not text:
            return 0
        payload = f"{text}\n" if append_nl and not text.endswith("\n") else text
        n = self._write_bytes(payload.encode("utf-8", errors="ignore"))

        # Eco a consola de WS (opcional)
        self._emit_console_safe(
            {
                "type": "serial_out",
                "line": payload.rstrip("\r\n"),
                "ts": time.time(),
            }
        )
        return n

    def send_wasd(self, key: str, duration_ms: Optional[int] = None):
        """
        Envía un comando WASD mapeado. Ajusta a tu firmware:
        - Por defecto manda, p.ej., "CMD:w" y para stop "CMD:stop".
        - Si usas JSON, cambia el mapeo en wasd_map o sobrescribe esta función.
        """
        if not key:
            return
        k = key.lower()
        cmd = self.wasd_map.get(k)
        if not cmd:
            return

        if duration_ms is not None:
            line = f"{cmd},{int(duration_ms)}"
        else:
            line = cmd

        self.send_line(line, append_nl=True)

    # ---------- Internos ----------
    def _run(self):
        while not self._stop.is_set():
            try:
                if not self._ser or not self._ser.is_open:
                    # Estado desconectado: notifica y trata de reabrir
                    self._emit_console_safe(
                        {
                            "type": "serial_status",
                            "event": "disconnected",
                            "ts": time.time(),
                        }
                    )
                    self._try_reopen_with_backoff()
                    continue

                # Lee hasta '\n' o hasta timeout
                data = self._ser.readline()
                if not data:
                    # Timeout sin datos -> simplemente intenta otra vez
                    continue

                line = data.decode("utf-8", errors="ignore").strip()
                if not line:
                    continue
                print("[Serial] Línea recibida cruda:", repr(line))

                # Siempre mandamos primero la línea cruda al monitor WS
                self._emit_console_safe(
                    {
                        "type": "serial_in",
                        "line": line,
                        "ts": time.time(),
                    }
                )

                 # 1) Telemetría (con try/except local para no tirar el loop)
                try:
                    tm = try_parse_telemetry(line)
                except Exception as e:
                    print(f"[Serial] Error parseando telemetría: {e}")
                    tm = None

                if tm is not None:
                    print("[Serial] Telemetría parseada OK:", tm.dict())
                    asyncio.run_coroutine_threadsafe(
                        self.emit_ws_telemetry(tm), self.loop
                    )
                    continue


                # 2) Imagen (también protegido)
                try:
                    img = try_parse_image(line)
                except Exception as e:
                    print(f"[Serial] Error parseando imagen: {e}")
                    img = None

                if img is not None:
                    asyncio.run_coroutine_threadsafe(
                        self.emit_ws_image(img), self.loop
                    )
                    # opcional: en consola mostramos marcador genérico
                    self._emit_console_safe(
                        {
                            "type": "serial_in",
                            "line": "<image_frame_base64>",
                            "ts": time.time(),
                        }
                    )
                    continue

                # 3) Si no es telemetría ni imagen, ya fue enviada como serial_in arriba,
                #    no hacemos nada más.
                #    (Si quieres filtrar logs ruidosos, puedes meter lógica aquí.)

            except serial.SerialException as e:
                # Error de puerto (desconexión, permiso, etc.) -> cerrar y reintentar
                print(f"[Serial] SerialException, se considerará desconectado: {e}")
                self._emit_console_safe(
                    {
                        "type": "serial_status",
                        "event": "disconnected",
                        "ts": time.time(),
                    }
                )
                self._close_port()
                time.sleep(1.0)  # pequeño margen antes de que la próxima iteración intente reabrir

            except Exception as e:
                # Errores genéricos del loop (no de parseo específico)
                print(f"[Serial] Error en loop serial (no desconecta): {e}")
                time.sleep(0.1)

    def _open_port(self):
        try:
            self._ser = serial.Serial(
                port=settings.serial_port,
                baudrate=settings.serial_baud,
                timeout=settings.serial_timeout_s,
            )
            # (Opcional) limpiar buffers iniciales
            try:
                self._ser.reset_input_buffer()
                self._ser.reset_output_buffer()
            except Exception:
                pass

            self._emit_console_safe(
                {
                    "type": "serial_status",
                    "event": "opened",
                    "port": settings.serial_port,
                    "baud": settings.serial_baud,
                    "ts": time.time(),
                }
            )
        except Exception as e:
            self._ser = None
            print(f"[Serial] No se pudo abrir {settings.serial_port}: {e}")

    def _close_port(self):
        try:
            if self._ser and self._ser.is_open:
                self._ser.close()
        except Exception:
            pass
        finally:
            self._ser = None

    def _try_reopen_with_backoff(self):
        # Backoff simple: intenta cada 1.0 s
        self._close_port()
        time.sleep(1.0)
        self._open_port()

    def _write_bytes(self, data: bytes) -> int:
        if not self._ser or not self._ser.is_open:
            raise RuntimeError("Puerto serial no abierto.")
        with self._wlock:
            return self._ser.write(data)

    def _emit_console_safe(self, payload: dict):
        if not self.emit_ws_console:
            return
        try:
            asyncio.run_coroutine_threadsafe(
                self.emit_ws_console(payload), self.loop
            )
        except Exception:
            # No queremos que un error de WS rompa el hilo serial
            pass
