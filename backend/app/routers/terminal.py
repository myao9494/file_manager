"""
WebSocket ターミナルルーター
右ペイン下部へJupyter風の対話型ターミナルを埋め込むため、
サーバー側のシェルをPTY経由でWebSocketへ中継する
"""
import asyncio
import json
import os
import platform
import shutil
import struct
import subprocess
from pathlib import Path

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.config import settings

router = APIRouter()


def get_shell_command() -> list[str]:
    """実行する対話型シェルコマンドを返す"""
    if platform.system() == "Windows":
        return [os.environ.get("COMSPEC", "cmd.exe")]

    shell = os.environ.get("SHELL") or shutil.which("zsh") or shutil.which("bash") or "/bin/sh"
    return [shell, "-i"]


def resolve_terminal_cwd(raw_cwd: str | None) -> Path:
    """開始ディレクトリを決定し、不正または存在しない場合はデフォルトへフォールバックする"""
    if raw_cwd:
        candidate = Path(raw_cwd).expanduser()
        if candidate.exists() and candidate.is_dir():
            return candidate

    return settings.start_dir


class ShellProcess:
    """シェルプロセスとの入出力を抽象化する"""

    def __init__(self, cwd: Path):
        self.cwd = cwd
        self.process: subprocess.Popen[bytes] | None = None

    async def start(self) -> None:
        raise NotImplementedError

    async def read_chunk(self) -> bytes:
        raise NotImplementedError

    async def write_input(self, data: str) -> None:
        raise NotImplementedError

    async def resize(self, cols: int, rows: int) -> None:
        return None

    async def wait(self) -> int:
        if self.process is None:
            return 0
        return await asyncio.to_thread(self.process.wait)

    async def terminate(self) -> None:
        if self.process is None:
            return

        if self.process.poll() is None:
            self.process.terminate()
            try:
                await asyncio.wait_for(asyncio.to_thread(self.process.wait), timeout=1.0)
            except asyncio.TimeoutError:
                self.process.kill()
                await asyncio.to_thread(self.process.wait)


class PtyShellProcess(ShellProcess):
    """POSIX環境向けPTYベースの対話型シェル"""

    def __init__(self, cwd: Path):
        super().__init__(cwd)
        self.master_fd: int | None = None
        self.slave_fd: int | None = None

    async def start(self) -> None:
        import pty

        self.master_fd, self.slave_fd = pty.openpty()
        env = os.environ.copy()
        env.setdefault("TERM", "xterm-256color")

        self.process = subprocess.Popen(
            get_shell_command(),
            stdin=self.slave_fd,
            stdout=self.slave_fd,
            stderr=self.slave_fd,
            cwd=self.cwd,
            env=env,
            close_fds=True,
        )

        os.close(self.slave_fd)
        self.slave_fd = None

    async def read_chunk(self) -> bytes:
        if self.master_fd is None:
            return b""

        try:
            return await asyncio.to_thread(os.read, self.master_fd, 4096)
        except OSError:
            return b""

    async def write_input(self, data: str) -> None:
        if self.master_fd is None:
            return
        await asyncio.to_thread(os.write, self.master_fd, data.encode("utf-8"))

    async def resize(self, cols: int, rows: int) -> None:
        if self.master_fd is None:
            return

        import fcntl
        import termios

        winsize = struct.pack("HHHH", max(rows, 1), max(cols, 1), 0, 0)
        await asyncio.to_thread(fcntl.ioctl, self.master_fd, termios.TIOCSWINSZ, winsize)

    async def terminate(self) -> None:
        try:
            await super().terminate()
        finally:
            if self.master_fd is not None:
                try:
                    os.close(self.master_fd)
                except OSError:
                    pass
                self.master_fd = None
            if self.slave_fd is not None:
                try:
                    os.close(self.slave_fd)
                except OSError:
                    pass
                self.slave_fd = None


class PipeShellProcess(ShellProcess):
    """PTYが使えない環境向けの簡易シェル"""

    async def start(self) -> None:
        env = os.environ.copy()
        env.setdefault("TERM", "xterm-256color")

        self.process = subprocess.Popen(
            get_shell_command(),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            cwd=self.cwd,
            env=env,
        )

    async def read_chunk(self) -> bytes:
        if self.process is None or self.process.stdout is None:
            return b""

        try:
            return await asyncio.to_thread(self.process.stdout.read, 4096)
        except OSError:
            return b""

    async def write_input(self, data: str) -> None:
        if self.process is None or self.process.stdin is None:
            return

        self.process.stdin.write(data.encode("utf-8"))
        self.process.stdin.flush()


def create_shell_process(cwd: Path) -> ShellProcess:
    """環境に応じて最適なシェル実装を返す"""
    if os.name != "nt":
        return PtyShellProcess(cwd)
    return PipeShellProcess(cwd)


@router.websocket("/terminal/ws")
async def terminal_websocket(websocket: WebSocket, cwd: str | None = None):
    """WebSocket経由で対話型ターミナルを提供する"""
    await websocket.accept()

    shell = create_shell_process(resolve_terminal_cwd(cwd))
    await shell.start()

    async def forward_output() -> None:
        try:
            while True:
                chunk = await shell.read_chunk()
                if not chunk:
                    break

                await websocket.send_json({
                    "type": "output",
                    "data": chunk.decode("utf-8", errors="replace"),
                })
        finally:
            exit_code = await shell.wait()
            try:
                await websocket.send_json({"type": "exit", "code": exit_code})
            except Exception:
                pass

    async def receive_input() -> None:
        while True:
            message = await websocket.receive_text()
            payload = json.loads(message)
            message_type = payload.get("type")

            if message_type == "input":
                await shell.write_input(payload.get("data", ""))
            elif message_type == "resize":
                await shell.resize(int(payload.get("cols", 0)), int(payload.get("rows", 0)))

    output_task = asyncio.create_task(forward_output())
    input_task = asyncio.create_task(receive_input())

    try:
        done, pending = await asyncio.wait(
            {output_task, input_task},
            return_when=asyncio.FIRST_EXCEPTION,
        )

        for task in done:
            exc = task.exception()
            if exc and not isinstance(exc, WebSocketDisconnect):
                raise exc
    except WebSocketDisconnect:
        pass
    finally:
        for task in (output_task, input_task):
            if not task.done():
                task.cancel()

        await shell.terminate()
