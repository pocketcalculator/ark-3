"""Tests for graceful shutdown and cleanup."""

from __future__ import annotations

import signal
import time
from pathlib import Path

import pytest

from ark3_device.config import Config
from ark3_device.gpio_adapter import MockGPIOAdapter
from ark3_device.led_controller import LEDState
from ark3_device.main import App


def _make_app(tmp_path: Path) -> App:
    q = tmp_path / "queue"
    q.mkdir()
    token_path = tmp_path / "token"
    token_path.write_text("placeholder")
    cfg = Config(
        backend_url="https://test.example.com",
        device_name="test-device",
        queue_dir=q,
        token_path=token_path,
        mock_mode=True,
    )
    return App(cfg)


def test_cleanup_turns_leds_off(tmp_path: Path) -> None:
    app = _make_app(tmp_path)
    app._led.transition(LEDState.READY)
    time.sleep(0.05)

    app._cleanup()
    time.sleep(0.1)

    gpio: MockGPIOAdapter = app._gpio  # type: ignore[assignment]
    assert gpio.get_led(27) is False
    assert gpio.get_led(22) is False


def test_cleanup_closes_queue(tmp_path: Path) -> None:
    import sqlite3

    app = _make_app(tmp_path)
    app._cleanup()
    # Accessing closed connection should raise ProgrammingError
    with pytest.raises(sqlite3.ProgrammingError):
        app._queue._conn.execute("SELECT 1")


def test_signal_handler_sets_shutdown(tmp_path: Path) -> None:
    app = _make_app(tmp_path)
    assert not app._shutdown.is_set()
    app._handle_signal(signal.SIGTERM, None)
    assert app._shutdown.is_set()
