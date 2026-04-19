/**
 * ファイルオープン時のエディタ選択設定
 * ハンバーガーメニューで選んだ起動先を localStorage に保持する
 */

export type TextFileOpenMode = "web" | "vscode";
export type MarkdownOpenMode = "web" | "obsidian" | "vscode";

export const EDITOR_PREFERENCE_STORAGE_KEYS = {
  TEXT_FILE_OPEN_MODE: "file_manager_text_file_open_mode",
  MARKDOWN_OPEN_MODE: "file_manager_markdown_open_mode",
} as const;

const TEXT_FILE_MODES = new Set<TextFileOpenMode>(["web", "vscode"]);
const MARKDOWN_MODES = new Set<MarkdownOpenMode>(["web", "obsidian", "vscode"]);

export function getStoredTextFileOpenMode(): TextFileOpenMode {
  const value = localStorage.getItem(EDITOR_PREFERENCE_STORAGE_KEYS.TEXT_FILE_OPEN_MODE);
  return TEXT_FILE_MODES.has(value as TextFileOpenMode) ? (value as TextFileOpenMode) : "web";
}

export function setStoredTextFileOpenMode(mode: TextFileOpenMode): void {
  localStorage.setItem(EDITOR_PREFERENCE_STORAGE_KEYS.TEXT_FILE_OPEN_MODE, mode);
}

export function getStoredMarkdownOpenMode(): MarkdownOpenMode {
  const value = localStorage.getItem(EDITOR_PREFERENCE_STORAGE_KEYS.MARKDOWN_OPEN_MODE);
  return MARKDOWN_MODES.has(value as MarkdownOpenMode) ? (value as MarkdownOpenMode) : "web";
}

export function setStoredMarkdownOpenMode(mode: MarkdownOpenMode): void {
  localStorage.setItem(EDITOR_PREFERENCE_STORAGE_KEYS.MARKDOWN_OPEN_MODE, mode);
}
