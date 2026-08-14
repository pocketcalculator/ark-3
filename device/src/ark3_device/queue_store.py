"""Durable SQLite queue for captured images pending upload."""

from __future__ import annotations

import logging
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS queue (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    image_path  TEXT    NOT NULL,
    enqueued_at REAL    NOT NULL,
    attempts    INTEGER NOT NULL DEFAULT 0,
    next_retry  REAL    NOT NULL DEFAULT 0.0,
    status      TEXT    NOT NULL DEFAULT 'pending'
);
"""


@dataclass
class QueueItem:
    id: int
    image_path: Path
    enqueued_at: float
    attempts: int
    next_retry: float
    status: str


class QueueStore:
    """Thread-safe SQLite queue. One writer at a time via WAL mode."""

    def __init__(self, db_path: Path) -> None:
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._db_path = db_path
        self._conn = sqlite3.connect(str(db_path), check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=FULL")
        self._conn.executescript(_SCHEMA)
        self._conn.commit()

    def enqueue(self, image_path: Path) -> QueueItem:
        now = time.time()
        cur = self._conn.execute(
            "INSERT INTO queue (image_path, enqueued_at, next_retry) VALUES (?, ?, ?)",
            (str(image_path), now, now),
        )
        self._conn.commit()
        item_id: int = cur.lastrowid  # type: ignore[assignment]
        logger.debug("Queued item id=%d path=%s", item_id, image_path)
        return QueueItem(item_id, image_path, now, 0, now, "pending")

    def count_pending(self) -> int:
        row = self._conn.execute("SELECT COUNT(*) FROM queue WHERE status='pending'").fetchone()
        return int(row[0])

    def count_all(self) -> int:
        row = self._conn.execute("SELECT COUNT(*) FROM queue").fetchone()
        return int(row[0])

    def next_ready(self) -> QueueItem | None:
        """Return the oldest pending item whose next_retry has passed."""
        now = time.time()
        row = self._conn.execute(
            "SELECT id, image_path, enqueued_at, attempts, next_retry, status "
            "FROM queue WHERE status='pending' AND next_retry <= ? "
            "ORDER BY enqueued_at ASC LIMIT 1",
            (now,),
        ).fetchone()
        if row is None:
            return None
        return QueueItem(row[0], Path(row[1]), row[2], row[3], row[4], row[5])

    def mark_retry(
        self,
        item_id: int,
        next_retry: float,
        attempts: int,
    ) -> None:
        self._conn.execute(
            "UPDATE queue SET attempts=?, next_retry=?, status='pending' WHERE id=?",
            (attempts, next_retry, item_id),
        )
        self._conn.commit()

    def mark_failed(self, item_id: int) -> None:
        """Permanently failed after max retries — keep record, mark failed."""
        self._conn.execute("UPDATE queue SET status='failed' WHERE id=?", (item_id,))
        self._conn.commit()
        logger.warning("Queue item id=%d permanently failed", item_id)

    def mark_done(self, item_id: int) -> None:
        self._conn.execute("UPDATE queue SET status='done' WHERE id=?", (item_id,))
        self._conn.commit()

    def quarantine(self, item_id: int) -> None:
        self._conn.execute("UPDATE queue SET status='quarantined' WHERE id=?", (item_id,))
        self._conn.commit()
        logger.warning("Queue item id=%d quarantined (corruption)", item_id)

    def close(self) -> None:
        import contextlib

        with contextlib.suppress(Exception):
            self._conn.close()
