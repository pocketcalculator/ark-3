"""Single-instance lock via a PID file with fcntl (POSIX) or best-effort (Windows)."""

from __future__ import annotations

import contextlib
import os
from pathlib import Path


class InstanceLockError(Exception):
    pass


class InstanceLock:
    """
    Holds an exclusive lock for the lifetime of the process.
    Must be used as a context manager or explicitly released.
    """

    def __init__(self, lock_path: Path) -> None:
        self._path = lock_path
        self._fd: int | None = None

    def acquire(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        try:
            self._fd = os.open(str(self._path), os.O_CREAT | os.O_RDWR, 0o644)
        except OSError as exc:
            raise InstanceLockError(f"Cannot open lock file {self._path}: {exc}") from exc

        try:
            import fcntl

            fcntl.flock(self._fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except ImportError:
            # Windows — no fcntl, single-instance best-effort via PID file
            pass
        except OSError:
            os.close(self._fd)
            self._fd = None
            raise InstanceLockError(
                f"Another instance is already running (lock held: {self._path})"
            ) from None

        # Write PID for diagnostics
        os.ftruncate(self._fd, 0)
        os.write(self._fd, str(os.getpid()).encode())

    def release(self) -> None:
        if self._fd is not None:
            try:
                import fcntl

                fcntl.flock(self._fd, fcntl.LOCK_UN)
            except (ImportError, OSError):
                pass
            os.close(self._fd)
            self._fd = None
        with contextlib.suppress(OSError):
            self._path.unlink(missing_ok=True)

    def __enter__(self) -> InstanceLock:
        self.acquire()
        return self

    def __exit__(self, *_: object) -> None:
        self.release()
