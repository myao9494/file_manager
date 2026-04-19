"""
設定APIのテスト
エディタ設定の取得・保存と設定ファイル反映を確認する
"""
from pathlib import Path


class TestConfigApi:
    """/api/config 系エンドポイントのテスト"""

    def test_get_config_returns_editor_preferences(self, client, temp_dir, monkeypatch):
        """設定ファイルのエディタ設定を取得できる"""
        from app import config

        preferences_path = temp_dir / "settings.json"
        preferences_path.write_text(
            '{\n  "textFileOpenMode": "vscode",\n  "markdownOpenMode": "external"\n}\n',
            encoding="utf-8",
        )

        monkeypatch.setattr(config.settings, "_base_dir_override", temp_dir)
        monkeypatch.setattr(config.settings, "_preferences_file_override", preferences_path)

        response = client.get("/api/config")

        assert response.status_code == 200
        data = response.json()
        assert data["textFileOpenMode"] == "vscode"
        assert data["markdownOpenMode"] == "external"

    def test_update_editor_preferences_saves_settings_file(self, client, temp_dir, monkeypatch):
        """エディタ設定更新で設定ファイルへ保存される"""
        from app import config

        preferences_path = temp_dir / "settings.json"

        monkeypatch.setattr(config.settings, "_base_dir_override", temp_dir)
        monkeypatch.setattr(config.settings, "_preferences_file_override", preferences_path)

        response = client.post(
            "/api/config/preferences",
            json={
                "textFileOpenMode": "vscode",
                "markdownOpenMode": "external",
            },
        )

        assert response.status_code == 200
        assert response.json()["textFileOpenMode"] == "vscode"
        assert response.json()["markdownOpenMode"] == "external"
        assert preferences_path.exists()
        saved = preferences_path.read_text(encoding="utf-8")
        assert '"textFileOpenMode": "vscode"' in saved
        assert '"markdownOpenMode": "external"' in saved
