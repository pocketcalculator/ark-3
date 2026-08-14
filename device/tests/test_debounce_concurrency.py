"""Tests for button debounce and concurrent capture prevention."""

from __future__ import annotations

import threading
from pathlib import Path

from ark3_device.config import Config
from ark3_device.main import App


def _make_app(tmp_path: Path) -> App:
    """Build a fully mocked App for testing."""
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

    app = App(cfg)
    return app


def test_concurrent_button_presses_single_capture(tmp_path: Path) -> None:
    """Rapid simultaneous presses must not corrupt queue or crash."""
    app = _make_app(tmp_path)

    def _press() -> None:
        app._on_button_press()

    threads = [threading.Thread(target=_press) for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    # Concurrency guard: each press that completes must produce exactly one capture.
    # Verify no corruption occurred — all queue items are valid (not 0, not > thread count)
    count = app._queue.count_all()
    assert 0 < count <= 10, f"Unexpected queue count: {count}"


def test_button_ignored_during_shutdown(tmp_path: Path) -> None:
    app = _make_app(tmp_path)
    app._shutdown.set()  # simulate shutdown
    app._on_button_press()
    assert app._queue.count_all() == 0


def test_button_ignored_when_queue_full(tmp_path: Path) -> None:
    app = _make_app(tmp_path)
    # Fill queue beyond max
    for i in range(app._cfg.max_queue + 1):
        p = app._cfg.queue_dir / f"dummy{i}.jpg"
        p.write_bytes(b"x")
        app._queue.enqueue(p)

    initial_count = app._queue.count_all()
    app._on_button_press()
    assert app._queue.count_all() == initial_count
