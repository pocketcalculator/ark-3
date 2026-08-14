import { randomBytes } from "node:crypto";
import { ApiError } from "../errors.js";

export const CSRF_COOKIE_NAME = "csrf-token";
export const CSRF_HEADER_NAME = "x-csrf-token";

export function generateCsrfToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Builds the CSRF cookie. HttpOnly is intentionally NOT set so the SPA can read
 * the token and echo it as a header (double-submit pattern).
 * Pass `{ secure: true }` in production / HTTPS contexts.
 */
export function buildCsrfCookie(token: string, options?: { secure?: boolean }): string {
  const secureFlag = options?.secure === true ? "; Secure" : "";
  return `${CSRF_COOKIE_NAME}=${token}; Path=/; SameSite=Strict${secureFlag}`;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (header === undefined) {
    return out;
  }
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    out[key] = decodeURIComponent(value);
  }
  return out;
}

export interface CsrfValidationInput {
  readonly cookieHeader: string | undefined;
  readonly csrfHeader: string | undefined;
  readonly origin: string | undefined;
  readonly referer: string | undefined;
}

export interface CsrfValidationOptions {
  readonly allowedOrigin: string;
  /** When true, a missing Origin and Referer is rejected (production). */
  readonly requireOrigin: boolean;
}

/**
 * Validates a state-mutating request:
 *   1. double-submit: X-CSRF-Token header must match the csrf-token cookie
 *   2. same-origin: Origin (or Referer) must match the configured origin
 * Throws {@link ApiError} with CSRF_INVALID on any failure.
 */
export function validateCsrf(
  input: CsrfValidationInput,
  options: CsrfValidationOptions,
): void {
  const headerToken = input.csrfHeader?.trim() ?? "";
  if (headerToken === "") {
    throw new ApiError("CSRF_INVALID", "Missing CSRF token header");
  }

  const cookies = parseCookies(input.cookieHeader);
  const cookieToken = cookies[CSRF_COOKIE_NAME];
  if (cookieToken === undefined || cookieToken !== headerToken) {
    throw new ApiError("CSRF_INVALID", "CSRF token header does not match cookie");
  }

  if (input.origin !== undefined && input.origin !== "") {
    if (input.origin !== options.allowedOrigin) {
      throw new ApiError("CSRF_INVALID", "Request origin is not allowed");
    }
    return;
  }

  if (input.referer !== undefined && input.referer !== "") {
    if (!input.referer.startsWith(options.allowedOrigin)) {
      throw new ApiError("CSRF_INVALID", "Request referer is not allowed");
    }
    return;
  }

  if (options.requireOrigin) {
    throw new ApiError("CSRF_INVALID", "Missing Origin/Referer on mutating request");
  }
}
