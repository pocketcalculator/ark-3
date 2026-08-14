"""HTTP uploader with exponential backoff, Retry-After support, and error classification."""

from __future__ import annotations

import logging
import random
from pathlib import Path
from typing import Protocol

import requests

logger = logging.getLogger(__name__)


class TokenProvider(Protocol):
    def get_token(self) -> str: ...


class UploadResult:
    __slots__ = ("success", "permanent_failure", "retry_after")

    def __init__(
        self,
        success: bool = False,
        permanent_failure: bool = False,
        retry_after: float | None = None,
    ) -> None:
        self.success = success
        self.permanent_failure = permanent_failure
        self.retry_after = retry_after


def _jitter(value: float) -> float:
    """Full jitter: uniform [0, value]."""
    return random.uniform(0.0, value)


def compute_backoff(
    attempt: int,
    base: float = 1.0,
    cap: float = 60.0,
) -> float:
    """Exponential backoff with full jitter, capped at cap seconds."""
    raw = min(cap, base * (2**attempt))
    return _jitter(raw)


class Uploader:
    """Uploads a JPEG to the backend /api/device/upload endpoint."""

    _UPLOAD_PATH = "/api/device/upload"

    def __init__(
        self,
        backend_url: str,
        device_name: str,
        token_provider: TokenProvider,
        timeout: float = 30.0,
        session: requests.Session | None = None,
    ) -> None:
        self._backend_url = backend_url.rstrip("/")
        self._device_name = device_name
        self._token_provider = token_provider
        self._timeout = timeout
        self._session = session or requests.Session()

    def upload(self, image_path: Path) -> UploadResult:
        """Attempt a single upload. Caller handles retry scheduling."""
        if not image_path.exists():
            logger.error("Image file missing for upload: %s", image_path)
            return UploadResult(permanent_failure=True)

        try:
            image_bytes = image_path.read_bytes()
        except OSError as exc:
            logger.error("Cannot read image %s: %s", image_path, exc)
            return UploadResult(permanent_failure=True)

        url = self._backend_url + self._UPLOAD_PATH
        token = self._token_provider.get_token()
        # Token MUST NOT be logged — never include in log statements.
        # Explicit concatenation (not an interpolated f-string) so that
        # automated secret-redaction tooling cannot mistake this for,
        # or turn it into, a literal placeholder.
        auth_header = "Bearer" + " " + token
        headers = {
            "Authorization": auth_header,
            "X-Device-Name": self._device_name,
        }
        files = {
            "image": (image_path.name, image_bytes, "image/jpeg"),
        }

        try:
            resp = self._session.post(
                url,
                headers=headers,
                files=files,
                timeout=self._timeout,
            )
        except requests.exceptions.Timeout:
            logger.warning("Upload timed out for %s", image_path.name)
            return UploadResult()
        except requests.exceptions.ConnectionError as exc:
            logger.warning("Upload connection error for %s: %s", image_path.name, exc)
            return UploadResult()
        except requests.exceptions.RequestException as exc:
            logger.warning("Upload request error for %s: %s", image_path.name, exc)
            return UploadResult()

        if resp.status_code in (200, 201, 202):
            logger.info("Upload accepted for %s (status=%d)", image_path.name, resp.status_code)
            return UploadResult(success=True)

        if resp.status_code == 429 or resp.status_code == 503:
            retry_after: float | None = None
            ra_header = resp.headers.get("Retry-After")
            if ra_header:
                import contextlib

                with contextlib.suppress(ValueError):
                    retry_after = float(ra_header)
            logger.warning(
                "Upload rate-limited/unavailable for %s (status=%d, retry-after=%s)",
                image_path.name,
                resp.status_code,
                retry_after,
            )
            return UploadResult(retry_after=retry_after)

        if 400 <= resp.status_code < 500:
            # 4xx (excluding 429): permanent client error — do not retry
            logger.error(
                "Upload permanently rejected for %s (status=%d)",
                image_path.name,
                resp.status_code,
            )
            return UploadResult(permanent_failure=True)

        # 5xx or unexpected
        logger.warning("Upload server error for %s (status=%d)", image_path.name, resp.status_code)
        return UploadResult()
