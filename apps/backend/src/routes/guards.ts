import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppDeps } from "../context.js";
import { resolvePrincipal, type Principal } from "../services/easyAuth.js";
import { hashPrincipal } from "../services/audit.js";
import { validateCsrf } from "../services/csrf.js";

/** Correlation id for a request — reuses Fastify's per-request id. */
export function correlationId(request: FastifyRequest): string {
  return request.id;
}

export interface AuthContext {
  readonly principal: Principal;
  readonly actorId: string;
  readonly correlationId: string;
}

/** Resolves the Easy Auth principal or throws UNAUTHORIZED/FORBIDDEN. */
export function requireAuth(request: FastifyRequest, deps: AppDeps): AuthContext {
  const principal = resolvePrincipal(request, deps.config);
  return {
    principal,
    actorId: hashPrincipal(principal.principalId),
    correlationId: correlationId(request),
  };
}

function headerValue(
  request: FastifyRequest,
  name: string,
): string | undefined {
  const raw = request.headers[name];
  if (Array.isArray(raw)) {
    return raw[0];
  }
  return raw;
}

/** Enforces double-submit CSRF and same-origin on mutating requests. */
export function enforceCsrf(request: FastifyRequest, deps: AppDeps): void {
  validateCsrf(
    {
      cookieHeader: headerValue(request, "cookie"),
      csrfHeader: headerValue(request, "x-csrf-token"),
      origin: headerValue(request, "origin"),
      referer: headerValue(request, "referer"),
    },
    {
      allowedOrigin: deps.config.corsOrigin,
      requireOrigin: !deps.config.authBypass,
    },
  );
}

/** Applies the standard no-store cache policy for sensitive responses. */
export function noStore(reply: FastifyReply): void {
  reply.header("Cache-Control", "no-store, no-cache");
  reply.header("Pragma", "no-cache");
}
