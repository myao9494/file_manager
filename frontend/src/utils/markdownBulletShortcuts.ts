/**
 * Markdown箇条書きショートカット処理
 * Obsidianライクなハイフン箇条書きの付与と解除をテキスト選択単位で適用する
 */
import type { TextSelectionTransformResult } from "./markdownEditorFormatting";

const BULLET_LIST_PATTERN = /^(\s*)[-*+]\s+(.*)$/;

function findLineStart(text: string, index: number): number {
  if (index <= 0) {
    return 0;
  }

  const previousNewline = text.lastIndexOf("\n", index - 1);
  return previousNewline === -1 ? 0 : previousNewline + 1;
}

function findLineEnd(text: string, index: number): number {
  const nextNewline = text.indexOf("\n", index);
  return nextNewline === -1 ? text.length : nextNewline;
}

function toggleBulletLine(line: string): string {
  const bulletMatch = line.match(BULLET_LIST_PATTERN);
  if (bulletMatch) {
    const [, indent, content] = bulletMatch;
    return `${indent}${content}`;
  }

  const indent = line.match(/^\s*/)?.[0] ?? "";
  const content = line.slice(indent.length);
  return `${indent}- ${content}`;
}

export function toggleBulletListSelection(
  text: string,
  selectionStart: number,
  selectionEnd: number
): TextSelectionTransformResult {
  const normalizedStart = Math.max(0, Math.min(selectionStart, selectionEnd));
  const normalizedEnd = Math.max(normalizedStart, Math.max(selectionStart, selectionEnd));
  const lineStart = findLineStart(text, normalizedStart);
  const lineEnd = findLineEnd(text, normalizedEnd);
  const selectedBlock = text.slice(lineStart, lineEnd);
  const isCollapsed = normalizedStart === normalizedEnd;
  const transformedBlock = selectedBlock
    .split("\n")
    .map((line) => toggleBulletLine(line))
    .join("\n");

  if (isCollapsed) {
    const firstLine = transformedBlock.split("\n")[0] ?? "";
    const bulletMatch = firstLine.match(BULLET_LIST_PATTERN);
    if (bulletMatch) {
      const caret = lineStart + bulletMatch[1].length + 2;
      return {
        text: `${text.slice(0, lineStart)}${transformedBlock}${text.slice(lineEnd)}`,
        selectionStart: caret,
        selectionEnd: caret,
      };
    }
  }

  return {
    text: `${text.slice(0, lineStart)}${transformedBlock}${text.slice(lineEnd)}`,
    selectionStart: lineStart,
    selectionEnd: lineStart + transformedBlock.length,
  };
}
