"""
WebSocket ターミナルAPIのテスト
対話型シェルを右ペイン下部へ埋め込むため、PTY経由での入出力を確認する
"""
import os
from pathlib import Path
from unittest.mock import Mock


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

        if os.name == "nt":
            return

        monkeypatch.setattr(terminal, "get_shell_command", lambda: ["/bin/sh", "-i"])
        command = "pwd\nexit\n"

        with client.websocket_connect(f"/api/terminal/ws?cwd={temp_dir}") as websocket:
            websocket.send_json({
                "type": "input",
                "data": command,
            })

            output = _receive_until_exit(websocket)

        assert str(temp_dir) in output

    def test_terminal_falls_back_to_default_directory_for_invalid_cwd(self, client, temp_dir, monkeypatch):
        """存在しない開始ディレクトリ指定時はデフォルトディレクトリへフォールバックする"""
        from app.routers import terminal

        if os.name == "nt":
            return

        fallback_dir = temp_dir / "fallback"
        fallback_dir.mkdir()

        monkeypatch.setenv("FILE_MANAGER_START_DIR", str(fallback_dir))
        monkeypatch.setattr(terminal, "get_shell_command", lambda: ["/bin/sh", "-i"])
        command = "pwd\nexit\n"

        invalid_dir = temp_dir / "missing"

        with client.websocket_connect(f"/api/terminal/ws?cwd={invalid_dir}") as websocket:
            websocket.send_json({
                "type": "input",
                "data": command,
            })

            output = _receive_until_exit(websocket)

        assert str(fallback_dir) in output


class TestPipeShellProcess:
    """Windows向けパイプシェルの出力読み取りを検証する"""

    def test_get_shell_command_uses_quiet_unicode_cmd_on_windows_by_default(self, monkeypatch):
        """Windowsでは既定で静かなコマンドプロンプトを使う"""
        from app.routers import terminal

        monkeypatch.setattr(terminal.platform, "system", lambda: "Windows")
        monkeypatch.delenv("FILE_MANAGER_WINDOWS_TERMINAL_SHELL", raising=False)
        monkeypatch.setenv("COMSPEC", "C:\\Windows\\System32\\cmd.exe")

        assert terminal.get_shell_command() == ["C:\\Windows\\System32\\cmd.exe", "/Q"]

    def test_get_shell_command_can_use_powershell_on_windows(self, monkeypatch):
        """環境変数で PowerShell へ切り替えられる"""
        from app.routers import terminal

        monkeypatch.setattr(terminal.platform, "system", lambda: "Windows")
        monkeypatch.setenv("FILE_MANAGER_WINDOWS_TERMINAL_SHELL", "powershell")
        monkeypatch.setattr(terminal.shutil, "which", lambda name: "powershell.exe" if name == "powershell" else None)

        assert terminal.get_shell_command() == [
            "powershell.exe",
            "-NoLogo",
            "-NoProfile",
            "-NoExit",
            "-Command",
            "[Console]::InputEncoding=[System.Text.UTF8Encoding]::new($false); [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)",
        ]

    def test_read_chunk_prefers_read1_for_streaming_output(self):
        """read1が使える場合はそれを優先して逐次出力を取得する"""
        from app.routers.terminal import PipeShellProcess

        stdout = Mock()
        stdout.read1.return_value = b"prompt> "
        stdout.read.side_effect = AssertionError("read() should not be used when read1() is available")

        shell = PipeShellProcess(Path.cwd())
        shell.process = Mock(stdout=stdout)

        import asyncio

        chunk = asyncio.run(shell.read_chunk())

        assert chunk == b"prompt> "
        stdout.read1.assert_called_once_with(4096)

    def test_read_chunk_falls_back_to_read_when_read1_is_unavailable(self):
        """read1がない場合はreadでフォールバックする"""
        from app.routers.terminal import PipeShellProcess

        stdout = Mock(spec=["read"])
        stdout.read.return_value = b"prompt> "

        shell = PipeShellProcess(Path.cwd())
        shell.process = Mock(stdout=stdout)

        import asyncio

        chunk = asyncio.run(shell.read_chunk())

        assert chunk == b"prompt> "
        stdout.read.assert_called_once_with(1)

    def test_write_input_normalizes_enter_on_windows(self, monkeypatch):
        """WindowsではEnterをシェル向けにCRLFへ正規化する"""
        from app.routers.terminal import PipeShellProcess

        stdin = Mock()
        shell = PipeShellProcess(Path.cwd())
        shell.process = Mock(stdin=stdin)
        monkeypatch.setattr("app.routers.terminal.os.name", "nt")

        import asyncio

        asyncio.run(shell.write_input("\r"))

        stdin.write.assert_called_once_with(b"\r\n")
        stdin.flush.assert_called_once_with()

    def test_write_input_uses_windows_shell_encoding(self, monkeypatch):
        """Windowsではシェル設定に応じた文字コードで入力をエンコードする"""
        from app.routers.terminal import PipeShellProcess

        stdin = Mock()
        shell = PipeShellProcess(Path.cwd())
        shell.process = Mock(stdin=stdin)
        shell.encoding = "cp932"
        monkeypatch.setattr("app.routers.terminal.os.name", "nt")

        import asyncio

        asyncio.run(shell.write_input("日本語\r"))

        stdin.write.assert_called_once_with("日本語\r\n".encode("cp932", errors="replace"))
        stdin.flush.assert_called_once_with()

    def test_decode_output_uses_windows_shell_encoding(self):
        """Windowsではシェル設定に応じた文字コードで出力をデコードする"""
        from app.routers.terminal import PipeShellProcess

        shell = PipeShellProcess(Path.cwd())
        shell.output_encoding = "cp932"
        import codecs
        shell.decoder = codecs.getincrementaldecoder(shell.output_encoding)(errors="replace")

        assert shell.decode_output("日本語".encode("cp932")) == "日本語"


class TestWindowsFallback:
    """Windowsでpywinptyが不安定な場合のフォールバックを検証する"""

    def test_terminal_falls_back_to_pipe_when_primary_shell_start_fails(self, client, monkeypatch):
        """Windowsでは初期シェル起動失敗時にPipeShellProcessへフォールバックする"""
        from app.routers import terminal

        class BrokenShell(terminal.ShellProcess):
            async def start(self) -> None:
                raise RuntimeError("primary failed")

            async def read_chunk(self) -> bytes:
                return b""

            async def write_input(self, data: str) -> None:
                return None

            async def wait(self) -> int:
                return 0

            async def terminate(self) -> None:
                return None

        class WorkingPipeShell(terminal.ShellProcess):
            def __init__(self, cwd: Path):
                super().__init__(cwd)
                self.started = False

            async def start(self) -> None:
                self.started = True

            async def read_chunk(self) -> bytes:
                return b"fallback ok"

            async def write_input(self, data: str) -> None:
                return None

            async def wait(self) -> int:
                return 0

            async def terminate(self) -> None:
                return None

        monkeypatch.setattr(terminal.platform, "system", lambda: "Windows")
        monkeypatch.setattr(terminal, "create_shell_process", lambda cwd: BrokenShell(cwd))
        monkeypatch.setattr(terminal, "PipeShellProcess", WorkingPipeShell)

        with client.websocket_connect("/api/terminal/ws") as websocket:
            ready = websocket.receive_json()
            message = websocket.receive_json()

        assert ready["type"] == "ready"
        assert ready["localEcho"] is True
        assert message["type"] == "output"
        assert "fallback ok" in message["data"]


class TestWindowsShellSelection:
    """Windows のシェル実装選択を検証する"""

    def test_create_shell_process_uses_pipe_by_default_on_windows(self, monkeypatch):
        """Windows では既定で安定な PipeShellProcess を使う"""
        from app.routers import terminal

        monkeypatch.setattr(terminal.platform, "system", lambda: "Windows")
        monkeypatch.delenv("FILE_MANAGER_WINDOWS_TERMINAL_BACKEND", raising=False)

        shell = terminal.create_shell_process(Path.cwd())

        assert isinstance(shell, terminal.PipeShellProcess)

    def test_create_shell_process_uses_winpty_only_when_opted_in(self, monkeypatch):
        """pywinpty は明示 opt-in のときだけ利用する"""
        from app.routers import terminal

        monkeypatch.setattr(terminal.platform, "system", lambda: "Windows")
        monkeypatch.setenv("FILE_MANAGER_WINDOWS_TERMINAL_BACKEND", "winpty")
        monkeypatch.setitem(__import__("sys").modules, "winpty", object())

        shell = terminal.create_shell_process(Path.cwd())

        assert isinstance(shell, terminal.WinPtyShellProcess)


class TestTerminalReadyMessage:
    """接続初期化時のクライアント設定通知を検証する"""

    def test_should_use_local_echo_for_pipe_shell(self):
        """PipeShellProcess 利用時はクライアント側エコーを有効化する"""
        from app.routers.terminal import PipeShellProcess, PtyShellProcess, should_use_local_echo

        assert should_use_local_echo(PipeShellProcess(Path.cwd())) is True
        assert should_use_local_echo(PtyShellProcess(Path.cwd())) is False


class TestTerminalCompletion:
    """タブ補完の補助ロジックを検証する"""

    def test_build_completion_result_completes_single_directory(self, temp_dir):
        """ディレクトリが一意なら残りを補完して区切り文字を足す"""
        from app.routers.terminal import build_completion_result

        (temp_dir / "Documents").mkdir()

        result = build_completion_result(temp_dir, "cd Doc")

        assert result["append"].endswith("uments" + os.sep)
        assert result["line"].endswith("Documents" + os.sep)

    def test_build_completion_result_extends_common_prefix_for_multiple_matches(self, temp_dir):
        """複数候補でも共通接頭辞が伸びる場合はそこまで補完する"""
        from app.routers.terminal import build_completion_result

        (temp_dir / "alpha-one").mkdir()
        (temp_dir / "alpha-two").mkdir()

        result = build_completion_result(temp_dir, "cd al")

        assert result["append"] == "pha-"
        assert result["line"].endswith("alpha-")

    def test_build_completion_result_handles_quoted_paths(self, temp_dir):
        """引用符付きトークンでも補完できる"""
        from app.routers.terminal import build_completion_result

        (temp_dir / "Program Files").mkdir()

        result = build_completion_result(temp_dir, 'cd "Prog')

        assert result["append"].endswith("ram Files" + os.sep)
        assert result["line"].endswith('"Program Files' + os.sep)


class TestTerminalCwdTracking:
    """cd コマンドに伴うカレントディレクトリ追跡を検証する"""

    def test_resolve_next_terminal_cwd_handles_parent_directory(self, temp_dir):
        """cd .. で親ディレクトリへ更新する"""
        from app.routers.terminal import resolve_next_terminal_cwd

        child = temp_dir / "child"
        child.mkdir()

        assert resolve_next_terminal_cwd(child, "cd ..").samefile(temp_dir)

    def test_resolve_next_terminal_cwd_handles_relative_directory(self, temp_dir):
        """相対パス指定の cd を現在ディレクトリ基準で解決する"""
        from app.routers.terminal import resolve_next_terminal_cwd

        child = temp_dir / "child"
        child.mkdir()

        assert resolve_next_terminal_cwd(temp_dir, "cd child").samefile(child)

    def test_resolve_next_terminal_cwd_ignores_missing_directory(self, temp_dir):
        """存在しない移動先は現在ディレクトリのままにする"""
        from app.routers.terminal import resolve_next_terminal_cwd

        assert resolve_next_terminal_cwd(temp_dir, "cd missing") == temp_dir
