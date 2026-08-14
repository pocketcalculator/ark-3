/**
 * CSRF token management.
 *
 * The server sets a CSRF cookie (`csrf-token`) with SameSite=Strict; the UI
 * reads it and sends it as the `X-CSRF-Token` request header on every
 * state-mutating request.  The body never contains the token.
 *
 * During local development (NODE_ENV=development) the server may not set
 * the cookie; we fall back to an empty string so requests still go through
 * the dev proxy.
 */

const CSRF_COOKIE_NAME = "csrf-token";
const CSRF_HEADER_NAME = "X-CSRF-Token";

/** Read the CSRF token from the cookie jar. Returns empty string if absent. */
export function getCsrfToken(): string {
  const match = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`));

  return match ? decodeURIComponent(match.slice(CSRF_COOKIE_NAME.length + 1)) : "";
}

/** Returns headers that must accompany every mutating API request. */
export function csrfHeaders(): Record<string, string> {
  return {
    [CSRF_HEADER_NAME]: getCsrfToken(),
  };
}
