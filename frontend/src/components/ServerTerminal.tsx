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

export function ServerTerminal({ leftCwd, centerCwd, onRequestFocus }: ServerTerminalProps) {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [sessionCwd, setSessionCwd] = useState(centerCwd);

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

    const socket = new WebSocket(buildTerminalWebSocketUrl(sessionCwd));
    socketRef.current = socket;

    const dataDisposable = xterm.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "input", data }));
      }
    });

    const resizeDisposable = xterm.onResize(({ cols, rows }) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });

    socket.addEventListener("open", () => {
      setStatus("connected");
      fitAddon.fit();
      socket.send(JSON.stringify({
        type: "resize",
        cols: xterm.cols,
        rows: xterm.rows,
      }));
    });

    socket.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data) as { type: string; data?: string; code?: number };

      if (payload.type === "output" && payload.data) {
        xterm.write(payload.data);
      }

      if (payload.type === "exit") {
        setStatus("disconnected");
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

    return () => {
      dataDisposable.dispose();
      resizeDisposable.dispose();
      socket.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [sessionCwd]);

  return (
    <section className="server-terminal" onMouseDown={onRequestFocus}>
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
      <div className="server-terminal-body" ref={terminalRef} />
    </section>
  );
}
