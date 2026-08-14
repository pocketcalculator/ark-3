/**
 * API client for the ark-3 backend.
 *
 * All image object URLs returned by loadImage() MUST be revoked by the caller
 * when they are no longer needed (e.g., when the card is removed from the DOM).
 * Use URL.revokeObjectURL() for cleanup.
 *
 * Images are fetched without caching to prevent sensitive data from persisting
 * in the browser cache.
 */

import {
  PendingListSchema,
  OperationResultSchema,
  ApiErrorSchema,
  type PendingList,
  type ApproveRequest,
  type RejectRequest,
  type OperationResult,
} from "@ark-3/contracts";
import { ApiResponseError } from "./errors.js";
import { csrfHeaders } from "./csrf.js";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
};

/** Parses the response and throws ApiResponseError on non-2xx. */
async function handleResponse<T>(
  res: Response,
  parse: (json: unknown) => T,
): Promise<T> {
  const json: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    // Attempt to parse as ApiError envelope
    const apiError = ApiErrorSchema.safeParse(json);
    if (apiError.success) {
      const { code, message, requestId } = apiError.data.error;
      throw new ApiResponseError({
        code,
        message,
        statusCode: res.status,
          ...(requestId !== undefined ? { requestId } : {}),
      });
    }
    throw new ApiResponseError({
      code: "UNKNOWN",
      message: `HTTP ${res.status}`,
      statusCode: res.status,
    });
  }

  return parse(json);
}

/** Fetch the list of pending approval items. */
export async function fetchPending(): Promise<PendingList> {
  const res = await fetch("/api/pending", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  return handleResponse(res, (json) => PendingListSchema.parse(json));
}

/**
 * Fetch a source image and return a revocable object URL.
 *
 * The caller is responsible for calling URL.revokeObjectURL(url) when done.
 * Cache is set to no-store to prevent sensitive images from being cached.
 */
export async function loadImage(imageRoute: string): Promise<string> {
  const res = await fetch(imageRoute, {
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "image/*" },
  });

  if (!res.ok) {
    throw new ApiResponseError({
      code: "NOT_FOUND",
      message: `Image not available (HTTP ${res.status})`,
      statusCode: res.status,
    });
  }

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/** Submit an approval for the given item. */
export async function submitApproval(
  req: ApproveRequest,
): Promise<OperationResult> {
  const res = await fetch(`/api/approve/${req.id}`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      ...JSON_HEADERS,
      ...csrfHeaders(),
    },
    body: JSON.stringify({ nonce: req.nonce, version: req.version }),
  });
  return handleResponse(res, (json) => OperationResultSchema.parse(json));
}

/** Submit a rejection for the given item. */
export async function submitRejection(
  req: RejectRequest,
): Promise<OperationResult> {
  const res = await fetch(`/api/reject/${req.id}`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      ...JSON_HEADERS,
      ...csrfHeaders(),
    },
    body: JSON.stringify({
      nonce: req.nonce,
      version: req.version,
      reason: req.reason,
    }),
  });
  return handleResponse(res, (json) => OperationResultSchema.parse(json));
}

/** Trigger OCR retry for an item in ocr_pending state. */
export async function retryOcr(id: string): Promise<OperationResult> {
  const res = await fetch(`/api/ocr-retry/${id}`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      ...JSON_HEADERS,
      ...csrfHeaders(),
    },
    body: JSON.stringify({}),
  });
  return handleResponse(res, (json) => OperationResultSchema.parse(json));
}
