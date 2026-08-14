"""Configuration loader — reads /etc/ark3/config.yaml (no token in config)."""

from __future__ import annotations

import os
import stat
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


@dataclass
class Config:
    backend_url: str
    device_name: str
    queue_dir: Path
    token_path: Path
    image_width: int = 1920
    image_height: int = 1080
    jpeg_quality: int = 85
    max_queue: int = 50
    max_retries: int = 10
    backoff_base: float = 1.0
    backoff_cap: float = 60.0
    disk_min_bytes: int = 50 * 1024 * 1024  # 50 MB
    mock_mode: bool = False
    log_level: str = "INFO"
    button_pin: int = 17
    green_led_pin: int = 27
    red_led_pin: int = 22
    debounce_ms: int = 50
    upload_timeout: float = 30.0


def _require_0600(path: Path) -> None:
    """Raise if file permissions are not exactly 0600 or owner is not current user."""
    st = path.stat()
    mode = stat.S_IMODE(st.st_mode)
    if mode != 0o600:
        raise PermissionError(f"Token file {path} must be mode 0600, got {oct(mode)}")
    # Check owner only on POSIX systems
    if hasattr(os, "getuid") and st.st_uid != os.getuid():
        raise PermissionError(
            f"Token file {path} must be owned by current user (uid={os.getuid()}), "
            f"got uid={st.st_uid}"
        )


def load_config(config_path: Path | None = None, mock_mode: bool = False) -> Config:
    path = config_path or Path("/etc/ark3/config.yaml")
    with path.open() as fh:
        raw: dict[str, Any] = yaml.safe_load(fh)

    cfg = Config(
        backend_url=raw["backend_url"],
        device_name=raw["device_name"],
        queue_dir=Path(raw.get("queue_dir", "/var/lib/ark3/queue")),
        token_path=Path(raw.get("token_path", "/etc/ark3/device-token")),
        image_width=int(raw.get("image_width", 1920)),
        image_height=int(raw.get("image_height", 1080)),
        jpeg_quality=int(raw.get("jpeg_quality", 85)),
        max_queue=int(raw.get("max_queue", 50)),
        max_retries=int(raw.get("max_retries", 10)),
        backoff_base=float(raw.get("backoff_base", 1.0)),
        backoff_cap=float(raw.get("backoff_cap", 60.0)),
        disk_min_bytes=int(raw.get("disk_min_bytes", 50 * 1024 * 1024)),
        mock_mode=bool(raw.get("mock_mode", False)) or mock_mode,
        log_level=str(raw.get("log_level", "INFO")),
        button_pin=int(raw.get("button_pin", 17)),
        green_led_pin=int(raw.get("green_led_pin", 27)),
        red_led_pin=int(raw.get("red_led_pin", 22)),
        debounce_ms=int(raw.get("debounce_ms", 50)),
        upload_timeout=float(raw.get("upload_timeout", 30.0)),
    )
    return cfg


def read_token(token_path: Path, mock_mode: bool = False) -> str:
    """Read device token; validate permissions on POSIX. Never return empty string."""
    if mock_mode:
        # In mock mode still refuse simulated production credentials
        # (tokens that look like real secrets — non-empty non-placeholder)
        placeholder = "MOCK_TOKEN_PLACEHOLDER"
        return placeholder

    if not token_path.exists():
        raise FileNotFoundError(f"Token file not found: {token_path}")

    _require_0600(token_path)

    token = token_path.read_text().strip()
    if not token:
        raise ValueError(f"Token file {token_path} is empty")
    return token
