/**
 * ファイルマネージャー メインアプリケーション
 * 3カラム構成: 左ペイン + 右ペイン + 検索パネル
 * URLクエリパラメータ ?path=/some/folder でフォルダを指定可能
 * Windowsネットワークフォルダ（UNCパス）対応
 * ファイルパスが指定された場合は親フォルダにリダイレクト
 * #api-test でAPIテストページを表示
 *
 * デフォルトパスはバックエンドの環境変数（FILE_MANAGER_BASE_DIR）から取得
 */
import { useState, useCallback, useEffect, lazy, Suspense, useRef } from "react";
import { Menu, Trash2, Sun, Moon, FlaskConical, Home } from "lucide-react";
import { FileList } from "./components/FileList";
import { FileSearch } from "./components/FileSearch";
import { ServerTerminal } from "./components/ServerTerminal";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { getPathInfo } from "./api/files";
import { useToast } from "./hooks/useToast";
import { getConfig, getDefaultBasePath, saveEditorPreferences } from "./config";
import { OperationHistoryProvider, useOperationHistoryContext } from "./contexts/OperationHistoryContext";
import { FolderHistoryProvider } from "./contexts/FolderHistoryContext";
import { ToastProvider } from "./contexts/ToastContext";
import { ZoomProvider, useZoomContext } from "./contexts/ZoomContext";
import {
  isEditableEventTarget,
  matchesCmdOrCtrlShiftShortcut,
} from "./utils/globalShortcuts";
import {
  type MarkdownOpenMode,
  type TextFileOpenMode,
} from "./utils/editorPreferences";
import "./App.css";

const ApiTestPage = lazy(() =>
  import("./pages/ApiTestPage").then((module) => ({ default: module.ApiTestPage }))
);

const STORAGE_KEYS = {
  LEFT_PATH: 'file_manager_left_path',
  CENTER_PATH: 'file_manager_center_path',
  THEME: 'file_manager_theme',
  VERIFY_CHECKSUM: 'file_manager_verify_checksum',
  DEBUG_MODE: 'file_manager_debug_mode',
};

// フォーカス可能なペインの型
type FocusedPane = "left" | "center" | "right" | "terminal" | null;

interface TerminalFocusRequest {
  cwd: string | null;
  seq: number;
}

function AppContent() {
  const { showError, showSuccess } = useToast();
  const { zoomLevel, zoomIn, zoomOut, resetZoom } = useZoomContext();
  const { undo, redo, canUndo, canRedo } = useOperationHistoryContext();
  const [showMenu, setShowMenu] = useState(false);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.THEME) || 'light';
  });
  // チェックサム検証設定（移動時の安全性用）
  const [verifyChecksum, setVerifyChecksum] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.VERIFY_CHECKSUM) === 'true';
  });
  // デバッグモード設定（ログ出力用）
  const [debugMode, setDebugMode] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.DEBUG_MODE) === 'true';
  });
  const [locationSearch, setLocationSearch] = useState(() => window.location.search);
  const [textFileOpenMode, setTextFileOpenMode] = useState<TextFileOpenMode>("web");
  const [markdownOpenMode, setMarkdownOpenMode] = useState<MarkdownOpenMode>("web");
  const [editorPreferencesLoaded, setEditorPreferencesLoaded] = useState(false);

  // 起動時にバックエンドから設定を取得（キャッシュに保存）
  useEffect(() => {
    getConfig()
      .then((config) => {
        setTextFileOpenMode(config.textFileOpenMode);
        setMarkdownOpenMode(config.markdownOpenMode);
      })
      .catch((error) => {
        console.error("設定取得エラー:", error);
      })
      .finally(() => {
        setEditorPreferencesLoaded(true);
      });
  }, []);

  useEffect(() => {
    const syncLocationSearch = () => {
      setLocationSearch(window.location.search);
    };

    window.addEventListener("popstate", syncLocationSearch);
    window.addEventListener("pageshow", syncLocationSearch);
    window.addEventListener("focus", syncLocationSearch);

    return () => {
      window.removeEventListener("popstate", syncLocationSearch);
      window.removeEventListener("pageshow", syncLocationSearch);
      window.removeEventListener("focus", syncLocationSearch);
    };
  }, []);

  // フォーカス中のペイン（各ペインは独自のフォーカス行を持つ）
  // 子コンポーネント（FileList/FileSearch）がisFocusedに基づいてDOMフォーカスを管理する
  const [focusedPane, setFocusedPane] = useState<FocusedPane>("left");
  const lastInactivePaneRef = useRef<Exclude<FocusedPane, null>>("left");
  const [terminalFocusRequest, setTerminalFocusRequest] = useState<TerminalFocusRequest>({
    cwd: null,
    seq: 0,
  });
  const [globalFulltextShortcutSeq, setGlobalFulltextShortcutSeq] = useState(0);

  // テーマを適用
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
  }, [theme]);

  // チェックサム設定を保存
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.VERIFY_CHECKSUM, String(verifyChecksum));
  }, [verifyChecksum]);

  // デバッグモード設定を保存
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.DEBUG_MODE, String(debugMode));
  }, [debugMode]);

  useEffect(() => {
    if (!editorPreferencesLoaded) {
      return;
    }

    saveEditorPreferences(textFileOpenMode, markdownOpenMode).catch((error) => {
      console.error("設定保存エラー:", error);
      showError("エディタ設定の保存に失敗しました");
    });
  }, [editorPreferencesLoaded, markdownOpenMode, showError, textFileOpenMode]);

  // ハッシュルーティング（APIテストページ）
  const [currentPage, setCurrentPage] = useState(() => {
    return window.location.hash === '#api-test' ? 'api-test' : 'main';
  });

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentPage(window.location.hash === '#api-test' ? 'api-test' : 'main');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // localStorageの初期化
  const handleResetSettings = () => {
    if (window.confirm("設定（保存されたパス、履歴、テーマなど）を初期化しますか？")) {
      localStorage.clear();
      window.location.href = window.location.pathname; // パラメータなしでリロード
    }
  };

  // URLクエリパラメータからパスを読み取る
  const searchParams = new URLSearchParams(locationSearch);
  const pathFromUrl = searchParams.get('path');
  const openFileFromUrl = searchParams.get('open_file');
  const openModeFromUrl = searchParams.get('open_mode');

  // パスが指定されている場合はデコードして使用、なければデフォルト
  const defaultPath = pathFromUrl
    ? decodeURIComponent(pathFromUrl)
    : getDefaultBasePath();

  const [leftPath, setLeftPath] = useState(() => {
    // 1. URLパラメータを最優先
    if (pathFromUrl) return decodeURIComponent(pathFromUrl);
    // 2. localStorage
    const saved = localStorage.getItem(STORAGE_KEYS.LEFT_PATH);
    if (saved) return saved;
    // 3. デフォルト（バックエンドから取得した値）
    return getDefaultBasePath();
  });

  useEffect(() => {
    if (!pathFromUrl) {
      return;
    }

    const decodedPath = decodeURIComponent(pathFromUrl);
    setLeftPath((prevPath) => (prevPath === decodedPath ? prevPath : decodedPath));
  }, [pathFromUrl]);

  // URLパラメータがファイルの場合、親フォルダにリダイレクト
  // 存在しないパスの場合はエラーメッセージを表示してURLパラメータをクリア
  useEffect(() => {
    const checkAndRedirectIfFile = async () => {
      if (!pathFromUrl) return;

      try {
        const decodedPath = decodeURIComponent(pathFromUrl);
        const pathInfo = await getPathInfo(decodedPath);

        if (pathInfo.type === "not_found") {
          // 存在しないパスの場合、エラーメッセージを表示してURLパラメータをクリア
          showError(`指定されたパスが見つかりません: ${decodedPath}\n\nデフォルトのパスに移動します。`);

          // URLパラメータを削除してリロード
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete('path');
          window.history.replaceState({}, '', newUrl.toString());

          // デフォルトパスに設定
          setLeftPath(getDefaultBasePath());
        } else if (pathInfo.type === "file" && pathInfo.parent) {
          // ファイルの場合、親フォルダのパスでURLを書き換えてリロード
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.set('path', pathInfo.parent);
          window.location.href = newUrl.toString();
        }
      } catch (error) {
        console.error("パス情報の取得に失敗しました:", error);
        // エラーの場合、エラーメッセージを表示してURLパラメータをクリア
        showError(`パス情報の取得に失敗しました。\n\nデフォルトのパスに移動します。`);

        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('path');
        window.history.replaceState({}, '', newUrl.toString());
        setLeftPath(getDefaultBasePath());
      }
    };

    checkAndRedirectIfFile();
  }, [pathFromUrl]);

  const [centerPath, setCenterPath] = useState(() => {
    // 中央ペインはURLパラメータを無視し、localStorage またはデフォルト値を使用
    const saved = localStorage.getItem(STORAGE_KEYS.CENTER_PATH);
    if (saved) return saved;
    return getDefaultBasePath();
  });

  const handleInitialOpenHandled = useCallback(() => {
    const nextUrl = new URL(window.location.href);
    if (!nextUrl.searchParams.has("open_file") && !nextUrl.searchParams.has("open_mode")) {
      return;
    }

    nextUrl.searchParams.delete("open_file");
    nextUrl.searchParams.delete("open_mode");
    window.history.replaceState({}, "", nextUrl.toString());
    setLocationSearch(nextUrl.search);
  }, []);

  // パス変更時に localStorage に保存
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.LEFT_PATH, leftPath);
  }, [leftPath]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CENTER_PATH, centerPath);
  }, [centerPath]);

  const clearActiveDomFocus = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, []);

  const deactivatePane = useCallback((pane: Exclude<FocusedPane, null>) => {
    lastInactivePaneRef.current = pane;
    clearActiveDomFocus();
    setFocusedPane(null);
  }, [clearActiveDomFocus]);

  const isXtermHiddenTextarea = (target: EventTarget | null): boolean => {
    return target instanceof HTMLTextAreaElement && target.classList.contains("xterm-helper-textarea");
  };

  // グローバルキーボードイベント（左右矢印でペイン切替、Ctrl+Z/Shift+Zで Undo/Redo）
  useEffect(() => {
    const handleGlobalKeyDown = async (e: KeyboardEvent) => {
      if (
        (focusedPane === "left" || focusedPane === "center" || focusedPane === "terminal") &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.shiftKey
      ) {
        if (e.key === "Escape") {
          e.preventDefault();
          deactivatePane(focusedPane);
          return;
        }
      }

      const isTerminalResidualFocus = isXtermHiddenTextarea(e.target) && focusedPane !== "terminal";

      // 入力中は単キーショートカットを無効化
      if (isEditableEventTarget(e.target) && !isTerminalResidualFocus) {
        return;
      }

      // Ctrl/Cmdキーが押されている場合
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();

        if (matchesCmdOrCtrlShiftShortcut(e, "p")) {
          e.preventDefault();
          if (isTerminalResidualFocus) clearActiveDomFocus();
          lastInactivePaneRef.current = "right";
          setFocusedPane("right");
          setGlobalFulltextShortcutSeq((current) => current + 1);
          return;
        }

        // Redo: Ctrl+Shift+Z / Cmd+Shift+Z (Undoより先にチェック)
        if (key === 'z' && e.shiftKey) {
          e.preventDefault();
          if (canRedo) {
            const result = await redo();
            if (result.success) {
              showSuccess(result.message);
            } else {
              showError(result.message);
            }
          } else {
            showError("やり直す操作がありません");
          }
          return;
        }

        // Undo: Ctrl+Z / Cmd+Z
        if (key === 'z' && !e.shiftKey) {
          e.preventDefault();
          if (canUndo) {
            const result = await undo();
            if (result.success) {
              showSuccess(result.message);
            } else {
              showError(result.message);
            }
          } else {
            showError("元に戻す操作がありません");
          }
          return;
        }

        // ブラウザの戻る・進む動作を防ぐ
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
        }
        return;
      }

      if (!e.shiftKey && !e.altKey) {
        const key = e.key.toLowerCase();

        if (key === "s") {
          e.preventDefault();
          if (isTerminalResidualFocus) clearActiveDomFocus();
          lastInactivePaneRef.current = "left";
          setFocusedPane("left");
          return;
        }

        if (key === "d") {
          e.preventDefault();
          if (isTerminalResidualFocus) clearActiveDomFocus();
          lastInactivePaneRef.current = "center";
          setFocusedPane("center");
          return;
        }

        if (key === "f") {
          e.preventDefault();
          if (isTerminalResidualFocus) clearActiveDomFocus();
          lastInactivePaneRef.current = "right";
          setFocusedPane("right");
          return;
        }

        if (key === "c") {
          e.preventDefault();
          if (isTerminalResidualFocus) clearActiveDomFocus();
          const cwd = focusedPane === "left" ? leftPath : focusedPane === "center" ? centerPath : null;
          lastInactivePaneRef.current = "terminal";
          setFocusedPane("terminal");
          setTerminalFocusRequest((current) => ({
            cwd,
            seq: current.seq + 1,
          }));
          return;
        }
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setFocusedPane((prev) => {
          if (prev === null) {
            if (lastInactivePaneRef.current === "terminal") return "right";
            if (lastInactivePaneRef.current === "right") return "center";
            if (lastInactivePaneRef.current === "center") return "left";
            return "left";
          }
          if (prev === 'terminal') return 'right';
          if (prev === 'right') return 'center';
          if (prev === 'center') return 'left';
          return prev;
        });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setFocusedPane((prev) => {
          if (prev === null) {
            if (lastInactivePaneRef.current === "left") return "center";
            if (lastInactivePaneRef.current === "center") return "right";
            if (lastInactivePaneRef.current === "right") return "terminal";
            return "right";
          }
          if (prev === 'right') return 'terminal';
          if (prev === 'left') return 'center';
          if (prev === 'center') return 'right';
          return prev;
        });
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [canUndo, canRedo, undo, redo, showError, showSuccess, focusedPane, leftPath, centerPath, clearActiveDomFocus]);

  const handleSelectFolder = useCallback((path: string) => {
    setLeftPath(path);
  }, []);

  const handleSelectRightFolder = useCallback((path: string) => {
    setCenterPath(path);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>
          <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>
            File Manager
          </a>
        </h1>
        <div className="header-actions">
          <a href="/" className="home-link" title="ホームに戻る">
            <Home size={20} />
          </a>
          <a href="#api-test" target="_blank" className="api-test-link" title="APIテストページ">
            <FlaskConical size={20} />
          </a>
          <div className="zoom-controls" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginRight: '8px', color: 'white' }}>
            <button
              onClick={zoomOut}
              className="zoom-button"
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '4px', display: 'flex' }}
              title="縮小"
            >
              -
            </button>
            <span
              onClick={resetZoom}
              style={{ fontSize: '12px', cursor: 'pointer', minWidth: '35px', textAlign: 'center' }}
              title="リセット"
            >
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={zoomIn}
              className="zoom-button"
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '4px', display: 'flex' }}
              title="拡大"
            >
              +
            </button>
          </div>
          <button className="menu-trigger" onClick={() => setShowMenu(!showMenu)}>
            <Menu size={20} />
          </button>
          {showMenu && (
            <div className="settings-menu">
              <button className="menu-item" onClick={() => { setTheme('light'); setShowMenu(false); }}>
                <Sun size={16} /> White Mode
              </button>
              <button className="menu-item" onClick={() => { setTheme('dark'); setShowMenu(false); }}>
                <Moon size={16} /> Dark Mode
              </button>
              <div className="menu-divider" />
              <div className="menu-section">
                <div className="menu-section-title">Text Files</div>
                <label className="menu-item checkbox-item">
                  <input
                    type="checkbox"
                    checked={textFileOpenMode === "web"}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setTextFileOpenMode("web");
                      }
                    }}
                  />
                  <span>Web App Editor</span>
                </label>
                <label className="menu-item checkbox-item">
                  <input
                    type="checkbox"
                    checked={textFileOpenMode === "vscode"}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setTextFileOpenMode("vscode");
                      }
                    }}
                  />
                  <span>Visual Studio Code</span>
                </label>
              </div>
              <div className="menu-divider" />
              <div className="menu-section">
                <div className="menu-section-title">Markdown</div>
                <label className="menu-item checkbox-item">
                  <input
                    type="checkbox"
                    checked={markdownOpenMode === "web"}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setMarkdownOpenMode("web");
                      }
                    }}
                  />
                  <span>Web App Editor</span>
                </label>
                <label className="menu-item checkbox-item">
                  <input
                    type="checkbox"
                    checked={markdownOpenMode === "external"}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setMarkdownOpenMode("external");
                      }
                    }}
                  />
                  <span>Obsidian or Visual Studio Code</span>
                </label>
              </div>
              <div className="menu-divider" />
              <label className="menu-item checkbox-item">
                <input
                  type="checkbox"
                  checked={verifyChecksum}
                  onChange={(e) => setVerifyChecksum(e.target.checked)}
                />
                <span>Safe Move (Checksum)</span>
              </label>
              <label className="menu-item checkbox-item">
                <input
                  type="checkbox"
                  checked={debugMode}
                  onChange={(e) => setDebugMode(e.target.checked)}
                />
                <span>Debug Mode</span>
              </label>
              <div className="menu-divider" />
              <button className="menu-item" onClick={() => { handleResetSettings(); setShowMenu(false); }}>
                <Trash2 size={16} /> Reset Storage
              </button>
            </div>
          )}
        </div>
      </header>
      {currentPage === 'api-test' ? (
        <main className="app-main api-test-main" style={{ zoom: zoomLevel } as any}>
          <Suspense fallback={<div className="loading">読み込み中...</div>}>
            <ApiTestPage />
          </Suspense>
        </main>
      ) : (
        <main className="app-main triple-pane" style={{ zoom: zoomLevel } as any}>
          <div
            className={`pane left-pane ${focusedPane === 'left' ? 'focused' : ''}`}
            onClick={() => {
              lastInactivePaneRef.current = "left";
              setFocusedPane('left');
            }}
          >
            <ErrorBoundary>
              <FileList
                panelId="left"
                initialPath={getDefaultBasePath()}
                path={leftPath}
                initialOpenFilePath={openFileFromUrl ? decodeURIComponent(openFileFromUrl) : undefined}
                initialOpenMode={openModeFromUrl === "web" ? "web" : undefined}
                onInitialOpenHandled={handleInitialOpenHandled}
                onPathChange={setLeftPath}
                isFocused={focusedPane === 'left'}
                onRequestFocus={() => {
                  lastInactivePaneRef.current = "left";
                  setFocusedPane('left');
                }}
                textFileOpenMode={textFileOpenMode}
                markdownOpenMode={markdownOpenMode}
              />
            </ErrorBoundary>
          </div>
          <div className="pane-divider" />
          <div
            className={`pane center-pane ${focusedPane === 'center' ? 'focused' : ''}`}
            onClick={() => {
              lastInactivePaneRef.current = "center";
              setFocusedPane('center');
            }}
          >
            <ErrorBoundary>
              <FileList
                panelId="center"
                initialPath={getDefaultBasePath()}
                path={centerPath}
                onPathChange={setCenterPath}
                isFocused={focusedPane === 'center'}
                onRequestFocus={() => {
                  lastInactivePaneRef.current = "center";
                  setFocusedPane('center');
                }}
                textFileOpenMode={textFileOpenMode}
                markdownOpenMode={markdownOpenMode}
              />
            </ErrorBoundary>
          </div>
          <div className="pane-divider" />
          <div
            className={`pane search-pane ${focusedPane === 'right' ? 'focused' : ''}`}
            onClick={() => {
              lastInactivePaneRef.current = "right";
              setFocusedPane('right');
            }}
          >
            <ErrorBoundary>
              <div className="search-pane-layout">
                <div
                  className={`search-pane-search ${focusedPane === 'right' ? 'focused' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    lastInactivePaneRef.current = "right";
                    setFocusedPane('right');
                  }}
                >
                  <FileSearch
                    initialPath={defaultPath}
                    leftPanePath={leftPath}
                    rightPanePath={centerPath}
                    onSelectFolder={handleSelectFolder}
                    onSelectRightFolder={handleSelectRightFolder}
                    isFocused={focusedPane === 'right'}
                    onRequestFocus={() => {
                      lastInactivePaneRef.current = "right";
                      setFocusedPane('right');
                    }}
                    textFileOpenMode={textFileOpenMode}
                    markdownOpenMode={markdownOpenMode}
                    globalFulltextShortcutSeq={globalFulltextShortcutSeq}
                  />
                </div>
                <div
                  className={`search-pane-terminal ${focusedPane === 'terminal' ? 'focused' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    lastInactivePaneRef.current = "terminal";
                    setFocusedPane('terminal');
                  }}
                >
                  <ServerTerminal
                    leftCwd={leftPath}
                    centerCwd={centerPath}
                    requestedCwd={terminalFocusRequest.cwd}
                    focusRequestSeq={terminalFocusRequest.seq}
                    isFocused={focusedPane === 'terminal'}
                    onRequestFocus={() => {
                      lastInactivePaneRef.current = "terminal";
                      setFocusedPane('terminal');
                    }}
                    onEscape={() => deactivatePane("terminal")}
                  />
                </div>
              </div>
            </ErrorBoundary>
          </div>
        </main>
      )}
    </div>
  );
}

// OperationHistoryProviderとToastProviderでラップ
function App() {
  return (
    <OperationHistoryProvider>
      <FolderHistoryProvider>
        <ToastProvider>
          <ZoomProvider>
            <AppContent />
          </ZoomProvider>
        </ToastProvider>
      </FolderHistoryProvider>
    </OperationHistoryProvider>
  );
}

export default App;
