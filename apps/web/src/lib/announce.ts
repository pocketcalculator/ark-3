/**
 * Accessible announcer utilities.
 * Updates aria-live regions to communicate state changes to screen readers
 * without moving visual focus.
 */

let announceTimer: ReturnType<typeof setTimeout> | null = null;

/** Announce a polite status message (non-urgent). */
export function announce(message: string): void {
  const el = document.getElementById("status-announcer");
  if (!el) return;

  // Clear first so re-announcing the same text triggers a new announcement
  el.textContent = "";
  if (announceTimer !== null) clearTimeout(announceTimer);
  announceTimer = setTimeout(() => {
    el.textContent = message;
  }, 50);
}

/** Announce an assertive alert message (urgent / error). */
export function announceAlert(message: string): void {
  const el = document.getElementById("alert-announcer");
  if (!el) return;
  el.textContent = "";
  setTimeout(() => {
    el.textContent = message;
  }, 50);
}
