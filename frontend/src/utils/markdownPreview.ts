/**
 * Markdownプレビュー描画ユーティリティ
 * Obsidianライクな表示に必要な主要構文を軽量な独自実装でHTMLへ変換する
 */

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function renderInline(text: string): string {
  const escaped = escapeHtml(text);

  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/==([^=]+)==/g, "<mark>$1</mark>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '<span class="markdown-wikilink" data-target="$1">$2</span>')
    .replace(/\[\[([^\]]+)\]\]/g, '<span class="markdown-wikilink" data-target="$1">$1</span>');
}

function renderInlineWithBreaks(text: string): string {
  return text
    .split("\n")
    .map((line) => renderInline(line))
    .join("<br />");
}

function renderCodeBlock(code: string, language = ""): string {
  const escapedLang = language ? escapeHtml(language) : "";
  const className = escapedLang ? ` language-${escapedLang}` : "";
  const dataAttr = escapedLang ? ` data-language="${escapedLang}"` : "";
  return `<pre class="markdown-code-block${className}"${dataAttr}><code>${escapeHtml(code)}</code></pre>`;
}

function renderList(lines: string[], startLineIndex: number): string {
  const items = lines.map((line, itemIndex) => {
    const taskMatch = line.match(/^\s*[-*+]\s+\[( |x|X)\]\s+(.*)$/);
    if (taskMatch) {
      const checked = taskMatch[1].toLowerCase() === "x";
      return `<li class="task-list-item" data-task-line="${startLineIndex + itemIndex}"><label><input type="checkbox" data-task-line="${startLineIndex + itemIndex}"${checked ? " checked" : ""} /><span>${renderInline(taskMatch[2])}</span></label></li>`;
    }

    const plainMatch = line.match(/^\s*[-*+]\s+(.*)$/);
    return `<li>${renderInline(plainMatch ? plainMatch[1] : line.trim())}</li>`;
  });
  const hasTaskList = lines.some((line) => /^\s*[-*+]\s+\[( |x|X)\]\s+/.test(line));
  const className = hasTaskList ? ' class="contains-task-list"' : "";
  return `<ul${className}>${items.join("")}</ul>`;
}

function renderBlockquote(lines: string[]): string {
  const strippedLines = lines.map((line) => line.replace(/^>\s?/, ""));
  const calloutMatch = strippedLines[0]?.match(/^\[!([a-zA-Z0-9_-]+)\]\s*(.*)$/);

  if (calloutMatch) {
    const [, type, title] = calloutMatch;
    const bodyLines = strippedLines.slice(1);
      const bodyHtml = bodyLines.length > 0 ? `<div class="markdown-callout-body">${bodyLines.map((line) => `<p>${renderInline(line)}</p>`).join("")}</div>` : "";
      return `<div class="markdown-callout markdown-callout-${escapeHtml(type.toLowerCase())}"><div class="markdown-callout-title">${renderInline(title || type)}</div>${bodyHtml}</div>`;
  }

  return `<blockquote>${strippedLines.map((line) => `<p>${renderInline(line)}</p>`).join("")}</blockquote>`;
}

export function renderMarkdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    const codeFenceMatch = line.match(/^```([\w-]*)\s*$/);
    if (codeFenceMatch) {
      const language = codeFenceMatch[1] ?? "";
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !/^```/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      html.push(renderCodeBlock(codeLines.join("\n"), language));
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      html.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      html.push("<hr />");
      index += 1;
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const listLines: string[] = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        listLines.push(lines[index]);
        index += 1;
      }
      html.push(renderList(listLines, index - listLines.length));
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index]);
        index += 1;
      }
      html.push(renderBlockquote(quoteLines));
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() !== "" &&
      !/^```/.test(lines[index]) &&
      !/^(#{1,6})\s+/.test(lines[index]) &&
      !/^\s*[-*+]\s+/.test(lines[index]) &&
      !/^>\s?/.test(lines[index]) &&
      !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[index].trim())
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }

    html.push(`<p>${renderInlineWithBreaks(paragraphLines.join("\n"))}</p>`);
  }

  return html.join("\n");
}
