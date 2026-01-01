"""
テスト用のフィクスチャと共通設定
"""
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    """テスト用のFastAPIクライアント"""
    return TestClient(app)


@pytest.fixture
def temp_dir():
    """テスト用の一時ディレクトリを作成"""
    with tempfile.TemporaryDirectory() as tmpdir:
        # テスト用のファイルとフォルダを作成
        test_dir = Path(tmpdir)

        # フォルダ作成
        (test_dir / "folder1").mkdir()
        (test_dir / "folder2").mkdir()

        # ファイル作成
        (test_dir / "file1.txt").write_text("test content 1")
        (test_dir / "file2.md").write_text("# Markdown")
        (test_dir / "folder1" / "nested.txt").write_text("nested content")

        yield test_dir
