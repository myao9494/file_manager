/**
 * クリップボード操作用APIクライアント
 */
// import { API_BASE_URL } from "./config"; // config.ts is not in api dir
const API_BASE_URL = "http://localhost:8001/api";

/**
 * ファイルパスのリストをOSのクリップボードにコピーする
 * Windows環境の場合、Explorerで貼り付け可能な形式でコピーされる
 */
export async function copyFilesToClipboard(paths: string[]): Promise<{ status: string; message?: string; count?: number }> {
    try {
        const response = await fetch(`${API_BASE_URL}/clipboard/copy`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ paths }),
        });

        if (!response.ok) {
            // エラーでも止まらないようにする（フロントエンドのコピーは継続）
            console.warn("Backend clipboard copy failed:", await response.text());
            return { status: "error", message: response.statusText };
        }

        return await response.json();
    } catch (error) {
        console.error("Failed to copy to OS clipboard:", error);
        return { status: "error", message: String(error) };
    }
}
