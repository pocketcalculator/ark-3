import { ApiErrorCode, type ApiError as ApiErrorEnvelope } from "@ark-3/contracts";

/**
 * Default HTTP status codes for each stable API error code.
 * Individual throw sites may override the status where semantics differ
 * (e.g. the daily deletion cap surfaces as 429).
 */
const DEFAULT_STATUS: Record<ApiErrorCode, number> = {
  UNKNOWN: 500,
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  CSRF_INVALID: 403,
  OCR_FAILED: 500,
  RG_NAME_INVALID: 400,
  RG_NOT_FOUND: 422,
  RG_AMBIGUOUS: 422,
  RG_NOT_ALLOWLISTED: 422,
  RG_NOT_DISPOSABLE: 422,
  NONCE_INVALID: 409,
  NONCE_EXPIRED: 409,
  VERSION_MISMATCH: 409,
  TRANSITION_INVALID: 409,
  DELETION_FAILED: 500,
  REVALIDATION_FAILED: 422,
};

export interface ApiErrorOptions {
  readonly statusCode?: number;
  readonly detail?: Record<string, unknown>;
}

/**
 * Explicit, typed application error. Every failure path throws one of these so
 * the global error handler can produce a stable {@link ApiErrorEnvelope}.
 */
export class ApiError extends Error {
  public readonly code: ApiErrorCode;
  public readonly statusCode: number;
  public readonly detail: Record<string, unknown> | undefined;

  public constructor(
    code: ApiErrorCode,
    message: string,
    options: ApiErrorOptions = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.statusCode = options.statusCode ?? DEFAULT_STATUS[code];
    this.detail = options.detail;
  }

  public toEnvelope(requestId: string): ApiErrorEnvelope {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        ...(this.detail !== undefined ? { detail: this.detail } : {}),
        timestamp: new Date().toISOString(),
        requestId,
      },
    };
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

export { ApiErrorCode };
