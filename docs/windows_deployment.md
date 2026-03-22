# Windows環境へのデプロイガイド

このガイドでは、フロントエンドのビルド環境（Node.js/npm）がないWindows環境（会社PCなど）で、File Managerアプリを使用する方法を説明します。

## 概要

開発機（Mac/Linux）でフロントエンドをビルドし、その成果物を配布して、Windows 側で起動します。

## 前提条件

- **開発機 (Mac/Linux)**: Node.js, Python環境があること
- **会社PC (Windows)**: Pythonがインストールされていること（管理者権限不要のEmbeddable Pythonでも可）

## 手順

### 1. 開発機での準備（ビルド）

1. 開発機で `frontend/` のビルドを実行します。

   ```bash
   cd frontend
   npm run build
   ```

2. Windows 機へ、少なくとも以下をコピーします。
   - `backend/`
   - `frontend/dist/`
   - `start_windows_prod.bat`

### 2. Windows環境での実行

1. コピーしたフォルダ内の `start_windows_prod.bat` をダブルクリックします。
2. コマンドプロンプトが開き、サーバーが起動します。
3. 自動的にブラウザが開かない場合は、`http://localhost:8001` にアクセスしてください。

## 注意事項

- **APIのエンドポイント**: API は `http://localhost:8001/api` です。
- **フロントエンドのURL**: `start_windows_prod.bat` は `http://localhost:8001` でアプリ全体を提供します。
- **設定**: `backend/.env` ファイルでベースディレクトリの設定などが可能です。
- **トラブルシューティング**: 画面が真っ白になる場合は、ブラウザの開発者ツール（F12）でコンソールエラーを確認してください。

## 構成

- `backend/app/main.py`: FastAPI アプリ本体
- `frontend/dist/`: Windows で配信するビルド済みフロントエンド
- `start_windows_prod.bat`: FastAPI (`8001`) で `frontend/dist` を配信する起動スクリプト
