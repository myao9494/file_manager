/**
 * グローバルショートカット判定のテスト
 * Ctrl/Cmdショートカットと編集可能要素の除外条件を検証する
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isEditableEventTarget,
  matchesCmdOrCtrlShortcut,
  matchesCmdOrCtrlShiftShortcut,
} from "./globalShortcuts";

describe("globalShortcuts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function installHTMLElementStubs() {
    class FakeHTMLElement {
      isContentEditable = false;
    }

    class FakeHTMLInputElement extends FakeHTMLElement {}
    class FakeHTMLTextAreaElement extends FakeHTMLElement {}
    class FakeHTMLButtonElement extends FakeHTMLElement {}

    vi.stubGlobal("HTMLElement", FakeHTMLElement);
    vi.stubGlobal("HTMLInputElement", FakeHTMLInputElement);
    vi.stubGlobal("HTMLTextAreaElement", FakeHTMLTextAreaElement);

    return {
      FakeHTMLElement,
      FakeHTMLInputElement,
      FakeHTMLTextAreaElement,
      FakeHTMLButtonElement,
    };
  }

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

  it("matches Cmd+Shift+P shortcut", () => {
    const event = { key: "P", ctrlKey: false, metaKey: true, shiftKey: true, altKey: false } as KeyboardEvent;

    expect(matchesCmdOrCtrlShiftShortcut(event, "p")).toBe(true);
  });

  it("does not match Cmd+Shift+P when Alt is also pressed", () => {
    const event = { key: "P", ctrlKey: false, metaKey: true, shiftKey: true, altKey: true } as KeyboardEvent;

    expect(matchesCmdOrCtrlShiftShortcut(event, "p")).toBe(false);
  });

  it("treats input and textarea as editable targets", () => {
    const { FakeHTMLInputElement, FakeHTMLTextAreaElement } = installHTMLElementStubs();

    expect(isEditableEventTarget(new FakeHTMLInputElement())).toBe(true);
    expect(isEditableEventTarget(new FakeHTMLTextAreaElement())).toBe(true);
  });

  it("treats contenteditable elements as editable targets", () => {
    const { FakeHTMLElement } = installHTMLElementStubs();
    const element = new FakeHTMLElement();
    element.isContentEditable = true;

    expect(isEditableEventTarget(element)).toBe(true);
  });

  it("does not treat plain elements as editable targets", () => {
    const { FakeHTMLButtonElement } = installHTMLElementStubs();

    expect(isEditableEventTarget(new FakeHTMLButtonElement())).toBe(false);
    expect(isEditableEventTarget(null)).toBe(false);
  });
});
