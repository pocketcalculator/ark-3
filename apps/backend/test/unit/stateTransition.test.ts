import { describe, it, expect } from "vitest";
import {
  isValidTransition,
  isTerminal,
} from "../../src/validation/stateTransition.js";

describe("isValidTransition", () => {
  it("permits documented forward transitions", () => {
    expect(isValidTransition("uploaded", "ocr_pending")).toBe(true);
    expect(isValidTransition("ocr_pending", "awaiting_approval")).toBe(true);
    expect(isValidTransition("awaiting_approval", "deleting")).toBe(true);
    expect(isValidTransition("awaiting_approval", "rejected")).toBe(true);
    expect(isValidTransition("deleting", "deleted")).toBe(true);
    expect(isValidTransition("deleting", "failed")).toBe(true);
  });

  it("rejects transitions that are not documented", () => {
    expect(isValidTransition("uploaded", "deleted")).toBe(false);
    expect(isValidTransition("awaiting_approval", "deleted")).toBe(false);
    expect(isValidTransition("ocr_pending", "deleting")).toBe(false);
  });

  it("rejects any transition out of a terminal state", () => {
    expect(isValidTransition("deleted", "failed")).toBe(false);
    expect(isValidTransition("rejected", "awaiting_approval")).toBe(false);
    expect(isValidTransition("failed", "ocr_pending")).toBe(false);
  });
});

describe("isTerminal", () => {
  it("identifies terminal states", () => {
    expect(isTerminal("deleted")).toBe(true);
    expect(isTerminal("rejected")).toBe(true);
    expect(isTerminal("failed")).toBe(true);
  });

  it("identifies non-terminal states", () => {
    expect(isTerminal("uploaded")).toBe(false);
    expect(isTerminal("ocr_pending")).toBe(false);
    expect(isTerminal("awaiting_approval")).toBe(false);
    expect(isTerminal("deleting")).toBe(false);
  });
});
