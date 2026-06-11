"""
ファイルI/Oタイムアウトおよび高速なパス正規化のテスト
- normalize_path がファイルシステムへ実在問い合わせ（I/O）を行わないことの検証
- パストラバーサル防止チェックの検証
- run_with_timeout がタイムアウト値超過時に 504 エラーを投げることの検証
"""
import pytest
import time
from fastapi import HTTPException
from pathlib import Path
from app.routers import files
from app import config

def test_normalize_path_does_not_access_filesystem():
    """normalize_path が実在しないパスを渡されてもフリーズせずに一瞬で返ることを検証"""
    # 存在しない絶対パス
    path_str = "/nonexistent/absolute/path/to/some/file"
    start_time = time.time()
    res = files.normalize_path(path_str)
    end_time = time.time()
    
    assert res == Path(path_str)
    # ファイルシステムへのタイムアウト待ちなどが発生せず、一瞬（0.05秒以下）で計算できること
    assert (end_time - start_time) < 0.05

def test_normalize_path_prevents_traversal():
    """相対パス指定時のパストラバーサル（ベースディレクトリ外へのアクセス）が正しく拒否されることを検証"""
    # config.settings.base_dir 外を指す相対パス
    with pytest.raises(HTTPException) as excinfo:
        files.normalize_path("../../etc/passwd")
    assert excinfo.value.status_code == 403
    assert "アクセスが拒否されました" in excinfo.value.detail

@pytest.mark.anyio
async def test_run_with_timeout_raises_timeout_error(monkeypatch):
    """処理が指定されたタイムアウト時間を超えた場合に 504 エラーになることを検証"""
    # apiTimeout設定を 0.1秒 にモック
    monkeypatch.setattr(config, "get_editor_preferences", lambda: {"apiTimeout": 0.1})
    
    def slow_func():
        # 0.5秒スリープする遅延処理
        time.sleep(0.5)
        return "success"

    with pytest.raises(HTTPException) as excinfo:
        await files.run_with_timeout(slow_func)
    
    assert excinfo.value.status_code == 504
    assert "タイムアウトしました" in excinfo.value.detail

@pytest.mark.anyio
async def test_run_with_timeout_succeeds_in_time(monkeypatch):
    """処理がタイムアウト時間内に終わる場合は通常通り結果が返ることを検証"""
    monkeypatch.setattr(config, "get_editor_preferences", lambda: {"apiTimeout": 0.5})
    
    def fast_func():
        return "fast_result"

    res = await files.run_with_timeout(fast_func)
    assert res == "fast_result"
