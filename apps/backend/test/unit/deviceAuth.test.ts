import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  DeviceAuthService,
  RateLimiter,
  parseBearerToken,
  hashToken,
} from "../../src/services/deviceAuth.js";
import type { SecretProvider } from "../../src/providers/secret.js";

function secretProvider(hash: string): SecretProvider {
  return {
    getSecret: () => Promise.resolve(hash),
  };
}

const TOKEN = "correct-horse-battery-staple";
const HASH = createHash("sha256").update(TOKEN).digest("hex");

describe("DeviceAuthService.verifyToken", () => {
  it("accepts the correct token", async () => {
    const svc = new DeviceAuthService(secretProvider(HASH), "s", new RateLimiter(10));
    await expect(svc.verifyToken(TOKEN)).resolves.toBe(true);
  });

  it("rejects a wrong token", async () => {
    const svc = new DeviceAuthService(secretProvider(HASH), "s", new RateLimiter(10));
    await expect(svc.verifyToken("wrong-token")).resolves.toBe(false);
  });

  it("rejects an empty token without touching the secret", async () => {
    const svc = new DeviceAuthService(secretProvider(HASH), "s", new RateLimiter(10));
    await expect(svc.verifyToken("")).resolves.toBe(false);
  });

  it("rejects a stored hash of the wrong length safely", async () => {
    const svc = new DeviceAuthService(secretProvider("abcd"), "s", new RateLimiter(10));
    await expect(svc.verifyToken(TOKEN)).resolves.toBe(false);
  });
});

describe("parseBearerToken", () => {
  it("extracts the token from a Bearer header", () => {
    expect(parseBearerToken("Bearer abc123")).toBe("abc123");
    expect(parseBearerToken("bearer abc123")).toBe("abc123");
  });

  it("returns null for malformed headers", () => {
    expect(parseBearerToken(undefined)).toBeNull();
    expect(parseBearerToken("Token abc")).toBeNull();
    expect(parseBearerToken("Bearer ")).toBeNull();
  });
});

describe("hashToken", () => {
  it("produces a hex sha256 that never equals the token", () => {
    const h = hashToken(TOKEN);
    expect(h).toBe(HASH);
    expect(h).not.toContain(TOKEN);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("RateLimiter", () => {
  it("allows up to the limit within a minute then blocks", () => {
    const t = 1_000_000;
    const limiter = new RateLimiter(2, () => t);
    expect(limiter.tryConsume("dev")).toBe(true);
    expect(limiter.tryConsume("dev")).toBe(true);
    expect(limiter.tryConsume("dev")).toBe(false);
  });

  it("tracks devices independently", () => {
    const limiter = new RateLimiter(1);
    expect(limiter.tryConsume("a")).toBe(true);
    expect(limiter.tryConsume("b")).toBe(true);
    expect(limiter.tryConsume("a")).toBe(false);
  });

  it("frees capacity after the window slides", () => {
    let t = 0;
    const limiter = new RateLimiter(1, () => t);
    expect(limiter.tryConsume("dev")).toBe(true);
    expect(limiter.tryConsume("dev")).toBe(false);
    t = 61_000;
    expect(limiter.tryConsume("dev")).toBe(true);
  });
});
