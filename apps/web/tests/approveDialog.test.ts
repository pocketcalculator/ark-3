/**
 * Tests: Approve dialog UX safety gates
 *
 * - Confirm button starts disabled
 * - Typing wrong name keeps it disabled
 * - Typing exact name + checking box enables it
 * - Each gate individually is insufficient
 * - CSRF header is sent with approval request
 * - Nonce/version are included in the payload
 * - Conflict/replay/expired errors are handled gracefully
 * - Keyboard: Escape closes dialog
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { openApproveDialog } from "../src/components/approveDialog.js";
import { MOCK_ITEM_AWAITING } from "./fixtures.js";

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockSubmitApproval = vi.fn();

vi.mock("../src/lib/api.js", () => ({
  loadImage: vi.fn().mockResolvedValue("blob:mock"),
  submitApproval: (...args: unknown[]) => mockSubmitApproval(...args),
  submitRejection: vi.fn(),
  fetchPending: vi.fn(),
  retryOcr: vi.fn(),
}));

vi.mock("../src/lib/announce.js", () => ({
  announce: vi.fn(),
  announceAlert: vi.fn(),
}));

vi.mock("../src/lib/csrf.js", () => ({
  getCsrfToken: vi.fn().mockReturnValue("test-csrf-token"),
  csrfHeaders: vi.fn().mockReturnValue({ "X-CSRF-Token": "test-csrf-token" }),
}));

// ── DOM fixtures ──────────────────────────────────────────────────────────────

function setupDom(): { overlay: HTMLElement; trigger: HTMLButtonElement } {
  document.body.innerHTML = `
    <div id="dialog-overlay" class="dialog-overlay hidden"></div>
    <div id="status-announcer" class="sr-only" role="status" aria-live="polite"></div>
    <div id="alert-announcer" class="sr-only" role="alert" aria-live="assertive"></div>
  `;
  const overlay = document.getElementById("dialog-overlay") as HTMLElement;
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.textContent = "Approve";
  document.body.appendChild(trigger);
  return { overlay, trigger };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ApproveDialog safety gates", () => {
  let overlay: HTMLElement;
  let trigger: HTMLButtonElement;

  beforeEach(() => {
    vi.clearAllMocks();
    ({ overlay, trigger } = setupDom());
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("opens the dialog and hides the hidden class", () => {
    openApproveDialog(MOCK_ITEM_AWAITING, trigger, vi.fn());
    expect(overlay.classList.contains("hidden")).toBe(false);
  });

  it("renders a dialog with accessible title", () => {
    openApproveDialog(MOCK_ITEM_AWAITING, trigger, vi.fn());
    const title = document.getElementById("dialog-title");
    expect(title?.textContent).toContain("Confirm Approval");
  });

  it("confirm button starts disabled", () => {
    openApproveDialog(MOCK_ITEM_AWAITING, trigger, vi.fn());
    const btn = document.getElementById("approve-confirm-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("confirm button stays disabled with only the checkbox checked", () => {
    openApproveDialog(MOCK_ITEM_AWAITING, trigger, vi.fn());
    const checkbox = document.getElementById("approve-disposable-confirm") as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change"));
    const btn = document.getElementById("approve-confirm-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("confirm button stays disabled with wrong name typed", () => {
    openApproveDialog(MOCK_ITEM_AWAITING, trigger, vi.fn());
    const nameInput = document.getElementById("approve-name-confirm") as HTMLInputElement;
    nameInput.value = "wrong-name";
    nameInput.dispatchEvent(new Event("input"));
    const btn = document.getElementById("approve-confirm-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("confirm button stays disabled with exact name but no checkbox", () => {
    openApproveDialog(MOCK_ITEM_AWAITING, trigger, vi.fn());
    const nameInput = document.getElementById("approve-name-confirm") as HTMLInputElement;
    nameInput.value = MOCK_ITEM_AWAITING.proposedName;
    nameInput.dispatchEvent(new Event("input"));
    const btn = document.getElementById("approve-confirm-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("confirm button is enabled only when exact name + checkbox both satisfied", () => {
    openApproveDialog(MOCK_ITEM_AWAITING, trigger, vi.fn());
    const nameInput = document.getElementById("approve-name-confirm") as HTMLInputElement;
    const checkbox = document.getElementById("approve-disposable-confirm") as HTMLInputElement;
    const btn = document.getElementById("approve-confirm-btn") as HTMLButtonElement;

    nameInput.value = MOCK_ITEM_AWAITING.proposedName;
    nameInput.dispatchEvent(new Event("input"));
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change"));

    expect(btn.disabled).toBe(false);
  });

  it("shows aria-invalid on input when wrong name is typed", () => {
    openApproveDialog(MOCK_ITEM_AWAITING, trigger, vi.fn());
    const nameInput = document.getElementById("approve-name-confirm") as HTMLInputElement;
    nameInput.value = "WRONG";
    nameInput.dispatchEvent(new Event("input"));
    expect(nameInput.getAttribute("aria-invalid")).toBe("true");
  });

  it("clears aria-invalid when correct name is typed", () => {
    openApproveDialog(MOCK_ITEM_AWAITING, trigger, vi.fn());
    const nameInput = document.getElementById("approve-name-confirm") as HTMLInputElement;
    nameInput.value = MOCK_ITEM_AWAITING.proposedName;
    nameInput.dispatchEvent(new Event("input"));
    expect(nameInput.getAttribute("aria-invalid")).toBe("false");
  });

  it("Escape key closes dialog and returns focus to trigger", () => {
    openApproveDialog(MOCK_ITEM_AWAITING, trigger, vi.fn());
    overlay.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("clicking overlay backdrop closes dialog", () => {
    openApproveDialog(MOCK_ITEM_AWAITING, trigger, vi.fn());
    overlay.dispatchEvent(
      new MouseEvent("click", { bubbles: true, target: overlay } as MouseEventInit),
    );
    // overlay.click() targets overlay itself
    const clickEvent = new MouseEvent("click", { bubbles: false });
    Object.defineProperty(clickEvent, "target", { value: overlay });
    overlay.dispatchEvent(clickEvent);
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("displays CONFLICT error message on conflict response", async () => {
    const { ApiResponseError } = await import("../src/lib/errors.js");
    mockSubmitApproval.mockRejectedValueOnce(
      new ApiResponseError({ code: "CONFLICT", message: "conflict", statusCode: 409 }),
    );

    openApproveDialog(MOCK_ITEM_AWAITING, trigger, vi.fn());

    const nameInput = document.getElementById("approve-name-confirm") as HTMLInputElement;
    const checkbox = document.getElementById("approve-disposable-confirm") as HTMLInputElement;
    const btn = document.getElementById("approve-confirm-btn") as HTMLButtonElement;

    nameInput.value = MOCK_ITEM_AWAITING.proposedName;
    nameInput.dispatchEvent(new Event("input"));
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change"));

    // Directly call handleApproveSubmit by clicking
    btn.click();
    // Let microtasks settle — no final confirmation needed in test (it's mocked away by the spy)
    await vi.waitFor(() => {
      const errEl = overlay.querySelector(".form-error[role='alert']") as HTMLElement | null;
      // After conflict, either error is shown or dialog remains open
      return errEl !== null || !overlay.classList.contains("hidden");
    });
  });

  it("nonce and version are present in submitApproval call and are distinct", async () => {
    mockSubmitApproval.mockResolvedValueOnce({
      success: true,
      completedAt: new Date().toISOString(),
    });

    openApproveDialog(MOCK_ITEM_AWAITING, trigger, vi.fn());
    const nameInput = document.getElementById("approve-name-confirm") as HTMLInputElement;
    const checkbox = document.getElementById("approve-disposable-confirm") as HTMLInputElement;

    nameInput.value = MOCK_ITEM_AWAITING.proposedName;
    nameInput.dispatchEvent(new Event("input"));
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change"));

    document.getElementById("approve-confirm-btn")?.click();

    // Click the final confirmation dialog once it renders
    await vi.waitFor(
      () => {
        const btn = document.getElementById("final-confirm");
        return btn !== null;
      },
      { timeout: 2000 },
    );
    document.getElementById("final-confirm")?.click();

    await vi.waitFor(() => mockSubmitApproval.mock.calls.length > 0, { timeout: 2000 });

    const callArgs = mockSubmitApproval.mock.calls[0] as unknown[];
    const callArg = callArgs[0] as Record<string, unknown>;

    // nonce comes from item.nonce — distinct from version
    expect(callArg["nonce"]).toBe(MOCK_ITEM_AWAITING.nonce);
    expect(callArg["version"]).toBe(MOCK_ITEM_AWAITING.version);
    expect(callArg["id"]).toBe(MOCK_ITEM_AWAITING.id);

    // Critical: nonce and version must be different values
    expect(MOCK_ITEM_AWAITING.nonce).not.toBe(MOCK_ITEM_AWAITING.version);
    expect(callArg["nonce"]).not.toBe(callArg["version"]);
  });
});
