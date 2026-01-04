# Windows環境へのデプロイガイド

このガイドでは、フロントエンドのビルド環境（Node.js/npm）がないWindows環境（会社PCなど）で、File Managerアプリを使用する方法を説明します。

## 概要

開発機（Mac/Linux）でフロントエンドをビルドし、その成果物をバックエンド（Python/FastAPI）に同梱して配布します。Windows側ではPython環境のみで動作します。

## 前提条件

- **開発機 (Mac/Linux)**: Node.js, Python環境があること
- **会社PC (Windows)**: Pythonがインストールされていること（管理者権限不要のEmbeddable Pythonでも可）

## 手順

### 1. 開発機での準備（ビルド）

1. リポジトリのルートで以下のスクリプトを実行します。

   ```bash
   ./scripts/build_for_windows.sh
   ```

   このスクリプトは以下の処理を行います：
   - フロントエンド (`frontend/`) のビルド (`npm run build`)
   - ビルド成果物 (`frontend/dist/`) をバックエンドの静的ファイルディレクトリ (`backend/static/`) にコピー

2. ビルドが完了したら、`backend` フォルダと `start_windows_prod.bat` をWindows機にコピーします。
   （`frontend` フォルダは不要です）

### 2. Windows環境での実行

1. コピーしたフォルダ内の `start_windows_prod.bat` をダブルクリックします。
2. コマンドプロンプトが開き、サーバーが起動します。
3. 自動的にブラウザが開かない場合は、`http://localhost:8001` にアクセスしてください。

## 注意事項

- **APIのエンドポイント**: 本番モード（ビルド済みフロントエンド）では、APIは同じポート（8001）の `/api` パスで提供されます。
- **設定**: `backend/.env` ファイルでベースディレクトリの設定などが可能です。
- **トラブルシューティング**: 画面が真っ白になる場合は、ブラウザの開発者ツール（F12）でコンソールエラーを確認してください。

## 構成

- `backend/app/main.py`: 静的ファイル (`/assets`, `index.html`) の配信設定が追加されています。
- `frontend/src/api/files.ts`: ビルド時はAPIのURLが相対パス (`/api`) になるように調整されています。
