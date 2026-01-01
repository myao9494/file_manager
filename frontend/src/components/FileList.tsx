/**
 * ファイル一覧コンポーネント
 * リストビューでファイル/フォルダを表示
 * ドラッグ&ドロップ対応、検索機能、ツールバー
 */
import { useState, useRef, useMemo, useEffect, type KeyboardEvent } from "react";
import {
  // Folder,
  // File,
  ChevronUp,
  ChevronDown,
  FolderPlus,
  Trash2,
  RefreshCw,
  Search,
  Download,
  Code,
  FolderOpen,
  ClipboardPaste,
  Gem,
  History,
  Copy,
  ArrowLeft,
  ArrowRight,
  Home,
  Rocket,
  Network,
} from "lucide-react";
import { useFiles, useDeleteItemsBatch, useCreateFolder, useMoveItemsBatch, useCopyItemsBatch } from "../hooks/useFiles";
import { useQueryClient } from "@tanstack/react-query";
import type { FileItem } from "../types/file";
import { getPathInfo, openInVSCode, openInExplorer, getDownloadUrl, openInAntigravity, openInJupyter, openInExcalidraw, createFile, updateFile, openInObsidian, openSmart, countFiles } from "../api/files";
import { MarkdownEditorModal } from "./MarkdownEditorModal";
import { ProgressModal } from "./ProgressModal";
import { useToast } from "../hooks/useToast";
import { ContextMenu } from "./ContextMenu";
import { FilterBar } from "./FilterBar";
import { Toast } from "./Toast";
import { FileIcon } from "./FileIcon";
import { getNetworkDrivePath, getDefaultBasePath } from "../config";
import { useOperationHistoryContext } from "../contexts/OperationHistoryContext";
import "./FileList.css";

interface FileListProps {
  initialPath?: string;
  panelId?: string;
  path?: string;
  onPathChange?: (path: string) => void;
  isFocused?: boolean;
  onRequestFocus?: () => void;
}

// ナビゲーション履歴エントリの型（カーソル・選択状態を含む）
interface NavigationHistoryEntry {
  path: string;
  focusedIndex: number;
  selectedItems: string[];
}

// ドラッグアンドドロップの状態をコンポーネント間で共有するためのグローバル変数
// useRefはコンポーネントインスタンスごとなので、ペイン間の移動には適さない
let globalDraggedItems: FileItem[] = [];

// グローバルクリップボード（アプリ内コピー＆ペースト用）
let globalClipboard: { paths: string[]; op: 'copy' | 'move' } | null = null;

export function FileList({
  initialPath,
  panelId = "main",
  path,
  onPathChange,
  isFocused = false,
  onRequestFocus
}: FileListProps) {
  // initialPathが未指定の場合はバックエンドから取得した値を使用
  const effectiveInitialPath = initialPath ?? getDefaultBasePath();
  const { toasts, hideToast, showError, showSuccess } = useToast();
  const [currentPath, setCurrentPath] = useState<string | null>(null); // 初期値はnull（検証前）
  const [isPathValidated, setIsPathValidated] = useState(false); // パス検証済みフラグ
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: FileItem;
  } | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [extFilter, setExtFilter] = useState<string>(() => {
    // 左ペインと真ん中ペインのデフォルトは「常用」
    if (panelId === "left" || panelId === "center") {
      return "md+svg+csv+pdf+ipynb+py+excalidraw+excalidraw.md+excalidraw.svg+excalidraw.png";
    }
    return "all";
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "size" | "date">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [pathHistory, setPathHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [navigationHistory, setNavigationHistory] = useState<NavigationHistoryEntry[]>([]);
  const [navigationIndex, setNavigationIndex] = useState(0);
  const [historyFilter, setHistoryFilter] = useState("");
  // ローカルフォーカス行インデックス（各ペインで独立）
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  // フォーカス中のUIセクション
  type FocusSection = 'toolbar' | 'path' | 'filter' | 'search' | 'list';
  const [focusedSection, setFocusedSection] = useState<FocusSection>('list');
  // ツールバーボタン内のフォーカスインデックス
  const [toolbarButtonIndex, setToolbarButtonIndex] = useState(0);
  // フィルタバーボタン内のフォーカスインデックス（全10ボタン: 全, F, D, 全, 常用, MD, IPYNB, PDF, Office, 画像, Excali）
  const [filterButtonIndex, setFilterButtonIndex] = useState(0);
  // パスセクション内のフォーカスインデックス（0: 履歴ボタン, 1: コピーボタン, 2: パス入力）
  const [pathButtonIndex, setPathButtonIndex] = useState(0);
  const [historySelectedIndex, setHistorySelectedIndex] = useState(0);
  const historyInputRef = useRef<HTMLInputElement>(null);
  const pathInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // ローカルRefは廃止し、グローバル変数 globalDraggedItems を使用する
  const [lastSelectedPath, setLastSelectedPath] = useState<string | null>(null);

  // Markdownエディタモーダルの状態
  const [mdEditorOpen, setMdEditorOpen] = useState(false);
  const [mdEditorFileName, setMdEditorFileName] = useState("");
  const [mdEditorFilePath, setMdEditorFilePath] = useState<string | null>(null);
  const [mdEditorSaving, setMdEditorSaving] = useState(false);
  const [mdEditorInitialContent, setMdEditorInitialContent] = useState("");

  // プログレスモーダルの状態
  const [progressModalOpen, setProgressModalOpen] = useState(false);
  const [progressTaskId, setProgressTaskId] = useState<string | null>(null);
  const [progressOperationType, setProgressOperationType] = useState<'move' | 'copy' | 'delete'>('move');

  // パスが検証済みの場合のみuseFilesを呼び出す
  const { data, isLoading, error, refetch } = useFiles(isPathValidated && currentPath ? currentPath : "");
  const queryClient = useQueryClient();
  const deleteItemsBatch = useDeleteItemsBatch();
  const createFolder = useCreateFolder();
  const moveItemsBatch = useMoveItemsBatch();
  const copyItemsBatch = useCopyItemsBatch();
  const { addOperation } = useOperationHistoryContext();

  // 初期パスの検証
  useEffect(() => {
    const validateInitialPath = async () => {
      const targetPath = path || effectiveInitialPath;
      if (!targetPath) {
        setCurrentPath(effectiveInitialPath);
        setNavigationHistory([{ path: effectiveInitialPath, focusedIndex: 0, selectedItems: [] }]);
        setIsPathValidated(true);
        return;
      }

      try {
        const pathInfo = await getPathInfo(targetPath);

        if (pathInfo.type === "not_found") {
          showError(`指定されたパスが見つかりません: ${targetPath}`);
          // デフォルトパスにフォールバック
          setCurrentPath(effectiveInitialPath);
          setNavigationHistory([{ path: effectiveInitialPath, focusedIndex: 0, selectedItems: [] }]);
        } else if (pathInfo.type === "file" && pathInfo.parent) {
          // ファイルの場合は親フォルダ
          setCurrentPath(pathInfo.parent);
          setNavigationHistory([{ path: pathInfo.parent, focusedIndex: 0, selectedItems: [] }]);
        } else {
          // ディレクトリの場合
          setCurrentPath(targetPath);
          setNavigationHistory([{ path: targetPath, focusedIndex: 0, selectedItems: [] }]);
        }
      } catch (error) {
        console.error("初期パスの検証に失敗しました:", error);
        setCurrentPath(effectiveInitialPath);
        setNavigationHistory([{ path: effectiveInitialPath, focusedIndex: 0, selectedItems: [] }]);
      }
      setIsPathValidated(true);
    };

    validateInitialPath();
  }, []); // 初回のみ実行

  // 履歴の初期化
  useEffect(() => {
    const historyKey = `file-manager-history-${panelId}`;
    const saved = localStorage.getItem(historyKey);
    if (saved) {
      try {
        setPathHistory(JSON.parse(saved));
      } catch {
        setPathHistory([]);
      }
    }
  }, [panelId]);

  // 外部からのパス変更に同期（パスチェック付き）
  useEffect(() => {
    const checkAndSetPath = async () => {
      if (!path || path === currentPath) return;

      try {
        const pathInfo = await getPathInfo(path);

        if (pathInfo.type === "not_found") {
          // 存在しないパスの場合、エラーメッセージを表示
          showError(`指定されたパスが見つかりません: ${path}`);
          return;
        }

        if (pathInfo.type === "file" && pathInfo.parent) {
          // ファイルの場合、親フォルダを設定
          setCurrentPath(pathInfo.parent);
          setPathInput(pathInfo.parent);
        } else if (pathInfo.type === "directory") {
          // ディレクトリの場合、そのまま設定
          setCurrentPath(path);
        }
        setSelectedItems(new Set());
        setSearchQuery("");
        setShowHistory(false);
      } catch (error) {
        console.error("パス情報の取得に失敗しました:", error);
        showError("パス情報の取得に失敗しました");
      }
    };

    checkAndSetPath();
  }, [path]);

  // パス変更時の履歴更新
  useEffect(() => {
    if (currentPath) {
      setPathInput(currentPath);
      const historyKey = `file-manager-history-${panelId}`;
      setPathHistory((prev) => {
        const newHistory = [currentPath, ...prev.filter((p) => p !== currentPath)].slice(0, 10);
        localStorage.setItem(historyKey, JSON.stringify(newHistory));
        return newHistory;
      });
      // 外部に通知
      onPathChange?.(currentPath);
    }
  }, [currentPath, panelId]);

  // フォルダに移動（パスチェック付き）
  const navigateToFolder = async (targetPath: string, fromNavigation = false) => {
    // 空のパスはスキップ
    if (!targetPath || targetPath.trim() === "") {
      return;
    }

    // 現在のパスと同じ場合はスキップ
    if (targetPath === currentPath) {
      return;
    }

    try {
      // パスの存在確認と種別チェック
      const pathInfo = await getPathInfo(targetPath);

      if (pathInfo.type === "not_found") {
        // 存在しないパスの場合、エラーメッセージを表示
        showError(`指定されたパスが見つかりません: ${targetPath}`);
        return;
      }

      // ファイルの場合は親フォルダに移動
      const finalPath = pathInfo.type === "file" && pathInfo.parent
        ? pathInfo.parent
        : targetPath;

      if (!fromNavigation) {
        // ユーザーアクションによる移動の場合、履歴を追加
        // 現在の状態を履歴に保存してから新しいエントリを追加
        setNavigationHistory((prev) => {
          // 現在のエントリの状態を更新
          const updated = prev.map((entry, idx) =>
            idx === navigationIndex
              ? { ...entry, focusedIndex, selectedItems: Array.from(selectedItems) }
              : entry
          );
          // 新しいエントリを追加（履歴の最大サイズを制限: 100件）
          const newEntry: NavigationHistoryEntry = { path: finalPath, focusedIndex: 0, selectedItems: [] };
          const newHistory = [...updated.slice(0, navigationIndex + 1), newEntry];
          return newHistory.slice(-100);
        });
        setNavigationIndex((prev) => Math.min(prev + 1, 99));
      }
      setCurrentPath(finalPath);
      setSelectedItems(new Set());
      setFocusedIndex(0);
      setSearchQuery("");
    } catch (error) {
      console.error("パス情報の取得に失敗しました:", error);
      showError("パス情報の取得に失敗しました");
    }
  };

  // 戻る
  const goBack = () => {
    if (navigationIndex > 0) {
      // 現在の状態を履歴に保存
      setNavigationHistory((prev) =>
        prev.map((entry, idx) =>
          idx === navigationIndex
            ? { ...entry, focusedIndex, selectedItems: Array.from(selectedItems) }
            : entry
        )
      );
      const newIndex = navigationIndex - 1;
      const targetEntry = navigationHistory[newIndex];
      setNavigationIndex(newIndex);
      setCurrentPath(targetEntry.path);
      setSelectedItems(new Set(targetEntry.selectedItems));
      setFocusedIndex(targetEntry.focusedIndex);
      setSearchQuery("");
    }
  };

  // 進む
  const goForward = () => {
    if (navigationIndex < navigationHistory.length - 1) {
      // 現在の状態を履歴に保存
      setNavigationHistory((prev) =>
        prev.map((entry, idx) =>
          idx === navigationIndex
            ? { ...entry, focusedIndex, selectedItems: Array.from(selectedItems) }
            : entry
        )
      );
      const newIndex = navigationIndex + 1;
      const targetEntry = navigationHistory[newIndex];
      setNavigationIndex(newIndex);
      setCurrentPath(targetEntry.path);
      setSelectedItems(new Set(targetEntry.selectedItems));
      setFocusedIndex(targetEntry.focusedIndex);
      setSearchQuery("");
    }
  };

  // 上の階層に移動
  const navigateUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    navigateToFolder("/" + parts.join("/"));
  };

  // 右クリックメニュー
  const handleContextMenu = (e: React.MouseEvent, item: FileItem) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  };

  // フルパスをコピー
  const copyFullPath = async (item: FileItem) => {
    try {
      // item.pathは既に絶対パス
      const fullPath = item.path || currentPath || "";
      await navigator.clipboard.writeText(fullPath);
      showSuccess("パスをコピーしました");
      setContextMenu(null);
    } catch {
      showError("コピーに失敗しました");
    }
  };

  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 選択項目を削除
  const handleDeleteSelected = async () => {
    if (selectedItems.size === 0) return;
    if (!confirm(`${selectedItems.size}件のアイテムを削除しますか？`)) return;

    const debugMode = localStorage.getItem('file_manager_debug_mode') === 'true';
    const paths = Array.from(selectedItems);

    try {
      // ファイル数をカウント（ネスト3階層まで）はNASで遅いため廃止
      // 選択されたアイテムの中にディレクトリが含まれているかチェック
      // allSortedItemsから情報を取得する必要がある
      const hasDirectory = paths.some(path => {
        const item = allSortedItems.find(i => i.path === path);
        return item && item.type === 'directory';
      });

      // 非同期モード判定: 3ファイル以上 または ディレクトリを含む
      const useAsyncMode = paths.length >= 3 || hasDirectory;

      if (useAsyncMode) {
        // 非同期モード: プログレスモーダルを表示
        deleteItemsBatch.mutateAsync({
          paths,
          asyncMode: true,
          debugMode
        }).then((result) => {
          if (result.status === 'async' && result.task_id) {
            setProgressOperationType('delete');
            setProgressTaskId(result.task_id);
            setProgressModalOpen(true);
            setSelectedItems(new Set());
          }
        }).catch((err) => {
          console.error("Batch delete failed:", err);
          showError(`削除処理中にエラーが発生しました: ${err.message}`);
        });
      } else {
        // 同期モード（1-2ファイル）
        deleteItemsBatch.mutateAsync({
          paths,
          asyncMode: false,
          debugMode
        }).then((result) => {
          if (result.status === 'completed' && result.success_count !== undefined) {
            if (result.success_count > 0) {
              showSuccess(`${result.success_count}件削除しました`);
              setSelectedItems(new Set());
            }
            if (result.fail_count && result.fail_count > 0) {
              showError(`${result.fail_count}件の削除に失敗しました`);
            }
            // ファイル一覧を更新
            queryClient.invalidateQueries({ queryKey: ["files"] });
          }
        }).catch((err) => {
          console.error("Delete failed:", err);
          showError(`削除処理中にエラーが発生しました: ${err.message}`);
        });
      }
    } catch (err: any) {
      console.error("Failed to count files:", err);
      showError(`ファイル数カウントに失敗しました: ${err.message}`);
    }
  };

  // フォルダ作成
  const handleCreateFolder = async () => {
    const name = prompt("フォルダ名を入力してください");
    if (!name) return;
    const parentPath = currentPath || "";
    await createFolder.mutateAsync({ parentPath, name });

    // 履歴に追加
    addOperation({
      type: "CREATE_FOLDER",
      canUndo: true,
      timestamp: Date.now(),
      data: {
        createdPath: `${parentPath}/${name}`,
      },
    });
  };

  // クリップボードからパスを開く
  const openFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        navigateToFolder(text.trim());
      }
    } catch {
      showError("クリップボードの読み取りに失敗しました");
    }
  };

  // フルパスをコピー
  const copyCurrentPath = async () => {
    if (!currentPath) return;
    try {
      await navigator.clipboard.writeText(currentPath || "/");
      showSuccess("パスをコピーしました");
    } catch {
      showError("コピーに失敗しました");
    }
  };

  // パス入力の確定
  const handlePathSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 空のパスはスキップ
    if (!pathInput || pathInput.trim() === "") {
      return;
    }

    try {
      // パスの存在確認
      const pathInfo = await getPathInfo(pathInput);

      if (pathInfo.type === "not_found") {
        // 存在しないパスの場合、エラーメッセージを表示して元のパスに戻す
        showError(`指定されたパスが見つかりません: ${pathInput}\n\n元のパスに戻ります。`);
        setPathInput(currentPath || ""); // 入力フィールドを元に戻す
        return;
      }

      if (pathInfo.type === "file" && pathInfo.parent) {
        // ファイルの場合、親フォルダに移動
        navigateToFolder(pathInfo.parent);
      } else if (pathInfo.type === "directory") {
        // ディレクトリの場合、そのまま移動
        navigateToFolder(pathInput);

        // 現在のパスと同じ場合でも履歴を更新動かしたい（一番上に持ってくる）
        const historyKey = `file-manager-history-${panelId}`;
        setPathHistory((prev) => {
          const newHistory = [pathInput, ...prev.filter((p) => p !== pathInput)].slice(0, 10);
          localStorage.setItem(historyKey, JSON.stringify(newHistory));
          return newHistory;
        });
      }
    } catch (error) {
      console.error("パス情報の取得に失敗しました:", error);
      showError(`パスの確認に失敗しました。\n\n元のパスに戻ります。`);
      setPathInput(currentPath || "");
    }
  };

  // ダウンロード
  const handleDownload = async () => {
    if (selectedItems.size === 0) {
      showError("ファイルを選択してください");
      return;
    }

    for (const path of selectedItems) {
      const item = allSortedItems.find(i => i.path === path);
      if (item && item.type === 'directory') {
        showError(`フォルダのダウンロードはサポートされていません: ${item.name}`);
        continue;
      }

      // ローカルAPI経由でダウンロード
      const url = getDownloadUrl(path);
      const link = document.createElement('a');
      link.href = url;
      link.download = ''; // ファイル名はサーバーレスポンスに従う
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      await new Promise(resolve => setTimeout(resolve, 500));
    }
  };

  // VSCodeで開く
  const handleOpenVSCode = async () => {
    const pathsToOpen = selectedItems.size > 0
      ? Array.from(selectedItems)
      : (currentPath ? [currentPath] : []);

    if (pathsToOpen.length === 0) {
      showError("開く対象がありません");
      return;
    }

    let successCount = 0;
    for (const path of pathsToOpen) {
      try {
        await openInVSCode(path);
        successCount++;
      } catch (e: any) {
        console.error(`Error opening in VSCode: ${path}`, e);
        showError(`VSCode起動エラー: ${e.message}`);
      }
    }

    if (successCount > 0) {
      showSuccess(`${successCount}件をVSCodeで開きました`);
    } else if (pathsToOpen.length > 0 && successCount === 0) {
      // 上記catchでエラー表示済み
    }
  };

  // エクスプローラー/Finderで開く
  const handleOpenExplorer = async () => {
    // 選択されたフォルダまたはファイルがあればその場所、なければカレントパス
    const targetPath = selectedItems.size > 0
      ? Array.from(selectedItems)[0] // 最初の1つだけ開く
      : currentPath;

    if (!targetPath) {
      return;
    }

    try {
      await openInExplorer(targetPath);
      showSuccess("フォルダを開きました");
    } catch (e: any) {
      console.error("Failed to open explorer:", e);
      showError(`フォルダを開けませんでした: ${e.message}`);
    }
  };

  // Jupyterを開く
  const handleOpenJupyter = async () => {
    // 選択なしならカレントディレクトリ、ありならそのパス
    const targetPath = selectedItems.size > 0
      ? Array.from(selectedItems)[0]
      : currentPath;

    if (!targetPath) return;

    try {
      await openInJupyter(targetPath);
      showSuccess("Jupyterを開きました");
    } catch (e: any) {
      console.error("Failed to open jupyter:", e);
      showError(`Jupyterを開けませんでした: ${e.message}`);
    }
  };

  // Excalidrawを開く (新規作成して開く)
  const handleOpenExcalidraw = async () => {
    // ファイル名入力プロンプト
    const name = prompt("ファイル名を入力してください");
    if (!name || !name.trim()) return;

    if (!currentPath) {
      showError("作成先フォルダが特定できません");
      return;
    }

    // 拡張子の決定
    // パスに 'obsidian' が含まれる場合は .excalidraw.md、それ以外は .excalidraw
    const isObsidian = currentPath.toLowerCase().includes('obsidian');
    const targetExtension = isObsidian ? '.excalidraw.md' : '.excalidraw';

    // 拡張子が既に入力されているかチェックし、なければ付与
    let filename = name.trim();
    if (!filename.endsWith(targetExtension)) {
      // 重複拡張子回避（.excalidrawと入力されたがObsidian環境の場合など）
      // シンプルに、末尾が想定拡張子でないなら追加する
      // .excalidraw.md の場合、.excalidrawだけついてても.mdを追加したい
      if (isObsidian && filename.endsWith('.excalidraw')) {
        filename += '.md';
      } else { // どちらの拡張子にも一致しない場合、targetExtensionを追加
        filename += targetExtension;
      }
    }

    try {
      // ファイル作成
      const cleanName = filename; // 階層トラバーサルチェックはバックエンドでやるが、念のため
      const result = await createFile(currentPath, cleanName, ""); // 空ファイル作成

      showSuccess(`ファイルを作成しました: ${cleanName}`);

      // 履歴に追加
      addOperation({
        type: "CREATE_FILE",
        canUndo: true,
        timestamp: Date.now(),
        data: {
          createdPath: result.path,
          content: "",
        },
      });

      // 作成したファイルを開く
      await openInExcalidraw(result.path);
      showSuccess("Excalidrawを開きました");

      // リスト更新
      refetch();

    } catch (e: any) {
      console.error("Failed to open excalidraw:", e);
      showError(`処理に失敗しました: ${e.message}`);
    }
  };

  // Antigravityで開く
  const handleOpenAntigravity = async () => {
    const pathsToOpen = selectedItems.size > 0
      ? Array.from(selectedItems)
      : (currentPath ? [currentPath] : []);

    if (pathsToOpen.length === 0) {
      showError("開く対象がありません");
      return;
    }

    let successCount = 0;
    for (const path of pathsToOpen) {
      try {
        await openInAntigravity(path);
        successCount++;
      } catch (e: any) {
        console.error(`Error opening in Antigravity: ${path}`, e);
        showError(`Antigravity起動エラー: ${e.message}`);
      }
    }

    if (successCount > 0) {
      showSuccess(`${successCount}件をAntigravityで開きました`);
    } else if (pathsToOpen.length > 0 && successCount === 0) {
      // 上記catchでエラー表示済み
    }
  };

  // Markdown作成を開く
  const handleOpenMarkdown = () => {
    const name = prompt("Markdownファイル名を入力してください（.md拡張子は自動付与）");
    if (!name || !name.trim()) return;

    if (!currentPath) {
      showError("作成先フォルダが特定できません");
      return;
    }

    // 拡張子の決定
    let filename = name.trim();
    if (!filename.endsWith('.md')) {
      filename += '.md';
    }

    setMdEditorFileName(filename);
    setMdEditorFilePath(null); // 新規作成なのでpathはまだない
    setMdEditorInitialContent(""); // 新規作成なので空
    setMdEditorOpen(true);
  };

  // Markdown保存
  const handleSaveMarkdown = async (content: string) => {
    if (!currentPath) return;

    setMdEditorSaving(true);
    try {
      if (mdEditorFilePath) {
        // 既存ファイルの更新
        await updateFile(mdEditorFilePath, content);
        showSuccess(`更新しました: ${mdEditorFileName}`);

        // 履歴に追加（戻れない操作として記録）
        addOperation({
          type: "UPDATE_FILE",
          canUndo: false,
          timestamp: Date.now(),
          data: {},
        });
      } else {
        // 新規ファイル作成
        const result = await createFile(currentPath, mdEditorFileName, content);
        setMdEditorFilePath(result.path);
        showSuccess(`作成しました: ${mdEditorFileName}`);

        // 履歴に追加
        addOperation({
          type: "CREATE_FILE",
          canUndo: true,
          timestamp: Date.now(),
          data: {
            createdPath: result.path,
            content,
          },
        });
      }
      refetch();
      setMdEditorOpen(false);
    } catch (e: any) {
      showError(`保存に失敗しました: ${e.message}`);
    } finally {
      setMdEditorSaving(false);
    }
  };

  // Markdownエディタを閉じる
  const handleCloseMdEditor = () => {
    setMdEditorOpen(false);
    setMdEditorFileName("");
    setMdEditorFilePath(null);
  };

  // Obsidianで開く
  const handleOpenObsidian = async () => {
    const pathsToOpen = selectedItems.size > 0
      ? Array.from(selectedItems)
      : (currentPath ? [currentPath] : []);

    if (pathsToOpen.length === 0) {
      showError("開く対象がありません");
      return;
    }

    let successCount = 0;
    for (const path of pathsToOpen) {
      try {
        await openInObsidian(path);
        successCount++;
      } catch (e: any) {
        console.error(`Error opening in Obsidian: ${path}`, e);
        showError(`Obsidian起動エラー: ${e.message}`);
      }
    }

    if (successCount > 0) {
      showSuccess(`${successCount}件をObsidianで開きました`);
    }
  };

  // 履歴フィルタリングとキーボード操作
  useEffect(() => {
    if (showHistory) {
      setHistoryFilter("");
      setHistorySelectedIndex(0);
      // ドロップダウンが表示されたらフィルタ入力にフォーカス
      // requestAnimationFrameを使用して確実にDOMが更新された後にフォーカスを当てる
      requestAnimationFrame(() => {
        historyInputRef.current?.focus();
      });
    }
  }, [showHistory]);

  const filteredHistory = useMemo(() => {
    if (!historyFilter) return pathHistory;
    return pathHistory.filter(p => p.toLowerCase().includes(historyFilter.toLowerCase()));
  }, [pathHistory, historyFilter]);

  const handleHistoryKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      setHistorySelectedIndex(prev => {
        const newIndex = Math.min(prev + 1, filteredHistory.length - 1);
        // 選択されたアイテムをスクロールして表示
        requestAnimationFrame(() => {
          const item = containerRef.current?.querySelector(`.history-item[data-index="${newIndex}"]`);
          item?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
        return newIndex;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      setHistorySelectedIndex(prev => {
        const newIndex = Math.max(prev - 1, 0);
        // 選択されたアイテムをスクロールして表示
        requestAnimationFrame(() => {
          const item = containerRef.current?.querySelector(`.history-item[data-index="${newIndex}"]`);
          item?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
        return newIndex;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (filteredHistory[historySelectedIndex]) {
        navigateToFolder(filteredHistory[historySelectedIndex]);
        setShowHistory(false);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setShowHistory(false);
    }
  };

  // フィルタリングと検索
  const filteredItems = useMemo(() => {
    let items = data?.items || [];

    // 検索フィルタ
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter((item) => item.name.toLowerCase().includes(query));
    }

    // タイプフィルタ (全/F/D)
    if (typeFilter === "folders") {
      items = items.filter((item) => item.type === "directory");
    } else if (typeFilter === "files") {
      items = items.filter((item) => item.type === "file");
    }

    // 拡張子フィルタ
    if (extFilter !== "all") {
      items = items.filter((item) => {
        if (item.type === "directory") return true;
        const ext = item.name.split(".").pop()?.toLowerCase();
        return extFilter.split('+').includes(ext || '');
      });
    }

    return items;
  }, [data?.items, searchQuery, typeFilter, extFilter]);

  // フォルダとファイルを分離してソート
  const { folders, files } = useMemo(() => {
    const f = filteredItems.filter((item) => item.type === "directory");
    const fi = filteredItems.filter((item) => item.type === "file");

    const sortFn = (a: any, b: any) => {
      let res = 0;
      if (sortKey === "name") {
        res = a.name.localeCompare(b.name);
      } else if (sortKey === "size") {
        res = (a.size || 0) - (b.size || 0);
      } else if (sortKey === "date") {
        const dateA = a.modified ? new Date(a.modified).getTime() : 0;
        const dateB = b.modified ? new Date(b.modified).getTime() : 0;
        res = dateA - dateB;
      }
      return sortOrder === "asc" ? res : -res;
    };

    return { folders: f.sort(sortFn), files: fi.sort(sortFn) };
  }, [filteredItems, sortKey, sortOrder]);

  // 全アイテム（フィルタとソート適用後）をメモ化
  const allSortedItems = useMemo(() => [...folders, ...files], [folders, files]);

  // ドラッグ開始
  const handleDragStart = (e: React.DragEvent, item: FileItem) => {
    // 複数選択されている場合、選択されたアイテム全てのリストを作成
    let dragData: FileItem[] = [];

    // 現在表示されている全アイテム（フィルタ適用後）
    const allVisibleItems = [...folders, ...files];

    if (selectedItems.has(item.path)) {
      // ドラッグしたアイテムが選択状態なら、選択済み全アイテムを対象にする
      dragData = allVisibleItems.filter(i => selectedItems.has(i.path));

      // 万が一漏れていた場合のマージ
      if (!dragData.find(d => d.path === item.path)) {
        dragData.push(item);
      }
    } else {
      // 選択されていないアイテムをドラッグした場合、その一つだけを対象にする
      dragData = [item];
    }


    // グローバル変数に保存
    globalDraggedItems = dragData;
    console.log(`DragStart: Selected=${selectedItems.size}, Prepared Items=${dragData.length}`);

    // dataTransferにもセット（互換性のため）
    e.dataTransfer.setData("text/plain", JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = "copyMove";
  };

  // ドラッグオーバー
  const handleDragOver = (e: React.DragEvent, targetPath: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverPath(targetPath);
  };

  // ドラッグ終了
  const handleDragLeave = () => {
    setDragOverPath(null);
  };

  // ドロップ
  const handleDrop = async (e: React.DragEvent, targetPath: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverPath(null);

    setDragOverPath(null);

    // グローバル変数から取得
    let items: FileItem[] = globalDraggedItems;

    // グローバル変数が空ならdataTransferから取得（外部からのドラッグ等の可能性用）
    if (items.length === 0) {
      const data = e.dataTransfer.getData("text/plain");
      if (data) {
        try {
          // 配列形式か単体形式かを判別してパース
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed)) {
            items = parsed;
          } else {
            items = [parsed];
          }
        } catch {
          console.error("Invalid drag data json");
        }
      }
    }

    if (items.length > 0) {
      console.log(`Drop: Processing ${items.length} items`);

      const srcPaths = items
        .filter(item => item.path !== targetPath)
        .map(item => item.path);

      if (srcPaths.length > 0) {
        // 設定を読み込み
        const verifyChecksum = localStorage.getItem('file_manager_verify_checksum') === 'true';
        const debugMode = localStorage.getItem('file_manager_debug_mode') === 'true';

        // クライアントサイドでの再帰カウント（countFiles）はNAS等で遅いため廃止
        // シンプルに「3つ以上のアイテム」または「フォルダが含まれる」場合は非同期モードとする
        // （フォルダが含まれる場合、中身が大量にある可能性があるため安全側に倒す）
        const hasDirectory = items.some(item => item.type === "directory");
        const useAsyncMode = srcPaths.length >= 3 || hasDirectory;

        if (useAsyncMode) {
          // 非同期モード: プログレスモーダルを表示
          moveItemsBatch.mutateAsync({
            srcPaths,
            destPath: targetPath,
            overwrite: false,
            verifyChecksum,
            asyncMode: true,
            debugMode
          }).then((result) => {
            if (result.status === 'async' && result.task_id) {
              setProgressOperationType('move');
              setProgressTaskId(result.task_id);
              setProgressModalOpen(true);

              // 履歴に追加（非同期モードでも成功時に追加）
              addOperation({
                type: "MOVE",
                canUndo: true,
                timestamp: Date.now(),
                data: {
                  srcPaths,
                  destParentPath: targetPath,
                },
              });
            }
          }).catch((err) => {
            console.error("Batch move failed:", err);
            showError("移動処理中にエラーが発生しました");
          });
        } else {
          // 同期モード: 従来通り
          moveItemsBatch.mutateAsync({
            srcPaths,
            destPath: targetPath,
            overwrite: false,
            verifyChecksum,
            asyncMode: false,
            debugMode
          }).then((result) => {
            if (result.status === 'completed' && result.success_count !== undefined) {
              handleBatchOperationResult('move', {
                success_count: result.success_count,
                fail_count: result.fail_count ?? 0,
                results: result.results ?? []
              }, targetPath);

              // 履歴に追加（同期モードで成功時）
              if (result.success_count > 0) {
                addOperation({
                  type: "MOVE",
                  canUndo: true,
                  timestamp: Date.now(),
                  data: {
                    srcPaths,
                    destParentPath: targetPath,
                  },
                });
              }
            }
          }).catch((err) => {
            console.error("Batch move failed:", err);
            showError("移動処理中にエラーが発生しました");
          });
        }
      }
    }

    // クリーンアップ
    globalDraggedItems = [];
  };

  // ドラッグ選択の状態
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);

  // Shift+ドラッグ中フラグ
  const [isShiftDragSelecting, setIsShiftDragSelecting] = useState(false);

  // isFocusedがtrueになったらcontainerRefにDOMフォーカスを当てる
  // これにより、ペイン切り替え後すぐにキーボード操作が有効になる
  // isFocusedがtrueの時、またはパス変更/ロード完了時にcontainerRefにDOMフォーカスを当てる
  // これにより、ペイン切り替え後やフォルダ移動後もキーボード操作が有効になる
  useEffect(() => {
    if (isFocused && containerRef.current && !isLoading) {
      // 念のため少し遅延させてフォーカス権を取り戻す
      requestAnimationFrame(() => {
        containerRef.current?.focus({ preventScroll: true });
      });
    }
  }, [isFocused, isLoading, currentPath]);

  // ツールバーボタンにキーボードフォーカスクラスを動的に付与
  useEffect(() => {
    if (focusedSection !== 'toolbar' || !containerRef.current) return;

    const toolbarButtons = containerRef.current.querySelectorAll('.icon-toolbar button');
    // 以前のフォーカスクラスをすべて削除
    toolbarButtons.forEach(btn => btn.classList.remove('keyboard-focused'));
    // 現在のインデックスにフォーカスクラスを追加
    if (toolbarButtons[toolbarButtonIndex]) {
      toolbarButtons[toolbarButtonIndex].classList.add('keyboard-focused');
    }

    return () => {
      // クリーンアップ時にすべてのフォーカスクラスを削除
      toolbarButtons.forEach(btn => btn.classList.remove('keyboard-focused'));
    };
  }, [focusedSection, toolbarButtonIndex]);

  // フィルタバーボタンにキーボードフォーカスクラスを動的に付与
  useEffect(() => {
    if (focusedSection !== 'filter' || !containerRef.current) return;

    const filterButtons = containerRef.current.querySelectorAll('.filter-bar .filter-btn');
    // 以前のフォーカスクラスをすべて削除
    filterButtons.forEach(btn => btn.classList.remove('keyboard-focused'));
    // 現在のインデックスにフォーカスクラスを追加
    if (filterButtons[filterButtonIndex]) {
      filterButtons[filterButtonIndex].classList.add('keyboard-focused');
    }

    return () => {
      // クリーンアップ時にすべてのフォーカスクラスを削除
      filterButtons.forEach(btn => btn.classList.remove('keyboard-focused'));
    };
  }, [focusedSection, filterButtonIndex]);

  // パスセクションのボタンにキーボードフォーカスクラスを動的に付与
  useEffect(() => {
    if (focusedSection !== 'path' || !containerRef.current) return;

    // パスセクションの要素: 履歴ボタン、コピーボタン、パス入力
    const historyButton = containerRef.current.querySelector('.path-input-container button[title="履歴"]');
    const copyButton = containerRef.current.querySelector('.path-input-container button[title="フルパスをコピー"]');
    const pathInput = containerRef.current.querySelector('.path-input-container .path-input');
    const elements = [historyButton, copyButton, pathInput].filter(Boolean);

    // 以前のフォーカスクラスをすべて削除
    elements.forEach(el => el?.classList.remove('keyboard-focused'));
    // 現在のインデックスにフォーカスクラスを追加
    if (elements[pathButtonIndex]) {
      elements[pathButtonIndex]?.classList.add('keyboard-focused');
    }

    return () => {
      // クリーンアップ時にすべてのフォーカスクラスを削除
      elements.forEach(el => el?.classList.remove('keyboard-focused'));
    };
  }, [focusedSection, pathButtonIndex]);

  // マウスダウン（ドラッグ選択開始）
  const handleMouseDown = (e: React.MouseEvent) => {
    // コンテナにフォーカスを当てる（これによりキーボードイベントを受け取れる）
    containerRef.current?.focus();

    // 左クリックのみ
    if (e.button !== 0) return;

    // Shiftキーが押されている場合は、テーブル行上でもドラッグ選択を許可
    const isShiftPressed = e.shiftKey;

    if (isShiftPressed) {
      // Shift+ドラッグ：テーブル行上でもドラッグ選択を開始
      // ただし、入力要素やボタンは除外
      if ((e.target as HTMLElement).closest('button, input, a')) return;

      // デフォルトの動作を防止（テキスト選択やドラッグを防ぐ）
      e.preventDefault();

      setIsDragSelecting(true);
      setIsShiftDragSelecting(true);
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setSelectionBox({ startX: x, startY: y, endX: x, endY: y });
      }
    } else {
      // 通常クリック：テーブル行上ではドラッグ選択を開始しない
      if ((e.target as HTMLElement).closest('button, input, a, .file-table tr')) return;

      setIsDragSelecting(true);
      setIsShiftDragSelecting(false);
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setSelectionBox({ startX: x, startY: y, endX: x, endY: y });
      }
    }
  };

  // マウスムーブ（ドラッグ中）
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragSelecting || !selectionBox || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setSelectionBox({ ...selectionBox, endX: x, endY: y });
  };

  // マウスアップ（ドラッグ終了・選択確定）
  const handleMouseUp = () => {
    if (!isDragSelecting || !selectionBox || !containerRef.current) {
      setIsDragSelecting(false);
      setSelectionBox(null);
      return;
    }

    // 選択ボックスの座標計算
    const left = Math.min(selectionBox.startX, selectionBox.endX);
    const top = Math.min(selectionBox.startY, selectionBox.endY);
    const width = Math.abs(selectionBox.endX - selectionBox.startX);
    const height = Math.abs(selectionBox.endY - selectionBox.startY);

    // 微小なドラッグは無視（クリックと誤認させないため）
    if (width < 5 && height < 5) {
      setIsDragSelecting(false);
      setSelectionBox(null);
      return;
    }

    // 選択判定
    const newSelected = new Set(selectedItems);
    const rows = containerRef.current.querySelectorAll('.file-table tbody tr');

    // 現在のスクロール位置を考慮
    // selectionBoxはcontainerRef内の相対座標
    // getBoundingClientRectはビューポート相対座標
    // 比較のために補正が必要だが、containerRef基準で統一する
    const containerRect = containerRef.current.getBoundingClientRect();

    rows.forEach((row) => {
      const rowRect = row.getBoundingClientRect();
      const rowTop = rowRect.top - containerRect.top + containerRef.current!.scrollTop;
      const rowLeft = rowRect.left - containerRect.left + containerRef.current!.scrollLeft;

      // 簡易的な交差判定
      // 行全体が含まれるか、あるいは交差しているか
      if (
        rowLeft < left + width &&
        rowLeft + rowRect.width > left &&
        rowTop < top + height &&
        rowTop + rowRect.height > top
      ) {
        // パスを取得（tr要素にdata-path属性があると便利だが、今回はindexから辿るか、FileIcon等から類推は難しい）
        // そのため、Reactのレンダリングサイクル内で要素に関連付けられたデータを知る必要がある。
        // 既存のDOM構造にはパス情報が埋め込まれていないため、data-pathを追加するのがベスト。
        const path = row.getAttribute('data-path');
        if (path) {
          newSelected.add(path);
        }
      }
    });

    setSelectedItems(newSelected);
    setIsDragSelecting(false);
    setIsShiftDragSelecting(false);
    setSelectionBox(null);
  };

  // ウィンドウ外でのマウスアップも検知するため
  useEffect(() => {
    if (isDragSelecting) {
      window.addEventListener('mouseup', handleMouseUp);
      return () => window.removeEventListener('mouseup', handleMouseUp);
    }
  }, [isDragSelecting, selectionBox]);

  // パネルへのドロップ
  const handlePanelDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (currentPath) {
      handleDrop(e, currentPath);
    }
  };

  // バッチ操作結果の共通ハンドラ
  const handleBatchOperationResult = async (
    operation: 'copy' | 'move',
    result: { success_count: number; fail_count: number; results: any[] },
    targetPath: string
  ) => {
    if (result.success_count > 0) {
      const opName = operation === 'copy' ? 'コピー' : '移動';
      showSuccess(`${result.success_count}件${opName}しました`);
      if (operation === 'move') {
        globalClipboard = null;
        // ドラッグ移動の場合は選択解除も行う
        setSelectedItems(new Set());
      }
    }

    console.log("Batch result:", result);

    if (result.fail_count > 0) {
      // エラーメッセージに「存在します」が含まれているかチェック
      const conflicts = result.results.filter((r: any) =>
        r.status === "error" && r.message && r.message.includes("存在します")
      );

      if (conflicts.length > 0) {
        if (confirm(`${conflicts.length}件のファイルが既に存在します。上書きしますか？`)) {
          const conflictPaths = conflicts.map((r: any) => r.path);
          try {
            const retryResult = operation === 'copy'
              ? await copyItemsBatch.mutateAsync({ srcPaths: conflictPaths, destPath: targetPath, overwrite: true })
              : await moveItemsBatch.mutateAsync({ srcPaths: conflictPaths, destPath: targetPath, overwrite: true });

            if ((retryResult.success_count ?? 0) > 0) {
              showSuccess(`${retryResult.success_count}件上書きしました`);
              if (operation === 'move' && (retryResult.fail_count ?? 0) === 0) {
                globalClipboard = null;
                setSelectedItems(new Set());
              }
            }
          } catch (retryErr) {
            console.error("Overwrite retry failed:", retryErr);
            showError("上書き処理中にエラーが発生しました");
          }
        }
      }

      // その他のエラー
      const otherErrors = result.results.filter((r: any) =>
        r.status === "error" && (!r.message || !r.message.includes("存在します"))
      );

      if (otherErrors.length > 0) {
        showError(`${otherErrors.length}件の処理に失敗しました`);
        otherErrors.forEach((r: any) => {
          console.error(`Failed to process ${r.path}: ${r.message}`);
        });
      }
    }
  };


  // アイテムクリックハンドラ（選択処理）
  const handleItemClick = (e: React.MouseEvent, path: string) => {
    // Checkboxクリック時は親へ伝搬しないようにonClickで止めているのでここには来ないはずだが念のため
    // e.stopPropagation(); 

    const isMultiSelect = e.ctrlKey || e.metaKey;
    const isRangeSelect = e.shiftKey;

    if (isRangeSelect && lastSelectedPath) {
      // 範囲選択
      const currentIndex = allSortedItems.findIndex(item => item.path === path);
      const lastIndex = allSortedItems.findIndex(item => item.path === lastSelectedPath);

      if (currentIndex !== -1 && lastIndex !== -1) {
        const start = Math.min(currentIndex, lastIndex);
        const end = Math.max(currentIndex, lastIndex);

        const newSelected = new Set(selectedItems);
        // 範囲内のアイテムを追加
        for (let i = start; i <= end; i++) {
          newSelected.add(allSortedItems[i].path);
        }
        setSelectedItems(newSelected);
      }
    } else if (isMultiSelect) {
      // 個別トグル選択
      const newSelected = new Set(selectedItems);
      if (newSelected.has(path)) {
        newSelected.delete(path);
      } else {
        newSelected.add(path);
        setLastSelectedPath(path);
      }
      setSelectedItems(newSelected);
    } else {
      // 単一選択（他をクリア）
      setSelectedItems(new Set([path]));
      setLastSelectedPath(path);
    }
  };

  // ファイルクリックハンドラ（ファイルを開く処理）
  // バックエンドの/api/open/smartでファイル種類判定・処理を行う
  const handleFileClick = async (item: FileItem) => {
    try {
      const result = await openSmart(item.path);

      if (result.action === "open_modal") {
        // Markdownエディタモーダルで開く
        setMdEditorFileName(item.name);
        setMdEditorFilePath(item.path);
        setMdEditorInitialContent(result.content || "");
        setMdEditorOpen(true);
      } else {
        // 外部アプリで開いた
        showSuccess(result.message);
      }
    } catch (e: any) {
      showError(e.message || "ファイルを開けませんでした");
    }
  };

  // キーボードショートカット
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    const isCmdOrCtrl = e.ctrlKey || e.metaKey;

    // ペインがフォーカスされている場合のみ処理
    if (!isFocused) return;

    // 戻る (Ctrl + Left)
    if (isCmdOrCtrl && e.key === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      goBack();
      return;
    }

    // 進む (Ctrl + Right)
    if (isCmdOrCtrl && e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      goForward();
      return;
    }

    // セクションごとの操作
    switch (focusedSection) {
      case 'toolbar':
        // 左右: ツールバーボタン切替
        if (e.key === 'ArrowLeft') {
          if (toolbarButtonIndex === 0) {
            // 左端の場合はイベントを通過させてペイン切り替えを許可
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          setToolbarButtonIndex(toolbarButtonIndex - 1);
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          // ツールバーボタンの最大インデックス（約16ボタン）
          const maxToolbarIndex = 15;
          if (toolbarButtonIndex < maxToolbarIndex) {
            setToolbarButtonIndex(toolbarButtonIndex + 1);
          }
          return;
        }
        // 下: 次のセクションへ
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          setFocusedSection('path');
          setPathButtonIndex(0); // 履歴ボタンから開始
          return;
        }
        // Enter: ボタンをクリック
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          // ツールバーボタンをクリック（DOMから取得）
          const toolbarButtons = containerRef.current?.querySelectorAll('.icon-toolbar button');
          if (toolbarButtons && toolbarButtons[toolbarButtonIndex]) {
            (toolbarButtons[toolbarButtonIndex] as HTMLButtonElement).click();
          }
          return;
        }
        break;

      case 'path':
        // 履歴ドロップダウンが開いている場合は履歴ナビゲーション
        if (showHistory) {
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            setHistorySelectedIndex(Math.max(0, historySelectedIndex - 1));
            return;
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            setHistorySelectedIndex(Math.min(filteredHistory.length - 1, historySelectedIndex + 1));
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            if (filteredHistory[historySelectedIndex]) {
              navigateToFolder(filteredHistory[historySelectedIndex]);
              setShowHistory(false);
            }
            return;
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setShowHistory(false);
            return;
          }
          return;
        }

        // 左右: パスセクション内のボタン切替
        if (e.key === 'ArrowLeft') {
          if (pathButtonIndex === 0) {
            // 左端の場合はイベントを通過させてペイン切り替えを許可
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          setPathButtonIndex(pathButtonIndex - 1);
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          // 0: 履歴、1: コピー、2: パス入力
          if (pathButtonIndex < 2) {
            setPathButtonIndex(pathButtonIndex + 1);
          }
          return;
        }
        // 上: 前のセクションへ
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          setFocusedSection('toolbar');
          return;
        }
        // 下: 次のセクションへ
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          setFocusedSection('filter');
          return;
        }
        // Enter: ボタンをクリックまたはパス入力フォーカス
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          if (pathButtonIndex === 0) {
            // 履歴ボタン: 履歴ドロップダウンを表示
            setShowHistory(!showHistory);
            setHistorySelectedIndex(0);
          } else if (pathButtonIndex === 1) {
            // コピーボタン: パスをコピー
            copyCurrentPath();
          } else if (pathButtonIndex === 2) {
            // パス入力: フォーカスを移動
            pathInputRef.current?.focus();
          }
          return;
        }
        break;

      case 'filter':
        // 左右: フィルタボタン切替
        if (e.key === 'ArrowLeft') {
          if (filterButtonIndex === 0) {
            // 左端の場合はイベントを通過させてペイン切り替えを許可
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          setFilterButtonIndex(filterButtonIndex - 1);
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          // フィルタボタンの最大インデックス（全10ボタン）
          const maxFilterIndex = 10;
          if (filterButtonIndex < maxFilterIndex) {
            setFilterButtonIndex(filterButtonIndex + 1);
          }
          return;
        }
        // 上: 前のセクションへ
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          setFocusedSection('path');
          setPathButtonIndex(0); // 履歴ボタンから開始
          return;
        }
        // 下: 次のセクションへ
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          setFocusedSection('search');
          searchInputRef.current?.focus();
          return;
        }
        // Enter: ボタンをクリック
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          const filterButtons = containerRef.current?.querySelectorAll('.filter-bar .filter-btn');
          if (filterButtons && filterButtons[filterButtonIndex]) {
            (filterButtons[filterButtonIndex] as HTMLButtonElement).click();
          }
          return;
        }
        break;

      case 'search':
        // 上: 前のセクションへ
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          setFocusedSection('filter');
          return;
        }
        // 下: 次のセクションへ
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          setFocusedSection('list');
          setFocusedIndex(0);
          return;
        }
        break;

      case 'list':
        // 上矢印: フォーカスを上に移動
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();

          if (focusedIndex === 0) {
            // 先頭で上を押したら検索セクションへ
            setFocusedSection('search');
            searchInputRef.current?.focus();
            return;
          }

          const newIndex = focusedIndex - 1;

          if (isCmdOrCtrl && e.shiftKey) {
            // Ctrl + Shift: 選択解除（なぞって解除）
            const newSelected = new Set(selectedItems);
            if (allSortedItems[focusedIndex]) {
              newSelected.delete(allSortedItems[focusedIndex].path);
            }
            if (allSortedItems[newIndex]) {
              newSelected.delete(allSortedItems[newIndex].path);
            }
            setSelectedItems(newSelected);
          } else if (e.shiftKey) {
            // Shift押下中は連続選択
            const newSelected = new Set(selectedItems);
            if (allSortedItems[focusedIndex]) {
              newSelected.add(allSortedItems[focusedIndex].path);
            }
            if (allSortedItems[newIndex]) {
              newSelected.add(allSortedItems[newIndex].path);
              setLastSelectedPath(allSortedItems[newIndex].path);
            }
            setSelectedItems(newSelected);
          }

          setFocusedIndex(newIndex);
          // フォーカスしたアイテムをスクロールして表示
          requestAnimationFrame(() => {
            const row = containerRef.current?.querySelector(`.file-table tbody tr[data-index="${newIndex}"]`);
            row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          });
          return;
        }

        // 下矢印: フォーカスを下に移動
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          const newIndex = Math.min(allSortedItems.length - 1, focusedIndex + 1);

          if (isCmdOrCtrl && e.shiftKey) {
            // Ctrl + Shift: 選択解除（なぞって解除）
            const newSelected = new Set(selectedItems);
            if (allSortedItems[focusedIndex]) {
              newSelected.delete(allSortedItems[focusedIndex].path);
            }
            if (allSortedItems[newIndex]) {
              newSelected.delete(allSortedItems[newIndex].path);
            }
            setSelectedItems(newSelected);
          } else if (e.shiftKey) {
            // Shift押下中は連続選択
            const newSelected = new Set(selectedItems);
            if (allSortedItems[focusedIndex]) {
              newSelected.add(allSortedItems[focusedIndex].path);
            }
            if (allSortedItems[newIndex]) {
              newSelected.add(allSortedItems[newIndex].path);
              setLastSelectedPath(allSortedItems[newIndex].path);
            }
            setSelectedItems(newSelected);
          }

          setFocusedIndex(newIndex);
          // フォーカスしたアイテムをスクロールして表示
          requestAnimationFrame(() => {
            const row = containerRef.current?.querySelector(`.file-table tbody tr[data-index="${newIndex}"]`);
            row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          });
          return;
        }

        // Ctrl + Enter: フォーカス中の行を選択トグル
        if (isCmdOrCtrl && e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          if (focusedIndex >= 0 && allSortedItems[focusedIndex]) {
            const item = allSortedItems[focusedIndex];
            toggleSelect(item.path);
          }
          return;
        }

        // Enter: フォーカス中の行を開く（選択済みの場合）
        if (e.key === 'Enter' && !isCmdOrCtrl) {
          e.preventDefault();
          e.stopPropagation();
          if (focusedIndex >= 0 && allSortedItems[focusedIndex]) {
            const item = allSortedItems[focusedIndex];
            if (selectedItems.has(item.path)) {
              // 選択済みなら開く
              if (item.type === 'directory') {
                navigateToFolder(item.path);
              } else {
                handleFileClick(item);
              }
            } else {
              // 未選択なら選択
              toggleSelect(item.path);
            }
          }
          return;
        }
        break;
    }

    // 全選択解除 (Ctrl + Shift + A)
    if (isCmdOrCtrl && e.shiftKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      e.stopPropagation(); // 他のペインへの干渉を防ぐ
      setSelectedItems(new Set());
      return;
    }

    // 全選択 (Ctrl + A)
    if (isCmdOrCtrl && !e.shiftKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      e.stopPropagation();
      const allPaths = allSortedItems.map(item => item.path);
      setSelectedItems(new Set(allPaths));
    }

    // コピー (Ctrl + C)
    if (isCmdOrCtrl && e.key.toLowerCase() === 'c') {
      if (selectedItems.size > 0) {
        e.preventDefault();
        e.stopPropagation();

        // グローバルクリップボードに保存
        globalClipboard = {
          paths: Array.from(selectedItems),
          op: 'copy'
        };

        showSuccess(`${selectedItems.size}件をコピーしました`);
      }
      return;
    }

    // 切り取り (Ctrl + X)
    if (isCmdOrCtrl && e.key.toLowerCase() === 'x') {
      if (selectedItems.size > 0) {
        e.preventDefault();
        e.stopPropagation();

        // グローバルクリップボードに保存
        globalClipboard = {
          paths: Array.from(selectedItems),
          op: 'move'
        };

        showSuccess(`${selectedItems.size}件を切り取りました`);
      }
      return;
    }

    // ペースト (Ctrl + V)
    if (isCmdOrCtrl && e.key.toLowerCase() === 'v') {
      if (globalClipboard && globalClipboard.paths.length > 0) {
        if (currentPath) {
          e.preventDefault();
          e.stopPropagation();

          const debugMode = localStorage.getItem('file_manager_debug_mode') === 'true';
          const verifyChecksum = localStorage.getItem('file_manager_verify_checksum') === 'true';

          // ファイル数をカウントして非同期モードかどうかを判定
          countFiles(globalClipboard.paths, 3).then((countResult) => {
            const totalFileCount = countResult.total_count;
            const useAsyncMode = totalFileCount >= 3;

            if (globalClipboard!.op === 'copy') {
              if (useAsyncMode) {
                // 非同期モード: プログレスバー表示
                const srcPaths = globalClipboard!.paths;
                copyItemsBatch.mutateAsync({
                  srcPaths,
                  destPath: currentPath,
                  verifyChecksum,
                  asyncMode: true,
                  debugMode
                }).then((result) => {
                  if (result.status === 'async' && result.task_id) {
                    setProgressOperationType('copy');
                    setProgressTaskId(result.task_id);
                    setProgressModalOpen(true);

                    // 履歴に追加（コピーされたファイルのパスを計算）
                    const copiedPaths = srcPaths.map((srcPath) => {
                      const fileName = srcPath.split("/").pop() || "";
                      return `${currentPath}/${fileName}`;
                    });
                    addOperation({
                      type: "COPY",
                      canUndo: true,
                      timestamp: Date.now(),
                      data: {
                        copiedPaths,
                        originalPaths: srcPaths,
                      },
                    });
                  }
                }).catch((err) => {
                  console.error("Paste failed:", err);
                  showError("ペースト処理中にエラーが発生しました");
                });
              } else {
                // 同期モード
                const srcPaths = globalClipboard!.paths;
                copyItemsBatch.mutateAsync({
                  srcPaths,
                  destPath: currentPath,
                  verifyChecksum,
                  asyncMode: false,
                  debugMode
                }).then((result) => {
                  if (result.success_count !== undefined) {
                    handleBatchOperationResult('copy', {
                      success_count: result.success_count,
                      fail_count: result.fail_count ?? 0,
                      results: result.results ?? []
                    }, currentPath);

                    // 履歴に追加（同期モードで成功時）
                    if (result.success_count > 0) {
                      const copiedPaths = srcPaths.map((srcPath) => {
                        const fileName = srcPath.split("/").pop() || "";
                        return `${currentPath}/${fileName}`;
                      });
                      addOperation({
                        type: "COPY",
                        canUndo: true,
                        timestamp: Date.now(),
                        data: {
                          copiedPaths,
                          originalPaths: srcPaths,
                        },
                      });
                    }
                  }
                }).catch((err) => {
                  console.error("Paste failed:", err);
                  showError("ペースト処理中にエラーが発生しました");
                });
              }
            } else if (globalClipboard!.op === 'move') {
              if (useAsyncMode) {
                // 非同期モード: プログレスバー表示
                moveItemsBatch.mutateAsync({
                  srcPaths: globalClipboard!.paths,
                  destPath: currentPath,
                  verifyChecksum,
                  asyncMode: true,
                  debugMode
                }).then((result) => {
                  if (result.status === 'async' && result.task_id) {
                    setProgressOperationType('move');
                    setProgressTaskId(result.task_id);
                    setProgressModalOpen(true);
                    // 切り取りの場合はクリップボードをクリア
                    globalClipboard = null;
                    setSelectedItems(new Set());
                  }
                }).catch((err) => {
                  console.error("Paste failed:", err);
                  showError("ペースト処理中にエラーが発生しました");
                });
              } else {
                // 同期モード
                moveItemsBatch.mutateAsync({
                  srcPaths: globalClipboard!.paths,
                  destPath: currentPath,
                  verifyChecksum,
                  asyncMode: false,
                  debugMode
                }).then((result) => {
                  if (result.success_count !== undefined) {
                    handleBatchOperationResult('move', {
                      success_count: result.success_count,
                      fail_count: result.fail_count ?? 0,
                      results: result.results ?? []
                    }, currentPath);
                  }
                }).catch((err) => {
                  console.error("Paste failed:", err);
                  showError("ペースト処理中にエラーが発生しました");
                });
              }
            }
          }).catch((err: any) => {
            console.error("Failed to count files:", err);
            showError(`ファイル数カウントに失敗しました: ${err.message}`);
          });
        }
      }
    }
    // 削除 (Delete / Cmd + Backspace)
    if (e.key === 'Delete' || (isCmdOrCtrl && e.key === 'Backspace')) {
      if (selectedItems.size > 0) {
        e.preventDefault();
        e.stopPropagation();
        handleDeleteSelected();
      }
      return;
    }

    // 選択解除 (Esc)
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setSelectedItems(new Set());
      setLastSelectedPath(null);
      return;
    }
  };

  // チェックボックス選択
  const toggleSelect = (path: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(path)) {
      newSelected.delete(path);
    } else {
      newSelected.add(path);
      setLastSelectedPath(path);
    }
    setSelectedItems(newSelected);
  };

  // ファイルサイズをフォーマット
  const formatSize = (bytes?: number) => {
    if (bytes === undefined) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // 日付をフォーマット
  const formatDate = (isoDate?: string) => {
    if (!isoDate) return "-";
    return new Date(isoDate).toLocaleDateString("ja-JP");
  };

  const handleSort = (key: "name" | "size" | "date") => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  const SortIcon = ({ col }: { col: "name" | "size" | "date" }) => {
    if (sortKey !== col) return null;
    return sortOrder === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  };

  // パス検証中またはファイル読み込み中
  if (!isPathValidated || isLoading) {
    return <div className="loading">読み込み中...</div>;
  }

  // パス検証済みで、有効なcurrentPathがない場合（通常は発生しない）
  if (!currentPath) {
    return <div className="error">パスが設定されていません</div>;
  }

  // エラー表示（パス検証後のエラーのみ）
  if (error) {
    return <div className="error">エラー: {(error as Error).message}</div>;
  }

  return (
    <div
      ref={containerRef}
      className={`file-list ${isShiftDragSelecting ? 'shift-drag-selecting' : ''}`}
      tabIndex={0} // キーボードイベントのために必要
      onKeyDown={handleKeyDown}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handlePanelDrop}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {selectionBox && (
        <div
          className="selection-box"
          style={{
            left: Math.min(selectionBox.startX, selectionBox.endX),
            top: Math.min(selectionBox.startY, selectionBox.endY),
            width: Math.abs(selectionBox.endX - selectionBox.startX),
            height: Math.abs(selectionBox.endY - selectionBox.startY),
          }}
        />
      )}
      {/* アイコンツールバー */}
      <div
        className={`icon-toolbar ${focusedSection === 'toolbar' ? 'section-focused' : ''}`}
        data-focused-index={focusedSection === 'toolbar' ? toolbarButtonIndex : undefined}
      >
        <button onClick={goBack} disabled={navigationIndex <= 0} title="戻る">
          <ArrowLeft size={16} />
        </button>
        <button onClick={goForward} disabled={navigationIndex >= navigationHistory.length - 1} title="進む">
          <ArrowRight size={16} />
        </button>
        <button onClick={navigateUp} disabled={!currentPath} title="上の階層へ">
          <ChevronUp size={16} />
        </button>
        <button onClick={() => navigateToFolder(effectiveInitialPath)} title="ホームへ">
          <Home size={16} />
        </button>
        <button onClick={() => navigateToFolder(getNetworkDrivePath())} title="ネットワークドライブへ">
          <Network size={16} />
        </button>
        <button onClick={openFromClipboard} title="クリップボードから開く">
          <ClipboardPaste size={16} />
        </button>
        <button onClick={handleDownload} title="ダウンロード">
          <Download size={16} />
        </button>
        <button onClick={handleOpenVSCode} title="VSCodeで開く">
          <Code size={16} />
        </button>
        <button onClick={handleOpenAntigravity} title="Antigravityで開く">
          <Rocket size={16} />
        </button>
        <button onClick={handleOpenExplorer} title="フォルダを開く">
          <FolderOpen size={16} />
        </button>
        <button onClick={handleOpenJupyter} title="Jupyterで開く">
          <img src="/icons/catppuccin/jupyter.svg" alt="Jupyter" width={16} height={16} />
        </button>
        <button onClick={handleOpenExcalidraw} title="Excalidrawで開く">
          <img src="/icons/catppuccin/excalidraw.svg" alt="Excalidraw" width={16} height={16} />
        </button>
        <button onClick={handleOpenMarkdown} title="Markdownファイル作成">
          <img src="/icons/catppuccin/markdown.svg" alt="Markdown" width={16} height={16} />
        </button>
        {/* Obsidianボタン：パスにobsidianを含む場合のみ表示 */}
        {currentPath && currentPath.toLowerCase().includes('obsidian') && (
          <>
            <div className="toolbar-divider" />
            <button onClick={handleOpenObsidian} title="Obsidianで開く">
              <Gem size={16} />
            </button>
          </>
        )}
        <div className="toolbar-divider" />
        <button onClick={handleCreateFolder} title="フォルダ作成">
          <FolderPlus size={16} />
        </button>
        <button
          onClick={handleDeleteSelected}
          disabled={selectedItems.size === 0}
          title="選択項目を削除"
          className="delete-btn"
        >
          <Trash2 size={16} />
        </button>
        <button onClick={() => refetch()} title="更新">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* パス入力 */}
      <div className="path-input-container">
        <button onClick={() => setShowHistory(!showHistory)} title="履歴" className="path-button">
          <History size={14} />
        </button>
        <button onClick={copyCurrentPath} title="フルパスをコピー" className="path-button">
          <Copy size={14} />
        </button>
        <form onSubmit={handlePathSubmit} className="path-form">
          <input
            ref={pathInputRef}
            type="text"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            placeholder="フルパスを入力"
            className="path-input"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                containerRef.current?.focus();
                setFocusedSection('filter');
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                containerRef.current?.focus();
                setFocusedSection('toolbar');
                setToolbarButtonIndex(0);
              } else if (e.key === 'ArrowLeft') {
                // カーソルが先頭の場合、コピーボタンに移動
                if ((e.target as HTMLInputElement).selectionStart === 0) {
                  e.preventDefault();
                  containerRef.current?.focus();
                  setFocusedSection('path');
                  setPathButtonIndex(1); // コピーボタン
                }
              }
            }}
          />
        </form>
        {showHistory && (
          <div className="history-dropdown">
            <input
              ref={historyInputRef}
              type="text"
              className="history-filter"
              placeholder="履歴を検索..."
              value={historyFilter}
              onChange={(e) => {
                setHistoryFilter(e.target.value);
                setHistorySelectedIndex(0);
              }}
              onKeyDown={handleHistoryKeyDown}
              onClick={(e) => e.stopPropagation()}
            />
            {filteredHistory.length > 0 ? (
              filteredHistory.map((path, index) => (
                <div
                  key={index}
                  data-index={index}
                  className={`history-item ${index === historySelectedIndex ? "selected" : ""}`}
                  onClick={() => {
                    navigateToFolder(path);
                    setShowHistory(false);
                  }}
                  onMouseEnter={() => setHistorySelectedIndex(index)}
                >
                  {path || "/"}
                </div>
              ))
            ) : (
              <div className="history-empty">履歴がありません</div>
            )}
          </div>
        )}
      </div>

      {/* フィルタバー */}
      <FilterBar
        typeFilter={typeFilter}
        extFilter={extFilter}
        onTypeChange={setTypeFilter}
        onExtChange={setExtFilter}
        isFocused={focusedSection === 'filter'}
      />

      {/* 検索バー */}
      <div className="search-bar">
        <Search size={14} className="search-icon" />
        <input
          ref={searchInputRef}
          type="text"
          placeholder="このページ内を検索"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              containerRef.current?.focus();
              setFocusedSection('list');
              setFocusedIndex(0);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              containerRef.current?.focus();
              setFocusedSection('filter');
            }
          }}
        />
      </div>

      {/* ファイル一覧テーブル */}
      <div className="table-container">
        <table className="file-table">
          <thead>
            <tr>
              <th className="checkbox-col"></th>
              <th className="name-col" onClick={() => handleSort("name")}>
                Name <SortIcon col="name" />
              </th>
              <th className="size-col" onClick={() => handleSort("size")}>
                Size <SortIcon col="size" />
              </th>
              <th className="date-col" onClick={() => handleSort("date")}>
                Date <SortIcon col="date" />
              </th>
            </tr>
          </thead>
          <tbody>
            {/* フォルダ */}
            {folders.map((item, index) => (
              <tr
                key={item.path}
                data-path={item.path}
                data-index={index}
                className={`${selectedItems.has(item.path) ? "selected" : ""} ${dragOverPath === item.path ? "drag-over" : ""} ${focusedIndex === index ? "focused" : ""}`}
                draggable
                onDragStart={(e) => handleDragStart(e, item)}
                onDragOver={(e) => handleDragOver(e, item.path)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, item.path)}
                onContextMenu={(e) => handleContextMenu(e, item)}
                onClick={(e) => {
                  onRequestFocus?.();
                  setFocusedIndex(index);
                  handleItemClick(e, item.path);
                }}
              >
                <td onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedItems.has(item.path)}
                    onChange={() => toggleSelect(item.path)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (selectedItems.has(item.path)) {
                          // 既に選択済みなら開く（フォルダに移動）
                          navigateToFolder(item.path);
                        } else {
                          // 未選択なら選択する
                          toggleSelect(item.path);
                        }
                      }
                    }}
                  />
                </td>
                <td className="name-cell">
                  <div className="name-cell-content">
                    <button
                      className="row-copy-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyFullPath(item);
                      }}
                      title="フルパスをコピー"
                    >
                      <Copy size={12} />
                    </button>
                    <div
                      className="name-info-wrapper"
                      onClick={() => navigateToFolder(item.path)}
                    >
                      <FileIcon name={item.name} type="directory" className="icon" />
                      <span>{item.name}</span>
                    </div>
                  </div>
                </td>
                <td className="size-col">
                  <div className="cell-content">
                    -
                  </div>
                </td>
                <td className="date-col">
                  <div className="cell-content">
                    {formatDate(item.modified)}
                  </div>
                </td>
              </tr>
            ))}

            {/* ファイル */}
            {files.map((item, index) => (
              <tr
                key={item.path}
                data-path={item.path}
                data-index={folders.length + index}
                className={`${selectedItems.has(item.path) ? "selected" : ""} ${focusedIndex === folders.length + index ? "focused" : ""}`}
                draggable
                onDragStart={(e) => handleDragStart(e, item)}
                onContextMenu={(e) => handleContextMenu(e, item)}
                onClick={(e) => {
                  onRequestFocus?.();
                  setFocusedIndex(folders.length + index);
                  handleItemClick(e, item.path);
                }}
                onDoubleClick={() => handleFileClick(item)}
              >
                <td onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedItems.has(item.path)}
                    onChange={() => toggleSelect(item.path)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (selectedItems.has(item.path)) {
                          // 既に選択済みなら開く（ファイルを開く）
                          handleFileClick(item);
                        } else {
                          // 未選択なら選択する
                          toggleSelect(item.path);
                        }
                      }
                    }}
                  />
                </td>
                <td className="name-cell">
                  <div className="name-cell-content">
                    <button
                      className="row-copy-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyFullPath(item);
                      }}
                      title="フルパスをコピー"
                    >
                      <Copy size={12} />
                    </button>
                    <div className="name-info-wrapper">
                      <FileIcon name={item.name} type="file" className="icon" />
                      <span>{item.name}</span>
                    </div>
                  </div>
                </td>
                <td className="size-col">
                  <div className="cell-content">
                    {formatSize(item.size)}
                  </div>
                </td>
                <td className="date-col">
                  <div className="cell-content">
                    {formatDate(item.modified)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 右クリックメニュー */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          item={contextMenu.item}
          onClose={() => setContextMenu(null)}
          currentPath={currentPath || ""}
        />
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

      {/* Markdownエディタモーダル */}
      <MarkdownEditorModal
        isOpen={mdEditorOpen}
        onClose={handleCloseMdEditor}
        onSave={handleSaveMarkdown}
        fileName={mdEditorFileName}
        isSaving={mdEditorSaving}
        initialContent={mdEditorInitialContent}
      />

      {/* プログレスモーダル */}
      <ProgressModal
        isOpen={progressModalOpen}
        taskId={progressTaskId}
        operationType={progressOperationType}
        onClose={() => {
          if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
          setProgressModalOpen(false);
          setProgressTaskId(null);
          // 全パネルのファイル一覧を更新
          queryClient.invalidateQueries({ queryKey: ["files"] });
        }}
        onComplete={(result) => {
          if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
          const messages = { move: "移動完了", copy: "コピー完了", delete: "削除完了" };
          let msg = messages[progressOperationType];

          // 詳細がある場合は追加情報を表示してもよいが、ここではシンプルに
          if (result && result.fail_count > 0) {
            msg += ` (成功: ${result.success_count}, 失敗: ${result.fail_count})`;
          }

          showSuccess(msg);
          // 全パネルのファイル一覧を更新
          queryClient.invalidateQueries({ queryKey: ["files"] });

          // 完了後はモーダルを閉じる（ProgressModal側でonCloseが呼ばれるのを待つか、ここで閉じるか）
          // ProgressModalは自動で閉じないので、ここで閉じる
          setProgressModalOpen(false);
          setProgressTaskId(null);
        }}
      />
    </div>
  );
}
