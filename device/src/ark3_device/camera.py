"""Camera abstraction — real picamera2 or mock implementation."""

from __future__ import annotations

import abc
import contextlib
import logging
import time

logger = logging.getLogger(__name__)


class CameraAdapter(abc.ABC):
    """Abstract camera that produces JPEG files."""

    @abc.abstractmethod
    def capture(self, width: int, height: int, quality: int) -> bytes:
        """Return JPEG bytes."""

    @abc.abstractmethod
    def close(self) -> None:
        """Release camera resources."""


class Picamera2Adapter(CameraAdapter):
    """Live adapter using picamera2/libcamera."""

    def __init__(self) -> None:
        from picamera2 import Picamera2  # noqa: PLC0415

        self._cam = Picamera2()
        logger.debug("Picamera2 initialised")

    def capture(self, width: int, height: int, quality: int) -> bytes:
        import io

        config = self._cam.create_still_configuration(main={"size": (width, height)})
        self._cam.configure(config)
        self._cam.start()
        try:
            time.sleep(0.5)  # allow AE/AWB to settle
            buf = io.BytesIO()
            self._cam.capture_file(buf, format="jpeg", quality=quality)
            return buf.getvalue()
        finally:
            self._cam.stop()

    def close(self) -> None:
        with contextlib.suppress(Exception):
            self._cam.close()


class MockCameraAdapter(CameraAdapter):
    """Mock camera for local development — returns a minimal valid JPEG."""

    # Minimal 1×1 white JPEG (51 bytes)
    _STUB_JPEG = bytes(
        [
            0xFF,
            0xD8,
            0xFF,
            0xE0,
            0x00,
            0x10,
            0x4A,
            0x46,
            0x49,
            0x46,
            0x00,
            0x01,
            0x01,
            0x00,
            0x00,
            0x01,
            0x00,
            0x01,
            0x00,
            0x00,
            0xFF,
            0xDB,
            0x00,
            0x43,
            0x00,
            0x08,
            0x06,
            0x06,
            0x07,
            0x06,
            0x05,
            0x08,
            0x07,
            0x07,
            0x07,
            0x09,
            0x09,
            0x08,
            0x0A,
            0x0C,
            0x14,
            0x0D,
            0x0C,
            0x0B,
            0x0B,
            0x0C,
            0x19,
            0x12,
            0x13,
            0x0F,
            0x14,
            0x1D,
            0x1A,
            0x1F,
            0x1E,
            0x1D,
            0x1A,
            0x1C,
            0x1C,
            0x20,
            0x24,
            0x2E,
            0x27,
            0x20,
            0x22,
            0x2C,
            0x23,
            0x1C,
            0x1C,
            0x28,
            0x37,
            0x29,
            0x2C,
            0x30,
            0x31,
            0x34,
            0x34,
            0x34,
            0x1F,
            0x27,
            0x39,
            0x3D,
            0x38,
            0x32,
            0x3C,
            0x2E,
            0x33,
            0x34,
            0x32,
            0xFF,
            0xC0,
            0x00,
            0x0B,
            0x08,
            0x00,
            0x01,
            0x00,
            0x01,
            0x01,
            0x01,
            0x11,
            0x00,
            0xFF,
            0xC4,
            0x00,
            0x1F,
            0x00,
            0x00,
            0x01,
            0x05,
            0x01,
            0x01,
            0x01,
            0x01,
            0x01,
            0x01,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x01,
            0x02,
            0x03,
            0x04,
            0x05,
            0x06,
            0x07,
            0x08,
            0x09,
            0x0A,
            0x0B,
            0xFF,
            0xC4,
            0x00,
            0xB5,
            0x10,
            0x00,
            0x02,
            0x01,
            0x03,
            0x03,
            0x02,
            0x04,
            0x03,
            0x05,
            0x05,
            0x04,
            0x04,
            0x00,
            0x00,
            0x01,
            0x7D,
            0x01,
            0x02,
            0x03,
            0x00,
            0x04,
            0x11,
            0x05,
            0x12,
            0x21,
            0x31,
            0x41,
            0x06,
            0x13,
            0x51,
            0x61,
            0x07,
            0x22,
            0x71,
            0x14,
            0x32,
            0x81,
            0x91,
            0xA1,
            0x08,
            0x23,
            0x42,
            0xB1,
            0xC1,
            0x15,
            0x52,
            0xD1,
            0xF0,
            0x24,
            0x33,
            0x62,
            0x72,
            0xFF,
            0xDA,
            0x00,
            0x08,
            0x01,
            0x01,
            0x00,
            0x00,
            0x3F,
            0x00,
            0xFB,
            0x01,
            0xFF,
            0xD9,
        ]
    )

    def capture(self, width: int, height: int, quality: int) -> bytes:
        logger.info("MockCamera: returning stub JPEG (%dx%d q=%d)", width, height, quality)
        return self._STUB_JPEG

    def close(self) -> None:
        pass


def build_camera(mock_mode: bool) -> CameraAdapter:
    if mock_mode:
        return MockCameraAdapter()
    return Picamera2Adapter()
