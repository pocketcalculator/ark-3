/**
 * @ark-3/contracts
 *
 * Runtime Zod schemas and inferred TypeScript types for the ark-3 API.
 *
 * SECURITY NOTES
 * - Model-reported confidence is an uncalibrated indicator only; never gate
 *   decisions on it. The field is named `uncertainty` to make this explicit.
 * - Canonical resource group IDs are always derived server-side.
 * - CSRF tokens must be sent as a custom request header (X-CSRF-Token), not
 *   in the request body.
 * - Approval nonces are one-time use only; the backend enforces this.
 *
 * STATUS TRANSITIONS
 *
 *   uploaded
 *     ├─► ocr_pending      (OCR job dispatched)
 *     │     ├─► awaiting_approval  (OCR succeeded, passed all server-side gates)
 *     │     └─► failed             (OCR error or no usable result)
 *     ├─► awaiting_approval  (fast path — future, if pre-validated at upload)
 *     └─► failed
 *
 *   awaiting_approval
 *     ├─► deleting   (human approved; deletion job started)
 *     └─► rejected   (human rejected) [terminal — no transitions out]
 *
 *   deleting
 *     ├─► deleted    (ARM deletion confirmed) [terminal]
 *     └─► failed     (ARM deletion error)     [terminal]
 *
 *   failed   [terminal — no automatic retry; a new upload is required]
 *   rejected [terminal]
 *   deleted  [terminal]
 *
 * RETRY RULES
 *   - `failed` is terminal. The operator must take a new photo.
 *   - `rejected` is terminal. The operator must take a new photo.
 *   - `deleted` is terminal.
 *   - Only `uploaded → ocr_pending` and `ocr_pending → awaiting_approval`
 *     transitions may be retried internally (e.g. transient OCR timeout),
 *     but only by the backend — never by the client.
 */

import { z } from "zod";

// ── Status enum ──────────────────────────────────────────────────────────────

export const UploadStatusSchema = z.enum([
  "uploaded",
  "ocr_pending",
  "awaiting_approval",
  "rejected",
  "deleting",
  "deleted",
  "failed",
]);

export type UploadStatus = z.infer<typeof UploadStatusSchema>;

/** Terminal states — no further transitions are valid from these. */
export const TERMINAL_STATUSES: ReadonlySet<UploadStatus> = new Set([
  "rejected",
  "deleted",
  "failed",
]);

/** Valid forward transitions. Backend enforces this table; contracts document it. */
export const VALID_TRANSITIONS: Readonly<
  Record<UploadStatus, readonly UploadStatus[]>
> = {
  uploaded: ["ocr_pending", "failed"],
  ocr_pending: ["awaiting_approval", "failed"],
  awaiting_approval: ["deleting", "rejected"],
  deleting: ["deleted", "failed"],
  // Terminal states have no valid outbound transitions.
  rejected: [],
  deleted: [],
  failed: [],
};

// ── Azure resource group name grammar ────────────────────────────────────────
//
// Azure constraints for resource group names:
//   - 1–90 characters
//   - Alphanumeric, underscores, parentheses, hyphens, and periods
//   - Cannot end with a period
//
// Allowlist membership and tag validation remain backend-owned; this regex only
// captures the syntactic grammar.

export const RG_NAME_PATTERN =
  /^[a-zA-Z0-9_().\-]{1,89}[a-zA-Z0-9_()\-]$|^[a-zA-Z0-9_().\-]$/;

export const ResourceGroupNameSchema = z
  .string()
  .min(1)
  .max(90)
  .regex(
    /^[a-zA-Z0-9_().\-]+$/,
    "Resource group name contains invalid characters",
  )
  .refine((name) => !name.endsWith("."), {
    message: "Resource group name cannot end with a period",
  });

export type ResourceGroupName = z.infer<typeof ResourceGroupNameSchema>;

// ── Nonce ────────────────────────────────────────────────────────────────────
//
// A nonce is a 32-byte random value encoded as lowercase hex (64 characters).
// It is issued server-side when an item enters awaiting_approval status.
// Security properties:
//   - Strict length/charset: exactly 64 lowercase hex digits.
//   - One-time use: consumed (cleared) on first approve or reject.
//   - Short TTL: backend enforces a 15-minute expiry from issuance time.
//   - Version-bound: must be sent alongside the item's version; mismatch fails closed.
//   - Status-bound: only valid while item is in awaiting_approval; rotated on any transition.
//   - Never exposed on unauthenticated routes or in logs.

export const ApprovalNonceSchema = z
  .string()
  .length(64)
  .regex(/^[0-9a-f]{64}$/, "Nonce must be 64 lowercase hex digits");

export type ApprovalNonce = z.infer<typeof ApprovalNonceSchema>;

// ── Shared primitives ────────────────────────────────────────────────────────

/** Canonical resource group ARM ID, e.g. /subscriptions/{id}/resourceGroups/{name} */
export const CanonicalRgIdSchema = z
  .string()
  .regex(
    /^\/subscriptions\/[0-9a-fA-F-]{36}\/resourceGroups\/[a-zA-Z0-9_().\-]{1,90}$/,
    "Must be a canonical ARM resource group ID",
  );

export type CanonicalRgId = z.infer<typeof CanonicalRgIdSchema>;

// ── Device upload response ────────────────────────────────────────────────────

export const DeviceUploadResponseSchema = z.object({
  /** Opaque upload ID; use for status polling and approval references. */
  uploadId: z.string().uuid(),
  status: UploadStatusSchema,
  /** ISO 8601 timestamp when the upload was accepted. */
  acceptedAt: z.string().datetime(),
});

export type DeviceUploadResponse = z.infer<typeof DeviceUploadResponseSchema>;

// ── OCR result ───────────────────────────────────────────────────────────────

export const OcrResultSchema = z.object({
  /**
   * Proposed resource group name extracted from the image.
   * null when the model could not extract a plausible name.
   *
   * IMPORTANT: This value is untrusted model output. The backend performs
   * naming-grammar validation, exact Azure lookup, allowlist check, and
   * disposability tag check before this ever reaches the approval UI.
   */
  resourceGroupName: ResourceGroupNameSchema.nullable(),

  /**
   * Full raw text returned by the model, before any extraction.
   * Stored for audit and debugging; never used for deletion decisions.
   */
  rawText: z.string(),

  /**
   * Uncalibrated uncertainty indicator (0 = most confident, 1 = least).
   * Model-reported confidence is not a reliable signal; do NOT use this
   * value to gate approval or rejection decisions.
   */
  uncertainty: z.number().min(0).max(1),
});

export type OcrResult = z.infer<typeof OcrResultSchema>;

// ── Approval item ─────────────────────────────────────────────────────────────

export const ApprovalItemSchema = z.object({
  id: z.string().uuid(),

  /** Route to fetch the source image through the authenticated API. */
  imageRoute: z.string().startsWith("/api/images/"),

  /** Name proposed by OCR; shown verbatim in the approval UI. */
  proposedName: ResourceGroupNameSchema,

  /** Canonical ARM resource group ID; derived server-side after exact lookup. */
  canonicalRgId: CanonicalRgIdSchema,

  /** Human-readable display label for the subscription, e.g. "My Dev Sub". */
  subscriptionDisplayLabel: z.string(),

  /** Azure resource tags on the matched resource group. */
  tags: z.record(z.string(), z.string()),

  status: UploadStatusSchema,

  /** ISO 8601 */
  createdAt: z.string().datetime(),
  /** ISO 8601 */
  updatedAt: z.string().datetime(),

  /**
   * One-time approval nonce; 64 lowercase hex digits.
   * Issued when the item enters awaiting_approval. Must be sent back with
   * approve/reject requests. The backend invalidates it after first use.
   * Only present on authenticated responses; never logged or cached.
   */
  nonce: ApprovalNonceSchema,

  /**
   * Opaque version token (ETag / optimistic-concurrency handle).
   * Must be echoed back in approve/reject requests to prevent concurrent
   * double-approvals. Kept separate from nonce — they serve distinct purposes.
   */
  version: z.string(),
});

export type ApprovalItem = z.infer<typeof ApprovalItemSchema>;

// ── Pending list ──────────────────────────────────────────────────────────────

export const PendingListSchema = z.object({
  items: z.array(ApprovalItemSchema),
  /** Total count across all pages; may exceed items.length when paginated. */
  total: z.number().int().nonnegative(),
});

export type PendingList = z.infer<typeof PendingListSchema>;

// ── Approve / reject request ──────────────────────────────────────────────────
//
// CSRF token must be sent as the `X-CSRF-Token` HTTP request header.
// It MUST NOT appear in the request body (defense-in-depth: body-logging
// middleware would capture it; header-based tokens are safer).

export const ApproveRequestSchema = z.object({
  /** Upload/approval record ID being approved. */
  id: z.string().uuid(),

  /**
   * One-time nonce issued by the server when the item entered awaiting_approval.
   * The backend invalidates it after first use; replaying the nonce returns 409.
   */
  nonce: ApprovalNonceSchema,

  /**
   * Version/ETag echoed from the ApprovalItem; prevents concurrent approvals.
   */
  version: z.string().min(1),
});

export type ApproveRequest = z.infer<typeof ApproveRequestSchema>;

export const RejectRequestSchema = z.object({
  id: z.string().uuid(),
  nonce: ApprovalNonceSchema,
  version: z.string().min(1),
  /** Optional operator note recorded in the audit log. */
  reason: z.string().max(500).optional(),
});

export type RejectRequest = z.infer<typeof RejectRequestSchema>;

// ── Operation / deletion result ───────────────────────────────────────────────

export const OperationResultSchema = z.object({
  success: z.boolean(),
  /** Canonical ARM resource group ID that was acted upon. */
  canonicalRgId: CanonicalRgIdSchema.optional(),
  /** ISO 8601 timestamp of the completed operation. */
  completedAt: z.string().datetime(),
  /** Human-readable summary for logging/display. */
  message: z.string().optional(),
});

export type OperationResult = z.infer<typeof OperationResultSchema>;

// ── API error envelope ────────────────────────────────────────────────────────

/**
 * Stable error codes.
 *
 * These codes are part of the public API contract; changing them is a breaking
 * change. Add new codes rather than repurposing existing ones.
 */
export const ApiErrorCode = {
  // Generic
  UNKNOWN: "UNKNOWN",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",

  // Auth
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  CSRF_INVALID: "CSRF_INVALID",

  // OCR / name resolution
  OCR_FAILED: "OCR_FAILED",
  RG_NAME_INVALID: "RG_NAME_INVALID",
  RG_NOT_FOUND: "RG_NOT_FOUND",
  RG_AMBIGUOUS: "RG_AMBIGUOUS",
  RG_NOT_ALLOWLISTED: "RG_NOT_ALLOWLISTED",
  RG_NOT_DISPOSABLE: "RG_NOT_DISPOSABLE",

  // Approval flow
  NONCE_INVALID: "NONCE_INVALID",
  NONCE_EXPIRED: "NONCE_EXPIRED",
  VERSION_MISMATCH: "VERSION_MISMATCH",
  TRANSITION_INVALID: "TRANSITION_INVALID",

  // Deletion
  DELETION_FAILED: "DELETION_FAILED",
  REVALIDATION_FAILED: "REVALIDATION_FAILED",
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export const ApiErrorCodeSchema = z.enum(
  Object.values(ApiErrorCode) as [ApiErrorCode, ...ApiErrorCode[]],
);

export const ApiErrorSchema = z.object({
  /** Always false for error envelopes. */
  success: z.literal(false),
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    /** Optional additional machine-readable detail. */
    detail: z.record(z.string(), z.unknown()).optional(),
    /** ISO 8601 */
    timestamp: z.string().datetime(),
    /** Opaque request correlation ID for log tracing. */
    requestId: z.string().optional(),
  }),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
