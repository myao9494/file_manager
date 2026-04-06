# サーバーセットアップ手順

## 概要

`file_manager` は以下の 2 つの起動形態を持ちます。

- 開発モード: Vite (`5173`) + FastAPI (`8001`)
- PWA 配信モード: FastAPI (`8001`) が `frontend/dist/` を静的配信

通常利用は PWA 配信モードを前提とします。

## 前提

- macOS/Linux: Python 仮想環境の利用を推奨
- Windows: 仮想環境なしでも可
- フロントエンドの PWA 配信には `frontend/dist/` が必要

## バックエンドセットアップ

### macOS/Linux

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Windows

仮想環境なしでも動作します。システム `python` に依存関係が入っていればそのまま起動できます。

```powershell
cd backend
pip install -r requirements.txt
```

仮想環境を使う場合:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

## フロントエンドセットアップ

```bash
cd frontend
npm install
npm run build
```

## 起動手順

### PWA 配信モード

#### macOS/Linux

```bash
./start.sh
```

#### Windows

```powershell
.\start_windows_prod.bat
```

起動後:

- アプリ本体: `http://localhost:8001`
- API: `http://localhost:8001/api`

### 開発モード

#### macOS/Linux

```bash
./start_dev.sh
```

#### Windows

```powershell
.\start.bat
```

起動後:

- フロントエンド: `http://localhost:5173`
- API: `http://localhost:8001/api`

## Windows の Python 選択順

Windows の起動スクリプトは次の順で Python を選択します。

1. `backend/.venv_fix/Scripts/python.exe`
2. `backend/.venv/Scripts/python.exe`
3. システム `python`

## Server Terminal 補足

- Windows の既定シェルは `cmd.exe`
- 既定ではパイプ実装を使用
- Tab でパス補完可能
- PowerShell を使いたい場合は `FILE_MANAGER_WINDOWS_TERMINAL_SHELL=powershell`
- `pywinpty` を試したい場合は `FILE_MANAGER_WINDOWS_TERMINAL_BACKEND=winpty`

## 動作確認

1. `http://localhost:8001/api/config` で JSON が返る
2. PWA 配信モードでは `http://localhost:8001/` で画面が開く
3. 開発モードでは `http://localhost:5173/` で画面が開く
