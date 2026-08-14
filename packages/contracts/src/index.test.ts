/**
 * Unit tests for @ark-3/contracts
 *
 * Uses Node.js built-in test runner (node:test) — no external test framework required.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ResourceGroupNameSchema,
  UploadStatusSchema,
  TERMINAL_STATUSES,
  VALID_TRANSITIONS,
  DeviceUploadResponseSchema,
  OcrResultSchema,
  ApprovalItemSchema,
  ApproveRequestSchema,
  RejectRequestSchema,
  OperationResultSchema,
  ApiErrorSchema,
  ApiErrorCode,
  CanonicalRgIdSchema,
  PendingListSchema,
} from "./index.js";

// ── ResourceGroupName ────────────────────────────────────────────────────────

describe("ResourceGroupNameSchema", () => {
  it("accepts valid names", () => {
    const valid = [
      "rg-test",
      "MyResourceGroup",
      "rg_ark3_dev",
      "rg(test)",
      "a",
      "a".repeat(90),
      "rg-with.dot",
    ];
    for (const name of valid) {
      assert.ok(
        ResourceGroupNameSchema.safeParse(name).success,
        `Expected "${name}" to be valid`,
      );
    }
  });

  it("rejects names that end with a period", () => {
    const result = ResourceGroupNameSchema.safeParse("rg-test.");
    assert.equal(result.success, false);
  });

  it("rejects empty string", () => {
    assert.equal(ResourceGroupNameSchema.safeParse("").success, false);
  });

  it("rejects names longer than 90 chars", () => {
    assert.equal(
      ResourceGroupNameSchema.safeParse("a".repeat(91)).success,
      false,
    );
  });

  it("rejects names with invalid characters", () => {
    assert.equal(ResourceGroupNameSchema.safeParse("rg test").success, false);
    assert.equal(ResourceGroupNameSchema.safeParse("rg@test").success, false);
  });
});

// ── CanonicalRgId ────────────────────────────────────────────────────────────

describe("CanonicalRgIdSchema", () => {
  it("accepts a valid ARM ID", () => {
    const id =
      "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-test";
    assert.ok(CanonicalRgIdSchema.safeParse(id).success);
  });

  it("rejects a short subscription id", () => {
    const id = "/subscriptions/short/resourceGroups/rg-test";
    assert.equal(CanonicalRgIdSchema.safeParse(id).success, false);
  });

  it("rejects bare resource group name", () => {
    assert.equal(CanonicalRgIdSchema.safeParse("rg-test").success, false);
  });
});

// ── Status enum and transitions ──────────────────────────────────────────────

describe("UploadStatusSchema", () => {
  it("accepts all defined statuses", () => {
    const statuses = [
      "uploaded",
      "ocr_pending",
      "awaiting_approval",
      "rejected",
      "deleting",
      "deleted",
      "failed",
    ] as const;
    for (const s of statuses) {
      assert.ok(UploadStatusSchema.safeParse(s).success);
    }
  });

  it("rejects unknown status", () => {
    assert.equal(UploadStatusSchema.safeParse("approved").success, false);
  });
});

describe("TERMINAL_STATUSES", () => {
  it("contains rejected, deleted, failed", () => {
    assert.ok(TERMINAL_STATUSES.has("rejected"));
    assert.ok(TERMINAL_STATUSES.has("deleted"));
    assert.ok(TERMINAL_STATUSES.has("failed"));
  });

  it("does not contain non-terminal statuses", () => {
    assert.equal(TERMINAL_STATUSES.has("uploaded"), false);
    assert.equal(TERMINAL_STATUSES.has("awaiting_approval"), false);
    assert.equal(TERMINAL_STATUSES.has("deleting"), false);
  });
});

describe("VALID_TRANSITIONS", () => {
  it("terminal states have no outbound transitions", () => {
    for (const s of TERMINAL_STATUSES) {
      assert.deepEqual(VALID_TRANSITIONS[s], []);
    }
  });

  it("awaiting_approval can reach deleting or rejected", () => {
    assert.ok(VALID_TRANSITIONS.awaiting_approval.includes("deleting"));
    assert.ok(VALID_TRANSITIONS.awaiting_approval.includes("rejected"));
  });

  it("deleting can reach deleted or failed", () => {
    assert.ok(VALID_TRANSITIONS.deleting.includes("deleted"));
    assert.ok(VALID_TRANSITIONS.deleting.includes("failed"));
  });
});

// ── OcrResult ─────────────────────────────────────────────────────────────────

describe("OcrResultSchema", () => {
  it("accepts a valid result", () => {
    assert.ok(
      OcrResultSchema.safeParse({
        resourceGroupName: "rg-test",
        rawText: "rg-test",
        uncertainty: 0.1,
      }).success,
    );
  });

  it("accepts null resourceGroupName", () => {
    assert.ok(
      OcrResultSchema.safeParse({
        resourceGroupName: null,
        rawText: "unreadable",
        uncertainty: 0.9,
      }).success,
    );
  });

  it("rejects uncertainty outside [0,1]", () => {
    assert.equal(
      OcrResultSchema.safeParse({
        resourceGroupName: null,
        rawText: "",
        uncertainty: 1.5,
      }).success,
      false,
    );
  });
});

// ── DeviceUploadResponse ──────────────────────────────────────────────────────

describe("DeviceUploadResponseSchema", () => {
  it("accepts a valid response", () => {
    assert.ok(
      DeviceUploadResponseSchema.safeParse({
        uploadId: "00000000-0000-0000-0000-000000000000",
        status: "uploaded",
        acceptedAt: new Date().toISOString(),
      }).success,
    );
  });

  it("rejects non-UUID uploadId", () => {
    assert.equal(
      DeviceUploadResponseSchema.safeParse({
        uploadId: "not-a-uuid",
        status: "uploaded",
        acceptedAt: new Date().toISOString(),
      }).success,
      false,
    );
  });
});

// ── ApproveRequest ────────────────────────────────────────────────────────────

describe("ApproveRequestSchema", () => {
  const validNonce = "a".repeat(64);

  it("accepts a valid approve request", () => {
    assert.ok(
      ApproveRequestSchema.safeParse({
        id: "00000000-0000-0000-0000-000000000000",
        nonce: validNonce,
        version: "etag-v1",
      }).success,
    );
  });

  it("rejects empty nonce", () => {
    assert.equal(
      ApproveRequestSchema.safeParse({
        id: "00000000-0000-0000-0000-000000000000",
        nonce: "",
        version: "v1",
      }).success,
      false,
    );
  });

  it("rejects a nonce that is not 64 hex digits", () => {
    assert.equal(
      ApproveRequestSchema.safeParse({
        id: "00000000-0000-0000-0000-000000000000",
        nonce: "short-nonce",
        version: "v1",
      }).success,
      false,
    );
  });

  it("rejects a nonce with non-hex characters", () => {
    assert.equal(
      ApproveRequestSchema.safeParse({
        id: "00000000-0000-0000-0000-000000000000",
        nonce: "G".repeat(64),
        version: "v1",
      }).success,
      false,
    );
  });
});

// ── ApiError ──────────────────────────────────────────────────────────────────

describe("ApiErrorSchema", () => {
  it("accepts a valid error envelope", () => {
    assert.ok(
      ApiErrorSchema.safeParse({
        success: false,
        error: {
          code: ApiErrorCode.NOT_FOUND,
          message: "Resource group not found",
          timestamp: new Date().toISOString(),
        },
      }).success,
    );
  });

  it("rejects success: true", () => {
    assert.equal(
      ApiErrorSchema.safeParse({
        success: true,
        error: {
          code: "NOT_FOUND",
          message: "x",
          timestamp: new Date().toISOString(),
        },
      }).success,
      false,
    );
  });

  it("rejects unknown error codes", () => {
    assert.equal(
      ApiErrorSchema.safeParse({
        success: false,
        error: {
          code: "MADE_UP_CODE",
          message: "x",
          timestamp: new Date().toISOString(),
        },
      }).success,
      false,
    );
  });
});

// ── PendingList ───────────────────────────────────────────────────────────────

describe("PendingListSchema", () => {
  it("accepts an empty pending list", () => {
    assert.ok(
      PendingListSchema.safeParse({ items: [], total: 0 }).success,
    );
  });

  it("rejects negative total", () => {
    assert.equal(
      PendingListSchema.safeParse({ items: [], total: -1 }).success,
      false,
    );
  });
});
