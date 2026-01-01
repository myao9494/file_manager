"""
アプリケーション設定
- ベースディレクトリの設定（環境変数 FILE_MANAGER_BASE_DIR で指定）
- OS判定とパス正規化

注: インデックス検索機能は外部サービス（file_index_service）に移行
"""
import os
import platform
from pathlib import Path
from typing import Optional

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
    host: str = "0.0.0.0"
    port: int = 8001

    # OS判定
    is_windows: bool = platform.system() == "Windows"

    # テスト用のベースディレクトリオーバーライド
    _base_dir_override: Optional[Path] = None

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
        if self.is_windows:
            user_profile = os.environ.get("USERPROFILE")
            if user_profile:
                return Path(user_profile) / "Documents"
            return Path.home() / "Documents"
        return Path.home() / "Documents"


settings = Settings()
