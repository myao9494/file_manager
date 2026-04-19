/**
 * Markdown箇条書きショートカットのテスト
 * ハイフン箇条書きの付与と解除、およびキャレット位置を検証する
 */
import { describe, expect, it } from "vitest";

import { toggleBulletListSelection } from "./markdownBulletShortcuts";

describe("toggleBulletListSelection", () => {
  it("adds a bullet prefix to a plain line", () => {
    const result = toggleBulletListSelection("task", 0, 4);

    expect(result).toEqual({
      text: "- task",
      selectionStart: 0,
      selectionEnd: 6,
    });
  });

  it("places the caret after the inserted bullet for collapsed selections", () => {
    const result = toggleBulletListSelection("task", 0, 0);

    expect(result).toEqual({
      text: "- task",
      selectionStart: 2,
      selectionEnd: 2,
    });
  });

  it("removes the bullet marker when applied again", () => {
    const result = toggleBulletListSelection("- task", 0, 6);

    expect(result).toEqual({
      text: "task",
      selectionStart: 0,
      selectionEnd: 4,
    });
  });
});
