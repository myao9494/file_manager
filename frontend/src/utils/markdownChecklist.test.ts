/**
 * Markdownチェックボックス変換のテスト
 */
import { describe, expect, it } from "vitest";
import { formatItemsAsMarkdownChecklist } from "./markdownChecklist";

describe("formatItemsAsMarkdownChecklist", () => {
  it("formats files and directories as markdown checkboxes", () => {
    expect(
      formatItemsAsMarkdownChecklist([
        { name: "docs", type: "directory" },
        { name: "memo.md", type: "file" },
      ])
    ).toBe("- [ ] docs/\n- [ ] memo.md");
  });

  it("returns an empty string when there are no items", () => {
    expect(formatItemsAsMarkdownChecklist([])).toBe("");
  });
});
