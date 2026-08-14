/**
 * Reject dialog.
 *
 * Reject is intentionally easier than approve — no name-typing gate required.
 * A short optional reason may be provided.
 */

import type { ApprovalItem } from "@ark-3/contracts";
import { trapFocus, focusFirst } from "../lib/focus.js";
import { announce, announceAlert } from "../lib/announce.js";
import { submitRejection } from "../lib/api.js";
import { toDisplayError } from "../lib/errors.js";

type OnComplete = (item: ApprovalItem, success: boolean) => void;

interface RejectDialogState {
  item: ApprovalItem;
  onComplete: OnComplete;
  releaseFocusTrap: (() => void) | null;
  returnFocus: HTMLElement | null;
}

let state: RejectDialogState | null = null;

function getOverlay(): HTMLElement {
  const el = document.getElementById("dialog-overlay");
  if (!el) throw new Error("dialog-overlay not found in DOM");
  return el;
}

export function openRejectDialog(
  item: ApprovalItem,
  triggerEl: HTMLElement,
  onComplete: OnComplete,
): void {
  state = {
    item,
    onComplete,
    releaseFocusTrap: null,
    returnFocus: triggerEl,
  };
  renderRejectDialog();
}

function renderRejectDialog(): void {
  if (!state) return;
  const { item } = state;
  const overlay = getOverlay();

  overlay.innerHTML = "";

  const box = document.createElement("div");
  box.className = "dialog-box reject-dialog";
  box.setAttribute("role", "document");

  const title = document.createElement("h2");
  title.id = "dialog-title";
  title.className = "dialog-title";
  title.style.color = "var(--color-text)";
  title.textContent = "Reject Approval";

  const desc = document.createElement("p");
  desc.id = "dialog-description";
  desc.className = "dialog-description";
  desc.innerHTML = `Reject deletion of <strong style="font-family:monospace">${escapeHtml(item.proposedName)}</strong>? The item will be marked rejected and no deletion will occur.`;

  const reasonGroup = document.createElement("div");
  reasonGroup.className = "form-group";

  const reasonLabel = document.createElement("label");
  reasonLabel.setAttribute("for", "reject-reason");
  reasonLabel.className = "form-label";
  reasonLabel.textContent = "Reason (optional)";

  const reasonInput = document.createElement("textarea");
  reasonInput.id = "reject-reason";
  reasonInput.className = "form-input";
  reasonInput.setAttribute("rows", "3");
  reasonInput.setAttribute("maxlength", "500");
  reasonInput.setAttribute("aria-describedby", "reject-reason-hint");
  reasonInput.style.resize = "vertical";

  const reasonHint = document.createElement("p");
  reasonHint.id = "reject-reason-hint";
  reasonHint.className = "form-hint";
  reasonHint.textContent = "Recorded in the audit log. Max 500 characters.";

  reasonGroup.appendChild(reasonLabel);
  reasonGroup.appendChild(reasonInput);
  reasonGroup.appendChild(reasonHint);

  const apiErrorEl = document.createElement("p");
  apiErrorEl.className = "form-error";
  apiErrorEl.setAttribute("role", "alert");
  apiErrorEl.setAttribute("aria-live", "assertive");
  apiErrorEl.hidden = true;

  const actions = document.createElement("div");
  actions.className = "dialog-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn btn-secondary";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => closeDialog());

  const rejectBtn = document.createElement("button");
  rejectBtn.type = "button";
  rejectBtn.className = "btn btn-warning";
  rejectBtn.textContent = "Reject";

  rejectBtn.addEventListener("click", async () => {
    rejectBtn.disabled = true;
    rejectBtn.innerHTML = `<span class="inline-spinner" aria-hidden="true"></span> Rejecting…`;
    rejectBtn.setAttribute("aria-busy", "true");
    apiErrorEl.hidden = true;

    try {
      await submitRejection({
        id: item.id,
        nonce: item.nonce,
        version: item.version,
        reason: reasonInput.value.trim() || undefined,
      });
      announce(`Rejected ${item.proposedName}.`);
      const onComplete = state?.onComplete;
      closeDialog();
      onComplete?.(item, true);
    } catch (err) {
      const msg = toDisplayError(err);
      apiErrorEl.textContent = msg;
      apiErrorEl.hidden = false;
      announceAlert(msg);
      rejectBtn.disabled = false;
      rejectBtn.textContent = "Reject";
      rejectBtn.removeAttribute("aria-busy");
    }
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(rejectBtn);

  const escHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeDialog();
    }
  };
  overlay.addEventListener("keydown", escHandler);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeDialog();
  });

  box.appendChild(title);
  box.appendChild(desc);
  box.appendChild(reasonGroup);
  box.appendChild(apiErrorEl);
  box.appendChild(actions);

  overlay.appendChild(box);
  overlay.classList.remove("hidden");
  state!.releaseFocusTrap = trapFocus(overlay);
  focusFirst(box);
}

function closeDialog(): void {
  if (state?.releaseFocusTrap) state.releaseFocusTrap();
  const overlay = getOverlay();
  overlay.classList.add("hidden");
  overlay.innerHTML = "";
  state?.returnFocus?.focus();
  state = null;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
