/**
 * ファイル検索コンポーネント（Everything風 + インデックスベース高速検索）
 * 指定フォルダ以下のファイルを再帰的に検索
 * 検索階層と除外パターンを設定可能
 * 外部インデックスサービス対応（Everything互換）
 */
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  Search,
  File,
  X,
  Minus,
  Plus,
  ChevronUp,
  ChevronDown,
  Copy,
  Loader,
  AlertCircle,
  ExternalLink,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { FileIcon } from "./FileIcon";
import { ContextMenu } from "./ContextMenu";
import { useToast } from "../hooks/useToast";
import {
  useSearchFiles,
  useExternalIndexStatus,
  useExternalIndexSearch,
  useDeleteItemsBatch,
} from "../hooks/useFiles";
import { getIndexServiceUrl } from "../api/indexService";
import { openSmart } from "../api/files";
import { getDefaultBasePath } from "../config";
import type { SearchParams } from "../types/file";
import "./FileSearch.css";
import { MarkdownEditorModal } from "./MarkdownEditorModal";
import { updateFile } from "../api/files";
import { useOperationHistoryContext } from "../contexts/OperationHistoryContext";


interface FileSearchProps {
  initialPath?: string;
  leftPanePath: string;
  rightPanePath: string;
  onSelectFolder?: (path: string) => void;
  onSelectRightFolder?: (path: string) => void;
  isFocused?: boolean;
  onRequestFocus?: () => void;
}

type TypeFilter = "all" | "file" | "directory";
type SearchMode = "off" | "live-left" | "live-right" | "index-left" | "index-right" | "index-all";

export function FileSearch({
  initialPath,
  leftPanePath,
  rightPanePath,
  onSelectFolder,
  onSelectRightFolder,
  isFocused = false,
  onRequestFocus
}: FileSearchProps) {
  // initialPathが未指定の場合はバックエンドから取得した値を使用
  const effectiveInitialPath = initialPath ?? getDefaultBasePath();
  const [query, setQuery] = useState("");
  const isComposing = useRef(false); // IME入力中フラグ
  const [fileNamePattern, setFileNamePattern] = useState(""); // ファイル名フィルタ
  const isComposingFilter = useRef(false); // フィルタ入力中フラグ
  const [depth, setDepth] = useState(1); // デフォルト1階層
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [debouncedFileNamePattern, setDebouncedFileNamePattern] = useState(""); // ファイル名フィルタ（デバウンス後）
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sortKey, setSortKey] = useState<"name" | "size" | "date">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [searchMode, setSearchMode] = useState<SearchMode>("off"); // デフォルトはoff
  const [useRegex, setUseRegex] = useState(true); // 正規表現モード
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set()); // 選択状態
  // ローカルフォーカス行インデックス（各ペインで独立）
  const [focusedIndex, setFocusedIndex] = useState<number>(0);

  // フォーカス中のUIセクション（上から順にナビゲート）
  type FocusSection = 'mode' | 'filter' | 'input' | 'results';
  const [focusedSection, setFocusedSection] = useState<FocusSection>('mode');
  // モードボタン内のフォーカスインデックス
  const searchModes: SearchMode[] = ['off', 'live-left', 'live-right', 'index-left', 'index-right', 'index-all'];
  const [modeButtonIndex, setModeButtonIndex] = useState(0);
  // フィルタボタン内のフォーカスインデックス (0:全, 1:F, 2:D, 3:深度-)
  const [filterButtonIndex, setFilterButtonIndex] = useState(0);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: { name: string; path: string; type: "file" | "directory" };
  } | null>(null);

  // Markdownエディタモーダルの状態
  const [mdEditorOpen, setMdEditorOpen] = useState(false);
  const [mdEditorFileName, setMdEditorFileName] = useState("");
  const [mdEditorFilePath, setMdEditorFilePath] = useState<string | null>(null);
  const [mdEditorSaving, setMdEditorSaving] = useState(false);
  const [mdEditorInitialContent, setMdEditorInitialContent] = useState("");

  const { addOperation } = useOperationHistoryContext();

  // チェックボックス選択のtoggle
  const toggleSelect = (path: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(path)) {
      newSelected.delete(path);
    } else {
      newSelected.add(path);
    }
    setSelectedItems(newSelected);
  };

  // ペインクリック時にフォーカス要求
  const handlePaneClick = () => {
    onRequestFocus?.();
  };

  // コンテナのref（キーボードフォーカス用）
  const containerRef = useRef<HTMLDivElement>(null);



  // 検索対象パスを決定
  const searchPath = useMemo(() => {
    if (searchMode === "index-left" || searchMode === "live-left") return leftPanePath;
    if (searchMode === "index-right" || searchMode === "live-right") return rightPanePath;
    if (searchMode === "index-all") return undefined; // 全体検索
    return effectiveInitialPath; // Fallback
  }, [searchMode, leftPanePath, rightPanePath, effectiveInitialPath]);

  // 外部サービス状態
  const { data: externalStatus, error: externalError, isLoading: externalLoading } = useExternalIndexStatus();

  // 初回ロード時に外部インデックスが利用可能ならデフォルトをONにする
  const hasInitializedSearchMode = useRef(false);

  useEffect(() => {
    if (!hasInitializedSearchMode.current && !externalLoading) {
      if (externalStatus?.ready) {
        setSearchMode("index-all");
      }
      hasInitializedSearchMode.current = true;
    }
  }, [externalStatus, externalLoading]);

  // 外部サービス使用判定
  const useExternalService = searchMode === "index-left" || searchMode === "index-right" || searchMode === "index-all";

  // 検索クエリのデバウンス
  useEffect(() => {
    // IME入力中は処理しない
    if (isComposing.current) return;

    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 800); // 300ms -> 800ms に延長（カクつき防止）
    return () => clearTimeout(timer);
  }, [query]);

  // ファイル名フィルタのデバウンス
  useEffect(() => {
    // IME入力中は処理しない
    if (isComposingFilter.current) return;

    const timer = setTimeout(() => {
      setDebouncedFileNamePattern(fileNamePattern);
    }, 800);
    return () => clearTimeout(timer);
  }, [fileNamePattern]);

  // 検索パラメータ（内部API用）
  const searchParams: SearchParams | null = useMemo(() => {
    if (searchMode === "off" || !debouncedQuery.trim() || useExternalService || !searchPath) return null;
    return {
      path: searchPath,
      query: debouncedQuery,
      depth,
      ignore: "node_modules,*.pyc,.venv,dist,build",
      maxResults: 1000,
      useIndex: false,  // Liveモードはインデックスを使用しない
      fileType: typeFilter,
      searchAllIndexes: false,
    };
  }, [searchPath, debouncedQuery, depth, useExternalService, typeFilter]);

  // 外部サービス検索パラメータ
  const externalSearchParams = useMemo(() => {
    if (searchMode === "off" || !debouncedQuery.trim() || !useExternalService) return null;
    return {
      query: debouncedQuery,
      path: searchMode === "index-all" ? undefined : searchPath,  // index-allは全体検索
      count: 1000,
      fileType: typeFilter,
    };
  }, [debouncedQuery, useExternalService, searchMode, searchPath, typeFilter]);

  // 検索実行（内部API）
  const { data, isLoading, error } = useSearchFiles(searchParams, !useExternalService);

  // 検索実行（外部API）
  const { data: externalData, isLoading: externalSearchLoading, error: externalSearchError } = useExternalIndexSearch(externalSearchParams, useExternalService);

  // 検索結果を統合
  const searchData = useMemo(() => {
    if (useExternalService && externalData) {
      // 外部APIの結果を内部形式に変換
      return {
        query: debouncedQuery,
        path: searchPath,
        depth,
        total: externalData.totalResults,
        items: externalData.results.map(r => ({
          name: r.name,
          type: r.type as "file" | "directory",
          path: r.path,
          size: r.size,
          modified: r.date_modified ? new Date(r.date_modified * 1000).toISOString() : undefined,
        })),
      };
    }
    return data;
  }, [useExternalService, externalData, data, debouncedQuery, searchPath, depth]);

  // 統合されたローディング状態
  const isSearchLoading = useExternalService ? externalSearchLoading : isLoading;
  const searchError = useExternalService ? externalSearchError : error;

  // isFocusedがtrueになった時、または検索モード変更時にcontainerRefにDOMフォーカスを当てる
  // 注：isSearchLoadingを依存配列から削除。検索完了時にフォーカスを奪わないため（連続検索を可能にする）
  useEffect(() => {
    if (isFocused && containerRef.current && focusedSection !== 'input') {
      requestAnimationFrame(() => {
        containerRef.current?.focus({ preventScroll: true });
      });
    }
  }, [isFocused, searchMode]);

  // ペインにフォーカスが来た時のセクション初期化
  // 検索結果があればresults、なければmodeからスタート
  useEffect(() => {
    if (isFocused) {
      // 検索結果がある場合はresultsセクションへ
      const hasResults = searchData && searchData.items && searchData.items.length > 0;
      if (hasResults) {
        setFocusedSection('results');
        setFocusedIndex(0);
      } else {
        setFocusedSection('mode');
        setModeButtonIndex(searchModes.indexOf(searchMode));
      }
    }
  }, [isFocused]);
  // const handleRefetch = useExternalService ? externalRefetch : refetch;

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

  // パスをクリップボードにコピー
  const copyPath = useCallback(async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
    } catch {
      // 無視
    }
  }, []);

  // ファイル名パターンマッチング関数
  const matchesFileNamePattern = useCallback((fileName: string, pattern: string, isRegex: boolean): boolean => {
    if (!pattern) return true;

    try {
      if (isRegex) {
        // 正規表現モード
        const regex = new RegExp(pattern, 'i');
        return regex.test(fileName);
      } else {
        // キーワードモード：スペース区切りでOR検索
        const keywords = pattern.trim().split(/\s+/); // スペースで分割
        const fileNameLower = fileName.toLowerCase();

        // いずれかのキーワードがファイル名に含まれていればtrue
        return keywords.some(keyword => {
          const keywordLower = keyword.toLowerCase();
          // ファイル名または拡張子に含まれているかチェック
          // 例: "md" → ".md" ".markdown" "readme.md" などにマッチ
          return fileNameLower.includes(keywordLower);
        });
      }
    } catch {
      // エラーの場合は部分一致で処理
      return fileName.toLowerCase().includes(pattern.toLowerCase());
    }
  }, []);

  // フォルダとファイルを分離してソート（フィルタ適用）
  const sortedResults = useMemo(() => {
    if (!searchData?.items) return { folders: [], files: [], total: 0 };

    let filteredItems = searchData.items;

    // タイプフィルタを適用
    if (typeFilter === "file") {
      filteredItems = searchData.items.filter((item) => item.type === "file");
    } else if (typeFilter === "directory") {
      filteredItems = searchData.items.filter((item) => item.type === "directory");
    }

    // ファイル名パターンフィルタを適用
    if (debouncedFileNamePattern) {
      filteredItems = filteredItems.filter((item) =>
        matchesFileNamePattern(item.name, debouncedFileNamePattern, useRegex)
      );
    }

    const folders = filteredItems.filter((item) => item.type === "directory");
    const files = filteredItems.filter((item) => item.type === "file");

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

    return {
      folders: folders.sort(sortFn),
      files: files.sort(sortFn),
      total: filteredItems.length
    };
  }, [searchData?.items, typeFilter, debouncedFileNamePattern, useRegex, matchesFileNamePattern, sortKey, sortOrder]);



  // コンテキストメニュー処理
  const deleteItemsBatch = useDeleteItemsBatch();
  const { showSuccess, showError } = useToast();

  const handleContextMenu = (e: React.MouseEvent, item: { name: string; path: string; type: "file" | "directory" }) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      item,
    });
  };

  // ファイルクリックハンドラ（ファイルを開く処理）
  const handleFileClick = async (item: { name: string, path: string }) => {
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

  // Markdown保存
  const handleSaveMarkdown = async (content: string) => {
    if (!mdEditorFilePath) return;

    setMdEditorSaving(true);
    try {
      // 既存ファイルの更新
      await updateFile(mdEditorFilePath, content);
      showSuccess(`更新しました: ${mdEditorFileName}`);

      // 履歴に追加
      addOperation({
        type: "UPDATE_FILE",
        canUndo: false,
        timestamp: Date.now(),
        data: {},
      });

      setMdEditorOpen(false);

      // フォーカス復帰
      onRequestFocus?.();
      setTimeout(() => {
        containerRef.current?.focus();
      }, 50);
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
    containerRef.current?.focus();
  };

  const getParentPath = (path: string) => {
    // パス区切りは / を想定（Mac/Linux）
    const parts = path.split("/");
    parts.pop();
    return parts.join("/") || "/";
  };

  const handleOpenInLeft = () => {
    if (!contextMenu || !onSelectFolder) return;
    const path = contextMenu.item.type === "file"
      ? getParentPath(contextMenu.item.path)
      : contextMenu.item.path;
    onSelectFolder(path);
    setContextMenu(null);
  };

  const handleOpenInRight = () => {
    if (!contextMenu || !onSelectRightFolder) return;
    const path = contextMenu.item.type === "file"
      ? getParentPath(contextMenu.item.path)
      : contextMenu.item.path;
    onSelectRightFolder(path);
    setContextMenu(null);
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

  // 全アイテム（フォルダ + ファイル）を結合
  const allResults = useMemo(() => {
    return [...sortedResults.folders, ...sortedResults.files];
  }, [sortedResults.folders, sortedResults.files]);

  // 検索完了後は検索ボックスのフォーカスを維持（連続検索を可能にする）
  // ユーザーが矢印キー下を押した時のみresultsセクションへ移動する
  // 以前の動作：検索完了後に自動的にresultsセクションへ移動してフォーカスを外していた

  // 検索入力のref
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isCmdOrCtrl = (e: React.KeyboardEvent) => e.ctrlKey || e.metaKey;

  // フィルタ設定の配列
  const typeFilters: TypeFilter[] = ['all', 'file', 'directory'];

  // キーボードナビゲーション
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 入力フィールドにフォーカスがある場合は専用ハンドラに任せる
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    // ペインがフォーカスされている場合のみ操作を処理
    if (!isFocused) return;

    // / キー: 検索入力にフォーカス
    if (e.key === '/') {
      e.preventDefault();
      e.stopPropagation();
      setFocusedSection('input');
      searchInputRef.current?.focus();
      return;
    }

    // Esc: 選択解除
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setSelectedItems(new Set());
      return;
    }

    // セクションごとの操作
    switch (focusedSection) {
      case 'mode':
        // 左右: モードボタン切替
        if (e.key === 'ArrowLeft') {
          if (modeButtonIndex === 0) {
            // 左端の場合はイベントを通過させてペイン切り替えを許可
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          const newIdx = modeButtonIndex - 1;
          setModeButtonIndex(newIdx);
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          const newIdx = Math.min(searchModes.length - 1, modeButtonIndex + 1);
          setModeButtonIndex(newIdx);
          return;
        }
        // Enter: モード確定
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          setSearchMode(searchModes[modeButtonIndex]);
          return;
        }
        // 下: 次のセクションへ
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          setFocusedSection('filter');
          setFilterButtonIndex(typeFilters.indexOf(typeFilter));
          return;
        }
        break;

      case 'filter':
        // 左右: フィルタ/深度切替
        if (e.key === 'ArrowLeft') {
          if (filterButtonIndex === 0) {
            // 左端の場合はイベントを通過させてペイン切り替えを許可
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          // filterButtonIndex: 0-2 = typeFilter, 3+ = depth
          if (filterButtonIndex <= 2) {
            // typeFilter内を移動
            setFilterButtonIndex(filterButtonIndex - 1);
          } else if (filterButtonIndex === 3) {
            // depthからtypeFilterへ
            setFilterButtonIndex(2);
          }
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          if (filterButtonIndex < 3) {
            setFilterButtonIndex(filterButtonIndex + 1);
          }
          return;
        }
        // Enter: フィルタ確定 or 深度変更
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          if (filterButtonIndex <= 2) {
            setTypeFilter(typeFilters[filterButtonIndex]);
          } else if (filterButtonIndex === 3) {
            // 深度は左右で操作するのでEnterでは何もしない（または+1）
            setDepth(depth + 1);
          }
          return;
        }
        // Backspace/Delete: 深度を減らす（filterButtonIndex === 3の時）
        if ((e.key === 'Backspace' || e.key === 'Delete') && filterButtonIndex === 3) {
          e.preventDefault();
          e.stopPropagation();
          setDepth(Math.max(0, depth - 1));
          return;
        }
        // 上: 前のセクションへ
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          setFocusedSection('mode');
          return;
        }
        // 下: 次のセクションへ
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          setFocusedSection('input');
          searchInputRef.current?.focus();
          return;
        }
        break;

      case 'input':
        // inputセクションはテキスト入力なので、コンテナにフォーカスが来た時は結果リストへ
        // (通常はinput要素自体にフォーカスがあるはずだが、念のため)
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          setFocusedSection('filter');
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          setFocusedSection('results');
          setFocusedIndex(0);
          return;
        }
        break;

      case 'results':
        // 検索結果リストのナビゲーション
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          if (focusedIndex === 0) {
            // 先頭で上を押したら入力欄へ
            setFocusedSection('input');
            searchInputRef.current?.focus();
            return;
          }
          const newIndex = Math.max(0, focusedIndex - 1);
          // Shift選択
          if (e.shiftKey) {
            const isCtrl = isCmdOrCtrl(e);
            const newSelected = new Set(selectedItems);
            if (isCtrl) {
              if (allResults[focusedIndex]) newSelected.delete(allResults[focusedIndex].path);
              if (allResults[newIndex]) newSelected.delete(allResults[newIndex].path);
            } else {
              if (allResults[focusedIndex]) newSelected.add(allResults[focusedIndex].path);
              if (allResults[newIndex]) newSelected.add(allResults[newIndex].path);
            }
            setSelectedItems(newSelected);
          }
          setFocusedIndex(newIndex);
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          const newIndex = Math.min(allResults.length - 1, focusedIndex + 1);
          // Shift選択
          if (e.shiftKey) {
            const isCtrl = isCmdOrCtrl(e);
            const newSelected = new Set(selectedItems);
            if (isCtrl) {
              if (allResults[focusedIndex]) newSelected.delete(allResults[focusedIndex].path);
              if (allResults[newIndex]) newSelected.delete(allResults[newIndex].path);
            } else {
              if (allResults[focusedIndex]) newSelected.add(allResults[focusedIndex].path);
              if (allResults[newIndex]) newSelected.add(allResults[newIndex].path);
            }
            setSelectedItems(newSelected);
          }
          setFocusedIndex(newIndex);
          return;
        }
        // Ctrl + A: 全選択
        if (isCmdOrCtrl(e) && e.key.toLowerCase() === 'a') {
          e.preventDefault();
          e.stopPropagation();
          const allPaths = allResults.map(item => item.path);
          setSelectedItems(new Set(allPaths));
          return;
        }
        // Enter: フォーカス中の行を開く（選択済みの場合）または選択
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          if (focusedIndex >= 0 && allResults[focusedIndex]) {
            const item = allResults[focusedIndex];
            if (selectedItems.has(item.path)) {
              if (item.type === 'directory') {
                onSelectFolder?.(item.path);
              } else {
                handleFileClick(item);
              }
            } else {
              toggleSelect(item.path);
            }
          }
          return;
        }
        break;
    }
  };

  // 検索入力でのキーハンドリング
  const handleSearchInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      // 検索結果がある場合のみresultsセクションへ移動
      if (allResults.length > 0) {
        containerRef.current?.focus();
        setFocusedSection('results');
        setFocusedIndex(0);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      containerRef.current?.focus();
      setFocusedSection('filter');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      containerRef.current?.focus();
      setFocusedSection('mode');
    }
  };

  return (
    <div
      ref={containerRef}
      className="file-search"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* 1段目：検索モード選択 */}
      <div className="index-status">
        <button
          className={`mode-toggle ${searchMode === "off" ? "active" : ""} ${focusedSection === 'mode' && modeButtonIndex === 0 ? "keyboard-focused" : ""}`}
          onClick={() => setSearchMode("off")}
          title="検索オフ"
        >
          OFF
        </button>
        <button
          className={`mode-toggle ${searchMode === "live-left" ? "active" : ""} ${focusedSection === 'mode' && modeButtonIndex === 1 ? "keyboard-focused" : ""}`}
          onClick={() => setSearchMode("live-left")}
          title={`左ペインのパス (${leftPanePath}) をリアルタイム検索`}
        >
          Live(L)
        </button>
        <button
          className={`mode-toggle ${searchMode === "live-right" ? "active" : ""} ${focusedSection === 'mode' && modeButtonIndex === 2 ? "keyboard-focused" : ""}`}
          onClick={() => setSearchMode("live-right")}
          title={`右ペインのパス (${rightPanePath}) をリアルタイム検索`}
        >
          Live(R)
        </button>
        <button
          className={`mode-toggle ${searchMode === "index-left" ? "active" : ""} ${focusedSection === 'mode' && modeButtonIndex === 3 ? "keyboard-focused" : ""}`}
          onClick={() => setSearchMode("index-left")}
          title={`左ペインのパス (${leftPanePath}) を検索`}
        >
          Index(L)
        </button>
        <button
          className={`mode-toggle ${searchMode === "index-right" ? "active" : ""} ${focusedSection === 'mode' && modeButtonIndex === 4 ? "keyboard-focused" : ""}`}
          onClick={() => setSearchMode("index-right")}
          title={`右ペインのパス (${rightPanePath}) を検索`}
        >
          Index(R)
        </button>
        <button
          className={`mode-toggle ${searchMode === "index-all" ? "active" : ""} ${focusedSection === 'mode' && modeButtonIndex === 5 ? "keyboard-focused" : ""}`}
          onClick={() => setSearchMode("index-all")}
          title="全インデックス検索（Everything風）"
        >
          Index(ALL)
        </button>

        {/* ステータス表示 */}
        {useExternalService ? (
          <span className="index-info external-status">
            {externalLoading ? (
              <>
                <Loader size={12} className="spin" />
                接続中...
              </>
            ) : externalError ? (
              <>
                <XCircle size={12} className="error-icon" />
                接続エラー
              </>
            ) : externalStatus ? (
              externalStatus.ready ? (
                <>
                  <CheckCircle size={12} className="success-icon" />
                  {externalStatus.total_indexed.toLocaleString()} ファイル
                </>
              ) : externalStatus.paths.some(p => p.status === "scanning") ? (
                <>
                  <Loader size={12} className="spin" />
                  準備中...
                </>
              ) : (
                <>
                  <AlertCircle size={12} className="warning-icon" />
                  準備中
                </>
              )
            ) : (
              <>
                <AlertCircle size={12} className="warning-icon" />
                未接続
              </>
            )}
            <a
              href={getIndexServiceUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="service-url"
              title="インデックスサービスを開く"
            >
              <ExternalLink size={10} />
            </a>
          </span>
        ) : null}
      </div>

      {/* 外部サービス接続エラー時の警告 */}
      {useExternalService && externalError && (
        <div className="external-error-banner">
          <AlertCircle size={14} />
          <span>インデックスサービスに接続できません: {getIndexServiceUrl()}</span>
        </div>
      )}

      {/* 2段目：フィルタボタン */}
      <div className="search-row">
        <div className="search-filters">
          <button
            className={`type-filter-btn ${typeFilter === "all" ? "active" : ""} ${focusedSection === 'filter' && filterButtonIndex === 0 ? "keyboard-focused" : ""}`}
            onClick={() => setTypeFilter("all")}
            title="すべて"
          >
            全
          </button>
          <button
            className={`type-filter-btn ${typeFilter === "file" ? "active" : ""} ${focusedSection === 'filter' && filterButtonIndex === 1 ? "keyboard-focused" : ""}`}
            onClick={() => setTypeFilter("file")}
            title="ファイルのみ"
          >
            F
          </button>
          <button
            className={`type-filter-btn ${typeFilter === "directory" ? "active" : ""} ${focusedSection === 'filter' && filterButtonIndex === 2 ? "keyboard-focused" : ""}`}
            onClick={() => setTypeFilter("directory")}
            title="フォルダのみ"
          >
            D
          </button>
          <div className={`depth-control ${focusedSection === 'filter' && filterButtonIndex === 3 ? "keyboard-focused" : ""}`}>
            <button
              className="depth-btn"
              onClick={() => setDepth(Math.max(0, depth - 1))}
              disabled={depth === 0}
              title="階層を減らす（Backspaceキー）"
            >
              <Minus size={10} />
            </button>
            <span className="depth-value" title="検索階層（Enterで+1）">{depth === 0 ? "∞" : depth}</span>
            <button
              className="depth-btn"
              onClick={() => setDepth(depth + 1)}
              title="階層を増やす（Enterキー）"
            >
              <Plus size={10} />
            </button>
          </div>
          <div className="external-link-container" style={{ marginLeft: '12px', fontSize: '12px' }}>
            <a href="http://localhost:5174" target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', textDecoration: 'underline' }}>
              index検索のGUIへのリンク
            </a>
          </div>
        </div>
      </div>

      {/* 3段目：キーワード検索 + ファイル名フィルタ（横並び） */}
      <div className="search-row">
        <div className="search-input-container">
          <Search size={16} className="search-icon" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchInputKeyDown}
            onCompositionStart={() => {
              isComposing.current = true;
            }}
            onCompositionEnd={(e) => {
              isComposing.current = false;
              // IME確定時に検索実行
              setDebouncedQuery(e.currentTarget.value);
              // queryの状態も確実に更新
              setQuery(e.currentTarget.value);
            }}
            placeholder="キーワードを入力（例：確定申告）"
            className="search-input"
          />
          {query && (
            <button onClick={() => setQuery("")} className="clear-btn" title="クリア">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="search-input-container filter-input-container">
          <File size={16} className="search-icon" />
          <input
            type="text"
            value={fileNamePattern}
            onChange={(e) => setFileNamePattern(e.target.value)}
            onKeyDown={handleSearchInputKeyDown}
            onCompositionStart={() => {
              isComposingFilter.current = true;
            }}
            onCompositionEnd={(e) => {
              isComposingFilter.current = false;
              setDebouncedFileNamePattern(e.currentTarget.value);
              setFileNamePattern(e.currentTarget.value);
            }}
            placeholder={useRegex ? "正規表現" : "キーワード (例: md pdf txt)"}
            className="search-input"
          />
          {fileNamePattern && (
            <button onClick={() => setFileNamePattern("")} className="clear-btn" title="クリア">
              <X size={14} />
            </button>
          )}
        </div>

        <button
          className={`regex-toggle ${useRegex ? "active" : ""}`}
          onClick={() => setUseRegex(!useRegex)}
          title={useRegex ? "正規表現モード（有効）" : "キーワードモード（無効）"}
        >
          .*
        </button>
      </div>

      {/* 検索結果情報 */}
      {searchData && (
        <div className="search-info">
          <span>
            {sortedResults.total} 件の結果
            {typeFilter !== "all" && ` (全${searchData.total}件中)`}
          </span>
          {depth > 0 && !useExternalService && <span>（{depth}階層まで）</span>}
        </div>
      )}

      {/* 検索結果 */}
      <div className="search-results">
        {isSearchLoading && <div className="loading">検索中...</div>}

        {searchError && <div className="error">エラー: {(searchError as Error).message}</div>}

        {!isSearchLoading && !searchError && !searchData && !query && (
          <div className="placeholder">
            検索キーワードを入力してください
          </div>
        )}

        {!isSearchLoading && !searchError && searchData && searchData.items.length === 0 && (
          <div className="no-results">
            「{searchData.query}」に一致するファイルはありません
          </div>
        )}

        {searchData && searchData.items.length > 0 && (
          <table className="results-table">
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
              {sortedResults.folders.map((item: any, index: number) => (
                <tr
                  key={item.path}
                  className={`${selectedItems.has(item.path) ? "selected" : ""} ${focusedSection === 'results' && focusedIndex === index ? "keyboard-focused" : ""}`}
                  onContextMenu={(e) => handleContextMenu(e, item)}
                  title={item.path}
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    handlePaneClick();
                    setFocusedSection('results');
                    setFocusedIndex(index);
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
                            onSelectFolder?.(item.path);
                          } else {
                            toggleSelect(item.path);
                          }
                        }
                      }}
                    />
                  </td>
                  <td className="name-cell" onClick={() => onSelectFolder?.(item.path)}>
                    <button
                      className="row-copy-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyPath(item.path);
                      }}
                      title="フルパスをコピー"
                    >
                      <Copy size={12} />
                    </button>
                    <FileIcon name={item.name} type="directory" size={16} className="icon folder-icon" />
                    <div className="name-info">
                      <span className="item-name">{item.name}</span>
                      <span className="item-path">{item.path}</span>
                    </div>
                  </td>
                  <td>-</td>
                  <td>{formatDate(item.modified)}</td>
                </tr>
              ))}
              {/* ファイル */}
              {sortedResults.files.map((item: any, index: number) => (
                <tr
                  key={item.path}
                  className={`${selectedItems.has(item.path) ? "selected" : ""} ${focusedSection === 'results' && focusedIndex === sortedResults.folders.length + index ? "keyboard-focused" : ""}`}
                  onContextMenu={(e) => handleContextMenu(e, item)}
                  onDoubleClick={() => handleFileClick(item)}
                  title={item.path}
                  onClick={() => {
                    handlePaneClick();
                    setFocusedSection('results');
                    setFocusedIndex(sortedResults.folders.length + index);
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
                            // 既に選択済みならファイルを開く
                            handleFileClick(item);
                          } else {
                            toggleSelect(item.path);
                          }
                        }
                      }}
                    />
                  </td>
                  <td className="name-cell" onClick={() => copyPath(item.path)}>
                    <button
                      className="row-copy-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyPath(item.path);
                      }}
                      title="フルパスをコピー"
                    >
                      <Copy size={12} />
                    </button>
                    <FileIcon name={item.name} type="file" size={16} className="icon file-icon" />
                    <div className="name-info">
                      <span className="item-name">{item.name}</span>
                      <span className="item-path">{item.path}</span>
                    </div>
                  </td>
                  <td>{formatSize(item.size)}</td>
                  <td>{formatDate(item.modified)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          item={contextMenu.item as any} // FileItem型と互換性あり
          currentPath={getParentPath(contextMenu.item.path)}
          onClose={() => setContextMenu(null)}
          onOpenInLeft={onSelectFolder ? handleOpenInLeft : undefined}
          onOpenInRight={onSelectRightFolder ? handleOpenInRight : undefined}
          onDeleteRequest={async (item) => {
            if (window.confirm(`「${item.name}」を削除しますか？`)) {
              try {
                await deleteItemsBatch.mutateAsync({ paths: [item.path] });
                showSuccess("削除しました");
              } catch (e: any) {
                console.error(e);
                showError(`削除に失敗しました: ${e.message}`);
              }
            }
          }}
        />
      )}

      {/* Markdownエディタモーダル */}
      <MarkdownEditorModal
        isOpen={mdEditorOpen}
        onClose={handleCloseMdEditor}
        onSave={handleSaveMarkdown}
        fileName={mdEditorFileName}
        isSaving={mdEditorSaving}
        initialContent={mdEditorInitialContent}
      />
    </div>
  );
}
