# アーキテクチャ設計書

## 概要

React + FastAPIによる軽量ファイルマネージャー。個人利用・VPN内利用を前提とした用途特化UI。
3ペイン構成（左パネル + 中央パネル + 検索パネル、比率35:35:30）で、ドラッグ&ドロップによるファイル操作とEverything風の高速検索をサポート。

**注**: インデックス検索機能は外部サービス（file_index_service:8080）に分離されています。

## システム構成

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          Frontend (React + Vite)                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                            App.tsx (3-pane)                              │ │
│  │  ┌────────────┐  ┌────────────┐  ┌───────────────────────────────────┐ │ │
│  │  │ Left Pane  │  │Center Pane │  │      Search Pane (30%)            │ │ │
│  │  │  (35%)     │  │  (35%)     │  │  ┌─────────────────────────────┐  │ │ │
│  │  │  FileList  │  │  FileList  │  │  │      FileSearch             │  │ │ │
│  │  │ - Toolbar  │  │ - Toolbar  │  │  │  - Type filters (全/F/D)    │  │ │ │
│  │  │ - Search   │  │ - Search   │  │  │  - Depth control (+/-)     │  │ │ │
│  │  │ - Filter   │  │ - Filter   │  │  │  │  - Regex toggle (.*ボタン)  │  │ │ │
│  │  │ - Table    │  │ - Table    │  │  │  - Real-time search        │  │ │ │
│  │  └────────────┘  └────────────┘  │  │  - Results table           │  │ │ │
│  │                                   │  └─────────────────────────────┘  │ │ │
│  │                                   └───────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                        │
│  ┌───────────────────────────────────▼──────────────────────────────────────┐│
│  │                          TanStack Query                                   ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ ││
│  │  │  useFiles    │  │ useDelete    │  │useCreateFolder│ │useSearchFiles│││
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘ ││
│  └──────────────────────────────────────────────────────────────────────────┘│
│                          │                              │                     │
│  ┌───────────────────────▼────────────────┐  ┌──────────▼──────────────────┐│
│  │   API Client (files.ts)                │  │ API Client (indexService.ts)││
│  │   http://localhost:8001/api            │  │ http://localhost:8080/      ││
│  └────────────────────────────────────────┘  └─────────────────────────────┘│
└───────────────────────┬──────────────────────────────────┬───────────────────┘
                        │ HTTP (CORS)                      │ HTTP
                        ▼                                  ▼
        ┌───────────────────────────────┐  ┌──────────────────────────────────┐
        │  Backend (FastAPI:8001)       │  │ file_index_service (FastAPI:8080)│
        │  ┌─────────────────────────┐  │  │  - Everything互換API             │
        │  │      main.py            │  │  │  - SQLite FTS5インデックス       │
        │  │  - CORS middleware      │  │  │  - ファイル監視（watchdog）      │
        │  │  - Router mounting      │  │  │  - 並列スキャナー                │
        │  └─────────────────────────┘  │  └──────────────────────────────────┘
        │              │                 │                  │
        │  ┌───────────▼──────────────┐ │                  │
        │  │   routers/files.py       │ │                  │
        │  │  - GET /files (一覧)     │ │                  │
        │  │  - GET /search (Live)    │ │                  │
        │  │  - DELETE /delete        │ │                  │
        │  │  - POST /create-folder   │ │                  │
        │  │  - POST /rename          │ │                  │
        │  └──────────────────────────┘ │                  │
        │              │                 │                  │
        │  ┌───────────▼──────────────┐ │                  │
        │  │      config.py           │ │                  │
        │  │  - BASE_DIR設定          │ │                  │
        │  │  - ポート設定 (8001)     │ │                  │
        │  └──────────────────────────┘ │                  │
        └───────────────┬────────────────┘                  │
                        │                                   │
                        ▼                                   ▼
            ┌──────────────────────┐          ┌──────────────────────┐
            │   File System        │◄─────────│   File System        │
            │   (BASE_DIR)         │  監視     │   (Watch Paths)      │
            │ /Users/.../projects  │          │                      │
            └──────────────────────┘          └──────────────────────┘
```

## ディレクトリ構造

```
file_manager/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPIアプリ（CORS設定込み）
│   │   ├── config.py            # 設定（ポート8001）
│   │   └── routers/
│   │       ├── __init__.py
│   │       └── files.py         # ファイル操作API（Live検索含む）
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── conftest.py          # テストフィクスチャ
│   │   └── test_files_api.py    # ファイルAPIテスト
│   ├── .venv/                   # Python仮想環境
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── files.ts         # 内部API（port 8001）
│   │   │   └── indexService.ts  # 外部サービスAPI（port 8080）
│   │   ├── components/
│   │   │   ├── FileList.tsx     # メインコンポーネント
│   │   │   ├── FileList.css
│   │   │   ├── FileSearch.tsx   # ファイル検索（Everything風）
│   │   │   ├── FileSearch.css
│   │   │   ├── FilterBar.tsx    # フィルタバー
│   │   │   ├── FilterBar.css
│   │   │   ├── ContextMenu.tsx  # 右クリックメニュー
│   │   │   ├── ContextMenu.css
│   │   │   ├── FileIcon.tsx     # ファイルタイプアイコン
│   │   │   ├── Toast.tsx        # トースト通知
│   │   │   └── ErrorBoundary.tsx # エラー境界
│   │   ├── hooks/
│   │   │   ├── useFiles.ts      # カスタムフック
│   │   │   └── useToast.ts      # トースト管理フック
│   │   ├── types/
│   │   │   └── file.ts          # 型定義
│   │   ├── utils/
│   │   │   └── iconMapping.ts   # アイコンマッピング
│   │   ├── App.tsx              # 3ペインレイアウト（35:35:30）
│   │   ├── App.css
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
│
├── docs/
│   ├── architecture.md          # このファイル
│   ├── startup_scripts.md       # 起動スクリプト
│   └── ui_enhancements.md       # UI機能拡張
│
├── CLAUDE.md                    # 開発ガイドライン
└── README.md
```

## コンポーネント設計

### App.tsx - 3ペインレイアウト

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Header: File Manager [🍔] [☀/🌙]                                         │
├────────────────────┬────────────────────┬──────────────────────────────────┤
│   Left Pane (35%)  │  Center Pane (35%) │   Search Pane (30%)              │
│   (FileList)       │   (FileList)       │   (FileSearch)                   │
│                    │                    │                                  │
│ ┌────────────────┐ │ ┌────────────────┐ │ ┌──────────────────────────────┐ │
│ │ Toolbar        │ │ │ Toolbar        │ │ │ [OFF][Live][Index(Left)]...  │ │
│ ├────────────────┤ │ ├────────────────┤ │ ├──────────────────────────────┤ │
│ │ Current Path   │ │ │ Current Path   │ │ │ 🔍 キーワード検索            │ │
│ ├────────────────┤ │ ├────────────────┤ │ │ 📄 ファイル名フィルタ [.*]   │ │
│ │ Search Bar     │ │ │ Search Bar     │ │ ├──────────────────────────────┤ │
│ ├────────────────┤ │ ├────────────────┤ │ │ [全][F][D] [-][∞][+]         │ │
│ │ Filter Bar     │ │ │ Filter Bar     │ │ ├──────────────────────────────┤ │
│ ├────────────────┤ │ ├────────────────┤ │ ├──────────────────────────────┤ │
│ │                │ │ │                │ │ │ Results: 45 files            │ │
│ │  File Table    │ │ │  File Table    │ │ │ 📁 folder1    -    2024/12   │ │
│ │ (folders first)│ │ │ (folders first)│ │ │ 📁 folder2    -    2024/12   │ │
│ │                │ │ │                │ │ │ 📄 file1.txt  12KB 2024/12   │ │
│ └────────────────┘ │ └────────────────┘ │ └──────────────────────────────┘ │
└────────────────────┴────────────────────┴──────────────────────────────────┘
```

**URLパラメータ対応:**

- `?path=/absolute/path` でフォルダを指定可能
- ファイルパスが指定された場合は親フォルダにリダイレクト
- URLデコード処理により、WindowsのUNCパス（`\\server\share`）も対応
- パラメータがない場合のデフォルト: `/Users/username/projects`

**ハンバーガーメニュー:**

- テーマ切り替え（Light/Dark）
- ストレージリセット（localStorage初期化）

**注**: インデックス再構築は外部サービス（file_index_service:5174）のUIで実行します。

### FileList.tsx - ツールバーアイコン

file_viewer/templates/base.htmlに準拠したアイコン配置：

| アイコン | 機能 | 実装状況 |
|----------|------|----------|
| ChevronUp | 上の階層へ移動 | 実装済み |
| ClipboardPaste | クリップボードから開く | 実装済み |
| Download | ダウンロード | 未実装 |
| Code | VSCodeで開く | 未実装 |
| Pencil | Codeで開く | 未実装 |
| FolderOpen | フォルダを開く | 未実装 |
| BookOpen | Jupyterで開く | 未実装 |
| Pentagon | Excalidrawで開く | 未実装 |
| FileText | Markdownファイル作成 | 未実装 |
| Square | サーバーを停止 | 未実装 |
| Info | ステータスを確認 | 未実装 |
| Gem | Obsidianで開く | 未実装 |
| FolderPlus | フォルダ作成 | 実装済み |
| Trash2 | 削除 | 実装済み |
| RefreshCw | 更新 | 実装済み |

## API設計

### 内部API（file_manager:8001）

#### GET /api/files

ファイル一覧を取得

**パラメータ:**
- `path` (string, optional): ディレクトリパス
  - 絶対パス: そのまま使用（Windows UNCパス `\\server\share` を含む）
  - 相対パス: ベースディレクトリからの相対パスとして扱う
  - 空文字: ベースディレクトリ

**レスポンス:**
```json
{
  "type": "directory",
  "path": "/absolute/path/to/current",
  "items": [
    {
      "name": "folder1",
      "type": "directory",
      "path": "/absolute/path/to/folder1"
    },
    {
      "name": "file1.txt",
      "type": "file",
      "path": "/absolute/path/to/file1.txt",
      "size": 1024,
      "modified": "2025-01-01T12:00:00"
    }
  ]
}
```

#### GET /api/path-info

パスの種別を判定（ファイル/ディレクトリ/存在しない）

**パラメータ:**
- `path` (string): 確認するパス

**レスポンス:**
```json
{
  "path": "/absolute/path",
  "type": "file",  // "file" | "directory" | "not_found"
  "parent": "/absolute"  // typeが"file"の場合のみ
}
```

#### GET /api/search

ファイル検索（Liveモード - ディレクトリ走査）

**パラメータ:**
- `path` (string): 検索開始ディレクトリ
- `query` (string): 検索クエリ（ファイル名の部分一致、大文字小文字を区別しない）
- `depth` (int, default=0): 検索階層（0=無制限、1=現在のディレクトリのみ）
- `ignore` (string, default=""): 除外パターン（カンマ区切り、例: "node_modules,*.pyc,.git"）
- `max_results` (int, default=1000): 最大結果数（最大10000）
- `file_type` (string, default="all"): ファイルタイプフィルタ（all/file/directory）

**レスポンス:**
```json
{
  "query": "test",
  "path": "/search/base/path",
  "depth": 0,
  "total": 45,
  "items": [
    {
      "name": "test_folder",
      "type": "directory",
      "path": "/absolute/path/to/test_folder",
      "modified": "2024-12-01T12:00:00"
    },
    {
      "name": "test.txt",
      "type": "file",
      "path": "/absolute/path/to/test.txt",
      "size": 1024,
      "modified": "2024-12-01T12:00:00"
    }
  ]
}
```

#### DELETE /api/delete

ファイル/フォルダを削除

**リクエストボディ:**
```json
{
  "path": "/path/to/item"
}
```

**レスポンス:**
```json
{
  "status": "success",
  "message": "削除しました: /path/to/item"
}
```

#### POST /api/create-folder

フォルダを作成

**リクエストボディ:**
```json
{
  "path": "/parent/folder",
  "name": "new_folder"
}
```

**レスポンス:**
```json
{
  "status": "success",
  "message": "フォルダを作成しました: /parent/folder/new_folder"
}
```

#### POST /api/rename

ファイル/フォルダをリネーム

**リクエストボディ:**
```json
{
  "old_path": "/path/to/old_name",
  "new_name": "new_name"
}
```

**レスポンス:**
```json
{
  "status": "success",
  "message": "リネームしました: /path/to/old_name → /path/to/new_name"
}
```

### 外部API（file_index_service:8080）

詳細は [file_index_service](../file_index_service/README.md) を参照。

#### GET /?search=...&json=1

Everything互換検索API

**主要パラメータ:**
- `search` (or `s`, `q`): 検索クエリ
- `json`: JSON形式（1=有効）
- `count` (or `c`): 最大結果数
- `offset` (or `o`): 結果オフセット
- `path`: 検索対象パス（拡張）
- `file_type`: ファイルタイプフィルタ（拡張）

#### GET /status

インデックスサービスの状態取得

#### GET /paths

監視パス一覧取得

#### POST /paths

監視パス追加

#### DELETE /paths?path=...

監視パス削除

#### POST /rebuild

インデックス再構築

## セキュリティ

### パストラバーサル対策

`routers/files.py`の`normalize_path()`関数で実装：

- `..` を含むパスの検出・拒否
- ベースディレクトリ外へのアクセス防止
- HTTPException 403で拒否

### CORS設定

個人利用・VPN内利用を前提とし、全オリジンからのアクセスを許可。
本番環境で使用する場合は適切なオリジン制限が必要。

## 技術スタック

### フロントエンド
- React 19+
- TypeScript
- Vite 7+
- TanStack Query (データフェッチング)
- Lucide React (アイコン)

### バックエンド
- Python 3.10+
- FastAPI
- uvicorn
- Pydantic (設定管理)
- pathlib / shutil (ファイル操作)

### 外部サービス（file_index_service）
- Python 3.10+
- FastAPI
- SQLite FTS5 (全文検索インデックス)
- watchdog (ファイル監視)

## ポート設定

| サービス | ポート |
|----------|--------|
| Backend (FastAPI) | 8001 |
| Frontend (Vite dev) | 5173 |
| file_index_service (FastAPI) | 8080 |
| file_index_service (Vite dev) | 5174 |

## テスト

### バックエンドテスト

```bash
cd backend
source .venv/bin/activate
PYTHONPATH=. pytest tests/ -v
```

テストケース：
1. ルートディレクトリ一覧取得
2. アイテム構造の検証
3. ネストされたディレクトリのナビゲーション
4. 存在しないパスで404エラー
5. パストラバーサル攻撃の防止
6. ファイルパス指定時の親ディレクトリ表示

## ファイル検索（Everything風）

### 実装済み機能

- **3つの検索モード**:
  - **Live**: リアルタイム検索（指定フォルダ以下を検索）
  - **Index**: インデックス検索（指定フォルダ以下を高速検索、階層指定対応）
  - **Index(ALL)**: 全インデックス検索（Everything風、全ての監視パスを検索）★デフォルト
- **リアルタイム検索**: デバウンス800msで快適な検索体験、IME入力対応
- **タイプフィルタ**: ボタンで全/ファイル/フォルダを切り替え
- **階層制御**: +/-ボタンで検索深度を調整（0=無制限）
- **除外パターン**: カンマ区切りで複数パターン指定（例: node_modules,.git,*.pyc）
- **監視パス管理**: 追加/削除、スキャン状態表示
- **結果表示**: フォルダ→ファイルの順で表示、パスコピー用アイコンボタン
- **コンパクトUI**: ウィンドウ幅の30%を使用、最小限のスペースで最大の機能
- **日本語部分一致**: 日本語ファイル名の部分一致検索に対応（例: 「申告」→「確定申告.pdf」）

### 検索インデックス

外部サービス（file_index_service）がSQLite FTS5を使用した高速検索システムを提供：

| クエリ長 | インデックス | 速度 | 説明 |
|---------|-------------|------|------|
| 3文字以上 | FTS5 trigram | ~0.03秒 | 日本語含む部分一致 |
| 2文字 | bigramテーブル | ~0.06秒 | 2文字ペア完全一致 |
| 1文字 | LIKE検索 | 遅い | フォールバック |

360,000+ファイルでの高速検索を実現。

## ドラッグ&ドロップ

### 現在の実装

- フロントエンドでのドラッグ&ドロップUI
- ドラッグ中のビジュアルフィードバック
- フォルダへのドロップハイライト

### 未実装

- バックエンドのmove API
- 実際のファイル移動処理
