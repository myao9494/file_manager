"""
ファイル一覧APIのテスト
TDD: まずテストを作成し、失敗を確認してから実装を進める
"""
import pytest
from pathlib import Path


class TestGetFiles:
    """GET /api/files エンドポイントのテスト"""

    def test_get_files_returns_directory_type(self, client, temp_dir, monkeypatch):
        """ディレクトリを指定した場合、type: "directory"を返す"""
        # 一時ディレクトリをベースディレクトリとして設定
        from app import config
        monkeypatch.setattr(config.settings, "_base_dir_override", temp_dir)

        response = client.get("/api/files", params={"path": ""})

        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "directory"
        assert "items" in data

    def test_get_files_lists_folders_and_files(self, client, temp_dir, monkeypatch):
        """フォルダとファイルの一覧を取得できる"""
        from app import config
        monkeypatch.setattr(config.settings, "_base_dir_override", temp_dir)

        response = client.get("/api/files", params={"path": ""})

        assert response.status_code == 200
        data = response.json()
        items = data["items"]

        # フォルダとファイルが含まれている
        names = [item["name"] for item in items]
        assert "folder1" in names
        assert "folder2" in names
        assert "file1.txt" in names
        assert "file2.md" in names

    def test_get_files_item_structure(self, client, temp_dir, monkeypatch):
        """各アイテムが必要な情報を持っている"""
        from app import config
        monkeypatch.setattr(config.settings, "_base_dir_override", temp_dir)

        response = client.get("/api/files", params={"path": ""})

        data = response.json()
        items = data["items"]

        # フォルダの構造確認
        folder = next(item for item in items if item["name"] == "folder1")
        assert folder["type"] == "directory"
        assert "path" in folder

        # ファイルの構造確認
        file = next(item for item in items if item["name"] == "file1.txt")
        assert file["type"] == "file"
        assert "path" in file
        assert "size" in file
        assert "modified" in file

    def test_get_files_nested_directory(self, client, temp_dir, monkeypatch):
        """ネストしたディレクトリの内容を取得できる"""
        from app import config
        monkeypatch.setattr(config.settings, "_base_dir_override", temp_dir)

        response = client.get("/api/files", params={"path": "folder1"})

        assert response.status_code == 200
        data = response.json()
        items = data["items"]

        names = [item["name"] for item in items]
        assert "nested.txt" in names

    def test_get_files_nonexistent_path(self, client, temp_dir, monkeypatch):
        """存在しないパスは404を返す"""
        from app import config
        monkeypatch.setattr(config.settings, "_base_dir_override", temp_dir)

        response = client.get("/api/files", params={"path": "nonexistent"})

        assert response.status_code == 404

    def test_get_files_prevents_path_traversal(self, client, temp_dir, monkeypatch):
        """パストラバーサル攻撃を防ぐ"""
        from app import config
        monkeypatch.setattr(config.settings, "_base_dir_override", temp_dir)

        response = client.get("/api/files", params={"path": "../../../etc"})

        # 403: ベースディレクトリ外へのアクセス拒否
        assert response.status_code == 403
    def test_get_files_with_file_path_returns_parent_directory(self, client, temp_dir, monkeypatch):
        """ファイルパスを指定した場合、その親ディレクトリの内容を返す"""
        from app import config
        monkeypatch.setattr(config.settings, "_base_dir_override", temp_dir)

        # 実在するファイルパスを指定
        file_path = "file1.txt"
        response = client.get("/api/files", params={"path": file_path})

        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "directory"
        # pathフィールドが含まれ、親ディレクトリ（この場合はベースディレクトリ）を指していること
        assert "path" in data
        assert Path(data["path"]).resolve() == temp_dir.resolve()
        
        # アイテム一覧にそのファイルが含まれていること
        names = [item["name"] for item in data["items"]]
        assert "file1.txt" in names

    def test_get_files_response_includes_path(self, client, temp_dir, monkeypatch):
        """レスポンスに現在のパスが含まれている"""
        from app import config
        monkeypatch.setattr(config.settings, "_base_dir_override", temp_dir)

        response = client.get("/api/files", params={"path": "folder1"})

        assert response.status_code == 200
        data = response.json()
        assert "path" in data
        assert Path(data["path"]).suffix == "" # フォルダ名
        assert str(Path(data["path"]).name) == "folder1"

import zipfile

class TestUnzipFile:
    """POST /api/files/unzip エンドポイントのテスト"""

    def test_unzip_creates_directory_and_extracts_files(self, client, temp_dir, monkeypatch):
        """zipファイルを解凍できること"""
        from app import config
        monkeypatch.setattr(config.settings, "_base_dir_override", temp_dir)

        zip_path = temp_dir / "test.zip"
        with zipfile.ZipFile(zip_path, "w") as zf:
            zf.writestr("test_in_zip.txt", "hello zip")
            zf.writestr("folder_in_zip/nested.txt", "nested zip")

        response = client.post("/api/unzip", json={"path": "test.zip"})
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        
        extract_dir = temp_dir / "test"
        assert extract_dir.exists()
        assert extract_dir.is_dir()
        assert (extract_dir / "test_in_zip.txt").exists()
        assert (extract_dir / "folder_in_zip" / "nested.txt").exists()

    def test_unzip_nonexistent_file(self, client, temp_dir, monkeypatch):
        """存在しないzipファイルの解凍はエラーになること"""
        from app import config
        monkeypatch.setattr(config.settings, "_base_dir_override", temp_dir)

        response = client.post("/api/unzip", json={"path": "not_exist.zip"})
        assert response.status_code == 404

    def test_unzip_not_a_zip_file(self, client, temp_dir, monkeypatch):
        """zipファイルでない場合の解凍はエラーになること"""
        from app import config
        monkeypatch.setattr(config.settings, "_base_dir_override", temp_dir)

        response = client.post("/api/unzip", json={"path": "file1.txt"})
        assert response.status_code == 400

