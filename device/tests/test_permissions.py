"""Tests for token file permission checks."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from ark3_device.config import read_token


@pytest.mark.skipif(os.name == "nt", reason="POSIX permission test only")
def test_valid_0600_token(token_file: Path) -> None:
    token = read_token(token_file, mock_mode=False)
    assert token == "supersecrettoken123"


@pytest.mark.skipif(os.name == "nt", reason="POSIX permission test only")
def test_wrong_permissions_raises(tmp_path: Path) -> None:
    p = tmp_path / "bad-token"
    p.write_text("mytoken")
    p.chmod(0o644)  # wrong — world-readable

    with pytest.raises(PermissionError, match="0600"):
        read_token(p, mock_mode=False)


@pytest.mark.skipif(os.name == "nt", reason="POSIX permission test only")
def test_empty_token_raises(tmp_path: Path) -> None:
    p = tmp_path / "empty-token"
    p.write_text("")
    p.chmod(0o600)

    with pytest.raises(ValueError, match="empty"):
        read_token(p, mock_mode=False)


def test_missing_token_raises(tmp_path: Path) -> None:
    p = tmp_path / "nonexistent"
    with pytest.raises(FileNotFoundError):
        read_token(p, mock_mode=False)


def test_mock_mode_returns_placeholder() -> None:
    result = read_token(Path("/nonexistent"), mock_mode=True)
    assert result == "MOCK_TOKEN_PLACEHOLDER"


@pytest.mark.skipif(os.name == "nt", reason="POSIX permission test only")
def test_token_not_logged(token_file: Path, caplog: pytest.LogCaptureFixture) -> None:
    """Verify the token value never appears in log output."""
    import logging

    with caplog.at_level(logging.DEBUG, logger="ark3_device"):
        token = read_token(token_file, mock_mode=False)

    for record in caplog.records:
        assert token not in record.getMessage(), (
            f"Token value leaked into log: {record.getMessage()!r}"
        )
