# GET /api/open-path エンドポイントのテスト
# フォルダを指定した場合のリダイレクト先の動作を確認する

import pytest
from pathlib import Path
import urllib.parse

class TestOpenPath:
    """GET /api/open-path エンドポイントのテスト"""

    def test_open_path_directory_redirects_to_frontend(self, client, temp_dir, monkeypatch):
        """ディレクトリを指定した場合、フロントエンドにリダイレクトされる"""
        from app import config
        monkeypatch.setattr(config.settings, "_base_dir_override", temp_dir)

        path = str(temp_dir / "folder1")
        encoded_path = urllib.parse.quote(path)
        
        # TestClientはデフォルトでリダイレクトを追跡するが、
        # ここではリダイレクト先そのものを確認したいため follow_redirects=False にする
        response = client.get("/api/open-path", params={"path": path}, follow_redirects=False)

        assert response.status_code == 307
        location = response.headers["location"]
        
        # 将来的にホスト名に依存しない形式か、リクエスト時のホストを使用するようにしたい
        # ここでは相対パスでのリダイレクトを期待するように修正する
        assert location.startswith("/?path=") or location.startswith("./?path=")
        assert encoded_path in location


    def test_open_path_file_returns_html(self, client, temp_dir, monkeypatch):
        """ファイルを指定した場合、OSで開き、タブを閉じるためのHTMLを返す"""
        from app import config
        monkeypatch.setattr(config.settings, "_base_dir_override", temp_dir)

        path = str(temp_dir / "file1.txt")
        
        # open_path (subprocess.Popen) をモック化する必要がある
        # しかしまずはレスポンスがHTMLであることを確認
        response = client.get("/api/open-path", params={"path": path})

        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
        assert "window.close()" in response.text
