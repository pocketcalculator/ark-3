"""Tests for atomic capture flow and disk-space guard."""

from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from ark3_device.camera import MockCameraAdapter
from ark3_device.capture import CaptureError, atomic_capture


def test_atomic_capture_produces_file(tmp_path: Path) -> None:
    q = tmp_path / "queue"
    q.mkdir()
    camera = MockCameraAdapter()

    path = atomic_capture(camera, q, 1920, 1080, 85, disk_min_bytes=0)
    assert path.exists()
    assert path.suffix == ".jpg"
    assert path.stat().st_size > 0


def test_atomic_capture_no_tmp_left_on_success(tmp_path: Path) -> None:
    q = tmp_path / "queue"
    q.mkdir()
    camera = MockCameraAdapter()

    atomic_capture(camera, q, 1920, 1080, 85, disk_min_bytes=0)
    tmp_files = list(q.glob(".tmp_*"))
    assert tmp_files == [], f"Temp files left behind: {tmp_files}"


def test_atomic_capture_fails_if_camera_returns_empty(tmp_path: Path) -> None:
    q = tmp_path / "queue"
    q.mkdir()
    camera = MagicMock()
    camera.capture.return_value = b""

    with pytest.raises(CaptureError, match="empty"):
        atomic_capture(camera, q, 1920, 1080, 85, disk_min_bytes=0)


@pytest.mark.skipif(os.name == "nt", reason="statvfs not available on Windows")
def test_disk_space_guard(tmp_path: Path) -> None:
    q = tmp_path / "queue"
    q.mkdir()
    camera = MockCameraAdapter()

    # Request more than all available disk — should fail
    with pytest.raises(CaptureError, match="disk"):
        atomic_capture(camera, q, 1920, 1080, 85, disk_min_bytes=9999 * 1024**3)


def test_capture_file_is_unique_on_multiple_calls(tmp_path: Path) -> None:
    q = tmp_path / "queue"
    q.mkdir()
    camera = MockCameraAdapter()

    paths = {atomic_capture(camera, q, 100, 100, 85, disk_min_bytes=0) for _ in range(3)}
    assert len(paths) == 3, "Duplicate filenames on rapid capture"


def test_picamera2_adapter_passes_quality_to_capture_file() -> None:
    """Picamera2Adapter.capture() must forward the quality param to capture_file."""
    mock_cam = MagicMock()
    mock_cam.capture_file.side_effect = lambda buf, format, quality: buf.write(b"\xff\xd8\xff\xd9")

    mock_picamera2_module = MagicMock()
    mock_picamera2_module.Picamera2.return_value = mock_cam

    with patch.dict(sys.modules, {"picamera2": mock_picamera2_module}):
        from importlib import reload

        import ark3_device.camera as cam_mod

        reload(cam_mod)
        adapter = cam_mod.Picamera2Adapter.__new__(cam_mod.Picamera2Adapter)
        adapter._cam = mock_cam

        adapter.capture(1920, 1080, quality=72)

    mock_cam.capture_file.assert_called_once()
    _, kwargs = mock_cam.capture_file.call_args
    assert kwargs.get("quality") == 72, (
        f"Expected quality=72 forwarded to capture_file, got {kwargs!r}"
    )
