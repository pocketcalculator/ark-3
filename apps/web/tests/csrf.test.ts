/**
 * Tests: CSRF token reading and header generation
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getCsrfToken, csrfHeaders } from "../src/lib/csrf.js";

function setCookie(value: string): void {
  Object.defineProperty(document, "cookie", {
    writable: true,
    value,
  });
}

describe("getCsrfToken", () => {
  afterEach(() => {
    // Reset cookie
    Object.defineProperty(document, "cookie", { writable: true, value: "" });
  });

  it("returns empty string when cookie is absent", () => {
    setCookie("");
    expect(getCsrfToken()).toBe("");
  });

  it("reads csrf-token from cookie string", () => {
    setCookie("csrf-token=my-token-value; other=foo");
    expect(getCsrfToken()).toBe("my-token-value");
  });

  it("handles URL-encoded values", () => {
    setCookie("csrf-token=my%2Ftoken%3D");
    expect(getCsrfToken()).toBe("my/token=");
  });
});

describe("csrfHeaders", () => {
  beforeEach(() => {
    setCookie("csrf-token=test-csrf-123");
  });

  afterEach(() => {
    Object.defineProperty(document, "cookie", { writable: true, value: "" });
  });

  it("includes X-CSRF-Token header", () => {
    const headers = csrfHeaders();
    expect(headers["X-CSRF-Token"]).toBe("test-csrf-123");
  });

  it("sends token as header — not in body or URL", () => {
    const headers = csrfHeaders();
    const keys = Object.keys(headers);
    expect(keys).toContain("X-CSRF-Token");
    // Ensure the token doesn't accidentally appear in a body-like key
    expect(keys.some((k) => k.toLowerCase().includes("body"))).toBe(false);
  });
});
