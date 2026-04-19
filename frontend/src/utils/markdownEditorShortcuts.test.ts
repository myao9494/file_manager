/**
 * Markdownエディタショートカットのテスト
 * Obsidianライクなチェックリスト切り替えの変換結果と選択範囲を検証する
 */
import { describe, expect, it } from "vitest";

import { toggleChecklistSelection } from "./markdownEditorShortcuts";

describe("toggleChecklistSelection", () => {
  it("adds a checklist prefix to a plain line", () => {
    const result = toggleChecklistSelection("task", 0, 4);

    expect(result).toEqual({
      text: "- [ ] task",
      selectionStart: 0,
      selectionEnd: 10,
    });
  });

  it("places the caret after the inserted checkbox when nothing is selected", () => {
    const result = toggleChecklistSelection("task", 0, 0);

    expect(result).toEqual({
      text: "- [ ] task",
      selectionStart: 6,
      selectionEnd: 6,
    });
  });

  it("converts a bullet list item into a checklist item", () => {
    const result = toggleChecklistSelection("- item", 2, 6);

    expect(result).toEqual({
      text: "- [ ] item",
      selectionStart: 0,
      selectionEnd: 10,
    });
  });

  it("removes the checklist marker when applied again", () => {
    const result = toggleChecklistSelection("- [x] done", 0, 10);

    expect(result).toEqual({
      text: "done",
      selectionStart: 0,
      selectionEnd: 4,
    });
  });

  it("applies the shortcut to every touched line in a multiline selection", () => {
    const text = "alpha\n- beta\n  [ ] gamma";
    const result = toggleChecklistSelection(text, 2, text.length - 1);

    expect(result).toEqual({
      text: "- [ ] alpha\n- [ ] beta\n  gamma",
      selectionStart: 0,
      selectionEnd: 30,
    });
  });
});
