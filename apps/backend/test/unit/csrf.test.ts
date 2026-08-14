import { describe, it, expect } from "vitest";
import {
  validateCsrf,
  parseCookies,
  buildCsrfCookie,
  generateCsrfToken,
} from "../../src/services/csrf.js";
import { ApiError } from "../../src/errors.js";

const ORIGIN = "http://localhost:3000";
const TOKEN = "abc123token";

const baseOptions = { allowedOrigin: ORIGIN, requireOrigin: true };

describe("validateCsrf", () => {
  it("passes with matching cookie, header, and origin", () => {
    expect(() =>
      validateCsrf(
        {
          cookieHeader: `csrf-token=${TOKEN}`,
          csrfHeader: TOKEN,
          origin: ORIGIN,
          referer: undefined,
        },
        baseOptions,
      ),
    ).not.toThrow();
  });

  it("throws when the header token is missing", () => {
    expect(() =>
      validateCsrf(
        { cookieHeader: `csrf-token=${TOKEN}`, csrfHeader: undefined, origin: ORIGIN, referer: undefined },
        baseOptions,
      ),
    ).toThrow(ApiError);
  });

  it("throws when the header does not match the cookie", () => {
    expect(() =>
      validateCsrf(
        { cookieHeader: `csrf-token=${TOKEN}`, csrfHeader: "different", origin: ORIGIN, referer: undefined },
        baseOptions,
      ),
    ).toThrowError(/does not match/);
  });

  it("throws when the origin is not allowed", () => {
    expect(() =>
      validateCsrf(
        {
          cookieHeader: `csrf-token=${TOKEN}`,
          csrfHeader: TOKEN,
          origin: "http://evil.example",
          referer: undefined,
        },
        baseOptions,
      ),
    ).toThrowError(/origin is not allowed/);
  });

  it("accepts a matching referer when origin is absent", () => {
    expect(() =>
      validateCsrf(
        {
          cookieHeader: `csrf-token=${TOKEN}`,
          csrfHeader: TOKEN,
          origin: undefined,
          referer: `${ORIGIN}/app/`,
        },
        baseOptions,
      ),
    ).not.toThrow();
  });

  it("rejects missing origin and referer when requireOrigin is true", () => {
    expect(() =>
      validateCsrf(
        { cookieHeader: `csrf-token=${TOKEN}`, csrfHeader: TOKEN, origin: undefined, referer: undefined },
        baseOptions,
      ),
    ).toThrow(ApiError);
  });

  it("allows missing origin and referer when requireOrigin is false", () => {
    expect(() =>
      validateCsrf(
        { cookieHeader: `csrf-token=${TOKEN}`, csrfHeader: TOKEN, origin: undefined, referer: undefined },
        { allowedOrigin: ORIGIN, requireOrigin: false },
      ),
    ).not.toThrow();
  });
});

describe("parseCookies", () => {
  it("parses multiple cookies", () => {
    const cookies = parseCookies("a=1; csrf-token=xyz; b=2");
    expect(cookies["csrf-token"]).toBe("xyz");
    expect(cookies["a"]).toBe("1");
  });

  it("returns empty object for undefined header", () => {
    expect(parseCookies(undefined)).toEqual({});
  });
});

describe("buildCsrfCookie / generateCsrfToken", () => {
  it("builds a non-HttpOnly SameSite=Strict cookie", () => {
    const cookie = buildCsrfCookie("tok");
    expect(cookie).toContain("csrf-token=tok");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie.toLowerCase()).not.toContain("httponly");
  });

  it("generates unique hex tokens", () => {
    expect(generateCsrfToken()).not.toBe(generateCsrfToken());
    expect(generateCsrfToken()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("omits Secure flag when secure option is false or absent (local HTTP dev)", () => {
    expect(buildCsrfCookie("tok")).not.toMatch(/;\s*Secure/i);
    expect(buildCsrfCookie("tok", { secure: false })).not.toMatch(/;\s*Secure/i);
  });

  it("appends Secure flag when secure option is true (production HTTPS)", () => {
    const cookie = buildCsrfCookie("tok", { secure: true });
    expect(cookie).toMatch(/;\s*Secure/);
    expect(cookie).toContain("csrf-token=tok");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie.toLowerCase()).not.toContain("httponly");
  });
});
