# API Reference

> ⚠️ **SANDBOX / NON-PRODUCTION ONLY.** These endpoints have been cross-checked against the implementation but have not been validated against a live deployment.

All endpoints are served by the Node.js / Fastify backend (`apps/backend`). In production the backend runs inside Azure Container Apps at `https://<containerAppFqdn>`.

---

## Authentication

| Endpoint | Auth method |
|---|---|
| `POST /api/device/upload` | Bearer token (`Authorization: Bearer <token>`) |
| `GET /api/health` | None (public) |
| All other endpoints | Easy Auth session (`X-MS-CLIENT-PRINCIPAL` header, injected by Azure Container Apps) |

Easy Auth is configured with `unauthenticatedClientAction: RedirectToLoginPage`. Calls without a valid session are redirected to the Microsoft Entra login page (browser) or return 401 (API clients that do not follow redirects).

The approver role (`approver` by default) is required for all mutating web endpoints. Requests from authenticated users without the role return `403 FORBIDDEN`.

---

## Common headers

### Request headers (mutating web endpoints)

| Header | Required | Description |
|---|---|---|
| `X-CSRF-Token` | Yes | Must match the `csrf-token` cookie value (double-submit pattern) |
| `Content-Type` | Yes | `application/json` |

### Response headers (all endpoints)

Mutating endpoints set `Cache-Control: no-store, no-cache` via the `noStore` guard.

---

## CSRF cookie

The backend sets a `csrf-token` cookie (`SameSite=Strict`, not `HttpOnly`) on session establishment. The SPA reads this cookie and echoes it as the `X-CSRF-Token` request header on all POST requests.

---

## Error envelope

All error responses use a stable JSON envelope:

```json
{
  "success": false,
  "error": {
    "code": "<ErrorCode>",
    "message": "Human-readable message",
    "detail": {},
    "timestamp": "2026-08-13T00:00:00.000Z",
    "requestId": "<correlation-id>"
  }
}
```

### Error codes

| Code | HTTP status | Description |
|---|---|---|
| `UNKNOWN` | 500 | Unexpected internal error |
| `VALIDATION_FAILED` | 400 | Request body or field validation failed |
| `NOT_FOUND` | 404 | Record not found |
| `CONFLICT` | 409 | Concurrent write conflict or daily cap reached |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Authenticated but lacks required role |
| `CSRF_INVALID` | 403 | CSRF token missing or does not match cookie |
| `OCR_FAILED` | 422 | Vision model returned no usable result |
| `RG_NAME_INVALID` | 422 | Extracted name fails Azure naming grammar |
| `RG_NOT_FOUND` | 404 | No matching RG found in subscription |
| `RG_AMBIGUOUS` | 409 | Multiple RGs matched (should not occur with exact match) |
| `RG_NOT_ALLOWLISTED` | 403 | RG name not in `ARK3_RG_ALLOWLIST` |
| `RG_NOT_DISPOSABLE` | 403 | RG lacks `ark3-disposable=true` tag |
| `NONCE_INVALID` | 409 | Nonce missing, wrong, or already consumed |
| `NONCE_EXPIRED` | 409 | Nonce expired (10-minute window) |
| `VERSION_MISMATCH` | 409 | Record was updated concurrently; re-fetch and retry |
| `TRANSITION_INVALID` | 409 | Attempted transition is not valid for current status |
| `DELETION_FAILED` | 500 | ARM delete call failed |
| `REVALIDATION_FAILED` | 409 | TOCTOU re-validation failed before deletion |

---

## Status transitions

```
uploaded
  ├─► ocr_pending      (OCR dispatched)
  │     ├─► awaiting_approval  (all gates passed)
  │     └─► failed             (OCR error)
  └─► failed

awaiting_approval
  ├─► deleting   (approved)
  └─► rejected   (rejected) [terminal]

deleting
  ├─► deleted    (ARM confirmed) [terminal]
  └─► failed     [terminal]

failed   [terminal]
rejected [terminal]
deleted  [terminal]
```

Terminal statuses have no valid outbound transitions. `failed` is terminal — a new upload is required.

---

## Endpoints

---

### `GET /api/health`

Health check. No authentication required.

**Response 200**
```json
{
  "status": "ok",
  "version": "0.0.0"
}
```

---

### `POST /api/device/upload`

Upload a JPEG image from the device. Accepts multipart/form-data.

**Headers**

| Header | Required | Value |
|---|---|---|
| `Authorization` | Yes | `Bearer <device-token>` |
| `X-Device-Name` | Yes | Device identifier string (e.g. `pi-zero-001`) |
| `Content-Type` | Yes | `multipart/form-data` |

**Request body**

Multipart/form-data with a single file field containing a JPEG image. Maximum size: 5 MB.

**Response 202 — Accepted**
```json
{
  "uploadId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "ocr_pending",
  "acceptedAt": "2026-08-13T00:00:00.000Z"
}
```

**Errors**

| Code | HTTP | Condition |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing/invalid token or missing X-Device-Name |
| `CONFLICT` | 429 | Rate limit exceeded (10 req/min per device name) |
| `VALIDATION_FAILED` | 400 | Missing file, file too large (>5 MB), or invalid image type |

**Rate limit response (429)**

Includes `Retry-After: 60` header.

---

### `GET /api/pending`

List approval records in `awaiting_approval` status. Requires Easy Auth session with approver role.

**Response 200**
```json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "imageRoute": "/api/images/550e8400-e29b-41d4-a716-446655440000",
      "proposedName": "rg-ark3-sandbox-<suffix>",
      "canonicalRgId": "/subscriptions/<subscription-id>/resourceGroups/rg-ark3-sandbox-<suffix>",
      "subscriptionDisplayLabel": "My Dev Sub",
      "tags": { "ark3-disposable": "true", "environment": "dev" },
      "status": "awaiting_approval",
      "createdAt": "2026-08-13T00:00:00.000Z",
      "updatedAt": "2026-08-13T00:01:00.000Z",
      "version": "<opaque-version-token>"
    }
  ],
  "total": 1
}
```

> Note: The `id` field in the response is the approval item ID; use this as `:id` in approve/reject requests. The `version` field must be echoed back to prevent concurrent double-approvals. There is no `nonce` field in the list response — the nonce is not exposed in the list API; the SPA must re-fetch the full item or the approval UI manages the nonce internally.

> **Implementation note:** The nonce is stored server-side and not returned in the pending list. The approve request supplies the nonce that was issued by the server at `awaiting_approval` time. The SPA must obtain the nonce from the approval record. In the current implementation the nonce is embedded in the approval record accessible to the backend; the web UI retrieves it as part of its workflow. Consult the source code in `apps/web` for the exact SPA flow.

**Errors**

| Code | HTTP | Condition |
|---|---|---|
| `UNAUTHORIZED` | 401 | No Easy Auth session |
| `FORBIDDEN` | 403 | Missing approver role |

---

### `GET /api/images/:id`

Retrieve the source JPEG image for an approval item. Requires Easy Auth session.

**Path parameter:** `:id` — the upload ID (UUID).

**Response 200**

`Content-Type: image/jpeg` (or actual image MIME type). Body is the raw image bytes.

**Errors**

| Code | HTTP | Condition |
|---|---|---|
| `UNAUTHORIZED` | 401 | No Easy Auth session |
| `NOT_FOUND` | 404 | Image not found in blob storage |

---

### `POST /api/approve/:id`

Approve an item for deletion. Requires Easy Auth session with approver role and a valid CSRF token.

**Path parameter:** `:id` — the approval item ID (UUID).

**Headers**

| Header | Required | Value |
|---|---|---|
| `X-CSRF-Token` | Yes | Value matching `csrf-token` cookie |
| `Content-Type` | Yes | `application/json` |

**Request body**
```json
{
  "nonce": "<nonce-from-server>",
  "version": "<version-from-pending-list>"
}
```

**Response 200 — Success**
```json
{
  "success": true,
  "canonicalRgId": "/subscriptions/<subscription-id>/resourceGroups/rg-ark3-sandbox-<suffix>",
  "completedAt": "2026-08-13T00:02:00.000Z",
  "message": "Deleted rg-ark3-sandbox-<suffix>"
}
```

**Errors**

| Code | HTTP | Condition |
|---|---|---|
| `UNAUTHORIZED` | 401 | No Easy Auth session |
| `FORBIDDEN` | 403 | Missing approver role |
| `CSRF_INVALID` | 403 | CSRF token missing or mismatch |
| `NOT_FOUND` | 404 | Record not found |
| `TRANSITION_INVALID` | 409 | Record is not in `awaiting_approval` |
| `NONCE_INVALID` | 409 | Nonce wrong or already consumed |
| `NONCE_EXPIRED` | 409 | Nonce expired (10-minute window) |
| `VERSION_MISMATCH` | 409 | Concurrent write; re-fetch and retry |
| `CONFLICT` | 429 | Daily deletion cap reached |
| `REVALIDATION_FAILED` | 409 | RG failed re-validation before deletion |
| `DELETION_FAILED` | 500 | ARM delete call failed |

---

### `POST /api/reject/:id`

Reject an item (terminal; no deletion). Requires Easy Auth session with approver role and CSRF.

**Path parameter:** `:id` — the approval item ID (UUID).

**Headers** — same as approve.

**Request body**
```json
{
  "nonce": "<nonce-from-server>",
  "version": "<version-from-pending-list>",
  "reason": "Optional operator note (max 500 chars)"
}
```

**Response 200**
```json
{
  "success": true,
  "completedAt": "2026-08-13T00:02:00.000Z",
  "message": "Rejected"
}
```

**Errors** — same as approve, excluding `DELETION_FAILED` and `REVALIDATION_FAILED`.

---

### `POST /api/ocr-retry/:id`

Re-dispatch the OCR pipeline for a record in `ocr_pending` status. Intended for transient failure recovery. Requires Easy Auth session with approver role and CSRF.

**Path parameter:** `:id` — the approval item ID (UUID).

**Request body** — empty (`{}`) or omitted.

**Response 200**
```json
{
  "success": true,
  "completedAt": "2026-08-13T00:00:30.000Z",
  "message": "OCR retry dispatched"
}
```

**Errors**

| Code | HTTP | Condition |
|---|---|---|
| `UNAUTHORIZED` | 401 | No Easy Auth session |
| `FORBIDDEN` | 403 | Missing approver role |
| `CSRF_INVALID` | 403 | CSRF token mismatch |
| `NOT_FOUND` | 404 | Record not found |
| `TRANSITION_INVALID` | 409 | Record is not in `ocr_pending` |

---

## Rate limits

| Endpoint | Limit |
|---|---|
| `POST /api/device/upload` | 10 requests/minute per `X-Device-Name` (default; `ARK3_DEVICE_RATE_LIMIT_RPM`) |
| All web endpoints | Daily deletion cap: 10 approvals/day (default; `ARK3_DAILY_DELETION_CAP`) |

No Azure API Management or Container Apps HTTP scaling limits are configured beyond the defaults.

---

## Image upload constraints

| Constraint | Value |
|---|---|
| Maximum file size | 5 MB |
| Accepted MIME types | `image/jpeg`, `image/png` (validated by magic bytes) |
| Content-Type header | `multipart/form-data` |

---

## Resource group name grammar

The backend validates extracted names against the Azure RG naming rules:
- 1–90 characters
- Characters: alphanumeric, underscores `_`, parentheses `()`, hyphens `-`, periods `.`
- Cannot end with a period

Regex (from `@ark-3/contracts`):
```
/^[a-zA-Z0-9_().\-]{1,89}[a-zA-Z0-9_()\-]$|^[a-zA-Z0-9_().\-]$/
```

---

## Canonical resource group ID format

```
/subscriptions/<uuid>/resourceGroups/<rg-name>
```

The canonical ID is always derived server-side after an exact ARM lookup. It is never derived from the model output alone.
