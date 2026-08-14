/**
 * Approval confirmation dialog.
 *
 * Safety gates (both must pass before the confirm button is enabled):
 *   1. User types the exact proposed RG name into a text input.
 *   2. User checks the "non-production / disposable" checkbox.
 *
 * Then a final confirmation dialog is shown before the request is sent.
 * Submits nonce + version for replay/concurrency protection.
 */

import type { ApprovalItem } from "@ark-3/contracts";
import { trapFocus, focusFirst } from "../lib/focus.js";
import { announce, announceAlert } from "../lib/announce.js";
import { submitApproval } from "../lib/api.js";
import { toDisplayError } from "../lib/errors.js";

type OnComplete = (item: ApprovalItem, success: boolean) => void;

interface ApproveDialogState {
  item: ApprovalItem;
  onComplete: OnComplete;
  releaseFocusTrap: (() => void) | null;
  returnFocus: HTMLElement | null;
}

let state: ApproveDialogState | null = null;

function getOverlay(): HTMLElement {
  const el = document.getElementById("dialog-overlay");
  if (!el) throw new Error("dialog-overlay not found in DOM");
  return el;
}

export function openApproveDialog(
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
  renderApproveDialog();
}

function renderApproveDialog(): void {
  if (!state) return;
  const { item } = state;
  const overlay = getOverlay();

  overlay.innerHTML = "";

  const box = document.createElement("div");
  box.className = "dialog-box";
  box.setAttribute("role", "document");

  // Title
  const title = document.createElement("h2");
  title.id = "dialog-title";
  title.className = "dialog-title";
  title.textContent = "Confirm Approval";

  // Description
  const desc = document.createElement("p");
  desc.id = "dialog-description";
  desc.className = "dialog-description";
  desc.textContent =
    "You are about to approve deletion of a non-production Azure resource group. " +
    "This action cannot be undone. Complete both steps below to proceed.";

  // Warning
  const warning = document.createElement("div");
  warning.className = "dialog-warning";
  warning.setAttribute("role", "note");
  warning.innerHTML =
    "<strong>⚠ Non-production only.</strong> This system targets disposable, non-production resources only. " +
    "Production deletion is out of scope.";

  // Resource summary
  const summary = document.createElement("dl");
  summary.className = "dialog-summary";
  summary.style.cssText =
    "display:grid;grid-template-columns:auto 1fr;gap:0.25rem 1rem;font-size:0.85rem;margin:0;";
  summary.innerHTML = `
    <dt style="font-weight:600;color:var(--color-text-muted)">RG Name</dt>
    <dd style="margin:0;font-family:monospace;font-weight:700">${escapeHtml(item.proposedName)}</dd>
    <dt style="font-weight:600;color:var(--color-text-muted)">Canonical ID</dt>
    <dd style="margin:0;font-family:monospace;font-size:0.8rem;word-break:break-all">${escapeHtml(item.canonicalRgId)}</dd>
    <dt style="font-weight:600;color:var(--color-text-muted)">Subscription</dt>
    <dd style="margin:0">${escapeHtml(item.subscriptionDisplayLabel)}</dd>
  `;

  // Step 1: Type the RG name
  const step1Group = document.createElement("div");
  step1Group.className = "form-group";

  const step1Label = document.createElement("label");
  step1Label.setAttribute("for", "approve-name-confirm");
  step1Label.className = "form-label";
  step1Label.innerHTML = `Step 1 of 2 — Type the exact resource group name to confirm: <code style="font-size:0.95rem">${escapeHtml(item.proposedName)}</code>`;

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.id = "approve-name-confirm";
  nameInput.className = "form-input";
  nameInput.setAttribute("autocomplete", "off");
  nameInput.setAttribute("autocorrect", "off");
  nameInput.setAttribute("autocapitalize", "off");
  nameInput.setAttribute("spellcheck", "false");
  nameInput.setAttribute("aria-required", "true");
  nameInput.setAttribute("aria-invalid", "false");
  nameInput.setAttribute("aria-describedby", "approve-name-hint approve-name-error");

  const nameHint = document.createElement("p");
  nameHint.id = "approve-name-hint";
  nameHint.className = "form-hint";
  nameHint.textContent = "Exact match required — case-sensitive.";

  const nameError = document.createElement("p");
  nameError.id = "approve-name-error";
  nameError.className = "form-error";
  nameError.setAttribute("aria-live", "polite");
  nameError.setAttribute("role", "alert");
  nameError.hidden = true;
  nameError.textContent = "Name does not match. Type the exact resource group name.";

  step1Group.appendChild(step1Label);
  step1Group.appendChild(nameInput);
  step1Group.appendChild(nameHint);
  step1Group.appendChild(nameError);

  // Step 2: Checkbox
  const step2Group = document.createElement("div");
  step2Group.className = "form-checkbox-group";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.id = "approve-disposable-confirm";
  checkbox.className = "form-checkbox";
  checkbox.setAttribute("aria-required", "true");
  checkbox.setAttribute("aria-describedby", "approve-checkbox-label");

  const checkboxLabel = document.createElement("label");
  checkboxLabel.setAttribute("for", "approve-disposable-confirm");
  checkboxLabel.id = "approve-checkbox-label";
  checkboxLabel.className = "form-checkbox-label";
  checkboxLabel.innerHTML =
    "<strong>Step 2 of 2</strong> — I confirm this resource group is <strong>non-production and disposable</strong>, " +
    "and that deletion has been reviewed and is intentional.";

  step2Group.appendChild(checkbox);
  step2Group.appendChild(checkboxLabel);

  // Error message area (API errors)
  const apiErrorEl = document.createElement("p");
  apiErrorEl.className = "form-error";
  apiErrorEl.setAttribute("role", "alert");
  apiErrorEl.setAttribute("aria-live", "assertive");
  apiErrorEl.hidden = true;

  // Actions
  const actions = document.createElement("div");
  actions.className = "dialog-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn btn-secondary";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => closeDialog());

  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.id = "approve-confirm-btn";
  confirmBtn.className = "btn btn-danger";
  confirmBtn.textContent = "Approve Deletion";
  confirmBtn.disabled = true;
  confirmBtn.setAttribute(
    "aria-describedby",
    "dialog-description",
  );

  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);

  // Gate validation
  function updateGate(): void {
    const nameOk = nameInput.value === item.proposedName;
    const checkOk = checkbox.checked;
    confirmBtn.disabled = !(nameOk && checkOk);

    if (nameInput.value.length > 0 && !nameOk) {
      nameInput.setAttribute("aria-invalid", "true");
      nameError.hidden = false;
    } else {
      nameInput.setAttribute("aria-invalid", "false");
      nameError.hidden = true;
    }
  }

  nameInput.addEventListener("input", updateGate);
  checkbox.addEventListener("change", updateGate);

  // Submit handler
  confirmBtn.addEventListener("click", async () => {
    if (confirmBtn.disabled) return;
    await handleApproveSubmit(item, confirmBtn, apiErrorEl);
  });

  // Keyboard: Escape closes
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeDialog();
    }
  };

  box.appendChild(title);
  box.appendChild(desc);
  box.appendChild(warning);
  box.appendChild(summary);
  box.appendChild(step1Group);
  box.appendChild(step2Group);
  box.appendChild(apiErrorEl);
  box.appendChild(actions);

  overlay.appendChild(box);

  overlay.classList.remove("hidden");
  overlay.addEventListener("keydown", escHandler);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeDialog();
  });

  state!.releaseFocusTrap = trapFocus(overlay);
  focusFirst(box);
}

async function handleApproveSubmit(
  item: ApprovalItem,
  btn: HTMLButtonElement,
  apiErrorEl: HTMLElement,
): Promise<void> {
  // Final confirmation dialog
  const confirmed = await showFinalConfirmation(item);
  if (!confirmed) return;

  btn.disabled = true;
  btn.innerHTML = `<span class="inline-spinner" aria-hidden="true"></span> Approving…`;
  btn.setAttribute("aria-busy", "true");
  apiErrorEl.hidden = true;

  try {
    await submitApproval({
      id: item.id,
      nonce: item.nonce,
      version: item.version,
    });
    announce(`Approval submitted for ${item.proposedName}.`);
    const onComplete = state?.onComplete;
    closeDialog();
    onComplete?.(item, true);
  } catch (err) {
    const msg = toDisplayError(err);
    apiErrorEl.textContent = msg;
    apiErrorEl.hidden = false;
    announceAlert(msg);
    btn.disabled = false;
    btn.textContent = "Approve Deletion";
    btn.removeAttribute("aria-busy");
  }
}

function showFinalConfirmation(item: ApprovalItem): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = getOverlay();
    // Store the current box temporarily
    const existingBox = overlay.querySelector(".dialog-box");

    const confirmBox = document.createElement("div");
    confirmBox.className = "dialog-box";
    confirmBox.setAttribute("role", "alertdialog");
    confirmBox.setAttribute("aria-labelledby", "final-confirm-title");
    confirmBox.setAttribute("aria-describedby", "final-confirm-desc");
    confirmBox.style.borderColor = "var(--color-danger-border)";

    confirmBox.innerHTML = `
      <h2 id="final-confirm-title" class="dialog-title">Final Confirmation</h2>
      <p id="final-confirm-desc" class="dialog-description">
        You are about to permanently delete the Azure resource group:<br/>
        <strong style="font-family:monospace">${escapeHtml(item.proposedName)}</strong><br/>
        <span style="font-size:0.8rem;color:var(--color-text-muted)">${escapeHtml(item.canonicalRgId)}</span>
      </p>
      <p class="dialog-warning"><strong>This cannot be undone.</strong></p>
      <div class="dialog-actions" style="margin-top:0.5rem">
        <button type="button" id="final-cancel" class="btn btn-secondary">Cancel</button>
        <button type="button" id="final-confirm" class="btn btn-danger">Delete Resource Group</button>
      </div>
    `;

    if (existingBox) overlay.removeChild(existingBox);
    overlay.appendChild(confirmBox);

    const release = trapFocus(overlay);
    document.getElementById("final-confirm")?.focus();

    function cleanup(result: boolean): void {
      release();
      overlay.removeChild(confirmBox);
      if (existingBox) overlay.appendChild(existingBox);
      resolve(result);
    }

    document.getElementById("final-cancel")?.addEventListener("click", () => cleanup(false));
    document.getElementById("final-confirm")?.addEventListener("click", () => cleanup(true));
    overlay.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          cleanup(false);
        }
      },
      { once: true },
    );
  });
}

function closeDialog(): void {
  if (state?.releaseFocusTrap) state.releaseFocusTrap();
  const overlay = getOverlay();
  overlay.classList.add("hidden");
  overlay.innerHTML = "";
  state?.returnFocus?.focus();
  state = null;
}

/** Safe HTML escaping — never use innerHTML with user/server data directly. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
