/**
 * Markdownエディタ整形処理のテスト
 * 選択範囲のラップ、インデント、チェックリスト化の基盤動作を検証する
 */
import { describe, expect, it } from "vitest";

import {
  adjustHeadingLevel,
  indentSelection,
  insertMarkdownNewline,
  outdentSelection,
  setTaskListItemChecked,
  wrapSelection,
} from "./markdownEditorFormatting";

describe("wrapSelection", () => {
  it("wraps the selected text and preserves inner selection", () => {
    const result = wrapSelection("hello", 0, 5, "**", "**");

    expect(result).toEqual({
      text: "**hello**",
      selectionStart: 2,
      selectionEnd: 7,
    });
  });

  it("inserts placeholder text when nothing is selected", () => {
    const result = wrapSelection("hello", 5, 5, "[", "](url)", "text");

    expect(result).toEqual({
      text: "hello[text](url)",
      selectionStart: 6,
      selectionEnd: 10,
    });
  });
});

describe("indentSelection", () => {
  it("indents every touched line", () => {
    const result = indentSelection("alpha\nbeta", 2, 8);

    expect(result).toEqual({
      text: "  alpha\n  beta",
      selectionStart: 0,
      selectionEnd: 14,
    });
  });
});

describe("outdentSelection", () => {
  it("removes up to one indent level from every touched line", () => {
    const result = outdentSelection("  alpha\n    beta", 0, 15);

    expect(result).toEqual({
      text: "alpha\n  beta",
      selectionStart: 0,
      selectionEnd: 12,
    });
  });
});

describe("adjustHeadingLevel", () => {
  it("adds a heading marker when the line is plain text", () => {
    const result = adjustHeadingLevel("Title", 0, 0, 1);

    expect(result).toEqual({
      text: "# Title",
      selectionStart: 2,
      selectionEnd: 2,
    });
  });

  it("increases and decreases heading levels within bounds", () => {
    expect(adjustHeadingLevel("## Title", 3, 3, 1)).toEqual({
      text: "### Title",
      selectionStart: 4,
      selectionEnd: 4,
    });

    expect(adjustHeadingLevel("## Title", 3, 3, -1)).toEqual({
      text: "# Title",
      selectionStart: 2,
      selectionEnd: 2,
    });
  });

  it("removes heading markup when decreasing from level one", () => {
    const result = adjustHeadingLevel("# Title", 2, 2, -1);

    expect(result).toEqual({
      text: "Title",
      selectionStart: 0,
      selectionEnd: 0,
    });
  });
});

describe("insertMarkdownNewline", () => {
  it("continues an unordered list item on enter", () => {
    const result = insertMarkdownNewline("- alpha", 7, 7);

    expect(result).toEqual({
      text: "- alpha\n- ",
      selectionStart: 10,
      selectionEnd: 10,
    });
  });

  it("continues a task list item on enter", () => {
    const result = insertMarkdownNewline("- [ ] alpha", 11, 11);

    expect(result).toEqual({
      text: "- [ ] alpha\n- [ ] ",
      selectionStart: 18,
      selectionEnd: 18,
    });
  });

  it("exits an empty unordered list item on enter", () => {
    const result = insertMarkdownNewline("- ", 2, 2);

    expect(result).toEqual({
      text: "",
      selectionStart: 0,
      selectionEnd: 0,
    });
  });

  it("exits an empty task list item on enter", () => {
    const result = insertMarkdownNewline("- [ ] ", 6, 6);

    expect(result).toEqual({
      text: "",
      selectionStart: 0,
      selectionEnd: 0,
    });
  });
});

describe("setTaskListItemChecked", () => {
  it("updates the checkbox state on the requested line", () => {
    const result = setTaskListItemChecked("- [ ] a\n- [x] b", 1, false);

    expect(result).toEqual({
      text: "- [ ] a\n- [ ] b",
      selectionStart: 0,
      selectionEnd: 0,
    });
  });

  it("leaves the text unchanged when the line is not a task item", () => {
    const result = setTaskListItemChecked("- [ ] a\nplain", 1, true);

    expect(result).toEqual({
      text: "- [ ] a\nplain",
      selectionStart: 0,
      selectionEnd: 0,
    });
  });
});
