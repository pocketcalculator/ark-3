import type { FastifyRequest } from "fastify";
import type { Config } from "../config.js";
import { ApiError } from "../errors.js";

/** Authenticated caller identity derived from Easy Auth (or dev bypass). */
export interface Principal {
  /** Stable principal identifier (userId / oid claim). */
  readonly principalId: string;
  readonly roles: readonly string[];
}

interface ClientPrincipalClaim {
  readonly typ?: string;
  readonly val?: string;
}

interface ClientPrincipal {
  readonly userId?: string;
  readonly identityProvider?: string;
  readonly userRoles?: readonly string[];
  readonly claims?: readonly ClientPrincipalClaim[];
}

const DEV_PRINCIPAL: Principal = {
  principalId: "dev-local-principal",
  roles: ["approver"],
};

function decodeClientPrincipal(headerValue: string): ClientPrincipal {
  const json = Buffer.from(headerValue, "base64").toString("utf8");
  const parsed: unknown = JSON.parse(json);
  if (parsed === null || typeof parsed !== "object") {
    throw new ApiError("UNAUTHORIZED", "Malformed client principal");
  }
  return parsed as ClientPrincipal;
}

function extractPrincipalId(principal: ClientPrincipal): string {
  if (typeof principal.userId === "string" && principal.userId.length > 0) {
    return principal.userId;
  }
  const claims = principal.claims ?? [];
  for (const claim of claims) {
    if (
      (claim.typ === "http://schemas.microsoft.com/identity/claims/objectidentifier" ||
        claim.typ === "sub") &&
      typeof claim.val === "string" &&
      claim.val.length > 0
    ) {
      return claim.val;
    }
  }
  throw new ApiError("UNAUTHORIZED", "Client principal has no identifier");
}

function extractRoles(principal: ClientPrincipal): string[] {
  const roles = new Set<string>();
  for (const role of principal.userRoles ?? []) {
    roles.add(role);
  }
  for (const claim of principal.claims ?? []) {
    if (claim.typ === "roles" && typeof claim.val === "string") {
      roles.add(claim.val);
    }
  }
  return [...roles];
}

/**
 * Resolves the caller principal. In development with the auth bypass a fixed
 * fake principal is returned; in all other modes the Easy Auth
 * `X-MS-CLIENT-PRINCIPAL` header is required and the approver role enforced.
 */
export function resolvePrincipal(
  request: FastifyRequest,
  config: Config,
): Principal {
  if (config.authBypass) {
    return DEV_PRINCIPAL;
  }

  const header = request.headers["x-ms-client-principal"];
  const headerValue = Array.isArray(header) ? header[0] : header;
  if (headerValue === undefined || headerValue === "") {
    throw new ApiError("UNAUTHORIZED", "Authentication required");
  }

  const principal = decodeClientPrincipal(headerValue);
  const principalId = extractPrincipalId(principal);
  const roles = extractRoles(principal);

  if (!roles.includes(config.approverRole)) {
    throw new ApiError(
      "FORBIDDEN",
      `Principal lacks required role "${config.approverRole}"`,
    );
  }

  return { principalId, roles };
}
