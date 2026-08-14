"""Background worker that drains the queue with retry/backoff logic."""

from __future__ import annotations

import logging
import threading
import time

from .config import Config
from .led_controller import LEDController, LEDState
from .queue_store import QueueStore
from .uploader import Uploader, compute_backoff

logger = logging.getLogger(__name__)


class UploadWorker:
    """Drains QueueStore items, retrying with backoff. Runs in its own thread."""

    _POLL_INTERVAL = 2.0  # seconds between drain cycles

    def __init__(
        self,
        queue: QueueStore,
        uploader: Uploader,
        led: LEDController,
        cfg: Config,
    ) -> None:
        self._queue = queue
        self._uploader = uploader
        self._led = led
        self._cfg = cfg
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, daemon=True, name="upload-worker")
        self._thread.start()

    def stop(self, timeout: float = 5.0) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=timeout)

    def _run(self) -> None:
        logger.info("Upload worker started")
        while not self._stop.is_set():
            try:
                self._drain()
            except Exception as exc:
                logger.exception("Upload worker unhandled error: %s", exc)
            self._stop.wait(self._POLL_INTERVAL)
        logger.info("Upload worker stopped")

    def _drain(self) -> None:
        while not self._stop.is_set():
            item = self._queue.next_ready()
            if item is None:
                # Update LED: if queue has pending items waiting for backoff → QUEUED
                if self._queue.count_pending() > 0:
                    self._led.transition(LEDState.QUEUED)
                else:
                    # No items at all or all done — back to READY
                    if self._queue.count_pending() == 0 and self._led.state not in (
                        LEDState.CAPTURING,
                        LEDState.ERROR,
                    ):
                        self._led.transition(LEDState.READY)
                break

            image_path = item.image_path
            logger.info(
                "Attempting upload item id=%d path=%s (attempt %d)",
                item.id,
                image_path.name,
                item.attempts + 1,
            )

            # Validate image file exists
            if not image_path.exists():
                logger.error("Image missing, quarantining item id=%d", item.id)
                self._queue.quarantine(item.id)
                continue

            self._led.transition(LEDState.UPLOADING)
            result = self._uploader.upload(image_path)

            if result.success:
                # Delete local file ONLY after backend acknowledgment
                try:
                    image_path.unlink()
                    logger.info("Deleted uploaded image: %s", image_path.name)
                except OSError as exc:
                    logger.warning("Could not delete image %s: %s", image_path.name, exc)
                self._queue.mark_done(item.id)
                self._led.transition(LEDState.READY)
                continue

            if result.permanent_failure:
                self._queue.mark_failed(item.id)
                self._led.transition(LEDState.ERROR)
                break

            # Transient failure — schedule retry
            new_attempts = item.attempts + 1
            if new_attempts >= self._cfg.max_retries:
                logger.error("Max retries reached for item id=%d, marking failed", item.id)
                self._queue.mark_failed(item.id)
                self._led.transition(LEDState.ERROR)
                break

            if result.retry_after is not None:
                delay = result.retry_after
            else:
                delay = compute_backoff(
                    new_attempts,
                    self._cfg.backoff_base,
                    self._cfg.backoff_cap,
                )

            next_retry = time.time() + delay
            self._queue.mark_retry(item.id, next_retry, new_attempts)
            logger.info(
                "Scheduled retry for item id=%d in %.1fs (attempt %d/%d)",
                item.id,
                delay,
                new_attempts,
                self._cfg.max_retries,
            )
            self._led.transition(LEDState.QUEUED)
            break  # let the poll loop handle next cycle
