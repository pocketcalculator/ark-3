/**
 * Tests: axe-core accessibility audit on rendered approval card.
 *
 * Uses axe-core directly against JSDOM. We run on the card's containing
 * div (not full document) to avoid false positives from missing landmark
 * regions in the minimal test DOM.
 */
import { describe, it, expect, vi } from "vitest";
import axe from "axe-core";
import { createApprovalCard } from "../src/components/approvalCard.js";
import { MOCK_ITEM_AWAITING } from "./fixtures.js";

vi.mock("../src/lib/api.js", () => ({
  loadImage: vi.fn().mockResolvedValue("blob:mock"),
  retryOcr: vi.fn(),
  submitApproval: vi.fn(),
  submitRejection: vi.fn(),
  fetchPending: vi.fn(),
}));

vi.mock("../src/lib/announce.js", () => ({
  announce: vi.fn(),
  announceAlert: vi.fn(),
}));

describe("ApprovalCard accessibility (axe-core)", () => {
  it("card has no critical axe violations", async () => {
    // Mount the card in a container with basic landmark context
    const container = document.createElement("main");
    const card = createApprovalCard({
      item: MOCK_ITEM_AWAITING,
      onApproved: vi.fn(),
      onRejected: vi.fn(),
    });
    container.appendChild(card);
    document.body.appendChild(container);

    const results = await axe.run(container, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "best-practice"],
      },
    });

    document.body.removeChild(container);

    // Filter out violations tied to missing full-page context (color-contrast
    // in JSDOM is unreliable since computed styles aren't applied)
    const critical = results.violations.filter(
      (v) => v.id !== "color-contrast",
    );

    if (critical.length > 0) {
      const details = critical
        .map((v) => `${v.id}: ${v.description}\n  ${v.nodes.map((n) => n.html).join("\n  ")}`)
        .join("\n");
      expect.fail(`Axe violations:\n${details}`);
    }

    expect(critical).toHaveLength(0);
  });
});
