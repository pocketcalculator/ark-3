"""Tests for QueueStore persistence, retry scheduling, and status transitions."""

from __future__ import annotations

import time
from pathlib import Path

from ark3_device.queue_store import QueueStore


def test_enqueue_and_next_ready(queue: QueueStore, tmp_queue_dir: Path) -> None:
    img = tmp_queue_dir / "img1.jpg"
    img.write_bytes(b"fakejpeg")

    item = queue.enqueue(img)
    assert item.id is not None
    assert item.status == "pending"

    ready = queue.next_ready()
    assert ready is not None
    assert ready.id == item.id
    assert ready.image_path == img


def test_next_ready_respects_next_retry(queue: QueueStore, tmp_queue_dir: Path) -> None:
    img = tmp_queue_dir / "img2.jpg"
    img.write_bytes(b"x")
    item = queue.enqueue(img)

    # Push next_retry far into the future
    queue.mark_retry(item.id, time.time() + 9999, 1)

    assert queue.next_ready() is None


def test_mark_done_removes_from_pending(queue: QueueStore, tmp_queue_dir: Path) -> None:
    img = tmp_queue_dir / "img3.jpg"
    img.write_bytes(b"x")
    item = queue.enqueue(img)
    assert queue.count_pending() == 1

    queue.mark_done(item.id)
    assert queue.count_pending() == 0


def test_mark_failed(queue: QueueStore, tmp_queue_dir: Path) -> None:
    img = tmp_queue_dir / "img4.jpg"
    img.write_bytes(b"x")
    item = queue.enqueue(img)

    queue.mark_failed(item.id)
    assert queue.count_pending() == 0
    assert queue.next_ready() is None


def test_quarantine(queue: QueueStore, tmp_queue_dir: Path) -> None:
    img = tmp_queue_dir / "img5.jpg"
    img.write_bytes(b"x")
    item = queue.enqueue(img)

    queue.quarantine(item.id)
    assert queue.count_pending() == 0


def test_persistence(tmp_queue_dir: Path) -> None:
    """QueueStore survives re-open (persistence)."""
    db_path = tmp_queue_dir / "queue.db"
    img = tmp_queue_dir / "persist.jpg"
    img.write_bytes(b"x")

    store1 = QueueStore(db_path)
    item = store1.enqueue(img)
    store1.close()

    store2 = QueueStore(db_path)
    assert store2.count_pending() == 1
    ready = store2.next_ready()
    assert ready is not None
    assert ready.id == item.id
    store2.close()


def test_multiple_items_ordered_by_enqueued_at(queue: QueueStore, tmp_queue_dir: Path) -> None:
    imgs = []
    for i in range(3):
        p = tmp_queue_dir / f"img{i}.jpg"
        p.write_bytes(b"x")
        imgs.append(p)
        queue.enqueue(p)
        time.sleep(0.01)  # ensure distinct timestamps

    first = queue.next_ready()
    assert first is not None
    assert first.image_path == imgs[0]
