"""
アプリケーション設定
- ベースディレクトリの設定（環境変数 FILE_MANAGER_BASE_DIR で指定）
- OS判定とパス正規化
- UI設定ファイルの読み書き

注: インデックス検索機能は外部サービス（file_index_service）に移行
"""
import json
import os
import platform
from pathlib import Path
from typing import Literal, Optional

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

# .envファイルを読み込み（存在する場合）
# スクリプト実行ディレクトリまたはbackendディレクトリの.envを探す
_env_file = Path(__file__).parent.parent / ".env"
if _env_file.exists():
    load_dotenv(_env_file)


class Settings(BaseSettings):
    """アプリケーション設定"""

    model_config = SettingsConfigDict(
        env_prefix="FILE_MANAGER_",
        extra="ignore",
    )

    # サーバー設定
    host: str = "127.0.0.1"
    port: int = 8010
    fulltext_service_url: str = "http://127.0.0.1:8079"
    fulltext_refresh_window_minutes: int = 60

    # OS判定
    is_windows: bool = platform.system() == "Windows"

    # テスト用のベースディレクトリオーバーライド
    _base_dir_override: Optional[Path] = None
    _preferences_file_override: Optional[Path] = None

    @property
    def base_dir(self) -> Path:
        """ベースディレクトリを取得"""
        if self._base_dir_override is not None:
            return self._base_dir_override

        # 環境変数で指定されている場合はそれを使用
        env_val = os.environ.get("FILE_MANAGER_BASE_DIR")
        if env_val:
            return Path(env_val)

        # フォールバック: OSに応じたデフォルト
        # Windows: USERPROFILEをルート（制限範囲）とする
        if self.is_windows:
            user_profile = os.environ.get("USERPROFILE")
            if user_profile:
                return Path(user_profile)
            return Path.home()
        # macOS/Linux: HOMEをルートとする
        return Path.home()

    @property
    def start_dir(self) -> Path:
        """初期表示ディレクトリを取得"""
        # 環境変数で指定されている場合はそれを使用
        env_val = os.environ.get("FILE_MANAGER_START_DIR")
        if env_val:
            return Path(env_val)
            
        # FILE_MANAGER_BASE_DIR が設定されている場合はそれをそのまま使用
        if os.environ.get("FILE_MANAGER_BASE_DIR"):
            return self.base_dir

        # デフォルトは base_dir/000_work (Windows) または base_dir/Documents
        if self.is_windows:
             return self.base_dir / "000_work"
        return self.base_dir


    @property
    def obsidian_base_dir(self) -> Path:
        """Obsidianのベースディレクトリを取得"""
        # 環境変数で指定されている場合はそれを使用
        env_val = os.environ.get("FILE_MANAGER_OBSIDIAN_BASE_DIR")
        if env_val:
            return Path(env_val)

        # デフォルト設定（ユーザー指定のパスを参考）
        if self.is_windows:
            # Windows版のデフォルト（例: D:\obsidian-dagnetz\01_data など、環境に合わせて変更可能）
            # ここでは暫定的に base_dir / "obsidian-dagnetz" / "01_data" とする
            return self.base_dir / "obsidian-dagnetz" / "01_data"
        else:
            # macOS版のデフォルト
            return Path("/Users/mine/000_work/obsidian-dagnetz/01_data")

    @property
    def preferences_file_path(self) -> Path:
        """UI設定を保存するJSONファイルのパスを取得"""
        if self._preferences_file_override is not None:
            return self._preferences_file_override

        env_val = os.environ.get("FILE_MANAGER_PREFERENCES_FILE")
        if env_val:
            return Path(env_val)

        return Path(__file__).parent.parent / "settings.json"


TextFileOpenMode = Literal["web", "vscode"]
MarkdownOpenMode = Literal["web", "external"]

DEFAULT_EDITOR_PREFERENCES = {
    "textFileOpenMode": "web",
    "markdownOpenMode": "web",
}


def _normalize_text_file_open_mode(value: object) -> TextFileOpenMode:
    if value == "vscode":
        return "vscode"
    return "web"


def _normalize_markdown_open_mode(value: object) -> MarkdownOpenMode:
    if value in {"external", "obsidian", "vscode"}:
        return "external"
    return "web"


def get_editor_preferences() -> dict[str, str]:
    """UI設定ファイルからエディタ設定を読み込む"""
    path = settings.preferences_file_path

    try:
        if path.exists():
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return {
                    "textFileOpenMode": _normalize_text_file_open_mode(data.get("textFileOpenMode")),
                    "markdownOpenMode": _normalize_markdown_open_mode(data.get("markdownOpenMode")),
                }
    except (OSError, json.JSONDecodeError):
        pass

    return DEFAULT_EDITOR_PREFERENCES.copy()


def save_editor_preferences(
    text_file_open_mode: TextFileOpenMode,
    markdown_open_mode: MarkdownOpenMode,
) -> dict[str, str]:
    """UI設定ファイルへエディタ設定を書き込む"""
    path = settings.preferences_file_path
    path.parent.mkdir(parents=True, exist_ok=True)

    preferences = {
        "textFileOpenMode": _normalize_text_file_open_mode(text_file_open_mode),
        "markdownOpenMode": _normalize_markdown_open_mode(markdown_open_mode),
    }
    path.write_text(
        json.dumps(preferences, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return preferences


settings = Settings()
