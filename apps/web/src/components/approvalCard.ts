/**
 * ApprovalCard renders a single pending approval item.
 *
 * Image object URLs are tracked and revoked when the card is removed to
 * prevent sensitive image data from persisting in browser memory.
 */

import type { ApprovalItem } from "@ark-3/contracts";
import { loadImage } from "../lib/api.js";
import { retryOcr } from "../lib/api.js";
import { announce, announceAlert } from "../lib/announce.js";
import { toDisplayError } from "../lib/errors.js";
import { openApproveDialog } from "./approveDialog.js";
import { openRejectDialog } from "./rejectDialog.js";

/** Active object URLs keyed by item ID — revoked when cards are removed. */
const objectUrls = new Map<string, string>();

/** Revoke and remove the object URL for the given item, if any. */
export function revokeCardImage(itemId: string): void {
  const url = objectUrls.get(itemId);
  if (url) {
    URL.revokeObjectURL(url);
    objectUrls.delete(itemId);
  }
}

type OnAction = (item: ApprovalItem) => void;

interface CardOptions {
  item: ApprovalItem;
  onApproved: OnAction;
  onRejected: OnAction;
}

/**
 * Creates and returns the card element.
 * Kicks off async image loading; no awaiting required from the caller.
 */
export function createApprovalCard(options: CardOptions): HTMLElement {
  const { item, onApproved, onRejected } = options;

  const card = document.createElement("article");
  card.className = "approval-card";
  card.setAttribute("aria-label", `Approval for ${item.proposedName}`);
  card.dataset["itemId"] = item.id;

  // ── Image section ─────────────────────────────────────────────────────────
  const imageSection = document.createElement("div");
  imageSection.className = "card-image-section";

  const imgEl = document.createElement("img");
  imgEl.className = "card-source-image";
  imgEl.alt = `Source photograph for resource group ${item.proposedName}`;
  imgEl.setAttribute("loading", "eager");
  // Prevent right-click save of sensitive images
  imgEl.addEventListener("contextmenu", (e) => e.preventDefault());
  imgEl.style.display = "none";

  const imgPlaceholder = document.createElement("div");
  imgPlaceholder.className = "image-loading-placeholder";
  imgPlaceholder.setAttribute("aria-live", "polite");
  imgPlaceholder.textContent = "Loading image…";

  imageSection.appendChild(imgEl);
  imageSection.appendChild(imgPlaceholder);

  // Async image load — revoke any prior URL for this item before replacing
  void loadImage(item.imageRoute).then((url) => {
    revokeCardImage(item.id);
    objectUrls.set(item.id, url);
    imgEl.src = url;
    imgEl.style.display = "block";
    imgPlaceholder.style.display = "none";
  }).catch(() => {
    imgPlaceholder.textContent = "Image unavailable";
  });

  // ── Body ──────────────────────────────────────────────────────────────────
  const body = document.createElement("div");
  body.className = "card-body";

  // Status
  const statusRow = createRow("Status", createStatusBadge(item.status));

  // RG Name
  const nameLabel = document.createElement("p");
  nameLabel.className = "card-section-label";
  nameLabel.textContent = "Proposed RG Name";

  const nameValue = document.createElement("p");
  nameValue.className = "card-value card-rg-name";
  nameValue.textContent = item.proposedName;
  nameValue.setAttribute("aria-label", `Proposed resource group name: ${item.proposedName}`);

  // Canonical ID
  const canonLabel = document.createElement("p");
  canonLabel.className = "card-section-label";
  canonLabel.textContent = "Canonical Resource Group ID";

  const canonValue = document.createElement("p");
  canonValue.className = "card-value card-canonical-id";
  canonValue.textContent = item.canonicalRgId;
  canonValue.setAttribute(
    "aria-label",
    `Canonical ARM resource group ID: ${item.canonicalRgId}`,
  );

  // Subscription
  const subRow = createTextRow("Target Subscription", item.subscriptionDisplayLabel);

  // Uncertainty
  const uncertaintyRow = createUncertaintyRow();

  // Tags
  const tagsSection = createTagsSection(item.tags);

  // Capture time
  const captureRow = createTextRow(
    "Capture Time",
    new Date(item.createdAt).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "medium",
    }),
  );

  // Version
  const versionRow = createTextRow("Version Token", item.version);

  body.appendChild(statusRow);
  body.appendChild(nameLabel);
  body.appendChild(nameValue);
  body.appendChild(canonLabel);
  body.appendChild(canonValue);
  body.appendChild(subRow);
  body.appendChild(uncertaintyRow);
  body.appendChild(tagsSection);
  body.appendChild(captureRow);
  body.appendChild(versionRow);

  // Actions
  const actions = createActions(item, body, onApproved, onRejected);
  body.appendChild(actions);

  card.appendChild(imageSection);
  card.appendChild(body);

  return card;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function createRow(label: string, valueEl: HTMLElement): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.style.marginBottom = "var(--space-sm)";

  const labelEl = document.createElement("p");
  labelEl.className = "card-section-label";
  labelEl.textContent = label;

  wrapper.appendChild(labelEl);
  wrapper.appendChild(valueEl);
  return wrapper;
}

function createTextRow(label: string, value: string): HTMLElement {
  const valueEl = document.createElement("p");
  valueEl.className = "card-value";
  valueEl.style.fontFamily = "inherit";
  valueEl.textContent = value;
  return createRow(label, valueEl);
}

function createStatusBadge(status: string): HTMLElement {
  const badge = document.createElement("span");
  badge.className = `status-badge status-badge--${status}`;
  badge.textContent = status.replace(/_/g, " ");
  badge.setAttribute("aria-label", `Status: ${status.replace(/_/g, " ")}`);
  return badge;
}

function createUncertaintyRow(): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.style.marginBottom = "var(--space-sm)";

  const label = document.createElement("p");
  label.className = "card-section-label";
  label.textContent = "OCR Uncertainty";

  const badge = document.createElement("span");
  badge.className = "uncertainty-badge";
  badge.setAttribute(
    "aria-label",
    "Uncertainty indicator — uncalibrated; do not use as sole basis for decisions",
  );
  badge.textContent = "Uncalibrated indicator";

  const note = document.createElement("p");
  note.className = "uncertainty-note";
  note.textContent =
    "Model-reported confidence is uncalibrated; all server-side gates must pass regardless of this value.";

  wrapper.appendChild(label);
  wrapper.appendChild(badge);
  wrapper.appendChild(note);
  return wrapper;
}

function createTagsSection(tags: Record<string, string>): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.style.marginBottom = "var(--space-sm)";

  const label = document.createElement("p");
  label.className = "card-section-label";
  label.textContent = "Resource Tags";

  const entries = Object.entries(tags);

  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "card-value";
    empty.style.fontFamily = "inherit";
    empty.style.color = "var(--color-text-muted)";
    empty.textContent = "No tags";
    wrapper.appendChild(label);
    wrapper.appendChild(empty);
    return wrapper;
  }

  const list = document.createElement("ul");
  list.className = "tags-list";
  list.setAttribute("aria-label", "Resource group tags");

  for (const [k, v] of entries) {
    const li = document.createElement("li");
    li.className = "tag-item";
    li.textContent = `${k}=${v}`;
    list.appendChild(li);
  }

  wrapper.appendChild(label);
  wrapper.appendChild(list);
  return wrapper;
}

function createActions(
  item: ApprovalItem,
  body: HTMLElement,
  onApproved: OnAction,
  onRejected: OnAction,
): HTMLElement {
  const actions = document.createElement("div");
  actions.className = "card-actions";

  const canApprove = item.status === "awaiting_approval";
  const canReject = item.status === "awaiting_approval";
  const canRetryOcr = item.status === "ocr_pending";

  if (canApprove) {
    const approveBtn = document.createElement("button");
    approveBtn.type = "button";
    approveBtn.className = "btn btn-danger";
    approveBtn.textContent = "Approve Deletion";
    approveBtn.setAttribute(
      "aria-label",
      `Approve deletion of ${item.proposedName}`,
    );

    approveBtn.addEventListener("click", () => {
      openApproveDialog(item, approveBtn, (completedItem, success) => {
        if (success) onApproved(completedItem);
      });
    });

    actions.appendChild(approveBtn);
  }

  if (canReject) {
    const rejectBtn = document.createElement("button");
    rejectBtn.type = "button";
    rejectBtn.className = "btn btn-secondary";
    rejectBtn.textContent = "Reject";
    rejectBtn.setAttribute("aria-label", `Reject ${item.proposedName}`);

    rejectBtn.addEventListener("click", () => {
      openRejectDialog(item, rejectBtn, (completedItem, success) => {
        if (success) onRejected(completedItem);
      });
    });

    actions.appendChild(rejectBtn);
  }

  if (canRetryOcr) {
    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "btn btn-warning";
    retryBtn.textContent = "Retry OCR";
    retryBtn.setAttribute("aria-label", `Retry OCR for ${item.proposedName}`);

    retryBtn.addEventListener("click", async () => {
      retryBtn.disabled = true;
      retryBtn.innerHTML = `<span class="inline-spinner" aria-hidden="true"></span> Retrying…`;
      retryBtn.setAttribute("aria-busy", "true");

      try {
        await retryOcr(item.id);
        announce(`OCR retry submitted for ${item.id}.`);
        // Refresh to show updated state
        window.location.reload();
      } catch (err) {
        const msg = toDisplayError(err);
        announceAlert(msg);

        // Show inline error
        const errEl = body.querySelector(".retry-error") ?? (() => {
          const el = document.createElement("p");
          el.className = "form-error retry-error";
          el.setAttribute("role", "alert");
          el.setAttribute("aria-live", "assertive");
          actions.insertBefore(el, retryBtn);
          return el;
        })();
        (errEl as HTMLElement).textContent = msg;

        retryBtn.disabled = false;
        retryBtn.textContent = "Retry OCR";
        retryBtn.removeAttribute("aria-busy");
      }
    });

    actions.appendChild(retryBtn);
  }

  if (!canApprove && !canReject && !canRetryOcr) {
    const note = document.createElement("p");
    note.style.cssText = "font-size:0.85rem;color:var(--color-text-muted);margin:0";
    note.textContent = "No actions available for the current status.";
    actions.appendChild(note);
  }

  return actions;
}
