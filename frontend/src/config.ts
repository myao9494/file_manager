/**
 * アプリケーション設定
 * プラットフォーム依存の設定を管理
 * バックエンドの/api/configから設定を取得
 */

export const API_BASE_URL = "http://localhost:8001";

/**
 * バックエンドから取得した設定のキャッシュ
 */
interface AppConfig {
  defaultBasePath: string;
  isWindows: boolean;
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
      configCache = data;
      return data;
    })
    .catch((err) => {
      console.error("設定取得エラー:", err);
      // フォールバック: プラットフォームに応じたデフォルト値
      const fallback: AppConfig = {
        defaultBasePath: getFallbackPath(),
        isWindows: navigator.userAgent.toLowerCase().includes("win"),
      };
      configCache = fallback;
      return fallback;
    });

  return configPromise;
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
  // User-Agentからプラットフォームを判定
  const userAgent = window.navigator.userAgent.toLowerCase();
  const isWindows = userAgent.includes('win');
  const isMac = userAgent.includes('mac');

  if (isWindows) {
    // Windowsの場合はUNCパス
    return '\\\\vnau12\\xxx\\yyy';
  } else if (isMac) {
    // macOSの場合はマウントポイント
    return '/Volumes/mine_nas';
  } else {
    // その他のプラットフォーム（Linux等）はmacOSと同じ扱い
    return '/Volumes/mine_nas';
  }
}

/**
 * ネットワークドライブの表示名
 */
export const NETWORK_DRIVE_LABEL = 'NAS';
