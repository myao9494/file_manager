/**
 * グローバルショートカット判定のテスト
 * Ctrl/Cmdショートカットと編集可能要素の除外条件を検証する
 */
import { describe, expect, it } from "vitest";

import { isEditableEventTarget, matchesCmdOrCtrlShortcut } from "./globalShortcuts";

describe("globalShortcuts", () => {
  it("matches Ctrl+R shortcut", () => {
    const event = { key: "r", ctrlKey: true, metaKey: false } as KeyboardEvent;

    expect(matchesCmdOrCtrlShortcut(event, "r")).toBe(true);
  });

  it("matches Cmd+R shortcut with uppercase key values", () => {
    const event = { key: "R", ctrlKey: false, metaKey: true } as KeyboardEvent;

    expect(matchesCmdOrCtrlShortcut(event, "r")).toBe(true);
  });

  it("does not match when modifier keys are missing", () => {
    const event = { key: "r", ctrlKey: false, metaKey: false } as KeyboardEvent;

    expect(matchesCmdOrCtrlShortcut(event, "r")).toBe(false);
  });

  it("does not match when Shift is also pressed", () => {
    const event = { key: "R", ctrlKey: true, metaKey: false, shiftKey: true, altKey: false } as KeyboardEvent;

    expect(matchesCmdOrCtrlShortcut(event, "r")).toBe(false);
  });

  it("treats input and textarea as editable targets", () => {
    expect(isEditableEventTarget(document.createElement("input"))).toBe(true);
    expect(isEditableEventTarget(document.createElement("textarea"))).toBe(true);
  });

  it("treats contenteditable elements as editable targets", () => {
    const element = document.createElement("div");
    element.contentEditable = "true";

    expect(isEditableEventTarget(element)).toBe(true);
  });

  it("does not treat plain elements as editable targets", () => {
    expect(isEditableEventTarget(document.createElement("button"))).toBe(false);
    expect(isEditableEventTarget(null)).toBe(false);
  });
});
