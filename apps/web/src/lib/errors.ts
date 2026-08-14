/**
 * Maps stable API error codes to human-readable messages.
 * Never exposes internal details or stack traces.
 */
import type { ApiErrorCode } from "@ark-3/contracts";

const CODE_MESSAGES: Record<ApiErrorCode, string> = {
  UNKNOWN: "An unexpected error occurred. Please try again.",
  VALIDATION_FAILED: "The request was invalid. Please refresh and try again.",
  NOT_FOUND: "The approval record was not found. It may have been removed.",
  CONFLICT:
    "This record was updated by another session. Please refresh to see the latest state.",

  UNAUTHORIZED:
    "You are not signed in. Please sign in via the login link above.",
  FORBIDDEN: "You do not have permission to perform this action.",
  CSRF_INVALID:
    "Security token validation failed. Please refresh and try again.",

  OCR_FAILED: "Text extraction from the image failed. A new photo is required.",
  RG_NAME_INVALID:
    "The extracted name does not match Azure resource group naming rules.",
  RG_NOT_FOUND:
    "No Azure resource group with this name was found in the configured subscription.",
  RG_AMBIGUOUS:
    "More than one resource group matched this name. Manual review required.",
  RG_NOT_ALLOWLISTED:
    "This resource group is not on the approved deletion list.",
  RG_NOT_DISPOSABLE:
    "This resource group is missing the required disposability tag (ark3-disposable=true).",

  NONCE_INVALID: "The approval token is invalid. Please refresh and try again.",
  NONCE_EXPIRED:
    "The approval token has expired. Please refresh to get a new one.",
  VERSION_MISMATCH:
    "This record was modified concurrently. Please refresh to see the current state.",
  TRANSITION_INVALID:
    "This action is no longer valid for the current approval state.",

  DELETION_FAILED:
    "The deletion request was sent but the operation failed. Check the audit log.",
  REVALIDATION_FAILED:
    "Pre-deletion validation failed. The resource group state may have changed.",
};

/**
 * Returns a safe human-readable message for an API error code.
 * Falls back to UNKNOWN message if the code is not recognized.
 */
export function errorCodeToMessage(code: string): string {
  const message =
    CODE_MESSAGES[code as ApiErrorCode] ?? CODE_MESSAGES["UNKNOWN"];
  return message;
}

/**
 * Extracts the best display message from an unknown error value.
 * Never surfaces raw error objects or stack traces to the UI.
 */
export function toDisplayError(err: unknown): string {
  if (err instanceof ApiResponseError) {
    return err.displayMessage;
  }
  return "An unexpected error occurred. Please refresh and try again.";
}

/** Structured error thrown when the API returns a non-2xx response. */
export class ApiResponseError extends Error {
  readonly code: string;
  readonly displayMessage: string;
  readonly statusCode: number;
  readonly requestId: string | undefined;

  constructor(params: {
    code: string;
    message: string;
    statusCode: number;
    requestId?: string;
  }) {
    super(params.message);
    this.name = "ApiResponseError";
    this.code = params.code;
    this.displayMessage = errorCodeToMessage(params.code);
    this.statusCode = params.statusCode;
    this.requestId = params.requestId;
  }
}
