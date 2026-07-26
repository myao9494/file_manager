/**
 * リネーム入力のベース名と拡張子を安全に結合する。
 */

/** 拡張子入力を含む新しいファイル名を返す。 */
export function buildRenamedFileName(baseName: string, extension: string): string {
  const trimmedBaseName = baseName.trim();
  const trimmedExtension = extension.trim();
  if (!trimmedExtension) return trimmedBaseName;
  return `${trimmedBaseName}${trimmedExtension.startsWith(".") ? trimmedExtension : `.${trimmedExtension}`}`;
}
