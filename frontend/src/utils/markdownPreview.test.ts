/**
 * Markdownプレビュー描画のテスト
 * Obsidian風プレビューで必要な基本構文と安全なエスケープを検証する
 */
import { describe, expect, it } from "vitest";

import { renderMarkdownToHtml } from "./markdownPreview";

describe("renderMarkdownToHtml", () => {
  it("renders headings, paragraphs, emphasis and links", () => {
    const html = renderMarkdownToHtml("# Title\n\nHello **world** and [site](https://example.com).");

    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<p>Hello <strong>world</strong> and <a href=\"https://example.com\"");
  });

  it("renders task lists and unordered lists", () => {
    const html = renderMarkdownToHtml("- [ ] todo\n- [x] done\n- plain");

    expect(html).toContain("contains-task-list");
    expect(html).toContain("type=\"checkbox\"");
    expect(html).toContain("data-task-line=\"0\"");
    expect(html).toContain("<li>plain</li>");
  });

  it("renders fenced code blocks and inline code safely", () => {
    const html = renderMarkdownToHtml("```ts\nconst value = 1 < 2;\n```\n\nUse `code`.");

    expect(html).toContain("markdown-code-block");
    expect(html).toContain('data-language="ts"');
    expect(html).toContain("const value = 1 &lt; 2;");
    expect(html).toContain("<code>code</code>");
  });

  it("renders callouts and wikilinks", () => {
    const html = renderMarkdownToHtml("> [!note] Memo\n> body\n\nSee [[Daily Note|today]].");

    expect(html).toContain("markdown-callout");
    expect(html).toContain("markdown-callout-title");
    expect(html).toContain("<span class=\"markdown-wikilink\" data-target=\"Daily Note\">today</span>");
  });

  it("escapes raw html to avoid injection", () => {
    const html = renderMarkdownToHtml("<script>alert(1)</script>");

    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });
});
