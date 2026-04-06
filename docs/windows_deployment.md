# Windows環境へのデプロイガイド

このガイドでは、フロントエンドのビルド環境（Node.js/npm）がないWindows環境（会社PCなど）で、File Managerアプリを使用する方法を説明します。

## 概要

開発機（Mac/Linux）でフロントエンドをビルドし、その成果物を配布して、Windows 側で起動します。

注:
- Windows は仮想環境なしでも動作します
- macOS 側は従来どおり仮想環境を利用して問題ありません

## 前提条件

- **開発機 (Mac/Linux)**: Node.js, Python環境があること
- **会社PC (Windows)**: Pythonがインストールされていること（管理者権限不要のEmbeddable Pythonでも可）
- **会社PC (Windows)**: 仮想環境は必須ではない
- **Server Terminal を強化したい場合**: `pywinpty` の追加を推奨

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

`start_windows_prod.bat` は以下の順で Python を選択します。

1. `backend/.venv_fix/Scripts/python.exe`
2. `backend/.venv/Scripts/python.exe`
3. システム `python`

このため、会社PCでは仮想環境がなくても、システム `python` にバックエンド依存が入っていればそのまま起動できます。

### 2.1 Server Terminal を強化したい場合

管理者権限は不要です。通常ユーザー権限のまま、`backend` ディレクトリで以下を実行してください。

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

`requirements.txt` には Windows 向けの `pywinpty` が含まれていますが、Server Terminal の既定は安定性優先の `cmd.exe` + パイプ実装です。`pywinpty` を試す場合だけ、起動前に `FILE_MANAGER_WINDOWS_TERMINAL_BACKEND=winpty` を設定してください。

PowerShell を使いたい場合は、追加で以下を設定します。

```powershell
$env:FILE_MANAGER_WINDOWS_TERMINAL_SHELL="powershell"
```

現在の既定動作:
- シェル: `cmd.exe`
- 出力: `/U` による Unicode 出力
- 入力: フロント側で行バッファ管理し、Enter 時にまとめて実行
- Tab: パス補完

## 注意事項

- **APIのエンドポイント**: API は `http://localhost:8001/api` です。
- **フロントエンドのURL**: `start_windows_prod.bat` は `http://localhost:8001` でアプリ全体を提供します。
- **設定**: `backend/.env` ファイルでベースディレクトリの設定などが可能です。
- **トラブルシューティング**: 画面が真っ白になる場合は、ブラウザの開発者ツール（F12）でコンソールエラーを確認してください。

## 構成

- `backend/app/main.py`: FastAPI アプリ本体
- `frontend/dist/`: Windows で配信するビルド済みフロントエンド
- `start_windows_prod.bat`: FastAPI (`8001`) で `frontend/dist` を配信する起動スクリプト
