# CLAUDE.md - File Manager プロジェクト

## プロジェクト概要

React + FastAPIによる軽量ファイルマネージャー。
`/Users/username/projects/file_viewer`（Flask版）を参考に、モダンな技術スタックで再構築。

## 開発方針

### TDD（テスト駆動開発）

1. テストを先に書く
2. テスト失敗を確認
3. 実装してテストを通す
4. リファクタリング

### コード規約

- 各ファイル冒頭に日本語コメントで仕様を記述
- TypeScript: 厳密な型定義を使用
- Python: 型ヒントを使用

## プロジェクト構造

```
file_manager/
├── backend/           # FastAPI バックエンド
│   ├── app/
│   │   ├── main.py    # エントリーポイント
│   │   ├── config.py  # 設定（ポート8001）
│   │   └── routers/   # APIルーター
│   └── tests/         # pytest テスト
├── frontend/          # React フロントエンド
│   └── src/
│       ├── api/       # APIクライアント
│       ├── components/# UIコンポーネント
│       ├── hooks/     # カスタムフック
│       └── types/     # 型定義
├── docs/              # ドキュメント
└── CLAUDE.md          # このファイル
```

## 開発サーバー

| サービス | ポート | コマンド |
|----------|--------|----------|
| Backend | 8001 | `PYTHONPATH=. python -m uvicorn app.main:app --reload --port 8001` |
| Frontend | 5173 | `npm run dev` |

### 起動スクリプト
一括起動・ポート解放機能付きのスクリプトを使用できます：
- **macOS/Linux**: `./start.sh`
- **Windows**: `start.bat`

詳細は `docs/startup_scripts.md` を参照。

## 環境変数設定

デフォルトのベースディレクトリは環境変数で設定します。これにより、異なる環境（自宅macOS / 会社Windows）でも`.env`ファイルを変更するだけで動作します。

### 設定方法

1. `backend/.env.example` を `backend/.env` にコピー
2. `FILE_MANAGER_BASE_DIR` を環境に合わせて設定

### 設定例

**macOS/Linux:**
```env
FILE_MANAGER_BASE_DIR=/Users/username/Documents
```

**Windows:**
```env
FILE_MANAGER_BASE_DIR=C:\Users\username\Documents
```

**Windowsネットワークフォルダ:**
```env
FILE_MANAGER_BASE_DIR=\\server\share\folder
```

### 動作の仕組み

1. バックエンド起動時に `.env` から `FILE_MANAGER_BASE_DIR` を読み込み
2. フロントエンドは起動時に `/api/config` から設定を取得
3. フロントエンドはビルド済み（dist）でも動作（バックエンドから動的に取得するため）

## URLパラメータ

フロントエンドは起動時にURLクエリパラメータからパスを読み取ります。

### 基本的な使用方法

```
http://localhost:5173/?path=/Users/username/Documents
```

### Windowsネットワークフォルダ（UNCパス）

```
http://localhost:5173/?path=\\server\share\folder
```

URLエンコードが必要な場合：
```
http://localhost:5173/?path=%5C%5Cserver%5Cshare%5Cfolder
```

### ファイルパスの自動処理

ファイルパスがURLで指定された場合、自動的に親フォルダにリダイレクトされます：

```
http://localhost:5173/?path=/Users/username/Documents/file.txt
↓ 自動リダイレクト
http://localhost:5173/?path=/Users/username/Documents
```

この機能により、ファイルパスを直接URLに貼り付けても、そのファイルが入っているフォルダが表示されます。

### エラー処理

存在しないパスが指定された場合、以下の動作をします：

**URLパラメータで存在しないパスを指定した場合:**
- エラートースト通知を表示
- URLパラメータを削除
- デフォルトパス（`/Users/username/projects`）に移動

**パス入力フィールドで存在しないパスを入力した場合:**
- エラートースト通知を表示
- 入力フィールドを元のパスに戻す
- 現在のパスを維持

トースト通知は自動的に5秒後に消えますが、×ボタンで手動で閉じることもできます。

### 注意事項

- **クロスプラットフォーム**: バックエンドが動作しているOSのパス形式を使用してください
  - macOS/Linux: `/Users/name/folder`
  - Windows: `C:\Users\name\folder` または `\\server\share\folder`
- **パス形式**: 絶対パスのみ対応（相対パスはベースディレクトリからの相対パスとして扱われます）
- **セキュリティ**: パストラバーサル（`..`）は検出され拒否されます
- **ファイル指定**: ファイルパスを指定すると親フォルダに自動リダイレクトされます

## 参照プロジェクト

- **file_viewer**: `/Users/username/projects/file_viewer`
  - `app.py`: メインFlaskアプリ
  - `templates/base.html`: ツールバーアイコンの参照元

## 主要コンポーネント

### App.tsx

メインレイアウトおよびグローバル設定。以下の機能を管理：

- ヘッダーメニュー（ハンバーガーメニュー）
  - テーマ切り替え（Light/Dark）
  - ストレージリセット（localStorage初期化）

### FileList.tsx

メインのファイル一覧コンポーネント。以下の機能を含む：

- ツールバー（base.html準拠のアイコン）
- 検索バー
- フィルタバー（ラベル簡略化、1行表示、ファイル・フォルダ切替対応）
- ファイル/フォルダテーブル（パスコピー用アイコン付き）
- ドラッグ&ドロップ
  - **Shift+ドラッグ**: テーブル行上でも範囲選択開始可能（ホバー効果を無視）
- **同一ペイン内移動の確認**:
  - 同一ペイン内でのファイル/フォルダ移動時のみ確認ポップアップを表示（誤操作防止）
  - 異なるペイン間移動は確認なし
- **ファイルダブルクリック処理**（バックエンドの`/api/open/smart`で判定）:
  - `.excalidraw*` → Excalidraw (localhost:3001)
  - `.ipynb` → JupyterLab (localhost:8888/lab/tree)
  - `.md`（obsidianあり） → Obsidian URI
  - `.md`（obsidianなし） → アプリ内Markdownエディタ
  - `.pdf` → **Mac**: ブラウザの別タブで開く / **Windows**: OSデフォルトアプリ
  - その他 → OSデフォルトアプリ（Preview、Excel等）
- 右クリックメニュー
- Markdownエディタモーダル（新規作成・編集）
- **戻る/進むボタン**: カーソル位置と選択状態も履歴と一緒に保存・復元

### FileSearch.tsx

ファイル検索コンポーネント（Everything風）。以下の機能を含む：

- **3つの検索モード**:
  - **Live**: リアルタイム検索（指定フォルダ以下を検索）
  - **Index**: インデックス検索（指定フォルダ以下を高速検索、階層指定対応）
  - **Index(ALL)**: 全インデックス検索（Everything風、全ての監視パスを検索）★デフォルト
- リアルタイム検索（デバウンス800ms、IME入力中は保留・確定時に即時実行）
- タイプフィルタボタン（全、F、D）でファイル/フォルダを絞り込み
- 検索階層の指定（+/-ボタンで調整、初期値1、0=無制限）
- 除外パターンの設定（node_modules, .git等、カンマ区切り）
- 各結果のパスコピー用アイコンボタンを追加
- フォルダ/ファイルの分離表示
- コンパクトなUI設計（検索ペインはウィンドウ幅の30%）
- 監視パス管理（追加/削除、スキャン状態表示）
- **日本語部分一致検索対応**（例: 「申告」→「確定申告.pdf」）

### 検索インデックス（外部サービス連携）

Index/Index(ALL)モードは外部の**File Index Service**に接続します。

**外部サービスリポジトリ**: `/Users/username/projects/file_index_service`

| 検索モード | 接続先 | 説明 |
|-----------|--------|------|
| Live | file_manager内部API | リアルタイムファイル検索 |
| Index | 外部サービス (port 8080) | 指定パス以下のインデックス検索 |
| Index(ALL) | 外部サービス (port 8080) | 全監視パスの検索（デフォルト） |

**接続設定:**
- サービスURL: `http://localhost:8080`（デフォルト）
- 設定場所: 検索ペインの設定ボタン（⚙️）→「インデックスサービスURL」
- 設定はlocalStorageに保存されます

**ステータス表示:**
- ● 準備完了 (ファイル数): サービス接続済み、インデックス準備完了
- ○ 準備中...: サービス接続済み、インデックス構築中
- ✕ 接続エラー: サービスに接続できない

**Windows環境での使用:**
- Windows版Everythingを使用する場合は、EverythingのHTTPサーバーを有効化
- ポート8080で起動し、このfile_managerから接続可能

**インデックス技術仕様:**
SQLite FTS5を使用した高速検索システム。クエリ長に応じて最適なインデックスを自動選択：

| クエリ長 | インデックス | 速度 | 説明 |
|---------|-------------|------|------|
| 3文字以上 | FTS5 trigram | ~0.03秒 | 日本語含む部分一致 |
| 2文字 | bigramテーブル | ~0.06秒 | 2文字ペア完全一致 |
| 1文字 | LIKE検索 | 遅い | フォールバック |

**関連ファイル（フロントエンド）:**
- `frontend/src/api/indexService.ts`: 外部サービスAPIクライアント
- `frontend/src/hooks/useFiles.ts`: 外部サービス用フック（useExternalIndexSearch等）
- `frontend/src/components/FileSearch.tsx`: 検索コンポーネント（モード切替対応）

### API エンドポイント

#### ファイル操作

| メソッド | パス | 説明 | 実装 |
|----------|------|------|------|
| GET | /api/files | ファイル一覧取得 | 済 |
| GET | /api/path-info | パス種別判定（ファイル/ディレクトリ） | 済 |
| GET | /api/search | ファイル検索 | 済 |
| DELETE | /api/delete/{path} | ゴミ箱に移動 | 済 |
| POST | /api/create-folder | フォルダ作成 | 済 |
| POST | /api/create-file | ファイル作成 | 済 |
| POST | /api/update-file | ファイル更新 | 済 |
| POST | /api/rename | リネーム | 済 |
| POST | /api/move | 移動 | 未 |
| POST | /api/copy | コピー | 未 |

#### インデックス管理（外部サービス）

インデックス管理APIは外部サービス（file_index_service）に移行しました。

| メソッド | パス | 説明 |
|----------|------|------|
| GET | http://localhost:8080/status | インデックス状態取得 |
| POST | http://localhost:8080/rebuild | インデックス再構築 |
| GET | http://localhost:8080/paths | 監視パス一覧 |
| POST | http://localhost:8080/paths | 監視パス追加 |
| DELETE | http://localhost:8080/paths?path=... | 監視パス削除 |

詳細は `/Users/username/projects/file_index_service/README.md` を参照。

## テスト実行

```bash
# バックエンド
cd backend
source .venv/bin/activate
PYTHONPATH=. pytest tests/ -v

# フロントエンド（未実装）
cd frontend
npm test
```

## セキュリティ考慮事項

- パストラバーサル対策: `normalize_path()`関数で実装
- CORS: 全オリジン許可（個人利用前提）
- 本番環境では適切なオリジン制限が必要

## 実装済み機能（更新）
 
 1. バックエンドAPI: 
    - ファイル操作: get, delete, create-folder, create-file, update-file, rename
    - **安全な移動 (Safe Move)**: コピー → 検証 → 削除 のプロセスによりデータ消失を防ぐ。並列コピー対応。
    - **一括操作**: move/batch, copy/batch (並列処理)
 2. ドラッグ&ドロップのバックエンド連携
 3. タイルビュー表示（未実装）
 4. ファイルアップロード (ダウンロードはネイティブ実装済)
 5. 外部アプリ連携: VSCode, Explorer, Antigravity, Download, Jupyter, Excalidraw, Markdown作成, Obsidian, **ゴミ箱**, **Test Folder**

## ドキュメント更新

変更時は以下を更新すること：

- `docs/architecture.md`: アーキテクチャ変更時
- `README.md`: 機能追加・セットアップ変更時
- `CLAUDE.md`: 開発方針変更時
- `docs/startup_scripts.md`: 起動スクリプトの仕様変更時
