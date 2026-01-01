# 外部連携 (file_viewer Integration)

このアプリケーション (`file_manager`) は、一部の機能について既存の `file_viewer` アプリケーションと連携しています。

## 連携の概要

`file_manager` のフロントエンドから、ローカルホスト上の `file_viewer` (Port 5001) のAPIを呼び出すことで機能を実現しています。

### ダウンロード機能

ファイルリストからファイルを選択して「ダウンロード」ボタンを押すと、以下のエンドポイントを使用してファイルをダウンロードします。

- **Endpoint**: `http://localhost:5001/download-fullpath`
- **Method**: `GET`
- **Query Param**: `path` (フルパス)

この機能を使用するためには、`file_viewer` 側に `/download-fullpath` エンドポイントが実装されている必要があります。

### VS Codeで開く

ファイルリストからファイルまたはフォルダを選択して「VSCodeで開く」ボタンを押すと、以下のエンドポイントを使用します。

- **Endpoint**: `http://localhost:5001/open-in-code`
- **Method**: `POST`
- **Body**: `{ "path": "..." }`

## 前提条件

- `file_viewer` が `http://localhost:5001` で起動していること。
- `file_viewer` がローカルマシン上で動作しており、`file_manager` と同じファイルシステムにアクセスできること（フルパスを使用するため）。
