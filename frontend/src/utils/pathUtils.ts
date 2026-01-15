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

/**
 * クリップボードコピー用にパスを整形する
 * - Windows形式のパス（ドライブレター付きなど）の場合、バックスラッシュ区切りにする
 * - 先頭の不要なスラッシュを除去 (/C:/... -> C:\...)
 * 
 * @param path整形前のパス
 * @returns 整形後のパス
 */
export function formatPathForClipboard(path: string): string {
    if (!path) return "";

    let formatted = path;

    // /C:/Users... のような形式の場合、先頭のスラッシュを除去
    if (formatted.match(/^\/[a-zA-Z]:/)) {
        formatted = formatted.substring(1);
    }

    // ドライブレターがある場合、大文字に統一 (c: -> C:)
    if (formatted.match(/^[a-z]:/)) {
        formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }

    // Windowsパスとみなされる場合（ドライブレターあり、またはUNCパス）
    // バックスラッシュ区切りに変換
    const isWindowsPath = /^[a-zA-Z]:/.test(formatted) || formatted.startsWith("//") || formatted.startsWith("\\\\");

    if (isWindowsPath) {
        return formatted.replace(/\//g, "\\");
    }

    return formatted;
}
