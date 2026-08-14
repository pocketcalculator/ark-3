import { createHash, timingSafeEqual } from "node:crypto";
import type { SecretProvider } from "../providers/secret.js";

/** Sliding-window per-key rate limiter (requests per minute). */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly limitPerMinute: number;
  private readonly now: () => number;

  public constructor(limitPerMinute: number, now: () => number = () => Date.now()) {
    this.limitPerMinute = limitPerMinute;
    this.now = now;
  }

  public tryConsume(key: string): boolean {
    const nowMs = this.now();
    const windowStart = nowMs - 60_000;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > windowStart);
    if (recent.length >= this.limitPerMinute) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(nowMs);
    this.hits.set(key, recent);
    return true;
  }
}

/**
 * Verifies device bearer tokens against a hex-encoded SHA-256 hash held in the
 * secret provider, using a constant-time comparison. The token value is never
 * logged or returned.
 */
export class DeviceAuthService {
  private readonly secrets: SecretProvider;
  private readonly secretName: string;
  private readonly rateLimiter: RateLimiter;
  private cachedHash: string | null = null;

  public constructor(
    secrets: SecretProvider,
    secretName: string,
    rateLimiter: RateLimiter,
  ) {
    this.secrets = secrets;
    this.secretName = secretName;
    this.rateLimiter = rateLimiter;
  }

  private async getStoredHash(): Promise<string> {
    if (this.cachedHash === null) {
      this.cachedHash = (await this.secrets.getSecret(this.secretName)).trim();
    }
    return this.cachedHash;
  }

  public async verifyToken(token: string): Promise<boolean> {
    if (token.length === 0) {
      return false;
    }
    const storedHashHex = await this.getStoredHash();
    const provided = createHash("sha256").update(token).digest();
    let stored: Buffer;
    try {
      stored = Buffer.from(storedHashHex, "hex");
    } catch {
      return false;
    }
    if (stored.length !== provided.length) {
      return false;
    }
    return timingSafeEqual(provided, stored);
  }

  public checkRateLimit(deviceName: string): boolean {
    return this.rateLimiter.tryConsume(deviceName);
  }
}

/** Extracts the token from an `Authorization: Bearer <token>` header. */
export function parseBearerToken(header: string | undefined): string | null {
  if (header === undefined) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (match === null || match[1] === undefined) {
    return null;
  }
  return match[1].trim();
}

/** Utility: hex-encoded SHA-256 of a token, matching the stored secret format. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
