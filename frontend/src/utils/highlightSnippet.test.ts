/**
 * indexed検索スニペットのハイライト分解を検証する
 */
import { describe, expect, it } from "vitest";

import { parseHighlightSnippet } from "./highlightSnippet";

describe("parseHighlightSnippet", () => {
  it("splits marked snippets into plain and highlighted parts", () => {
    expect(parseHighlightSnippet("foo <mark>bar</mark> baz")).toEqual([
      { text: "foo ", highlighted: false },
      { text: "bar", highlighted: true },
      { text: " baz", highlighted: false },
    ]);
  });

  it("returns plain text as a single non-highlighted part", () => {
    expect(parseHighlightSnippet("plain text")).toEqual([
      { text: "plain text", highlighted: false },
    ]);
  });
});
