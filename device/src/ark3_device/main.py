"""Main entry point for the ark3 device capture daemon."""

from __future__ import annotations

import argparse
import logging
import signal
import sys
import threading
from pathlib import Path

from .camera import CameraAdapter, build_camera
from .capture import CaptureError, atomic_capture
from .config import Config, load_config, read_token
from .gpio_adapter import GPIOAdapter, build_gpio
from .instance_lock import InstanceLock, InstanceLockError
from .led_controller import LEDController, LEDState
from .queue_store import QueueStore
from .upload_worker import UploadWorker
from .uploader import Uploader


def _setup_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )


class TokenProvider:
    """Lazy token provider — reads file once and caches."""

    def __init__(self, token_path: Path, mock_mode: bool) -> None:
        self._path = token_path
        self._mock_mode = mock_mode
        self._token: str | None = None

    def get_token(self) -> str:
        if self._token is None:
            self._token = read_token(self._path, self._mock_mode)
        return self._token


class App:
    """Top-level application; holds all resources and wires them together."""

    _LOCK_PATH = Path("/var/run/ark3/ark3-capture.lock")

    def __init__(self, cfg: Config) -> None:
        self._cfg = cfg
        self._shutdown = threading.Event()
        self._capture_lock = threading.Lock()

        # Validate: refuse simulated credentials in production mode
        if not cfg.mock_mode:
            token_path = cfg.token_path
            if not token_path.exists():
                raise RuntimeError(
                    f"Token file not found: {token_path}. "
                    "Run setup.sh and place device token first."
                )

        self._token_provider = TokenProvider(cfg.token_path, cfg.mock_mode)
        self._gpio: GPIOAdapter = build_gpio(cfg.mock_mode)
        self._camera: CameraAdapter = build_camera(cfg.mock_mode)

        db_path = cfg.queue_dir / "queue.db"
        self._queue = QueueStore(db_path)

        self._led = LEDController(self._gpio, cfg.green_led_pin, cfg.red_led_pin)

        uploader = Uploader(
            backend_url=cfg.backend_url,
            device_name=cfg.device_name,
            token_provider=self._token_provider,
            timeout=cfg.upload_timeout,
        )
        self._worker = UploadWorker(self._queue, uploader, self._led, cfg)

    def run(self) -> None:
        logger = logging.getLogger(__name__)
        cfg = self._cfg

        # Register signal handlers
        signal.signal(signal.SIGTERM, self._handle_signal)
        signal.signal(signal.SIGINT, self._handle_signal)

        logger.info(
            "ark3-device starting (mock_mode=%s, device=%s)",
            cfg.mock_mode,
            cfg.device_name,
        )

        # Setup button
        self._gpio.setup_button(
            cfg.button_pin,
            cfg.debounce_ms,
            self._on_button_press,
        )

        # Resume any queued items from prior run
        pending = self._queue.count_pending()
        if pending > 0:
            logger.info("Resuming with %d queued item(s)", pending)
            self._led.transition(LEDState.QUEUED)
        else:
            self._led.transition(LEDState.READY)

        self._worker.start()

        logger.info("Ready — press button on BCM%d to capture", cfg.button_pin)

        # Main loop
        while not self._shutdown.is_set():
            self._shutdown.wait(timeout=1.0)

        self._cleanup()
        logger.info("ark3-device stopped cleanly")

    def _on_button_press(self) -> None:
        logger = logging.getLogger(__name__)

        if not self._capture_lock.acquire(blocking=False):
            logger.debug("Button ignored — capture already in progress")
            return

        try:
            if self._shutdown.is_set():
                return

            if self._queue.count_all() >= self._cfg.max_queue:
                logger.warning("Queue full (%d items) — capture refused", self._cfg.max_queue)
                self._led.transition(LEDState.ERROR)
                return

            self._led.transition(LEDState.CAPTURING)
            try:
                path = atomic_capture(
                    self._camera,
                    self._cfg.queue_dir,
                    self._cfg.image_width,
                    self._cfg.image_height,
                    self._cfg.jpeg_quality,
                    self._cfg.disk_min_bytes,
                )
            except CaptureError as exc:
                logger.error("Capture failed: %s", exc)
                self._led.transition(LEDState.ERROR)
                return

            self._queue.enqueue(path)
            self._led.transition(LEDState.UPLOADING)
        finally:
            self._capture_lock.release()

    def _handle_signal(self, signum: int, frame: object) -> None:
        logging.getLogger(__name__).info("Signal %d received — shutting down", signum)
        self._shutdown.set()

    def _cleanup(self) -> None:
        logger = logging.getLogger(__name__)
        logger.info("Cleaning up resources")
        self._led.transition(LEDState.SHUTDOWN)
        self._worker.stop()
        self._queue.close()
        import contextlib

        with contextlib.suppress(Exception):
            self._camera.close()
        with contextlib.suppress(Exception):
            self._gpio.close()
        self._led.shutdown()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="ark3 device capture daemon")
    parser.add_argument(
        "--config",
        default="/etc/ark3/config.yaml",
        help="Path to config.yaml",
    )
    parser.add_argument(
        "--mock",
        action="store_true",
        help="Run in mock mode (no Pi hardware required)",
    )
    args = parser.parse_args(argv)

    cfg = load_config(Path(args.config), mock_mode=args.mock)
    _setup_logging(cfg.log_level)

    lock_path = App._LOCK_PATH
    try:
        with InstanceLock(lock_path):
            app = App(cfg)
            app.run()
    except InstanceLockError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
    except Exception as exc:
        logging.getLogger(__name__).exception("Fatal error: %s", exc)
        sys.exit(2)


if __name__ == "__main__":
    main()
