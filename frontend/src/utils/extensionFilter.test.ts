/**
 * 全文検索の拡張子フィルター入力を正規化する
 */
import { describe, expect, it } from "vitest";

import { normalizeExtensionFilterInput, parseExtensionFilterInput } from "./extensionFilter";

describe("normalizeExtensionFilterInput", () => {
  it("normalizes case, leading dots, and duplicated tokens", () => {
    expect(normalizeExtensionFilterInput(" MD   pdf .Txt md  ")).toBe(".md .pdf .txt");
  });

  it("returns an empty string when the input is blank", () => {
    expect(normalizeExtensionFilterInput("   ")).toBe("");
  });

  it("parses normalized tokens for exact-match filtering", () => {
    expect(parseExtensionFilterInput(" .xml  excalidraw.md XML ")).toEqual([".xml", ".excalidraw.md"]);
  });
});
