/**
 * ファイル一覧で使う更新日時表示のフォーマットを提供する
 */
export function formatFileDate(isoDate?: string): string {
  if (!isoDate) {
    return "-";
  }

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
