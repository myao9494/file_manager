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


class TestFullPath:
    """GET /api/fullpath エンドポイントのテスト"""

    def test_fullpath_obsidian_file_returns_html_instead_of_json(self, client, temp_dir, monkeypatch):
        """Obsidian対象ファイルでは専用アプリを起動しつつ、JSONではなくタブを閉じるHTMLを返す"""
        from app import config
        from app.routers import files

        obsidian_dir = temp_dir / "obsidian-vault" / "2026" / "03" / "14"
        obsidian_dir.mkdir(parents=True)
        note_path = obsidian_dir / "note.md"
        note_path.write_text("# note\n", encoding="utf-8")

        monkeypatch.setattr(config.settings, "_base_dir_override", temp_dir)
        monkeypatch.setattr(files.platform, "system", lambda: "Darwin")

        popen_calls = []
        monkeypatch.setattr(files.subprocess, "Popen", lambda args: popen_calls.append(args))

        response = client.get(
            "/api/fullpath",
            params={"path": str(note_path)},
            headers={"accept": "text/html"},
        )

        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
        assert "window.close()" in response.text
        assert len(popen_calls) == 1
        assert popen_calls[0][0] == "open"
        assert popen_calls[0][1].startswith("obsidian://open?vault=obsidian-vault&file=")

    def test_fullpath_pdf_redirects_to_viewer(self, client, temp_dir, monkeypatch):
        """PDFではブラウザ表示用URLへリダイレクトする"""
        from app import config

        pdf_path = temp_dir / "document.pdf"
        pdf_path.write_bytes(b"%PDF-1.4\n%test\n")

        monkeypatch.setattr(config.settings, "_base_dir_override", temp_dir)

        response = client.get(
            "/api/fullpath",
            params={"path": str(pdf_path)},
            headers={"accept": "text/html"},
            follow_redirects=False,
        )

        assert response.status_code == 307
        assert response.headers["location"].startswith("/api/view-pdf?path=")

    def test_fullpath_plain_markdown_opens_default_app_and_returns_html(self, client, temp_dir, monkeypatch):
        """通常MarkdownではJSONを返さず、デフォルトアプリ起動後にタブを閉じるHTMLを返す"""
        from app import config
        from app.routers import files

        note_path = temp_dir / "note.md"
        note_path.write_text("# note\n", encoding="utf-8")

        monkeypatch.setattr(config.settings, "_base_dir_override", temp_dir)
        monkeypatch.setattr(files.platform, "system", lambda: "Darwin")

        popen_calls = []
        monkeypatch.setattr(files.subprocess, "Popen", lambda args: popen_calls.append(args))

        response = client.get(
            "/api/fullpath",
            params={"path": str(note_path)},
            headers={"accept": "text/html"},
        )

        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
        assert "window.close()" in response.text
        assert len(popen_calls) == 1
        assert popen_calls[0][0] == "open"
        assert Path(popen_calls[0][1]).resolve() == note_path.resolve()

    def test_fullpath_api_clients_still_receive_json(self, client, temp_dir, monkeypatch):
        """APIクライアントでは従来どおりJSONレスポンスを返す"""
        from app import config

        note_path = temp_dir / "note.md"
        note_path.write_text("# note\n", encoding="utf-8")

        monkeypatch.setattr(config.settings, "_base_dir_override", temp_dir)

        response = client.get(
            "/api/fullpath",
            params={"path": str(note_path)},
            headers={"accept": "application/json"},
        )

        assert response.status_code == 200
        assert "application/json" in response.headers["content-type"]
        assert response.json()["action"] == "open_modal"


class TestOpenExplorer:
    """Explorer起動時のWindows固有挙動を確認するテスト"""

    def test_open_explorer_tries_to_bring_window_to_front_on_windows(self, client, temp_dir, monkeypatch):
        """WindowsではExplorer起動後に前面化処理を試みる"""
        from app import config
        from app.routers import files

        monkeypatch.setattr(config.settings, "_base_dir_override", temp_dir)
        monkeypatch.setattr(files.platform, "system", lambda: "Windows")

        popen_calls = []
        focus_calls = []

        class DummyProcess:
            pid = 4321

        def fake_popen(args):
            popen_calls.append(args)
            return DummyProcess()

        monkeypatch.setattr(files.subprocess, "Popen", fake_popen)
        monkeypatch.setattr(files, "_bring_explorer_to_front", lambda pid, path: focus_calls.append((pid, path)))

        response = client.post("/api/open/explorer", json={"path": str(temp_dir / "folder1")})

        assert response.status_code == 200
        assert len(popen_calls) == 1
        assert popen_calls[0][0] == "explorer"
        assert popen_calls[0][1].endswith("\\folder1")
        assert len(focus_calls) == 1
        assert focus_calls[0][0] == 4321
        assert str(focus_calls[0][1]).endswith("/folder1")

    def test_open_folder_tries_to_bring_window_to_front_on_windows(self, client, temp_dir, monkeypatch):
        """file_viewer互換APIでもExplorer前面化処理を試みる"""
        from app import config
        from app.routers import files

        monkeypatch.setattr(config.settings, "_base_dir_override", temp_dir)
        monkeypatch.setattr(files.platform, "system", lambda: "Windows")

        popen_calls = []
        focus_calls = []

        class DummyProcess:
            pid = 9876

        def fake_popen(args):
            popen_calls.append(args)
            return DummyProcess()

        monkeypatch.setattr(files.subprocess, "Popen", fake_popen)
        monkeypatch.setattr(files, "_bring_explorer_to_front", lambda pid, path: focus_calls.append((pid, path)))

        response = client.post("/api/open-folder", json={"path": str(temp_dir / "folder1" / "nested.txt")})

        assert response.status_code == 200
        assert len(popen_calls) == 1
        assert popen_calls[0][0] == "explorer"
        assert popen_calls[0][1].endswith("\\folder1")
        assert len(focus_calls) == 1
        assert focus_calls[0][0] == 9876
        assert str(focus_calls[0][1]).endswith("/folder1")


class TestProgramCodeActions:
    """プログラムコード用の右クリックアクションAPIテスト"""

    def test_open_editor_opens_textedit_on_macos(self, client, temp_dir, monkeypatch):
        """macOSではTextEditでコードファイルを開く"""
        from app import config
        from app.routers import files

        script_path = temp_dir / "script.py"
        script_path.write_text("print('hello')\n", encoding="utf-8")

        monkeypatch.setattr(config.settings, "_base_dir_override", temp_dir)
        monkeypatch.setattr(files.platform, "system", lambda: "Darwin")

        popen_calls = []
        monkeypatch.setattr(files.subprocess, "Popen", lambda args: popen_calls.append(args))

        response = client.post("/api/open/editor", json={"path": str(script_path)})

        assert response.status_code == 200
        assert len(popen_calls) == 1
        assert popen_calls[0][:3] == ["open", "-a", "TextEdit"]
        assert Path(popen_calls[0][3]).resolve() == script_path.resolve()

    def test_open_editor_rejects_non_program_code_file(self, client, temp_dir, monkeypatch):
        """対象外の拡張子ではエディター起動を拒否する"""
        from app import config

        monkeypatch.setattr(config.settings, "_base_dir_override", temp_dir)

        response = client.post("/api/open/editor", json={"path": str(temp_dir / "file1.txt")})

        assert response.status_code == 400
        assert "プログラムコード" in response.json()["detail"]

    def test_execute_program_runs_python_script_on_macos(self, client, temp_dir, monkeypatch):
        """macOSではPythonスクリプトをpython3で実行する"""
        from app import config
        from app.routers import files

        script_path = temp_dir / "runner.py"
        script_path.write_text("print('run')\n", encoding="utf-8")

        monkeypatch.setattr(config.settings, "_base_dir_override", temp_dir)
        monkeypatch.setattr(files.platform, "system", lambda: "Darwin")

        popen_calls = []

        def fake_popen(args, cwd=None):
            popen_calls.append((args, cwd))

        monkeypatch.setattr(files.subprocess, "Popen", fake_popen)

        response = client.post("/api/open/execute", json={"path": str(script_path)})

        assert response.status_code == 200
        assert len(popen_calls) == 1
        assert popen_calls[0][0][0] == "python3"
        assert Path(popen_calls[0][0][1]).resolve() == script_path.resolve()
        assert Path(popen_calls[0][1]).resolve() == temp_dir.resolve()

    def test_execute_program_runs_batch_file_on_windows(self, client, temp_dir, monkeypatch):
        """Windowsではbatをcmd /cで実行する"""
        from app import config
        from app.routers import files

        script_path = temp_dir / "runner.bat"
        script_path.write_text("@echo off\r\necho hello\r\n", encoding="utf-8")

        monkeypatch.setattr(config.settings, "_base_dir_override", temp_dir)
        monkeypatch.setattr(files.platform, "system", lambda: "Windows")

        popen_calls = []

        def fake_popen(args, cwd=None, creationflags=0):
            popen_calls.append((args, cwd, creationflags))

        monkeypatch.setattr(files.subprocess, "Popen", fake_popen)

        response = client.post("/api/open/execute", json={"path": str(script_path)})

        assert response.status_code == 200
        assert len(popen_calls) == 1
        assert popen_calls[0][0][:2] == ["cmd", "/c"]
        assert Path(popen_calls[0][0][2]).resolve() == script_path.resolve()
        assert Path(popen_calls[0][1]).resolve() == temp_dir.resolve()
        assert popen_calls[0][2] == 0
