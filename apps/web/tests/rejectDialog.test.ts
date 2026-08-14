/**
 * Tests: Reject dialog
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { openRejectDialog } from "../src/components/rejectDialog.js";
import { MOCK_ITEM_AWAITING } from "./fixtures.js";

const mockSubmitRejection = vi.fn();

vi.mock("../src/lib/api.js", () => ({
  loadImage: vi.fn().mockResolvedValue("blob:mock"),
  submitApproval: vi.fn(),
  submitRejection: (...args: unknown[]) => mockSubmitRejection(...args),
  fetchPending: vi.fn(),
  retryOcr: vi.fn(),
}));

vi.mock("../src/lib/announce.js", () => ({
  announce: vi.fn(),
  announceAlert: vi.fn(),
}));

vi.mock("../src/lib/csrf.js", () => ({
  getCsrfToken: vi.fn().mockReturnValue("csrf-test"),
  csrfHeaders: vi.fn().mockReturnValue({ "X-CSRF-Token": "csrf-test" }),
}));

function setupDom(): { overlay: HTMLElement; trigger: HTMLButtonElement } {
  document.body.innerHTML = `
    <div id="dialog-overlay" class="dialog-overlay hidden"></div>
    <div id="status-announcer" role="status" aria-live="polite"></div>
    <div id="alert-announcer" role="alert" aria-live="assertive"></div>
  `;
  const trigger = document.createElement("button");
  trigger.type = "button";
  document.body.appendChild(trigger);
  return {
    overlay: document.getElementById("dialog-overlay") as HTMLElement,
    trigger,
  };
}

describe("RejectDialog", () => {
  let overlay: HTMLElement;
  let trigger: HTMLButtonElement;

  beforeEach(() => {
    vi.clearAllMocks();
    ({ overlay, trigger } = setupDom());
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("opens the dialog", () => {
    openRejectDialog(MOCK_ITEM_AWAITING, trigger, vi.fn());
    expect(overlay.classList.contains("hidden")).toBe(false);
  });

  it("renders Reject button and Cancel button", () => {
    openRejectDialog(MOCK_ITEM_AWAITING, trigger, vi.fn());
    const btns = overlay.querySelectorAll("button");
    const labels = Array.from(btns).map((b) => b.textContent);
    expect(labels.some((l) => l?.includes("Reject"))).toBe(true);
    expect(labels.some((l) => l?.includes("Cancel"))).toBe(true);
  });

  it("Reject button is enabled immediately (safer path than approve)", () => {
    openRejectDialog(MOCK_ITEM_AWAITING, trigger, vi.fn());
    const rejectBtn = Array.from(overlay.querySelectorAll("button")).find(
      (b) => b.textContent === "Reject",
    ) as HTMLButtonElement;
    expect(rejectBtn.disabled).toBe(false);
  });

  it("Cancel button closes dialog", () => {
    openRejectDialog(MOCK_ITEM_AWAITING, trigger, vi.fn());
    const cancelBtn = Array.from(overlay.querySelectorAll("button")).find(
      (b) => b.textContent === "Cancel",
    ) as HTMLButtonElement;
    cancelBtn.click();
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("Escape key closes dialog", () => {
    openRejectDialog(MOCK_ITEM_AWAITING, trigger, vi.fn());
    overlay.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("submits rejection with nonce from item.nonce (distinct from version)", async () => {
    mockSubmitRejection.mockResolvedValueOnce({
      success: true,
      completedAt: new Date().toISOString(),
    });

    const onComplete = vi.fn();
    openRejectDialog(MOCK_ITEM_AWAITING, trigger, onComplete);

    const rejectBtn = Array.from(overlay.querySelectorAll("button")).find(
      (b) => b.textContent === "Reject",
    ) as HTMLButtonElement;
    rejectBtn.click();

    await vi.waitFor(() => mockSubmitRejection.mock.calls.length > 0);

    const [callArg] = mockSubmitRejection.mock.calls[0] as [unknown];
    const arg = callArg as Record<string, unknown>;

    // nonce must come from item.nonce, version from item.version
    expect(arg["nonce"]).toBe(MOCK_ITEM_AWAITING.nonce);
    expect(arg["version"]).toBe(MOCK_ITEM_AWAITING.version);
    expect(arg["id"]).toBe(MOCK_ITEM_AWAITING.id);

    // Critical: nonce and version must be distinct values
    expect(MOCK_ITEM_AWAITING.nonce).not.toBe(MOCK_ITEM_AWAITING.version);
    expect(arg["nonce"]).not.toBe(arg["version"]);
  });

  it("calls onComplete callback after successful rejection", async () => {
    mockSubmitRejection.mockResolvedValueOnce({
      success: true,
      completedAt: new Date().toISOString(),
    });

    const onComplete = vi.fn();
    openRejectDialog(MOCK_ITEM_AWAITING, trigger, onComplete);

    const rejectBtn = Array.from(overlay.querySelectorAll("button")).find(
      (b) => b.textContent === "Reject",
    ) as HTMLButtonElement;
    rejectBtn.click();

    await vi.waitFor(() => onComplete.mock.calls.length > 0);
    expect(onComplete).toHaveBeenCalledWith(MOCK_ITEM_AWAITING, true);
  });

  it("shows error message on API failure", async () => {
    const { ApiResponseError } = await import("../src/lib/errors.js");
    mockSubmitRejection.mockRejectedValueOnce(
      new ApiResponseError({
        code: "VERSION_MISMATCH",
        message: "version mismatch",
        statusCode: 409,
      }),
    );

    openRejectDialog(MOCK_ITEM_AWAITING, trigger, vi.fn());

    const rejectBtn = Array.from(overlay.querySelectorAll("button")).find(
      (b) => b.textContent === "Reject",
    ) as HTMLButtonElement;
    rejectBtn.click();

    await vi.waitFor(() => {
      const errEl = overlay.querySelector(".form-error[role='alert']") as HTMLElement | null;
      return errEl !== null && !errEl.hidden && errEl.textContent !== "";
    });

    const errEl = overlay.querySelector(".form-error[role='alert']") as HTMLElement;
    expect(errEl.textContent).toMatch(/concurrent/i);
  });
});
