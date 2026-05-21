"""
Obsidian関連のAPIテスト
"""
from datetime import datetime

def test_get_obsidian_daily_path(client, tmp_path, monkeypatch):
    """
    今日のObsidianフォルダパス取得テスト
    """
    # モック用のディレクトリを作成
    test_base = tmp_path / "test_obsidian"
    test_base.mkdir(parents=True)
    
    # 環境変数を上書き
    monkeypatch.setenv("FILE_MANAGER_OBSIDIAN_BASE_DIR", str(test_base))
    
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
    
