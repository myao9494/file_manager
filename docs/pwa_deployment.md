# PWA デプロイメントガイド

## 概要

File ManagerはPWA（Progressive Web App）として動作します。
バックエンド（FastAPI）がフロントエンドのビルド済みファイルを静的配信し、
単一ポート（8001）でアプリ全体が動作します。

## 動作モード

### 開発モード（従来通り）

```bash
./start_dev.sh
```

- **バックエンド**: `http://localhost:8001`（API）
- **フロントエンド**: `http://localhost:5173`（Vite devサーバー）
- Viteのプロキシ設定により、フロントエンドからの`/api`リクエストはバックエンドに転送

### 本番モード（PWA配信）

```bash
./start.sh
```

- **アプリ全体**: `http://localhost:8001`
- バックエンドがフロントエンドのビルド済みファイル（`frontend/dist/`）を配信
- `frontend/dist/`が未ビルドの場合、自動でビルド実行

## フロントエンドのビルド

```bash
cd frontend
npm run build    # または pnpm run build
```

ビルド成果物は `frontend/dist/` に生成されます。

## PWA機能

### マニフェスト

`frontend/public/manifest.json` でPWAの設定を管理：
- アプリ名、アイコン、テーマカラー
- `display: standalone` でネイティブアプリ風の表示

### Service Worker

`frontend/public/sw.js` でキャッシュ戦略を管理：
- **静的アセット**: Cache First（高速表示）
- **APIリクエスト**: Network Only（常に最新データ）

### インストール

ブラウザで `http://localhost:8001` にアクセスすると、アドレスバーにインストールボタンが表示されます。

## アーキテクチャ

```
[ブラウザ] → http://localhost:8001
                ├── /api/*  → FastAPI ルーター（APIレスポンス）
                └── /*      → frontend/dist/ 静的ファイル
                              └── SPA: 未知のパス → index.html
```

## API URLの設定

フロントエンドのAPI URLは `frontend/src/config.ts` の `API_BASE_URL` で管理。
PWA配信時は空文字列（`""`）を使用し、同一オリジンからの相対パスでAPIにアクセスします。

開発時は `vite.config.ts` のプロキシ設定により `/api` リクエストをバックエンドに転送。
