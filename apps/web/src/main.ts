/**
 * Main entry point for the ark-3 Approval Dashboard SPA.
 *
 * Bootstraps the application after DOMContentLoaded:
 *  1. Polls /api/pending and renders approval cards.
 *  2. Handles loading, empty, and error states.
 *  3. Revokes image object URLs when cards are removed.
 */

import "./styles/main.css";
import { fetchPending } from "./lib/api.js";
import { announce, announceAlert } from "./lib/announce.js";
import { toDisplayError, ApiResponseError } from "./lib/errors.js";
import {
  createApprovalCard,
  revokeCardImage,
} from "./components/approvalCard.js";
import type { ApprovalItem } from "@ark-3/contracts";

const POLL_INTERVAL_MS = 30_000;

let pollTimer: ReturnType<typeof setTimeout> | null = null;
let currentItems: ApprovalItem[] = [];

async function loadAndRender(): Promise<void> {
  const root = document.getElementById("app-root");
  if (!root) return;

  // Show loading state only on first load
  if (currentItems.length === 0) {
    root.innerHTML = `
      <div class="loading-state" role="status" aria-label="Loading pending approvals">
        <div class="loading-spinner" aria-hidden="true"></div>
        <p>Loading pending approvals…</p>
      </div>`;
  }

  try {
    const { items, total } = await fetchPending();
    currentItems = items;
    renderItems(root, items, total);
    announce(`${total} pending approval${total === 1 ? "" : "s"} loaded.`);
  } catch (err) {
    if (err instanceof ApiResponseError && err.statusCode === 401) {
      renderSignIn(root);
    } else {
      const msg = toDisplayError(err);
      renderError(root, msg);
      announceAlert(msg);
    }
  }
}

function renderItems(
  root: HTMLElement,
  items: ApprovalItem[],
  total: number,
): void {
  // Revoke image URLs for removed items
  const newIds = new Set(items.map((i) => i.id));
  for (const id of [...objectUrlTracker]) {
    if (!newIds.has(id)) {
      revokeCardImage(id);
      objectUrlTracker.delete(id);
    }
  }

  root.innerHTML = "";

  // Refresh bar
  const refreshBar = document.createElement("div");
  refreshBar.className = "refresh-bar";

  const barTitle = document.createElement("h2");
  barTitle.className = "refresh-bar-title";
  barTitle.textContent = "Pending Approvals";

  const countEl = document.createElement("p");
  countEl.className = "item-count";
  countEl.setAttribute("aria-live", "polite");
  countEl.textContent =
    total === 0
      ? "No pending items"
      : `Showing ${items.length} of ${total} item${total === 1 ? "" : "s"}`;

  const refreshBtn = document.createElement("button");
  refreshBtn.type = "button";
  refreshBtn.className = "btn btn-secondary";
  refreshBtn.textContent = "Refresh";
  refreshBtn.setAttribute("aria-label", "Refresh pending approvals list");
  refreshBtn.addEventListener("click", () => {
    schedulePoll(0);
  });

  refreshBar.appendChild(barTitle);
  refreshBar.appendChild(countEl);
  refreshBar.appendChild(refreshBtn);
  root.appendChild(refreshBar);

  if (items.length === 0) {
    const emptyEl = document.createElement("div");
    emptyEl.className = "empty-state";
    emptyEl.setAttribute("role", "status");
    emptyEl.innerHTML = `
      <p style="font-size:1.1rem;color:var(--color-text-muted)">No pending approvals.</p>
      <p style="font-size:0.85rem;color:var(--color-text-muted)">
        New items appear here after a device upload completes OCR validation.
      </p>`;
    root.appendChild(emptyEl);
    return;
  }

  const grid = document.createElement("div");
  grid.className = "approvals-grid";
  grid.setAttribute("role", "list");
  grid.setAttribute("aria-label", "Approval items");

  for (const item of items) {
    objectUrlTracker.add(item.id);
    const card = createApprovalCard({
      item,
      onApproved: handleActionComplete,
      onRejected: handleActionComplete,
    });
    card.setAttribute("role", "listitem");
    grid.appendChild(card);
  }

  root.appendChild(grid);
}

function renderError(root: HTMLElement, message: string): void {
  root.innerHTML = `
    <div class="error-state" role="alert" aria-live="assertive">
      <div class="error-banner">
        <strong>Unable to load approvals</strong>
        <p style="margin:0.25rem 0 0">${escapeHtml(message)}</p>
      </div>
      <button type="button" class="btn btn-secondary" id="retry-btn">Retry</button>
    </div>`;

  document.getElementById("retry-btn")?.addEventListener("click", () => {
    schedulePoll(0);
  });
}

function renderSignIn(root: HTMLElement): void {
  root.innerHTML = `
    <div class="auth-required" role="status" aria-live="polite">
      <div class="error-banner">
        <strong>Sign in required</strong>
        <p style="margin:0.25rem 0 0">You must be signed in to view pending approvals.</p>
      </div>
      <a href="/.auth/login/aad" class="btn btn-primary" id="signin-btn">Sign in with Microsoft</a>
    </div>`;

  const authLink = document.getElementById("auth-link");
  if (authLink) {
    authLink.textContent = "Sign in";
    authLink.setAttribute("href", "/.auth/login/aad");
    authLink.setAttribute("aria-label", "Sign in with Microsoft");
  }
}

/** Called when an approve or reject action completes — removes the card and reschedules. */
function handleActionComplete(item: ApprovalItem): void {
  revokeCardImage(item.id);
  objectUrlTracker.delete(item.id);

  // Remove card from DOM
  const card = document.querySelector(`[data-item-id="${item.id}"]`);
  card?.remove();

  // Update count
  currentItems = currentItems.filter((i) => i.id !== item.id);
  const countEl = document.querySelector(".item-count");
  if (countEl) {
    const remaining = currentItems.length;
    countEl.textContent =
      remaining === 0
        ? "No pending items"
        : `Showing ${remaining} item${remaining === 1 ? "" : "s"}`;
  }

  // If grid is empty, show empty state
  const grid = document.querySelector(".approvals-grid");
  if (grid && currentItems.length === 0) {
    const root = document.getElementById("app-root");
    if (root) renderItems(root, [], 0);
  }

  // Reschedule poll
  schedulePoll(POLL_INTERVAL_MS);
}

/** Tracks which item IDs have object URLs so we can revoke them on cleanup. */
const objectUrlTracker = new Set<string>();

function schedulePoll(delayMs: number): void {
  if (pollTimer !== null) clearTimeout(pollTimer);
  pollTimer = setTimeout(() => {
    void loadAndRender().finally(() => schedulePoll(POLL_INTERVAL_MS));
  }, delayMs);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  schedulePoll(0);
});

// Revoke all object URLs when the page is unloaded
window.addEventListener("pagehide", () => {
  for (const id of objectUrlTracker) {
    revokeCardImage(id);
  }
  objectUrlTracker.clear();
});
