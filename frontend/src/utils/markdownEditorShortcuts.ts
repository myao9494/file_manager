/**
 * Markdownエディタ向けショートカット処理
 * Obsidianライクなチェックリスト切り替えをテキスト選択単位で適用する
 */
import type { TextSelectionTransformResult } from "./markdownEditorFormatting";

const TASK_LIST_PATTERN = /^(\s*)(?:[-*+]\s+)?\[(?: |x|X)\]\s+(.*)$/;
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

function toggleChecklistLine(line: string): string {
  const taskMatch = line.match(TASK_LIST_PATTERN);
  if (taskMatch) {
    const [, indent, content] = taskMatch;
    return `${indent}${content}`;
  }

  const bulletMatch = line.match(BULLET_LIST_PATTERN);
  if (bulletMatch) {
    const [, indent, content] = bulletMatch;
    return `${indent}- [ ] ${content}`;
  }

  const indent = line.match(/^\s*/)?.[0] ?? "";
  const content = line.slice(indent.length);
  return `${indent}- [ ] ${content}`;
}

export function toggleChecklistSelection(
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
    .map((line) => toggleChecklistLine(line))
    .join("\n");

  let nextSelectionStart = lineStart;
  let nextSelectionEnd = lineStart + transformedBlock.length;

  if (isCollapsed) {
    const firstLine = transformedBlock.split("\n")[0] ?? "";
    const taskMatch = firstLine.match(TASK_LIST_PATTERN);
    if (taskMatch) {
      nextSelectionStart = lineStart + taskMatch[1].length + 6;
      nextSelectionEnd = nextSelectionStart;
    } else {
      nextSelectionStart = lineStart;
      nextSelectionEnd = lineStart;
    }
  }

  return {
    text: `${text.slice(0, lineStart)}${transformedBlock}${text.slice(lineEnd)}`,
    selectionStart: nextSelectionStart,
    selectionEnd: nextSelectionEnd,
  };
}
