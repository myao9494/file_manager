# サーバー起動スクリプト仕様書

## 概要
file_managerのサーバー（バックエンドおよびフロントエンド）を効率的に起動するためのスクリプトです。
既にポートが使用されている場合、そのプロセスを自動的に終了させてから再起動します。

**注**: インデックス検索機能は外部サービス（file_index_service）に分離されています。
外部サービスも同時に起動する場合は、file_index_serviceディレクトリの起動スクリプトを別途実行してください。

## 対象ポート
- **file_manager Backend**: 8001
- **file_manager Frontend**: 5173

## スクリプト一覧

### 1. start.sh (macOS/Linux用)
- **場所**: プロジェクトルート
- **機能**:
    - `lsof` を使用してポート 8001 を使用中のプロセスを特定し、終了します。
    - `frontend/` で `npm run build` を実行し、最新の `dist/` を生成します。
    - バックエンドのみを起動し、FastAPI が `frontend/dist/` を静的配信します。
    - `Ctrl+C` でバックエンドプロセスを停止します。
- **実行方法**:
    ```bash
    ./start.sh
    ```

### 2. start_dev.sh (macOS/Linux用)
- **場所**: プロジェクトルート
- **機能**:
    - `lsof` を使用してポート 8001, 5173 を使用中のプロセスを特定し、終了します。
    - バックエンドと Vite 開発サーバーを両方起動します。
    - `Ctrl+C` で両方のプロセスを停止します。
- **実行方法**:
    ```bash
    ./start_dev.sh
    ```

### 3. start.bat (Windows用, 開発モード)
- **場所**: プロジェクトルート
- **機能**:
    - `netstat` でポート 8001, 5173 を使用中のPIDを取得し、`taskkill` で終了します。
    - バックエンドとフロントエンド開発サーバーをそれぞれ別ウィンドウで起動します。
    - 実装上、起動前に `frontend/` で `npm run build` も実行します。
- **実行方法**:
    - `start.bat` をダブルクリック、またはコマンドプロンプトから実行。

### 4. start_windows_prod.bat (Windows用, 配信モード)
- **場所**: プロジェクトルート
- **機能**:
    - ポート 8001 を使用中のプロセスを停止します。
    - バックエンドを `8001` で起動します。
    - `frontend/dist` が存在する場合、FastAPI がそのまま静的配信します。
- **実行方法**:
    - `start_windows_prod.bat` をダブルクリック、またはコマンドプロンプトから実行。

## モードごとのURL

### macOS/Linux

- `./start_dev.sh`
  - Frontend: `http://localhost:5173`
  - Backend API: `http://localhost:8001/api`
- `./start.sh`
  - App: `http://localhost:8001`
  - Backend API: `http://localhost:8001/api`

### Windows

- `start.bat`
  - Frontend: `http://localhost:5173`
  - Backend API: `http://localhost:8001/api`
- `start_windows_prod.bat`
  - App: `http://localhost:8001`
  - Backend API: `http://localhost:8001/api`

## 注意事項
- スクリプトはプロジェクトルートディレクトリから実行してください。
- 実行には以下の環境が必要です：
    - Python (バックエンド用)
    - Node.js / npm (フロントエンド用)
    - ポート 8001, 5173 へのアクセス権限
- Windows の配信モードも単一ポート (`8001`) 構成です。
