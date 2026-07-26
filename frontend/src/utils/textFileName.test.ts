/**
 * テキストファイル作成時のファイル名・拡張子結合のテスト
 */
import { describe, expect, it } from "vitest";
import { buildTextFileName } from "./textFileName";

describe("buildTextFileName", () => {
  it("adds the selected extension", () => {
    expect(buildTextFileName("memo", "md")).toBe("memo.md");
  });

  it("does not duplicate the selected extension", () => {
    expect(buildTextFileName("memo.txt", "txt")).toBe("memo.txt");
  });

  it("normalizes a leading dot in the extension", () => {
    expect(buildTextFileName("settings", ".json")).toBe("settings.json");
  });
});
