/**
 * ファイル/フォルダ一覧をMarkdownチェックボックス形式へ変換するユーティリティ
 */
import type { FileItem } from "../types/file";

export function formatItemsAsMarkdownChecklist(items: Pick<FileItem, "name" | "type">[]): string {
  return items
    .map((item) => `- [ ] ${item.type === "directory" ? `${item.name}/` : item.name}`)
    .join("\n");
}
