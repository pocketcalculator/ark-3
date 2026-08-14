/**
 * Tests: API client
 * - fetchPending parses PendingList correctly
 * - submitApproval sends CSRF header
 * - submitApproval sends nonce+version in body
 * - Handles non-2xx responses as ApiResponseError
 * - loadImage uses no-store cache and same-origin credentials
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock csrf before importing api
vi.mock("../src/lib/csrf.js", () => ({
  getCsrfToken: vi.fn().mockReturnValue("mock-csrf-token"),
  csrfHeaders: vi.fn().mockReturnValue({ "X-CSRF-Token": "mock-csrf-token" }),
}));

import { fetchPending, submitApproval, loadImage } from "../src/lib/api.js";
import { ApiResponseError } from "../src/lib/errors.js";

const MOCK_PENDING_RESPONSE = {
  items: [
    {
      id: "11111111-1111-1111-1111-111111111111",
      imageRoute: "/api/images/11111111-1111-1111-1111-111111111111",
      proposedName: "rg-test-sandbox-01",
      canonicalRgId:
        "/subscriptions/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/resourceGroups/rg-test-sandbox-01",
      subscriptionDisplayLabel: "Dev Sandbox Sub",
      tags: { "ark3-disposable": "true" },
      status: "awaiting_approval",
      createdAt: "2026-08-13T14:00:00.000Z",
      updatedAt: "2026-08-13T14:05:00.000Z",
      nonce: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
      version: "etag-v1",
    },
  ],
  total: 1,
};

function makeFetchMock(status: number, body: unknown, contentType = "application/json") {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    blob: () =>
      Promise.resolve(new Blob(["img"], { type: "image/jpeg" })),
    headers: new Headers({ "Content-Type": contentType }),
  });
}

describe("API client", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = makeFetchMock(200, MOCK_PENDING_RESPONSE);
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("fetchPending", () => {
    it("calls /api/pending with same-origin credentials", async () => {
      await fetchPending();
      const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/pending");
      expect(options.credentials).toBe("same-origin");
    });

    it("parses and returns a valid PendingList", async () => {
      const result = await fetchPending();
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.proposedName).toBe("rg-test-sandbox-01");
    });

    it("throws ApiResponseError on 401", async () => {
      vi.stubGlobal(
        "fetch",
        makeFetchMock(401, { success: false, error: { code: "UNAUTHORIZED", message: "unauth", timestamp: new Date().toISOString() } }),
      );
      await expect(fetchPending()).rejects.toBeInstanceOf(ApiResponseError);
    });

    it("throws ApiResponseError with stable code on error", async () => {
      vi.stubGlobal(
        "fetch",
        makeFetchMock(409, {
          success: false,
          error: {
            code: "CONFLICT",
            message: "conflict",
            timestamp: new Date().toISOString(),
          },
        }),
      );
      try {
        await fetchPending();
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiResponseError);
        expect((err as ApiResponseError).code).toBe("CONFLICT");
      }
    });
  });

  describe("submitApproval", () => {
    beforeEach(() => {
      vi.stubGlobal(
        "fetch",
        makeFetchMock(200, { success: true, completedAt: new Date().toISOString() }),
      );
    });

    it("sends X-CSRF-Token header", async () => {
      await submitApproval({
        id: "11111111-1111-1111-1111-111111111111",
        nonce: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        version: "v1",
      });
      const [, options] = (vi.mocked(fetch) as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      expect(headers["X-CSRF-Token"]).toBe("mock-csrf-token");
    });

    it("sends nonce and version in request body", async () => {
      await submitApproval({
        id: "11111111-1111-1111-1111-111111111111",
        nonce: "cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe",
        version: "etag-v2",
      });
      const [, options] = (vi.mocked(fetch) as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as Record<string, unknown>;
      expect(body["nonce"]).toBe("cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe");
      expect(body["version"]).toBe("etag-v2");
    });

    it("uses POST method", async () => {
      await submitApproval({
        id: "11111111-1111-1111-1111-111111111111",
        nonce: "f00df00df00df00df00df00df00df00df00df00df00df00df00df00df00df00d",
        version: "v",
      });
      const [, options] = (vi.mocked(fetch) as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
      expect(options.method).toBe("POST");
    });
  });

  describe("loadImage", () => {
    beforeEach(() => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          blob: () => Promise.resolve(new Blob(["img"], { type: "image/jpeg" })),
        }),
      );
    });

    it("fetches image with no-store cache directive", async () => {
      await loadImage("/api/images/abc");
      const [, options] = (vi.mocked(fetch) as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
      expect(options.cache).toBe("no-store");
    });

    it("fetches with same-origin credentials", async () => {
      await loadImage("/api/images/abc");
      const [, options] = (vi.mocked(fetch) as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
      expect(options.credentials).toBe("same-origin");
    });

    it("returns an object URL string", async () => {
      const url = await loadImage("/api/images/abc");
      expect(url).toMatch(/^blob:/);
    });

    it("throws ApiResponseError on 404", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          blob: () => Promise.resolve(new Blob()),
        }),
      );
      await expect(loadImage("/api/images/missing")).rejects.toBeInstanceOf(ApiResponseError);
    });
  });
});
