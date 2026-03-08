# Obsidian 今日のフォルダ連携

## 概要
Obsidianのデイリーノート用フォルダ（YYYY/MM/DD形式）をこのアプリケーションで直接開くための機能です。
フォルダが存在しない場合は、バックエンド側で自動的に作成されます。

## 使用方法
ツールバーにある Obsidian のアイコン（紫色のロゴ）をクリックすることで、今日のフォルダへ移動します。

## 設定
環境ごとにObsidianのベースディレクトリが異なるため、`.env` ファイルで設定可能です。

### 設定項目
- `FILE_MANAGER_OBSIDIAN_BASE_DIR`: Obsidianのデータフォルダ（`01_data` 等）への絶対パス。

### 設定例 (macOS)
```env
FILE_MANAGER_OBSIDIAN_BASE_DIR=/Users/mine/000_work/obsidian-dagnetz/01_data
```

### 設定例 (Windows)
```env
FILE_MANAGER_OBSIDIAN_BASE_DIR=D:\obsidian-dagnetz\01_data
```

## 技術仕様
- **API**: `GET /api/obsidian/daily-path`
- **フォルダ構造**: `{obsidian_base_dir}/{YYYY}/{MM}/{DD}`
- **動作**: 
    1. 現在の日付を取得。
    2. 設定されたベースディレクトリ配下に `YYYY/MM/DD` 形式でパスを構築。
    3. `os.makedirs(exist_ok=True)` を用いて、親フォルダを含め作成。
    4. 作成されたフルパスをフロントエンドに返し、フロントエンド側でそのパスに移動する。
