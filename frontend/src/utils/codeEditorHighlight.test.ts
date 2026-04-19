/**
 * コードエディタ向けシンタックスハイライト生成のテスト
 */
import { describe, expect, it } from "vitest";

import {
  detectEditorLanguage,
  isWebFileEditorTarget,
  renderCodeToHighlightedHtml,
} from "./codeEditorHighlight";

describe("detectEditorLanguage", () => {
  it("maps representative file extensions to editor languages", () => {
    expect(detectEditorLanguage("main.py")).toBe("python");
    expect(detectEditorLanguage("index.tsx")).toBe("tsx");
    expect(detectEditorLanguage("notes.txt")).toBe("plaintext");
    expect(detectEditorLanguage("data.json")).toBe("json");
  });

  it("falls back to plaintext for unknown extensions", () => {
    expect(detectEditorLanguage("archive.unknown")).toBe("plaintext");
    expect(detectEditorLanguage("README")).toBe("plaintext");
  });
});

describe("renderCodeToHighlightedHtml", () => {
  it("highlights TypeScript keywords, strings, comments and preserves escaping", () => {
    const html = renderCodeToHighlightedHtml(
      "const label = \"<tag>\"; // note",
      "typescript",
    );

    expect(html).toContain('code-editor-token keyword">const</span>');
    expect(html).toContain('code-editor-token string">&quot;&lt;tag&gt;&quot;</span>');
    expect(html).toContain('code-editor-token comment">// note</span>');
  });

  it("highlights JSON keys and primitive values", () => {
    const html = renderCodeToHighlightedHtml(
      "{\n  \"enabled\": true,\n  \"count\": 3\n}",
      "json",
    );

    expect(html).toContain('code-editor-token property">&quot;enabled&quot;</span>');
    expect(html).toContain('code-editor-token keyword">true</span>');
    expect(html).toContain('code-editor-token number">3</span>');
  });

  it("keeps plain text readable without injecting markup from the source", () => {
    const html = renderCodeToHighlightedHtml("hello <script>", "plaintext");

    expect(html).toContain("hello &lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});

describe("isWebFileEditorTarget", () => {
  it("returns true for supported non-markdown text/code files", () => {
    expect(isWebFileEditorTarget("notes.txt")).toBe(true);
    expect(isWebFileEditorTarget("main.py")).toBe(true);
    expect(isWebFileEditorTarget("settings.json")).toBe(true);
  });

  it("returns false for markdown and unsupported files", () => {
    expect(isWebFileEditorTarget("memo.md")).toBe(false);
    expect(isWebFileEditorTarget("photo.png")).toBe(false);
  });
});
