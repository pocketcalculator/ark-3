"""Atomic capture flow: JPEG → durable temp → fsync → atomic rename into queue dir."""

from __future__ import annotations

import logging
import os
import time
import uuid
from pathlib import Path

from .camera import CameraAdapter

logger = logging.getLogger(__name__)


class CaptureError(Exception):
    """Raised when capture cannot produce a file."""


def atomic_capture(
    camera: CameraAdapter,
    queue_dir: Path,
    width: int,
    height: int,
    quality: int,
    disk_min_bytes: int,
) -> Path:
    """
    Capture a JPEG and atomically place it in queue_dir.

    Steps:
      1. Check available disk space.
      2. Capture JPEG bytes from camera.
      3. Write to a temp file in queue_dir, fsync, close.
      4. Atomic rename into final name.
    Returns the final file path.
    """
    queue_dir.mkdir(parents=True, exist_ok=True)
    _check_disk(queue_dir, disk_min_bytes)

    image_bytes = camera.capture(width, height, quality)
    if not image_bytes:
        raise CaptureError("Camera returned empty image data")

    timestamp = time.strftime("%Y%m%dT%H%M%S")
    uid = uuid.uuid4().hex[:8]
    final_name = f"capture_{timestamp}_{uid}.jpg"
    final_path = queue_dir / final_name
    tmp_path = queue_dir / f".tmp_{final_name}"

    try:
        with tmp_path.open("wb") as fh:
            fh.write(image_bytes)
            fh.flush()
            os.fsync(fh.fileno())
        tmp_path.rename(final_path)
        logger.info("Captured image: %s (%d bytes)", final_path.name, len(image_bytes))
    except OSError as exc:
        tmp_path.unlink(missing_ok=True)
        raise CaptureError(f"Failed to write capture: {exc}") from exc

    return final_path


def _check_disk(path: Path, min_bytes: int) -> None:
    try:
        st = os.statvfs(path)
        available = st.f_bavail * st.f_frsize
        if available < min_bytes:
            raise CaptureError(
                f"Insufficient disk space: {available} bytes available, {min_bytes} required"
            )
    except AttributeError:
        # Windows / non-POSIX — skip check in mock/dev mode
        pass
