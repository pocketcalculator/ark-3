"""Shared pytest fixtures for ark3_device tests."""

from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

import pytest

from ark3_device.config import Config
from ark3_device.gpio_adapter import MockGPIOAdapter
from ark3_device.led_controller import LEDController
from ark3_device.queue_store import QueueStore


@pytest.fixture
def tmp_queue_dir(tmp_path: Path) -> Path:
    q = tmp_path / "queue"
    q.mkdir()
    return q


@pytest.fixture
def queue(tmp_queue_dir: Path) -> Generator[QueueStore, None, None]:
    db_path = tmp_queue_dir / "queue.db"
    store = QueueStore(db_path)
    yield store
    store.close()


@pytest.fixture
def mock_gpio() -> MockGPIOAdapter:
    return MockGPIOAdapter()


@pytest.fixture
def led(mock_gpio: MockGPIOAdapter) -> LEDController:
    return LEDController(mock_gpio, green_pin=27, red_pin=22)


@pytest.fixture
def base_cfg(tmp_queue_dir: Path) -> Config:
    return Config(
        backend_url="https://test.example.com",
        device_name="test-device",
        queue_dir=tmp_queue_dir,
        token_path=Path("/nonexistent/token"),
        mock_mode=True,
    )


@pytest.fixture
def token_file(tmp_path: Path) -> Path:
    """Return a valid 0600 token file path."""
    p = tmp_path / "device-token"
    p.write_text("supersecrettoken123\n")
    p.chmod(0o600)
    return p
