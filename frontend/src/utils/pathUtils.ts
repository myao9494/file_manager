/**
 * パス操作ユーティリティ
 */

/**
 * パスをサニタイズする
 * - 前後の空白を除去
 * - 前後のダブルクォーテーション(")を除去 (Windowsのエクスプローラーからのコピペ対策)
 * 
 * @param path 入力パス
 * @returns サニタイズされたパス
 */
export function sanitizePath(path: string): string {
    if (!path) return "";

    let cleanPath = path.trim();

    // ダブルクォーテーションで囲まれている場合、それを取り除く
    // "パス" の形式
    if (cleanPath.startsWith('"') && cleanPath.endsWith('"')) {
        cleanPath = cleanPath.slice(1, -1);
    }

    // Windowsパス対策：バックスラッシュをスラッシュに置換
    cleanPath = cleanPath.replace(/\\/g, "/");

    // もう一度トリミング（引用符の中にスペースがあった場合など）
    return cleanPath.trim();
}
