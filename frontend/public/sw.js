/**
 * Service Worker
 * PWAのオフライン対応とキャッシュ管理
 * - 静的アセット: Cache First（キャッシュ優先、なければネットワーク）
 * - APIリクエスト: Network Only（キャッシュなし、常にネットワーク）
 */

const CACHE_NAME = "file-manager-v1";

// キャッシュ対象の静的アセット
const STATIC_ASSETS = [
    "/",
    "/manifest.json",
];

// インストール時: 静的アセットをキャッシュ
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    // 新しいService Workerを即座にアクティブにする
    self.skipWaiting();
});

// アクティベーション時: 古いキャッシュを削除
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        })
    );
    // すべてのクライアントを即座に制御
    self.clients.claim();
});

// フェッチ時: APIはネットワークのみ、静的アセットはキャッシュ優先
self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);

    // APIリクエストはネットワークのみ（キャッシュしない）
    if (url.pathname.startsWith("/api/")) {
        return;
    }

    // 静的アセットはCache First戦略
    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) {
                return cached;
            }
            return fetch(event.request).then((response) => {
                // 成功レスポンスのみキャッシュ
                if (response.ok && event.request.method === "GET") {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            });
        })
    );
});
