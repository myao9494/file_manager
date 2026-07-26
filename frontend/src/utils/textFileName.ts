/**
 * テキストファイル作成モーダルの名前と拡張子を安全に結合する。
 */

/** ファイル名と拡張子から作成するファイル名を返す。 */
export function buildTextFileName(name: string, extension: string): string {
  const trimmedName = name.trim();
  const normalizedExtension = extension.trim().replace(/^\.+/, "");
  if (!normalizedExtension) return trimmedName;
  const suffix = `.${normalizedExtension}`;
  return trimmedName.toLowerCase().endsWith(suffix.toLowerCase())
    ? trimmedName
    : `${trimmedName}${suffix}`;
}
