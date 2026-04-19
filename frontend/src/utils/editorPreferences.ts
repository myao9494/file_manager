/**
 * ファイルオープン時のエディタ選択設定
 * サーバー設定ファイルと同期するための型・正規化関数を提供する
 */

export type TextFileOpenMode = "web" | "vscode";
export type MarkdownOpenMode = "web" | "external";

const TEXT_FILE_MODES = new Set<TextFileOpenMode>(["web", "vscode"]);
const MARKDOWN_MODES = new Set<MarkdownOpenMode>(["web", "external"]);

export function normalizeTextFileOpenMode(value: string | null | undefined): TextFileOpenMode {
  return TEXT_FILE_MODES.has(value as TextFileOpenMode) ? (value as TextFileOpenMode) : "web";
}

export function normalizeMarkdownOpenMode(value: string | null | undefined): MarkdownOpenMode {
  if (value === "obsidian" || value === "vscode") {
    return "external";
  }
  return MARKDOWN_MODES.has(value as MarkdownOpenMode) ? (value as MarkdownOpenMode) : "web";
}
