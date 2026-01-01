# File Manager

React + FastAPIによる軽量ファイルマネージャー。個人利用・VPN内利用を前提とした用途特化UI。

## プロジェクト概要

`/Users/username/projects/file_viewer`を参考にして作成したweb版ファイルマネージャー。
3ペイン構成（左パネル + 中央パネル + 検索パネル、比率35:35:30）で、ドラッグ&ドロップによるファイル操作をサポート。

## GUIのモックアップ

Pasted image 20251227200414.png を参照

### 右クリックメニュー

- フルパスをコピー
- 名前を変更
- 削除
- コピー
- 切り取り
- 貼り付け

## 技術スタック

### フロントエンド

- **React 18+** - UIフレームワーク
- **TypeScript** - 型安全性
- **Vite** - ビルドツール
- **TanStack Query** - データフェッチング
- **Lucide React** - アイコン

### バックエンド

- **Python 3.10+**
- **FastAPI** - Web APIフレームワーク
- **uvicorn** - ASGIサーバー
- **Pydantic** - 設定管理
- **pathlib / shutil** - ファイルシステム操作

## セットアップ

### バックエンド

```bash
cd backend

# 仮想環境作成
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# 依存関係インストール
pip install -r requirements.txt

# テスト実行
PYTHONPATH=. pytest tests/ -v

# サーバー起動（ポート8001）
PYTHONPATH=. python -m uvicorn app.main:app --reload --port 8001
```

### フロントエンド

```bash
cd frontend

# 依存関係インストール
npm install

# 開発サーバー起動
npm run dev

# ビルド
npm run build
```

## 使用方法

1. バックエンドサーバーを起動（ポート8001）
2. フロントエンド開発サーバーを起動（ポート5173）
3. ブラウザで `http://localhost:5173` にアクセス

### URLパラメータでフォルダを指定

起動時に特定のフォルダを開きたい場合、URLクエリパラメータで指定できます：

```
http://localhost:5173/?path=/Users/username/Documents
```

Windowsネットワークフォルダ（UNCパス）も指定可能：
```
http://localhost:5173/?path=\\server\share\folder
```

詳細は [CLAUDE.md](CLAUDE.md#URLパラメータ) を参照してください。

## 機能

### 実装済み

- [x] 3カラムレイアウト（左パネル + 中央パネル + 検索パネル）
- [x] ファイル一覧表示（リストビュー）
- [x] フォルダナビゲーション（戻る/進む対応）
- [x] ファイルフィルタリング（拡張子別）
- [x] ページ内検索
- [x] ドラッグ&ドロップUI
- [x] 右クリックメニュー（UI）
  - [x] フルパスをコピー
  - [x] 名前を変更（UI）
  - [x] 削除（UI）
  - [x] コピー/切り取り/貼り付け（UI）
- [x] ツールバーアイコン（file_viewer準拠）
  - [x] 戻る/進む
  - [x] 上の階層へ移動
  - [x] クリップボードから開く
  - [x] フォルダ作成
  - [x] 削除
  - [x] 更新
- [x] **ファイル検索（Everything風）**
  - [x] リアルタイム検索（デバウンス付き、300ms）
  - [x] タイプフィルタ（全、ファイル、フォルダ）
  - [x] 検索階層の指定（+/-ボタンで調整、0=無制限）
  - [x] 除外パターンの設定（カンマ区切り）
  - [x] 検索結果のクリックでパスコピー
  - [x] フォルダ/ファイルの分離表示
- [x] バックエンドAPI
  - [x] ファイル一覧取得
  - [x] ファイル検索
  - [x] フォルダ作成
  - [x] 削除

### 未実装

- [ ] バックエンドAPI: リネーム、コピー、移動
- [ ] ドラッグ&ドロップによる移動（バックエンド連携）
- [ ] タイルビュー
- [ ] ファイルアップロード
- [ ] ダウンロード機能
- [ ] VSCode/Jupyter/Obsidian連携
- [ ] Excalidraw連携
- [ ] Markdownファイル作成

## TDD方針

1. テストファーストで開発
2. 期待される入出力に基づきテストを作成
3. テスト失敗を確認後、実装を進める
4. すべてのテストがパスするまで繰り返す

## 参考リンク

- [FastAPI公式ドキュメント](https://fastapi.tiangolo.com/)
- [ファイル操作API参考](https://medium.com/@chodvadiyasaurabh/building-a-file-upload-and-download-api-with-python-and-fastapi-3de94e4d1a35)
- [React連携ガイド](https://testdriven.io/blog/fastapi-react/)

## ドキュメント

- [アーキテクチャ設計書](docs/architecture.md)
