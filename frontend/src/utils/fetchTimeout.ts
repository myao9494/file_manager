/**
 * APIリクエストのタイムアウト処理
 * - globalThis.fetch をラップし、一定時間応答がない場合に AbortController によりリクエストを中断する
 * - タイムアウト時間は設定ファイル（settings.json）から動的に読み込む
 * - アップロード処理（/api/upload）など、一部の重いAPIは除外する
 */

import { getApiTimeout } from '../config';

let isPatched = false;

export function setupFetchTimeout(): void {
  if (isPatched) {
    return;
  }

  const originalFetch = globalThis.fetch;

  globalThis.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const urlStr = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input.url);

    // アップロードAPI (/api/upload) などはタイムアウトを除外する
    const isUpload = urlStr.includes('/api/upload');
    if (isUpload) {
      return originalFetch(input, init);
    }

    // 動的にタイムアウト値を取得 (秒 -> ミリ秒)
    const timeoutSec = getApiTimeout();
    const timeoutMs = timeoutSec * 1000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    // 既存のsignalがあればマージすべきだが、本アプリでは現在他のsignalは使用されていないため単純に上書きする
    const newInit: RequestInit = {
      ...init,
      signal: controller.signal,
    };

    try {
      const response = await originalFetch(input, newInit);
      return response;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(
          `リクエストがタイムアウトしました（設定値: ${timeoutSec}秒）。ネットワークドライブが遅いか、サーバーが応答していません。`
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  isPatched = true;
}
