/**
 * クリップボード操作用APIクライアント
 * config.tsの共通API_BASE_URLを使用
 */
import { API_BASE_URL } from "../config";

const API_URL = `${API_BASE_URL}/api`;

/**
 * ファイルパスのリストをOSのクリップボードにコピーする
 * Windows環境の場合、Explorerで貼り付け可能な形式でコピーされる
 */
export async function copyFilesToClipboard(paths: string[]): Promise<{ status: string; message?: string; count?: number }> {
    try {
        const response = await fetch(`${API_URL}/clipboard/copy`, {
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
