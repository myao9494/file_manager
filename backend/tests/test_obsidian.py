"""
Obsidian関連のAPIテスト
"""
import pytest
from fastapi.testclient import TestClient
from pathlib import Path
from app.main import app
from app.config import settings
import os
import shutil
from datetime import datetime

client = TestClient(app)

def test_get_obsidian_daily_path():
    """
    今日のObsidianフォルダパス取得テスト
    """
    # モック用のディレクトリを作成
    test_base = Path("/tmp/test_obsidian")
    if test_base.exists():
        shutil.rmtree(test_base)
    test_base.mkdir(parents=True)
    
    # 環境変数を上書き
    os.environ["FILE_MANAGER_OBSIDIAN_BASE_DIR"] = str(test_base)
    
    # API呼び出し
    response = client.get("/api/obsidian/daily-path")
    assert response.status_code == 200
    
    data = response.json()
    assert "path" in data
    
    # パスが正しいか確認
    now = datetime.now()
    expected_path = test_base / now.strftime("%Y/%m/%d")
    assert data["path"] == expected_path.as_posix()
    
    # フォルダが作成されているか確認
    assert expected_path.exists()
    assert expected_path.is_dir()
    
    # クリーンアップ
    shutil.rmtree(test_base)
    del os.environ["FILE_MANAGER_OBSIDIAN_BASE_DIR"]
