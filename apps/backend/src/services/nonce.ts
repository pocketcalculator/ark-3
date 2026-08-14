import { randomBytes } from "node:crypto";

/** Nonce lifetime: 15 minutes from issuance. */
export const NONCE_TTL_MS = 15 * 60 * 1000;

export function generateNonce(): string {
  return randomBytes(32).toString("hex");
}

export function nonceExpiry(now: Date): string {
  return new Date(now.getTime() + NONCE_TTL_MS).toISOString();
}
