# File Manager

React + FastAPI による軽量ファイルマネージャーです。3ペイン構成で、左右のファイル一覧と検索ペインを並べて操作できます。検索ペイン下部にはサーバーターミナルも埋め込めます。

## 概要

- フロントエンド: React + TypeScript + Vite
- バックエンド: FastAPI
- 検索:
  - `Live`: file_manager 内部 API によるディレクトリ走査
  - `Index(L)` / `Index(R)`: 外部の Local-fulltext-search (`http://localhost:8079`) を利用
  - `Index(ALL)`: 外部の file_index_service (`http://localhost:8080`) を利用
- 配信モード:
  - 開発モード: Vite (`5173`) + FastAPI (`8001`)
  - PWA 配信モード: FastAPI (`8001`) が `frontend/dist/` を配信

## セットアップ

### バックエンド

macOS は仮想環境利用を推奨、Windows は仮想環境なしでも動作します。

```bash
cd backend

python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

PYTHONPATH=. pytest tests/ -v
PYTHONPATH=. python -m uvicorn app.main:app --reload --port 8001
```

Windows 注:
- 仮想環境がなくても動作します。`python` に依存パッケージが入っていればそのまま起動できます
- Server Terminal を安定して使うには、仮想環境へ `pywinpty` が入っていることを推奨します
- `pywinpty` は管理者権限不要で、通常の `pip install -r requirements.txt` で導入できます
- Windows の既定は `cmd.exe` + パイプ実装です
- `cmd.exe` は `/U` 付きで起動し、Unicode出力を利用します
- `pywinpty` を試す場合だけ `FILE_MANAGER_WINDOWS_TERMINAL_BACKEND=winpty` を設定します
- PowerShell を使いたい場合だけ `FILE_MANAGER_WINDOWS_TERMINAL_SHELL=powershell` を設定します

### フロントエンド

```bash
cd frontend

npm install
npm run dev
npm run build
```

## 起動方法

### 開発モード

```bash
./start_dev.sh
```

- フロントエンド: `http://localhost:5173`
- バックエンド API: `http://localhost:8001/api`

### PWA 配信モード

```bash
./start.sh
```

- アプリ本体: `http://localhost:8001`
- バックエンド API: `http://localhost:8001/api`
- 実行時に `frontend/dist/` を最新化するため、フロントエンドをビルドします

### Windows

- 開発モード: `start.bat`
- 本番相当の配信: `start_windows_prod.bat`

注:
- `start_windows_prod.bat` も `http://localhost:8001` の単一ポート配信です
- `frontend/dist/` が必要です
- Windows は `backend/.venv_fix` → `backend/.venv` → システム `python` の順で起動に使用します
- そのため、会社PCのように仮想環境なしでもシステム `python` に依存関係が入っていれば動作します

## 環境変数

`backend/.env.example` を `backend/.env` にコピーして使用します。

主な設定:

- `FILE_MANAGER_BASE_DIR`: デフォルトのベースディレクトリ
- `FILE_MANAGER_OBSIDIAN_BASE_DIR`: Obsidian デイリーフォルダのベースディレクトリ

## URL パラメータ

起動時に特定のパスを開けます。

```text
http://localhost:5173/?path=/Users/username/Documents
```

UNC パスも指定可能です。

```text
http://localhost:5173/?path=\\server\share\folder
```

挙動:

- フォルダパス: そのフォルダを開く
- ファイルパス: 親フォルダへ移動
- 存在しないパス: エラー表示後、デフォルトパスへ戻る

## 主な機能

- 3ペインレイアウト（左 / 中央 / 検索）
- ファイル一覧表示
- 戻る / 進む / 上の階層へ移動
- ドラッグ&ドロップ
- 一括コピー / 一括移動 / 一括削除
- Safe Move（コピー → 検証 → 削除）
- Markdown エディタモーダル
- Obsidian / VSCode / Jupyter / Excalidraw / Finder or Explorer 連携
- Obsidian 今日のフォルダを開く機能
- 検索ペイン
  - `Live`
  - `Index(L)` / `Index(R)`
  - `Index(ALL)`
  - タイプフィルタ
  - 深さ指定
  - ファイル名フィルタ
  - 正規表現モード
- サーバーターミナル
  - 右ペイン下部に常駐
  - WebSocket + PTY 経由でローカルシェルに接続
  - Windows では `cmd.exe` を既定シェルとして使用
  - Windows では既定でパイプ実装を使い、必要時のみ `pywinpty` を明示有効化
  - Windows の `cmd.exe` では入力はフロント側で行バッファ管理し、Enter 時にまとめて実行
  - Tab で現在行のパス補完が可能
  - `Open Here` で中央ペインの現在パスから再接続

## API の現状

主なエンドポイント:

- `GET /api/files`
- `GET /api/path-info`
- `GET /api/search`
- `POST /api/create-folder`
- `POST /api/create-file`
- `POST /api/update-file`
- `POST /api/rename`
- `POST /api/move`
- `POST /api/move/batch`
- `POST /api/copy`
- `POST /api/copy/batch`
- `DELETE /api/delete/{path}`
- `POST /api/upload`
- `GET /api/obsidian/daily-path`
- `WS /api/terminal/ws`

詳細は [docs/architecture.md](docs/architecture.md) を参照してください。

## ドキュメント

- [アーキテクチャ設計書](docs/architecture.md)
- [PWA デプロイメントガイド](docs/pwa_deployment.md)
- [起動スクリプト仕様書](docs/startup_scripts.md)
- [Obsidian 今日のフォルダ連携](docs/obsidian_daily.md)
- [Everything 連携マニュアル](docs/everything_manual.md)
