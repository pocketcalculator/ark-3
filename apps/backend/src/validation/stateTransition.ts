import {
  TERMINAL_STATUSES,
  VALID_TRANSITIONS,
  type UploadStatus,
} from "@ark-3/contracts";

/** True when `to` is a permitted forward transition from `from`. */
export function isValidTransition(from: UploadStatus, to: UploadStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

/** True when the status has no valid outbound transitions. */
export function isTerminal(status: UploadStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}
