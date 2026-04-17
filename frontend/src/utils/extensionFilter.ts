/**
 * 全文検索の拡張子フィルター入力を正規化する
 */
export function normalizeExtensionFilterInput(value: string): string {
  const seen = new Set<string>();
  const tokens: string[] = [];

  for (const rawToken of value.split(/\s+/)) {
    const trimmedToken = rawToken.trim();

    if (!trimmedToken) {
      continue;
    }

    const normalizedToken = `.${trimmedToken.replace(/^\.+/, "").toLowerCase()}`;

    if (normalizedToken === "." || seen.has(normalizedToken)) {
      continue;
    }

    seen.add(normalizedToken);
    tokens.push(normalizedToken);
  }

  return tokens.join(" ");
}

/**
 * 正規化済みフィルター文字列を拡張子一覧へ分解する
 */
export function parseExtensionFilterInput(value: string): string[] {
  return normalizeExtensionFilterInput(value)
    .split(/\s+/)
    .filter(Boolean);
}
