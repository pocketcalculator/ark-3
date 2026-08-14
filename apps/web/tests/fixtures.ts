/**
 * Test fixtures — canonical ApprovalItem shapes for tests.
 */
import type { ApprovalItem } from "@ark-3/contracts";

export const MOCK_ITEM_AWAITING: ApprovalItem = {
  id: "11111111-1111-1111-1111-111111111111",
  imageRoute: "/api/images/11111111-1111-1111-1111-111111111111",
  proposedName: "rg-test-sandbox-01",
  canonicalRgId:
    "/subscriptions/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/resourceGroups/rg-test-sandbox-01",
  subscriptionDisplayLabel: "Dev Sandbox Sub",
  tags: { "ark3-disposable": "true", environment: "dev" },
  status: "awaiting_approval",
  createdAt: "2026-08-13T14:00:00.000Z",
  updatedAt: "2026-08-13T14:05:00.000Z",
  nonce: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  version: "etag-v1-abc123",
};

export const MOCK_ITEM_OCR_PENDING: ApprovalItem = {
  ...MOCK_ITEM_AWAITING,
  id: "22222222-2222-2222-2222-222222222222",
  imageRoute: "/api/images/22222222-2222-2222-2222-222222222222",
  proposedName: "rg-ocr-pending-01",
  status: "ocr_pending",
};

export const MOCK_ITEM_FAILED: ApprovalItem = {
  ...MOCK_ITEM_AWAITING,
  id: "33333333-3333-3333-3333-333333333333",
  imageRoute: "/api/images/33333333-3333-3333-3333-333333333333",
  proposedName: "rg-failed-01",
  status: "failed",
};
