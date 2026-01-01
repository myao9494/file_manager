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
import { useState, useCallback, useEffect } from "react";
import { Menu, Trash2, Sun, Moon, FlaskConical, Home } from "lucide-react";
import { FileList } from "./components/FileList";
import { FileSearch } from "./components/FileSearch";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Toast } from "./components/Toast";
import { ApiTestPage } from "./pages/ApiTestPage";
import { getPathInfo } from "./api/files";
import { useToast } from "./hooks/useToast";
import { getConfig, getDefaultBasePath } from "./config";
import "./App.css";

const STORAGE_KEYS = {
  LEFT_PATH: 'file_manager_left_path',
  CENTER_PATH: 'file_manager_center_path',
  THEME: 'file_manager_theme',
  VERIFY_CHECKSUM: 'file_manager_verify_checksum',
  DEBUG_MODE: 'file_manager_debug_mode',
};

// フォーカス可能なペインの型
type FocusedPane = "left" | "center" | "right";

function App() {
  const { toasts, hideToast, showError } = useToast();
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

  // 起動時にバックエンドから設定を取得（キャッシュに保存）
  useEffect(() => {
    getConfig();
  }, []);

  // フォーカス中のペイン（各ペインは独自のフォーカス行を持つ）
  // 子コンポーネント（FileList/FileSearch）がisFocusedに基づいてDOMフォーカスを管理する
  const [focusedPane, setFocusedPane] = useState<FocusedPane>("left");

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

  // グローバルキーボードイベント（左右矢印でペイン切替）
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 入力フィールドにフォーカスがある場合は無視
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Ctrl/Cmdキーが押されている場合はペイン切替を行わない（履歴操作などのため）
      if (e.ctrlKey || e.metaKey) {
        // ブラウザの戻る・進む動作を防ぐ
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
        }
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setFocusedPane((prev) => {
          if (prev === 'right') return 'center';
          if (prev === 'center') return 'left';
          return prev;
        });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setFocusedPane((prev) => {
          if (prev === 'left') return 'center';
          if (prev === 'center') return 'right';
          return prev;
        });
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // localStorageの初期化
  const handleResetSettings = () => {
    if (window.confirm("設定（保存されたパス、履歴、テーマなど）を初期化しますか？")) {
      localStorage.clear();
      window.location.href = window.location.pathname; // パラメータなしでリロード
    }
  };

  // URLクエリパラメータからパスを読み取る
  const searchParams = new URLSearchParams(window.location.search);
  const pathFromUrl = searchParams.get('path');

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

  // パス変更時に localStorage に保存
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.LEFT_PATH, leftPath);
  }, [leftPath]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CENTER_PATH, centerPath);
  }, [centerPath]);

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
          <a href="http://localhost:5173/" className="home-link" title="ホームに戻る">
            <Home size={20} />
          </a>
          <a href="#api-test" target="_blank" className="api-test-link" title="APIテストページ">
            <FlaskConical size={20} />
          </a>
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
        <main className="app-main api-test-main">
          <ApiTestPage />
        </main>
      ) : (
        <main className="app-main triple-pane">
          <div
            className={`pane left-pane ${focusedPane === 'left' ? 'focused' : ''}`}
            onClick={() => setFocusedPane('left')}
          >
            <ErrorBoundary>
              <FileList
                panelId="left"
                initialPath={getDefaultBasePath()}
                path={leftPath}
                onPathChange={setLeftPath}
                isFocused={focusedPane === 'left'}
                onRequestFocus={() => setFocusedPane('left')}
              />
            </ErrorBoundary>
          </div>
          <div className="pane-divider" />
          <div
            className={`pane center-pane ${focusedPane === 'center' ? 'focused' : ''}`}
            onClick={() => setFocusedPane('center')}
          >
            <ErrorBoundary>
              <FileList
                panelId="center"
                initialPath={getDefaultBasePath()}
                path={centerPath}
                onPathChange={setCenterPath}
                isFocused={focusedPane === 'center'}
                onRequestFocus={() => setFocusedPane('center')}
              />
            </ErrorBoundary>
          </div>
          <div className="pane-divider" />
          <div
            className={`pane search-pane ${focusedPane === 'right' ? 'focused' : ''}`}
            onClick={() => setFocusedPane('right')}
          >
            <ErrorBoundary>
              <FileSearch
                initialPath={defaultPath}
                leftPanePath={leftPath}
                rightPanePath={centerPath}
                onSelectFolder={handleSelectFolder}
                onSelectRightFolder={handleSelectRightFolder}
                isFocused={focusedPane === 'right'}
                onRequestFocus={() => setFocusedPane('right')}
              />
            </ErrorBoundary>
          </div>
        </main>
      )}
      {/* トースト通知 */}
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => hideToast(toast.id)}
        />
      ))}
    </div>
  );
}

export default App;
