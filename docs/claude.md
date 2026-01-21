# 開発仕様書

## 概要
ファイルマネージャの仕様をまとめる。

## 基本方針
- 言語: 日本語
- テスト駆動開発(TDD)推奨
- ドキュメントは `docs/` に集約

## 機能仕様
### フォルダ履歴
- 履歴はバックエンド `folder_history.json` に保存する。
- 最大300件まで保持する。
- アプリケーション起動時にバックエンドから履歴を読み込む。
- **起動時の競合対策**:
    - 起動直後のフォルダ移動（`addToHistory`）と、初期ロード（`fetchHistory`）が競合しないように制御する。
    - 読み込み完了まで（`isInitialized`がfalseの間）は、`addToHistory`等によるバックエンドへの保存をスキップする。
    - 読み込み完了時に、ローカルで追加された履歴とバックエンドの履歴をマージし、バックエンドに保存し直す。

### 環境設定 (Frontend)
- `frontend/src/config.ts` の `getNetworkDrivePath` は環境変数 `.env` を参照する。
- 以下の変数が定義されている場合、その値を使用する。
    - `VITE_NETWORK_DRIVE_PATH_WINDOWS`: Windows用のパス
    - `VITE_NETWORK_DRIVE_PATH_MAC`: macOS/Linux用のパス
- 定義されていない場合はデフォルト値を使用する。
