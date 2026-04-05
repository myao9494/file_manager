"""
WebSocket ターミナルAPIのテスト
対話型シェルを右ペイン下部へ埋め込むため、PTY経由での入出力を確認する
"""
from pathlib import Path


def _receive_until_exit(websocket, limit: int = 40) -> str:
    """シェル終了までWebSocketメッセージを収集する"""
    chunks: list[str] = []

    for _ in range(limit):
        message = websocket.receive_json()
        if message["type"] == "output":
            chunks.append(message["data"])
        elif message["type"] == "exit":
            break

    return "".join(chunks)


class TestTerminalWebSocket:
    """WebSocket /api/terminal/ws エンドポイントのテスト"""

    def test_terminal_executes_commands_in_requested_directory(self, client, temp_dir, monkeypatch):
        """指定ディレクトリを開始位置にしてシェルコマンドを実行できる"""
        from app.routers import terminal

        monkeypatch.setattr(terminal, "get_shell_command", lambda: ["/bin/sh", "-i"])

        with client.websocket_connect(f"/api/terminal/ws?cwd={temp_dir}") as websocket:
            websocket.send_json({
                "type": "input",
                "data": "pwd\nexit\n",
            })

            output = _receive_until_exit(websocket)

        assert str(temp_dir) in output

    def test_terminal_falls_back_to_default_directory_for_invalid_cwd(self, client, temp_dir, monkeypatch):
        """存在しない開始ディレクトリ指定時はデフォルトディレクトリへフォールバックする"""
        from app.routers import terminal

        fallback_dir = temp_dir / "fallback"
        fallback_dir.mkdir()

        monkeypatch.setenv("FILE_MANAGER_START_DIR", str(fallback_dir))
        monkeypatch.setattr(terminal, "get_shell_command", lambda: ["/bin/sh", "-i"])

        invalid_dir = temp_dir / "missing"

        with client.websocket_connect(f"/api/terminal/ws?cwd={invalid_dir}") as websocket:
            websocket.send_json({
                "type": "input",
                "data": "pwd\nexit\n",
            })

            output = _receive_until_exit(websocket)

        assert str(fallback_dir) in output
