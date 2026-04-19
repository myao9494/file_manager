/**
 * Markdownエディタの整形ユーティリティ
 * Obsidian風ショートカットで使う選択範囲操作を純粋関数として提供する
 */

export interface TextSelectionTransformResult {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

function normalizeSelectionBounds(selectionStart: number, selectionEnd: number) {
  const start = Math.max(0, Math.min(selectionStart, selectionEnd));
  const end = Math.max(start, Math.max(selectionStart, selectionEnd));

  return { start, end };
}

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

function replaceRange(
  text: string,
  start: number,
  end: number,
  replacement: string,
  selectionStart: number,
  selectionEnd: number
): TextSelectionTransformResult {
  return {
    text: `${text.slice(0, start)}${replacement}${text.slice(end)}`,
    selectionStart,
    selectionEnd,
  };
}

function transformSelectedLines(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  lineTransformer: (line: string) => string
): TextSelectionTransformResult {
  const { start, end } = normalizeSelectionBounds(selectionStart, selectionEnd);
  const lineStart = findLineStart(text, start);
  const lineEnd = findLineEnd(text, end);
  const block = text.slice(lineStart, lineEnd);
  const isCollapsed = start === end;

  const transformed = block
    .split("\n")
    .map((line) => lineTransformer(line))
    .join("\n");

  let nextSelectionStart = lineStart;
  let nextSelectionEnd = lineStart + transformed.length;

  if (isCollapsed) {
    const diff = transformed.length - block.length;
    nextSelectionStart = Math.max(lineStart, start + diff);
    nextSelectionEnd = nextSelectionStart;
  }

  return {
    text: `${text.slice(0, lineStart)}${transformed}${text.slice(lineEnd)}`,
    selectionStart: nextSelectionStart,
    selectionEnd: nextSelectionEnd,
  };
}

export function wrapSelection(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  prefix: string,
  suffix: string,
  placeholder = ""
): TextSelectionTransformResult {
  const { start, end } = normalizeSelectionBounds(selectionStart, selectionEnd);
  const selectedText = text.slice(start, end);
  const innerText = selectedText || placeholder;
  const transformed = `${prefix}${innerText}${suffix}`;
  const insertedText = `${text.slice(0, start)}${transformed}${text.slice(end)}`;
  const innerStart = start + prefix.length;

  return {
    text: insertedText,
    selectionStart: innerStart,
    selectionEnd: innerStart + innerText.length,
  };
}

export function indentSelection(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  indent = "  "
): TextSelectionTransformResult {
  return transformSelectedLines(text, selectionStart, selectionEnd, (line) => `${indent}${line}`);
}

export function outdentSelection(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  indentSize = 2
): TextSelectionTransformResult {
  const indentPattern = new RegExp(`^( {1,${indentSize}}|\t)`);
  return transformSelectedLines(text, selectionStart, selectionEnd, (line) => line.replace(indentPattern, ""));
}

export function adjustHeadingLevel(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  delta: 1 | -1
): TextSelectionTransformResult {
  const { start } = normalizeSelectionBounds(selectionStart, selectionEnd);
  const lineStart = findLineStart(text, start);
  const lineEnd = findLineEnd(text, start);
  const line = text.slice(lineStart, lineEnd);
  const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);

  let nextLine = line;
  let cursorOffset = start - lineStart;

  if (headingMatch) {
    const currentLevel = headingMatch[1].length;
    const content = headingMatch[2];
    const nextLevel = currentLevel + delta;

    if (nextLevel <= 0) {
      nextLine = content;
      cursorOffset = Math.max(0, cursorOffset - (currentLevel + 1));
    } else {
      const boundedLevel = Math.min(6, nextLevel);
      nextLine = `${"#".repeat(boundedLevel)} ${content}`;
      cursorOffset = Math.max(0, cursorOffset + (boundedLevel - currentLevel));
    }
  } else if (delta > 0) {
    nextLine = `# ${line}`;
    cursorOffset += 2;
  }

  const nextCursor = lineStart + Math.min(nextLine.length, cursorOffset);
  return replaceRange(text, lineStart, lineEnd, nextLine, nextCursor, nextCursor);
}

export function insertMarkdownNewline(
  text: string,
  selectionStart: number,
  selectionEnd: number
): TextSelectionTransformResult {
  const { start, end } = normalizeSelectionBounds(selectionStart, selectionEnd);
  const lineStart = findLineStart(text, start);
  const lineEnd = findLineEnd(text, start);
  const line = text.slice(lineStart, lineEnd);

  const taskListMatch = line.match(/^(\s*)[-*+]\s+\[( |x|X)\]\s?(.*)$/);
  if (taskListMatch) {
    const [, indent, state, content] = taskListMatch;
    if (content.trim() === "") {
      return replaceRange(text, lineStart, lineEnd, "", lineStart, lineStart);
    }

    const marker = `${indent}- [ ${state.toLowerCase() === "x" ? " " : state} ] `.replace("[   ]", "[ ]");
    const insertion = `\n${marker}`;
    const cursor = start + insertion.length;
    return replaceRange(text, start, end, insertion, cursor, cursor);
  }

  const unorderedListMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
  if (unorderedListMatch) {
    const [, indent, content] = unorderedListMatch;
    if (content.trim() === "") {
      return replaceRange(text, lineStart, lineEnd, "", lineStart, lineStart);
    }

    const insertion = `\n${indent}- `;
    const cursor = start + insertion.length;
    return replaceRange(text, start, end, insertion, cursor, cursor);
  }

  const orderedListMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
  if (orderedListMatch) {
    const [, indent, number, content] = orderedListMatch;
    if (content.trim() === "") {
      return replaceRange(text, lineStart, lineEnd, "", lineStart, lineStart);
    }

    const nextNumber = Number(number) + 1;
    const insertion = `\n${indent}${nextNumber}. `;
    const cursor = start + insertion.length;
    return replaceRange(text, start, end, insertion, cursor, cursor);
  }

  const insertion = "\n";
  const cursor = start + insertion.length;
  return replaceRange(text, start, end, insertion, cursor, cursor);
}

export function setTaskListItemChecked(
  text: string,
  lineNumber: number,
  checked: boolean
): TextSelectionTransformResult {
  const lines = text.split("\n");
  const line = lines[lineNumber];

  if (line === undefined) {
    return { text, selectionStart: 0, selectionEnd: 0 };
  }

  const nextLine = line.replace(
    /^(\s*[-*+]\s+\[)( |x|X)(\]\s+.*)$/,
    `$1${checked ? "x" : " "}$3`
  );

  if (nextLine === line) {
    return { text, selectionStart: 0, selectionEnd: 0 };
  }

  lines[lineNumber] = nextLine;
  return {
    text: lines.join("\n"),
    selectionStart: 0,
    selectionEnd: 0,
  };
}
