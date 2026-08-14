/**
 * Tests: keyboard behavior and focus management
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { trapFocus, focusFirst } from "../src/lib/focus.js";

describe("trapFocus", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="container">
        <button id="btn1">First</button>
        <button id="btn2">Middle</button>
        <button id="btn3">Last</button>
      </div>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("wraps Tab from last to first", () => {
    const container = document.getElementById("container") as HTMLElement;
    const btn3 = document.getElementById("btn3") as HTMLButtonElement;
    btn3.focus();

    const release = trapFocus(container);

    const tabEvent = new KeyboardEvent("keydown", { key: "Tab", bubbles: true });
    const preventSpy = vi.spyOn(tabEvent, "preventDefault");
    container.dispatchEvent(tabEvent);

    // Should prevent default and move to first
    expect(preventSpy).toHaveBeenCalled();
    release();
  });

  it("wraps Shift+Tab from first to last", () => {
    const container = document.getElementById("container") as HTMLElement;
    const btn1 = document.getElementById("btn1") as HTMLButtonElement;
    btn1.focus();

    const release = trapFocus(container);

    const shiftTabEvent = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
    });
    const preventSpy = vi.spyOn(shiftTabEvent, "preventDefault");
    container.dispatchEvent(shiftTabEvent);

    expect(preventSpy).toHaveBeenCalled();
    release();
  });

  it("release removes the keydown listener", () => {
    const container = document.getElementById("container") as HTMLElement;
    const btn3 = document.getElementById("btn3") as HTMLButtonElement;
    btn3.focus();

    const release = trapFocus(container);
    release();

    // After release, Tab should not be intercepted
    const tabEvent = new KeyboardEvent("keydown", { key: "Tab", bubbles: true });
    const preventSpy = vi.spyOn(tabEvent, "preventDefault");
    container.dispatchEvent(tabEvent);

    expect(preventSpy).not.toHaveBeenCalled();
  });
});

describe("focusFirst", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("focuses the first focusable element in a container", () => {
    document.body.innerHTML = `
      <div id="box">
        <p>Not focusable</p>
        <button id="first-btn">Click me</button>
      </div>
    `;
    const box = document.getElementById("box") as HTMLElement;
    focusFirst(box);
    expect(document.activeElement?.id).toBe("first-btn");
  });

  it("does nothing when no focusable element exists", () => {
    document.body.innerHTML = `<div id="empty"><p>Nothing here</p></div>`;
    const box = document.getElementById("empty") as HTMLElement;
    expect(() => focusFirst(box)).not.toThrow();
  });
});
