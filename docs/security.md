# Security

> ⚠️ **SANDBOX / NON-PRODUCTION ONLY.** This document describes the security design as implemented. No penetration testing or formal security assessment has been performed. Known limitations are listed at the end.

---

## Threat model

### Assets

| Asset | Sensitivity | Location |
|---|---|---|
| Device bearer token (raw) | High — grants upload capability | `/etc/ark3/device-token` on Pi, never persisted elsewhere |
| Device token verifier hash | Medium — SHA-256 of token; Key Vault secret | Azure Key Vault |
| Uploaded images | Medium — may show physical labels | Azure Blob Storage (private container) |
| Approval state records | Medium — contain RG names, canonical IDs | Azure Table Storage |
| Approval web session | High — grants deletion authority | Easy Auth session cookie |
| Azure credentials (UAMI) | High — grants ARM delete capability | Managed identity, no exportable key |

### Adversaries

| Adversary | Assumed capability |
|---|---|
| External attacker | Can observe public network traffic, attempt API fuzzing, replay captures |
| Compromised Pi device | Token exposed; can upload arbitrary images to the upload endpoint |
| Malicious model output | Model returns crafted `resourceGroupName` string |
| Unauthorized web user | Has Entra credentials but lacks `approver` role |
| Authorized approver error | Human makes a mistake; no technical control prevents it if gates pass |

### Out of scope

- Physical theft of the Pi (token revocation is the response; see incident section)
- Compromise of the Azure subscription itself
- Social engineering of the human approver

---

## Trust boundaries

```
[Pi device] ─── (HTTPS + Bearer token) ──── [Upload endpoint: /api/device/upload]
                                              ↓
                              Backend validates token, stores image
                                              ↓
                        [OCR pipeline: sends image to Azure OpenAI]
                                              ↓
                        [Model output — UNTRUSTED — server-side validated]
                                              ↓
                        [ARM lookup, allowlist, tag gate — all server-side]
                                              ↓
[Human approver] ─── (HTTPS + Easy Auth) ──── [Approval endpoints: /api/approve, /api/reject]
                                              ↓
                        [TOCTOU re-validation before ARM delete]
                                              ↓
                              [Azure Resource Manager]
```

The trust boundary between the device and the backend is the bearer token. The trust boundary between the web user and the backend is the Easy Auth session. The model is explicitly untrusted: its output is validated, never directly acted upon.

---

## Device token lifecycle

### Format and storage

- The raw token is a cryptographically random value (recommended: 32 bytes from `openssl rand -base64 32`).
- The backend stores **only** the hex-encoded SHA-256 hash of the token in Azure Key Vault (`device-token-verifier` secret).
- The Pi stores the raw token in `/etc/ark3/device-token` (mode `0600`, owned by `root:ark3`).
- The token is **never** logged, never returned in API responses, and never stored in source control.

### Verification

Verification uses a constant-time comparison (`crypto.timingSafeEqual`) of the SHA-256 digest of the provided token against the stored hash. This prevents timing side-channels.

The hash is cached in memory after first retrieval. To force a re-read (e.g., after token rotation), restart the Container App revision.

### Rate limiting

Per-device rate limiting is enforced before token verification: 10 requests per minute per `X-Device-Name` value (configurable via `ARK3_DEVICE_RATE_LIMIT_RPM`). This limits brute-force attempts even before the expensive Key Vault read.

### Rotation

1. Generate a new token and verifier hash (see [docs/how-to.md](how-to.md#5-device-token-provisioning)).
2. Update Key Vault: `az keyvault secret set --vault-name <kvName> --name device-token-verifier --value <new-hash>`
3. Restart the Container App revision to flush the cached hash.
4. Update the Pi token file: place the new raw token in `/etc/ark3/device-token`, then restart the service.

---

## Easy Auth, CSRF, nonce, and version

### Easy Auth (web UI authentication)

Easy Auth v2 (Microsoft Entra ID) protects all paths except `/api/device/upload` and `/api/health`. Unauthenticated requests are redirected to the Microsoft login page. The backend reads the `X-MS-CLIENT-PRINCIPAL` header (base64-encoded JSON) to extract the principal ID and roles. The approver role (`approver` by default, configurable) is required for all mutating endpoints.

`ARK3_AUTH_BYPASS=true` is **refused** unless `NODE_ENV=development` AND no managed identity endpoint is detected. This prevents the bypass from being reachable in any hosted environment.

### CSRF (double-submit cookie)

State-mutating requests (`POST /api/approve/:id`, `POST /api/reject/:id`, `POST /api/ocr-retry/:id`) require:
- A `csrf-token` cookie (set by the backend, `SameSite=Strict`, not `HttpOnly` so the SPA can read it)
- A matching `X-CSRF-Token` request header

The cookie is `SameSite=Strict`, which prevents cross-origin requests from including it. The header must match the cookie value. Origin/Referer is additionally validated against the configured `ARK3_CORS_ORIGIN`.

The CSRF token is **not** in the request body — body-logging middleware might capture it; header-based tokens are safer.

### Nonce (one-time use)

A nonce is issued when an approval item enters `awaiting_approval` state. The nonce:
- Is a cryptographically random value (`crypto.randomBytes`)
- Expires after 15 minutes (`nonceExpiresAt`), matching `NONCE_TTL_MS` in code
- Is consumed on first use (cleared to empty string on approve/reject, preventing replay)
- Is replayed nonce detection: `nonce === ""` → NONCE_INVALID; `now > nonceExpiresAt` → NONCE_EXPIRED

### Version (optimistic concurrency)

Every approval record has a `version` field (opaque token). Approve/reject requests must echo the version read from `GET /api/pending`. The backend performs an optimistic-concurrency check before writing. A concurrent approval by another operator returns `VERSION_MISMATCH` (409).

---

## Allowlist and tag gates (TOCTOU)

**Initial validation (OCR pipeline):**
1. RG name grammar validation (regex: Azure naming rules)
2. Exact case-insensitive ARM lookup within one subscription
3. Exactly one match required (zero → RG_NOT_FOUND; multiple → RG_AMBIGUOUS)
4. Name present in `ARK3_RG_ALLOWLIST` (exact match, case-insensitive)
5. Matched RG has tag `ark3-disposable=true`

**TOCTOU re-validation (immediately before deletion):**
All five gates are re-run against live ARM state **after** the operator approves and before the ARM delete call is issued. This prevents a window where the allowlist or tag could change between approval and execution.

**No fuzzy matching.** There is no fallback based on substrings ("test", "dev", "sandbox"). Only exact matches pass.

---

## Least privilege custom role

The custom role `ark3-RGDeletion-<hash>` grants only:
- `Microsoft.Resources/subscriptions/resourceGroups/read`
- `Microsoft.Resources/subscriptions/resourceGroups/delete`

It is scoped **only to the sandbox target resource group** (`rg-ark3-sandbox-<suffix>`). It does not grant:
- Subscription-wide Contributor or Owner
- Write access to child resources within the sandbox RG
- Access to any other resource group

---

## Audit and privacy

Every state transition is logged as a structured audit event to Application Insights:

| Event | When |
|---|---|
| `upload_received` | Device upload accepted |
| `ocr_dispatched` | OCR pipeline started |
| `ocr_succeeded` | Model returned a name |
| `ocr_failed` | Model or pipeline error |
| `validation_passed` | All server-side gates passed |
| `validation_failed` | A gate failed |
| `deletion_started` | Operator approved, transitioning to `deleting` |
| `revalidation_failed` | TOCTOU re-validation failed |
| `deletion_failed` | ARM delete call failed |
| `deletion_succeeded` | ARM confirmed deletion |
| `approval_granted` | Full approval+deletion cycle completed |
| `approval_rejected` | Operator rejected |

Audit events include: `correlationId`, `actorId` (principal ID of the approver), `uploadId`, `canonicalRgId`.

**Privacy:** Images are stored in a private blob container, accessible only through the authenticated API. They are automatically deleted after 7 days by the blob lifecycle policy. No PII beyond the principal ID (Entra object ID) is recorded in audit logs.

---

## Model prompt-injection containment

The vision model is asked to extract an Azure resource group name from an image. The following controls limit prompt injection risk:

1. **Model output is untrusted.** The extracted `resourceGroupName` is validated against the Azure naming grammar regex before any further use.
2. **Exact ARM lookup required.** Even a syntactically valid name that doesn't exist in the subscription fails at lookup.
3. **Allowlist gate.** A name not in the operator allowlist is rejected regardless of model confidence.
4. **Model confidence is not used for authorization decisions.** The `uncertainty` field is an uncalibrated indicator, stored for audit purposes only. It is never used to gate approve/reject decisions.
5. **`rawText` is never executed or interpreted.** It is stored for audit and debugging.

---

## No model confidence authorization

The model returns an `uncertainty` field (0 = most confident, 1 = least). This value is **explicitly excluded from all authorization decisions**. The field is named `uncertainty` (not `confidence`) to make its uncalibrated nature explicit. Operators must not infer safety from this value.

---

## No live deletion in CI or local environments

- `ARK3_AUTH_BYPASS=true` is refused if `NODE_ENV` is not `development`.
- `ARK3_AUTH_BYPASS=true` is refused if a managed identity endpoint is detected.
- Mock mode on the device (`--mock` flag) uses a placeholder token and does not connect to Azure.
- Docker Compose sets `ARK3_BLOB_STORAGE_PROVIDER=azurite` and `ARK3_AUTH_BYPASS=true`; no ARM calls can reach a real subscription in this configuration.

---

## Incident response and revocation

### Suspected token compromise

1. **Immediately rotate the token** — generate new token + hash, update Key Vault, restart Container App revision, update Pi token file. Old token is invalid as soon as Key Vault is updated and the cached hash is flushed.
2. Review Application Insights logs for unauthorized `upload_received` or `ocr_dispatched` events (filter by `uploadId` or unusual `correlationId` patterns).
3. If images of non-sandbox RGs were uploaded, review whether any reached `awaiting_approval` and whether any approvals occurred.

### Suspected web session compromise

1. Revoke all active sessions by disabling and re-enabling the Entra app, or by expiring the token store.
2. Review audit logs for `approval_granted` events with unexpected `actorId` values.

### Accidental deletion of wrong RG

1. The ARM delete is irreversible for a resource group. Azure has no undo for RG deletion.
2. File a `REVALIDATION_FAILED` audit trail: the delete only proceeds if all gates pass immediately before execution.
3. Review the allowlist and tag configuration to understand how the RG passed the gates.

---

## Known limitations

1. **No private networking.** All Azure resources use public endpoints. VNet injection is a production hardening step outside the current scope.
2. **No purge protection on Key Vault.** `enablePurgeProtection: false` is set (appropriate for dev). Enable before production use.
3. **No MFA enforcement.** Easy Auth relies on the Entra tenant's MFA policy. If the tenant does not enforce MFA, an account compromise enables approval.
4. **Daily deletion cap is not a hard rate limit.** The cap (`ARK3_DAILY_DELETION_CAP`, default 10) is enforced by an atomic counter in Table Storage, not by Azure Policy. It limits accidental over-deletion but is not a security boundary.
5. **Token hash is cached.** The backend caches the Key Vault secret in memory after first read. Revocation takes effect after Container App restart or next cold start.
6. **No audit log integrity protection.** Application Insights logs are mutable by anyone with access to the workspace. For production, consider immutable log storage.
7. **Model output is opaque.** The vision model cannot be audited for its reasoning; only its output is validated.
