"""Tests for upload classification (4xx permanent, 5xx transient, etc.)."""

from __future__ import annotations

from pathlib import Path

import pytest
import responses as resp_lib

from ark3_device.uploader import Uploader

BACKEND = "https://test.example.com"
UPLOAD_URL = f"{BACKEND}/api/device/upload"


class _FakeTokenProvider:
    def get_token(self) -> str:
        return "test-token-not-real"


def _make_uploader() -> Uploader:
    return Uploader(
        backend_url=BACKEND,
        device_name="test-device",
        token_provider=_FakeTokenProvider(),
        timeout=5.0,
    )


@pytest.fixture
def image_file(tmp_path: Path) -> Path:
    p = tmp_path / "test.jpg"
    p.write_bytes(b"\xff\xd8\xff\xd9")  # minimal valid JPEG markers
    return p


@resp_lib.activate
def test_201_is_success(image_file: Path) -> None:
    resp_lib.add(resp_lib.POST, UPLOAD_URL, status=201)
    result = _make_uploader().upload(image_file)
    assert result.success is True
    assert result.permanent_failure is False


@resp_lib.activate
def test_200_is_success(image_file: Path) -> None:
    resp_lib.add(resp_lib.POST, UPLOAD_URL, status=200)
    result = _make_uploader().upload(image_file)
    assert result.success is True


@resp_lib.activate
def test_400_is_permanent_failure(image_file: Path) -> None:
    resp_lib.add(resp_lib.POST, UPLOAD_URL, status=400)
    result = _make_uploader().upload(image_file)
    assert result.permanent_failure is True
    assert result.success is False


@resp_lib.activate
def test_401_is_permanent_failure(image_file: Path) -> None:
    resp_lib.add(resp_lib.POST, UPLOAD_URL, status=401)
    result = _make_uploader().upload(image_file)
    assert result.permanent_failure is True


@resp_lib.activate
def test_404_is_permanent_failure(image_file: Path) -> None:
    resp_lib.add(resp_lib.POST, UPLOAD_URL, status=404)
    result = _make_uploader().upload(image_file)
    assert result.permanent_failure is True


@resp_lib.activate
def test_500_is_transient(image_file: Path) -> None:
    resp_lib.add(resp_lib.POST, UPLOAD_URL, status=500)
    result = _make_uploader().upload(image_file)
    assert result.success is False
    assert result.permanent_failure is False
    assert result.retry_after is None


@resp_lib.activate
def test_429_with_retry_after(image_file: Path) -> None:
    resp_lib.add(
        resp_lib.POST,
        UPLOAD_URL,
        status=429,
        headers={"Retry-After": "30"},
    )
    result = _make_uploader().upload(image_file)
    assert result.success is False
    assert result.permanent_failure is False
    assert result.retry_after == 30.0


@resp_lib.activate
def test_503_without_retry_after(image_file: Path) -> None:
    resp_lib.add(resp_lib.POST, UPLOAD_URL, status=503)
    result = _make_uploader().upload(image_file)
    assert result.success is False
    assert result.permanent_failure is False
    assert result.retry_after is None


@resp_lib.activate
def test_connection_error_is_transient(image_file: Path) -> None:
    import requests as _req

    resp_lib.add(
        resp_lib.POST,
        UPLOAD_URL,
        body=_req.exceptions.ConnectionError("Connection refused"),
    )
    result = _make_uploader().upload(image_file)
    assert result.success is False
    assert result.permanent_failure is False


def test_missing_file_is_permanent_failure(tmp_path: Path) -> None:
    result = _make_uploader().upload(tmp_path / "ghost.jpg")
    assert result.permanent_failure is True


def test_token_not_in_headers_log(image_file: Path, caplog: pytest.LogCaptureFixture) -> None:
    """Authorization header value must not appear in any log record."""
    import logging

    import responses as _r

    with _r.RequestsMock() as rsps:
        rsps.add(_r.POST, UPLOAD_URL, status=201)
        with caplog.at_level(logging.DEBUG, logger="ark3_device"):
            _make_uploader().upload(image_file)

    for record in caplog.records:
        assert "test-token-not-real" not in record.getMessage(), (
            f"Token leaked into log: {record.getMessage()!r}"
        )


_SENTINEL_TOKEN = "sentinel-tok-9f3c2a"  # distinctive safe fake value, not a real secret


class _SpyTokenProvider:
    """Fake TokenProvider that records how many times it was called."""

    def __init__(self, token: str) -> None:
        self._token = token
        self.call_count = 0

    def get_token(self) -> str:
        self.call_count += 1
        return self._token


@resp_lib.activate
def test_authorization_header_uses_provider_token(image_file: Path) -> None:
    """Upload must send an Authorization header dynamically derived from the
    token provider's sentinel value with the backend-required 'Bearer' scheme.
    """
    sent_auth: list[str] = []

    def _capture(request: object) -> tuple[int, dict[str, str], str]:
        import requests as _req

        assert isinstance(request, _req.PreparedRequest)
        sent_auth.append(request.headers.get("Authorization", ""))
        return (201, {}, "")

    resp_lib.add_callback(resp_lib.POST, UPLOAD_URL, callback=_capture)

    provider = _SpyTokenProvider(_SENTINEL_TOKEN)
    uploader = Uploader(
        backend_url=BACKEND,
        device_name="test-device",
        token_provider=provider,
        timeout=5.0,
    )
    uploader.upload(image_file)

    assert provider.call_count == 1, "TokenProvider.get_token() must be called exactly once"
    assert len(sent_auth) == 1
    scheme, _, value = sent_auth[0].partition(" ")
    assert scheme == "Bearer"
    assert value == _SENTINEL_TOKEN
    assert sent_auth[0] == "Bearer" + " " + _SENTINEL_TOKEN
