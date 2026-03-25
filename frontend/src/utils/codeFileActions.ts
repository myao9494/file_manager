/**
 * 右クリックメニューで追加表示するプログラムコードファイル判定
 */

const PROGRAM_CODE_EXTENSIONS = new Set([
  ".py",
  ".pyw",
  ".sh",
  ".bash",
  ".zsh",
  ".command",
  ".bat",
  ".cmd",
  ".ps1",
]);

export function isProgramCodeFile(name: string): boolean {
  const lastDotIndex = name.lastIndexOf(".");
  if (lastDotIndex < 0) {
    return false;
  }

  const extension = name.slice(lastDotIndex).toLowerCase();
  return PROGRAM_CODE_EXTENSIONS.has(extension);
}
