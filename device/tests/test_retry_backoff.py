"""Tests for exponential backoff and Retry-After handling in UploadWorker."""

from __future__ import annotations

import time
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from ark3_device.config import Config
from ark3_device.gpio_adapter import MockGPIOAdapter
from ark3_device.led_controller import LEDController
from ark3_device.queue_store import QueueStore
from ark3_device.upload_worker import UploadWorker
from ark3_device.uploader import UploadResult, compute_backoff


@pytest.mark.parametrize(
    "attempt,expected_max",
    [
        (0, 1.0),
        (1, 2.0),
        (2, 4.0),
        (5, 32.0),
        (10, 60.0),  # capped
        (20, 60.0),  # capped
    ],
)
def test_compute_backoff_is_bounded(attempt: int, expected_max: float) -> None:
    for _ in range(50):
        val = compute_backoff(attempt, base=1.0, cap=60.0)
        assert 0.0 <= val <= expected_max + 0.001


def _make_worker(
    queue: QueueStore,
    cfg: Config,
    uploader_mock: MagicMock,
) -> UploadWorker:
    gpio = MockGPIOAdapter()
    led = LEDController(gpio, 27, 22)
    return UploadWorker(queue, uploader_mock, led, cfg)


def test_successful_upload_deletes_file_and_marks_done(
    queue: QueueStore, tmp_queue_dir: Path, base_cfg: Config
) -> None:
    img = tmp_queue_dir / "ok.jpg"
    img.write_bytes(b"x")
    queue.enqueue(img)

    uploader = MagicMock()
    uploader.upload.return_value = UploadResult(success=True)

    worker = _make_worker(queue, base_cfg, uploader)
    worker._drain()

    assert not img.exists()
    assert queue.count_pending() == 0


def test_permanent_failure_marks_failed_no_delete(
    queue: QueueStore, tmp_queue_dir: Path, base_cfg: Config
) -> None:
    img = tmp_queue_dir / "bad.jpg"
    img.write_bytes(b"x")
    queue.enqueue(img)

    uploader = MagicMock()
    uploader.upload.return_value = UploadResult(permanent_failure=True)

    worker = _make_worker(queue, base_cfg, uploader)
    worker._drain()

    assert img.exists()  # NOT deleted — only deleted on success
    assert queue.count_pending() == 0  # failed, not pending


def test_retry_after_header_used(queue: QueueStore, tmp_queue_dir: Path, base_cfg: Config) -> None:
    img = tmp_queue_dir / "rate.jpg"
    img.write_bytes(b"x")
    queue.enqueue(img)

    uploader = MagicMock()
    uploader.upload.return_value = UploadResult(retry_after=42.0)

    worker = _make_worker(queue, base_cfg, uploader)
    worker._drain()

    # Item should still be pending with next_retry ~42s in future
    assert queue.count_pending() == 1
    ready = queue.next_ready()
    assert ready is None  # not ready yet (next_retry in future)


def test_max_retries_marks_failed(queue: QueueStore, tmp_queue_dir: Path, base_cfg: Config) -> None:
    img = tmp_queue_dir / "exhausted.jpg"
    img.write_bytes(b"x")
    item = queue.enqueue(img)

    # Simulate item already at max_retries - 1
    queue.mark_retry(item.id, time.time() - 1, base_cfg.max_retries - 1)

    uploader = MagicMock()
    uploader.upload.return_value = UploadResult()  # transient failure

    worker = _make_worker(queue, base_cfg, uploader)
    worker._drain()

    assert queue.count_pending() == 0  # failed


def test_missing_image_is_quarantined(
    queue: QueueStore, tmp_queue_dir: Path, base_cfg: Config
) -> None:
    img = tmp_queue_dir / "ghost.jpg"
    # Do NOT create the file
    queue.enqueue(img)

    uploader = MagicMock()
    worker = _make_worker(queue, base_cfg, uploader)
    worker._drain()

    uploader.upload.assert_not_called()
    assert queue.count_pending() == 0
