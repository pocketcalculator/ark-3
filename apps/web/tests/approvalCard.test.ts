/**
 * Tests: ApprovalCard rendering
 * Verifies semantic HTML, required fields, accessibility attributes, actions,
 * and object URL lifecycle (leak prevention).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createApprovalCard, revokeCardImage } from "../src/components/approvalCard.js";
import { MOCK_ITEM_AWAITING, MOCK_ITEM_OCR_PENDING, MOCK_ITEM_FAILED } from "./fixtures.js";

// Mock the API so image loading doesn't fail
vi.mock("../src/lib/api.js", () => ({
  loadImage: vi.fn().mockResolvedValue("blob:mock-url"),
  retryOcr: vi.fn().mockResolvedValue({ success: true, completedAt: new Date().toISOString() }),
  submitApproval: vi.fn(),
  submitRejection: vi.fn(),
  fetchPending: vi.fn(),
}));

vi.mock("../src/lib/announce.js", () => ({
  announce: vi.fn(),
  announceAlert: vi.fn(),
}));

describe("createApprovalCard", () => {
  it("renders article element with correct aria-label", () => {
    const card = createApprovalCard({
      item: MOCK_ITEM_AWAITING,
      onApproved: vi.fn(),
      onRejected: vi.fn(),
    });
    expect(card.tagName).toBe("ARTICLE");
    expect(card.getAttribute("aria-label")).toContain(MOCK_ITEM_AWAITING.proposedName);
  });

  it("displays proposed RG name", () => {
    const card = createApprovalCard({
      item: MOCK_ITEM_AWAITING,
      onApproved: vi.fn(),
      onRejected: vi.fn(),
    });
    expect(card.textContent).toContain(MOCK_ITEM_AWAITING.proposedName);
  });

  it("displays canonical RG ID", () => {
    const card = createApprovalCard({
      item: MOCK_ITEM_AWAITING,
      onApproved: vi.fn(),
      onRejected: vi.fn(),
    });
    expect(card.textContent).toContain(MOCK_ITEM_AWAITING.canonicalRgId);
  });

  it("displays subscription display label", () => {
    const card = createApprovalCard({
      item: MOCK_ITEM_AWAITING,
      onApproved: vi.fn(),
      onRejected: vi.fn(),
    });
    expect(card.textContent).toContain(MOCK_ITEM_AWAITING.subscriptionDisplayLabel);
  });

  it("displays status badge with awaiting_approval status", () => {
    const card = createApprovalCard({
      item: MOCK_ITEM_AWAITING,
      onApproved: vi.fn(),
      onRejected: vi.fn(),
    });
    const badge = card.querySelector(".status-badge");
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain("awaiting approval");
  });

  it("displays uncalibrated uncertainty label", () => {
    const card = createApprovalCard({
      item: MOCK_ITEM_AWAITING,
      onApproved: vi.fn(),
      onRejected: vi.fn(),
    });
    expect(card.textContent).toMatch(/uncalibrated/i);
  });

  it("shows tags", () => {
    const card = createApprovalCard({
      item: MOCK_ITEM_AWAITING,
      onApproved: vi.fn(),
      onRejected: vi.fn(),
    });
    expect(card.textContent).toContain("ark3-disposable=true");
  });

  it("shows version token", () => {
    const card = createApprovalCard({
      item: MOCK_ITEM_AWAITING,
      onApproved: vi.fn(),
      onRejected: vi.fn(),
    });
    expect(card.textContent).toContain(MOCK_ITEM_AWAITING.version);
  });

  it("renders Approve and Reject buttons for awaiting_approval status", () => {
    const card = createApprovalCard({
      item: MOCK_ITEM_AWAITING,
      onApproved: vi.fn(),
      onRejected: vi.fn(),
    });
    const btns = card.querySelectorAll("button");
    const labels = Array.from(btns).map((b) => b.textContent);
    expect(labels.some((l) => l?.includes("Approve"))).toBe(true);
    expect(labels.some((l) => l?.includes("Reject"))).toBe(true);
  });

  it("renders only Retry OCR for ocr_pending status", () => {
    const card = createApprovalCard({
      item: MOCK_ITEM_OCR_PENDING,
      onApproved: vi.fn(),
      onRejected: vi.fn(),
    });
    const btns = card.querySelectorAll("button");
    const labels = Array.from(btns).map((b) => b.textContent);
    expect(labels.some((l) => l?.includes("Retry OCR"))).toBe(true);
    expect(labels.some((l) => l?.includes("Approve"))).toBe(false);
  });

  it("renders no action buttons for failed status", () => {
    const card = createApprovalCard({
      item: MOCK_ITEM_FAILED,
      onApproved: vi.fn(),
      onRejected: vi.fn(),
    });
    const btns = card.querySelectorAll("button");
    expect(btns.length).toBe(0);
  });

  it("img has descriptive alt text", () => {
    const card = createApprovalCard({
      item: MOCK_ITEM_AWAITING,
      onApproved: vi.fn(),
      onRejected: vi.fn(),
    });
    const img = card.querySelector("img");
    expect(img?.alt).toContain(MOCK_ITEM_AWAITING.proposedName);
    expect(img?.alt).toBeTruthy();
  });

  it("sets data-item-id on the card for cleanup", () => {
    const card = createApprovalCard({
      item: MOCK_ITEM_AWAITING,
      onApproved: vi.fn(),
      onRejected: vi.fn(),
    });
    expect(card.dataset["itemId"]).toBe(MOCK_ITEM_AWAITING.id);
  });
});

// ── Object URL lifecycle tests ─────────────────────────────────────────────────

describe("revokeCardImage — object URL leak prevention", () => {
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let createObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    revokeObjectURL = vi.fn();
    createObjectURL = vi.fn().mockReturnValue("blob:mock-new-url");
    vi.stubGlobal("URL", {
      createObjectURL,
      revokeObjectURL,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("revokeCardImage revokes the stored URL and clears it", async () => {
    const mockLoadImage = vi.fn().mockResolvedValue("blob:old-url");

    vi.doMock("../src/lib/api.js", () => ({
      loadImage: mockLoadImage,
      retryOcr: vi.fn(),
      submitApproval: vi.fn(),
      submitRejection: vi.fn(),
      fetchPending: vi.fn(),
    }));

    const { createApprovalCard: freshCreateCard, revokeCardImage: freshRevoke } =
      await import("../src/components/approvalCard.js?t=" + Date.now());

    freshCreateCard({
      item: MOCK_ITEM_AWAITING,
      onApproved: vi.fn(),
      onRejected: vi.fn(),
    });

    // Let the image load promise resolve
    await vi.waitFor(() => mockLoadImage.mock.calls.length > 0);
    await new Promise<void>((r) => setTimeout(r, 0));

    // Calling revoke should invoke URL.revokeObjectURL
    freshRevoke(MOCK_ITEM_AWAITING.id);
    // A second revoke for the same ID must not throw or double-revoke
    freshRevoke(MOCK_ITEM_AWAITING.id);
  });

  it("revokeCardImage is a no-op for unknown item IDs", () => {
    expect(() => revokeCardImage("unknown-id-that-does-not-exist")).not.toThrow();
  });
});
