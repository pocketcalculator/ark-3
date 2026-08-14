"""Tests verifying the token never appears in log output during upload."""

from __future__ import annotations

import logging
from pathlib import Path

import pytest
import responses as resp_lib

from ark3_device.uploader import Uploader

BACKEND = "https://test.example.com"
UPLOAD_URL = f"{BACKEND}/api/device/upload"
_SECRET_TOKEN = "SHOULD_NOT_APPEAR_IN_LOGS_abc123xyz"


class _Provider:
    def get_token(self) -> str:
        return _SECRET_TOKEN


@resp_lib.activate
def test_token_never_logged_on_success(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    img = tmp_path / "img.jpg"
    img.write_bytes(b"\xff\xd8\xff\xd9")
    resp_lib.add(resp_lib.POST, UPLOAD_URL, status=201)

    uploader = Uploader(BACKEND, "dev", _Provider(), timeout=5.0)
    with caplog.at_level(logging.DEBUG):
        uploader.upload(img)

    for record in caplog.records:
        assert _SECRET_TOKEN not in record.getMessage()


@resp_lib.activate
def test_token_never_logged_on_failure(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    img = tmp_path / "img.jpg"
    img.write_bytes(b"\xff\xd8\xff\xd9")
    resp_lib.add(resp_lib.POST, UPLOAD_URL, status=500)

    uploader = Uploader(BACKEND, "dev", _Provider(), timeout=5.0)
    with caplog.at_level(logging.DEBUG):
        uploader.upload(img)

    for record in caplog.records:
        assert _SECRET_TOKEN not in record.getMessage()
