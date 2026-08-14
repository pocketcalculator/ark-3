/**
 * Tests: error code → human message mapping
 */
import { describe, it, expect } from "vitest";
import { errorCodeToMessage, ApiResponseError } from "../src/lib/errors.js";

describe("errorCodeToMessage", () => {
  it("maps CONFLICT to a user-readable message", () => {
    const msg = errorCodeToMessage("CONFLICT");
    expect(msg).toMatch(/updated by another session/i);
  });

  it("maps NONCE_EXPIRED to a user-readable message", () => {
    const msg = errorCodeToMessage("NONCE_EXPIRED");
    expect(msg).toMatch(/expired/i);
  });

  it("maps VERSION_MISMATCH to a user-readable message", () => {
    const msg = errorCodeToMessage("VERSION_MISMATCH");
    expect(msg).toMatch(/concurrent/i);
  });

  it("maps REVALIDATION_FAILED to a user-readable message", () => {
    const msg = errorCodeToMessage("REVALIDATION_FAILED");
    expect(msg).toMatch(/validation failed/i);
  });

  it("falls back to UNKNOWN for unrecognized codes", () => {
    const msg = errorCodeToMessage("TOTALLY_UNKNOWN_CODE");
    expect(msg).toMatch(/unexpected error/i);
  });

  it("does not expose internal terms like 'stack', 'exception', or 'SQL'", () => {
    for (const code of [
      "UNKNOWN",
      "VALIDATION_FAILED",
      "NOT_FOUND",
      "CONFLICT",
      "OCR_FAILED",
      "DELETION_FAILED",
    ]) {
      const msg = errorCodeToMessage(code);
      expect(msg.toLowerCase()).not.toMatch(/(stack|exception|sql|error code)/);
    }
  });
});

describe("ApiResponseError", () => {
  it("sets displayMessage from code lookup", () => {
    const err = new ApiResponseError({
      code: "NONCE_INVALID",
      message: "raw internal message",
      statusCode: 409,
    });
    expect(err.displayMessage).toMatch(/token is invalid/i);
    // Raw message is NOT used as displayMessage
    expect(err.displayMessage).not.toBe("raw internal message");
  });

  it("preserves statusCode and requestId", () => {
    const err = new ApiResponseError({
      code: "FORBIDDEN",
      message: "forbidden",
      statusCode: 403,
      requestId: "req-abc",
    });
    expect(err.statusCode).toBe(403);
    expect(err.requestId).toBe("req-abc");
  });
});
