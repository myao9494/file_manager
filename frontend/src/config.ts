/**
 * アプリケーション設定
 * プラットフォーム依存の設定を管理
 * バックエンドの/api/configから設定を取得
 * PWA配信時は同一オリジンのため空文字列を使用
 */

import {
  normalizeMarkdownOpenMode,
  normalizeTextFileOpenMode,
  type MarkdownOpenMode,
  type TextFileOpenMode,
} from "./utils/editorPreferences";

export const API_BASE_URL = "";

/**
 * バックエンドから取得した設定のキャッシュ
 */
interface AppConfig {
  defaultBasePath: string;
  isWindows: boolean;
  textFileOpenMode: TextFileOpenMode;
  markdownOpenMode: MarkdownOpenMode;
}

let configCache: AppConfig | null = null;
let configPromise: Promise<AppConfig> | null = null;

/**
 * バックエンドから設定を取得（キャッシュあり）
 */
export async function getConfig(): Promise<AppConfig> {
  if (configCache) {
    return configCache;
  }

  if (configPromise) {
    return configPromise;
  }

  configPromise = fetch(`${API_BASE_URL}/api/config`)
    .then((res) => {
      if (!res.ok) {
        throw new Error("設定の取得に失敗しました");
      }
      return res.json();
    })
    .then((data) => {
      configCache = {
        defaultBasePath: data.defaultBasePath,
        isWindows: data.isWindows,
        textFileOpenMode: normalizeTextFileOpenMode(data.textFileOpenMode),
        markdownOpenMode: normalizeMarkdownOpenMode(data.markdownOpenMode),
      };
      return configCache;
    })
    .catch((err) => {
      console.error("設定取得エラー:", err);
      const fallback: AppConfig = {
        defaultBasePath: getFallbackPath(),
        isWindows: navigator.userAgent.toLowerCase().includes("win"),
        textFileOpenMode: "web",
        markdownOpenMode: "web",
      };
      configCache = fallback;
      return fallback;
    });

  return configPromise;
}

/**
 * エディタ設定をバックエンド設定ファイルへ保存する
 */
export async function saveEditorPreferences(
  textFileOpenMode: TextFileOpenMode,
  markdownOpenMode: MarkdownOpenMode
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/config/preferences`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      textFileOpenMode,
      markdownOpenMode,
    }),
  });

  if (!response.ok) {
    throw new Error("設定の保存に失敗しました");
  }

  const data = await response.json();
  configCache = {
    defaultBasePath: configCache?.defaultBasePath ?? getFallbackPath(),
    isWindows: configCache?.isWindows ?? navigator.userAgent.toLowerCase().includes("win"),
    textFileOpenMode: normalizeTextFileOpenMode(data.textFileOpenMode),
    markdownOpenMode: normalizeMarkdownOpenMode(data.markdownOpenMode),
  };
}

/**
 * フォールバック用のデフォルトパス
 */
function getFallbackPath(): string {
  const userAgent = window.navigator.userAgent.toLowerCase();
  if (userAgent.includes("win")) {
    return "C:\\Users";
  }
  return "/Users";
}

/**
 * 同期的にデフォルトパスを取得（キャッシュから）
 * 未取得の場合はフォールバック値を返す
 */
export function getDefaultBasePath(): string {
  return configCache?.defaultBasePath ?? getFallbackPath();
}

/**
 * プラットフォームを判定してネットワークドライブのパスを返す
 */
export function getNetworkDrivePath(): string {
  const userAgent = window.navigator.userAgent.toLowerCase();
  const isWindows = userAgent.includes("win");
  const isMac = userAgent.includes("mac");

  if (isWindows) {
    return import.meta.env.VITE_NETWORK_DRIVE_PATH_WINDOWS || "\\\\vnau12\\xxx\\yyy";
  } else if (isMac) {
    return import.meta.env.VITE_NETWORK_DRIVE_PATH_MAC || "/Volumes/mine_nas";
  } else {
    return import.meta.env.VITE_NETWORK_DRIVE_PATH_MAC || "/Volumes/mine_nas";
  }
}

/**
 * ネットワークドライブの表示名
 */
export const NETWORK_DRIVE_LABEL = "NAS";

/**
 * 複合拡張子のリスト
 * これらに一致する末尾を持つファイルは、その部分全体を拡張子として扱う
 */
export const COMPOUND_EXTENSIONS = [
  ".excalidraw.md",
  ".excalidraw.svg",
  ".excalidraw.png",
  ".ipynb.json",
];
