/**
 * サーバーターミナルコンポーネント
 * 右ペイン下部にJupyter風の対話型ターミナルを表示し、
 * WebSocket経由でバックエンドのシェルへ接続する
 */
import { useEffect, useRef, useState } from "react";
import { RefreshCw, PlugZap, PlugZap2 } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

import { API_BASE_URL } from "../config";
import "./ServerTerminal.css";

interface ServerTerminalProps {
  leftCwd: string;
  centerCwd: string;
  onRequestFocus?: () => void;
}

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

function buildTerminalWebSocketUrl(cwd: string): string {
  const apiUrl = new URL(`${API_BASE_URL}/api/terminal/ws`, window.location.origin);
  apiUrl.protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
  apiUrl.searchParams.set("cwd", cwd);
  return apiUrl.toString();
}

function writeLocalInput(xterm: Terminal, data: string): void {
  for (const char of data) {
    if (char === "\r") {
      xterm.write("\r\n");
      continue;
    }

    if (char === "\u007f") {
      xterm.write("\b \b");
      continue;
    }

    if (char === "\t") {
      xterm.write("    ");
      continue;
    }

    if (char >= " " && char !== "\u007f") {
      xterm.write(char);
    }
  }
}

export function ServerTerminal({ leftCwd, centerCwd, onRequestFocus }: ServerTerminalProps) {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const currentLineRef = useRef("");
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [sessionCwd, setSessionCwd] = useState(centerCwd);

  const focusTerminal = () => {
    onRequestFocus?.();
    xtermRef.current?.focus();
  };

  useEffect(() => {
    setSessionCwd((current) => current || centerCwd);
  }, [centerCwd]);

  useEffect(() => {
    if (!terminalRef.current) {
      return;
    }

    const xterm = new Terminal({
      cursorBlink: true,
      fontFamily: '"SFMono-Regular", "Menlo", "Monaco", "Consolas", monospace',
      fontSize: 13,
      lineHeight: 1.15,
      theme: {
        background: "#111318",
        foreground: "#f4f7fb",
        cursor: "#f4f7fb",
        selectionBackground: "rgba(120, 177, 255, 0.35)",
      },
      convertEol: true,
      scrollback: 5000,
      allowTransparency: false,
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.attachCustomKeyEventHandler((event) => {
      if (event.key === "Tab") {
        event.preventDefault();
      }
      return true;
    });
    xterm.open(terminalRef.current);
    fitAddon.fit();
    xterm.focus();

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    const observer = new ResizeObserver(() => {
      fitAddon.fit();

      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: "resize",
          cols: xterm.cols,
          rows: xterm.rows,
        }));
      }
    });

    observer.observe(terminalRef.current);
    resizeObserverRef.current = observer;

    return () => {
      observer.disconnect();
      resizeObserverRef.current = null;
      fitAddonRef.current = null;
      xtermRef.current = null;
      xterm.dispose();
    };
  }, []);

  useEffect(() => {
    const xterm = xtermRef.current;
    const fitAddon = fitAddonRef.current;

    if (!xterm || !fitAddon) {
      return;
    }

    setStatus("connecting");
    xterm.clear();
    xterm.writeln(`Connecting to server terminal...`);
    xterm.writeln(`cwd: ${sessionCwd}`);
    xterm.writeln("");

    let socket: WebSocket | null = null;
    let dataDisposable: { dispose: () => void } | null = null;
    let resizeDisposable: { dispose: () => void } | null = null;

    // StrictModeによるuseEffectの即時クリーンアップ時にWebSocketが接続中だと
    // ブラウザがエラーを吐きViteプロキシがクラッシュするのを防ぐため、少し遅延させる
    const connectId = setTimeout(() => {
      socket = new WebSocket(buildTerminalWebSocketUrl(sessionCwd));
      socketRef.current = socket;
      currentLineRef.current = "";

      dataDisposable = xterm.onData((data) => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          if (data === "\t") {
            socket.send(JSON.stringify({ type: "complete", line: currentLineRef.current }));
            return;
          }

          if (data === "\r") {
            writeLocalInput(xterm, data);
            socket.send(JSON.stringify({ type: "input", data: `${currentLineRef.current}\r` }));
            currentLineRef.current = "";
            return;
          }

          if (data === "\u007f") {
            currentLineRef.current = currentLineRef.current.slice(0, -1);
            writeLocalInput(xterm, data);
            return;
          }

          if (data >= " " && data !== "\u007f") {
            currentLineRef.current += data;
            writeLocalInput(xterm, data);
            return;
          }

          socket.send(JSON.stringify({ type: "input", data }));
        }
      });

      resizeDisposable = xterm.onResize(({ cols, rows }) => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "resize", cols, rows }));
        }
      });

      socket.addEventListener("open", () => {
        setStatus("connected");
        fitAddon.fit();
        xterm.focus();
        if (socket) {
          socket.send(JSON.stringify({
            type: "resize",
            cols: xterm.cols,
            rows: xterm.rows,
          }));
        }
      });

      socket.addEventListener("message", (event) => {
        const payload = JSON.parse(event.data) as { type: string; data?: string; code?: number; append?: string; line?: string };

        if (payload.type === "output" && payload.data) {
          xterm.write(payload.data);
        }

        if (payload.type === "completion" && payload.append) {
          currentLineRef.current = payload.line ?? `${currentLineRef.current}${payload.append}`;
          writeLocalInput(xterm, payload.append);
        }

        if (payload.type === "exit") {
          setStatus("disconnected");
          currentLineRef.current = "";
          xterm.writeln("");
          xterm.writeln(`[terminal exited: ${payload.code ?? 0}]`);
        }
      });

      socket.addEventListener("close", () => {
        setStatus((current) => (current === "error" ? current : "disconnected"));
      });

      socket.addEventListener("error", () => {
        setStatus("error");
        xterm.writeln("");
        xterm.writeln("[connection error]");
      });
    }, 100);

    return () => {
      clearTimeout(connectId);
      if (dataDisposable) dataDisposable.dispose();
      if (resizeDisposable) resizeDisposable.dispose();
      if (socket) {
        if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
      }
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [sessionCwd]);

  return (
    <section className="server-terminal" onMouseDown={focusTerminal}>
      <div className="server-terminal-header">
        <div className="server-terminal-title">Server Terminal</div>
        <div className={`server-terminal-status is-${status}`}>
          {status === "connected" ? <PlugZap size={14} /> : <PlugZap2 size={14} />}
          <span>{status}</span>
        </div>
        <button
          type="button"
          className="server-terminal-button"
          onClick={() => setSessionCwd(leftCwd)}
          title="左ペインのパスで再接続"
        >
          <RefreshCw size={14} />
          <span>Open Left</span>
        </button>
        <button
          type="button"
          className="server-terminal-button"
          onClick={() => setSessionCwd(centerCwd)}
          title="中央ペインのパスで再接続"
        >
          <RefreshCw size={14} />
          <span>Open Center</span>
        </button>
      </div>
      <div className="server-terminal-subtitle" title={sessionCwd}>
        {sessionCwd}
      </div>
      <div className="server-terminal-body" ref={terminalRef} onMouseDown={focusTerminal} />
    </section>
  );
}
