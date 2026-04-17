/**
 * 左右ペインの現在フォルダ配下を indexed DB のみで検索するモーダル
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Loader2, Search } from "lucide-react";

import {
  getFulltextIndexGuiUrl,
  getFulltextIndexServiceStatus,
  searchIndexedFolder,
  type FulltextIndexServiceStatus,
  type IndexedFolderSearchItem,
} from "../api/fulltextIndexService";
import { normalizeExtensionFilterInput, parseExtensionFilterInput } from "../utils/extensionFilter";
import { parseHighlightSnippet } from "../utils/highlightSnippet";
import { Modal } from "./Modal";
import "./IndexedFolderSearchModal.css";

interface IndexedFolderSearchModalProps {
  isOpen: boolean;
  folderPath: string | null;
  onClose: () => void;
  onSelectItem: (item: IndexedFolderSearchItem) => Promise<void>;
}

function formatDateLabel(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("ja-JP");
}

export function IndexedFolderSearchModal({
  isOpen,
  folderPath,
  onClose,
  onSelectItem,
}: IndexedFolderSearchModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [query, setQuery] = useState("");
  const [extensionFilterInput, setExtensionFilterInput] = useState("");
  const [items, setItems] = useState<IndexedFolderSearchItem[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [serviceStatus, setServiceStatus] = useState<FulltextIndexServiceStatus | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    void getFulltextIndexServiceStatus().then((status) => {
      setServiceStatus(status);
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setQuery("");
    setExtensionFilterInput("");
    setItems([]);
    setTotal(0);
    setSelectedIndex(0);
    setError("");
    setServiceStatus(null);

    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [isOpen, folderPath]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const trimmedQuery = query.trim();

    if (!trimmedQuery || !folderPath) {
      setItems([]);
      setTotal(0);
      setSelectedIndex(0);
      setIsLoading(false);
      setError("");
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);
    setError("");

    const timer = window.setTimeout(async () => {
      try {
        const response = await searchIndexedFolder({
          q: trimmedQuery,
          folderPath,
          limit: 200,
          offset: 0,
        });

        if (requestIdRef.current !== requestId) {
          return;
        }

        setItems(response.items);
        setTotal(response.total);
        setSelectedIndex(0);
      } catch (searchError: unknown) {
        if (requestIdRef.current !== requestId) {
          return;
        }

        setItems([]);
        setTotal(0);
        setSelectedIndex(0);
        setError(searchError instanceof Error ? searchError.message : "検索に失敗しました");
      } finally {
        if (requestIdRef.current === requestId) {
          setIsLoading(false);
        }
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
    };
  }, [extensionFilterInput, folderPath, isOpen, query]);

  useEffect(() => {
    const selectedResult = resultRefs.current[selectedIndex];
    selectedResult?.scrollIntoView({
      block: "nearest",
    });
  }, [selectedIndex]);

  const normalizedExtensionFilter = useMemo(
    () => normalizeExtensionFilterInput(extensionFilterInput),
    [extensionFilterInput]
  );
  const filteredItems = useMemo(() => {
    const extensions = parseExtensionFilterInput(extensionFilterInput);

    if (extensions.length === 0) {
      return items;
    }

    const extensionSet = new Set(extensions);
    return items.filter((item) => extensionSet.has(item.file_ext.toLowerCase()));
  }, [extensionFilterInput, items]);
  const selectedItem = useMemo(
    () => filteredItems[selectedIndex] ?? null,
    [filteredItems, selectedIndex]
  );
  const filteredTotal = filteredItems.length;
  const guiUrl = useMemo(() => getFulltextIndexGuiUrl(), []);
  const needsIndexGuidance = useMemo(() => {
    if (!serviceStatus) {
      return false;
    }

    return !serviceStatus.ready || serviceStatus.total_indexed === 0;
  }, [serviceStatus]);
  const showZeroResultGuidance = query.trim() && !isLoading && items.length === 0 && !error;
  const showFilteredEmptyState = query.trim() && !isLoading && items.length > 0 && filteredItems.length === 0 && !error;

  const handleOpenItem = async (item: IndexedFolderSearchItem | null) => {
    if (!item) {
      return;
    }

    try {
      await onSelectItem(item);
      onClose();
    } catch (openError: unknown) {
      setError(openError instanceof Error ? openError.message : "ファイルを開けませんでした");
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    const isImeComposing =
      e.nativeEvent.isComposing ||
      (e.nativeEvent as KeyboardEvent).keyCode === 229;

      if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filteredItems.length > 0) {
        setSelectedIndex((prev) => Math.min(prev + 1, filteredItems.length - 1));
      }
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filteredItems.length > 0) {
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      }
      return;
    }

    if (e.key === "Enter") {
      if (isImeComposing) {
        return;
      }

      e.preventDefault();
      await handleOpenItem(selectedItem);
    }
  };

  const handleExtensionFilterBlur = () => {
    setExtensionFilterInput((current) => normalizeExtensionFilterInput(current));
  };

  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, Math.max(filteredItems.length - 1, 0)));
  }, [filteredItems.length]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="フォルダ内 indexed 検索"
      width="720px"
      height="70vh"
    >
      <div className="indexed-folder-search">
        <div className="indexed-folder-search-actions">
          <a
            href={guiUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="indexed-folder-search-gui-link"
          >
            全文検索 GUI を開く
            <ExternalLink size={14} />
          </a>
          <span className="indexed-folder-search-actions-note">
            インデックス作成や最新化が必要なときはこちらを使います
          </span>
        </div>

        <div className="indexed-folder-search-input-row">
          <Search size={16} className="indexed-folder-search-icon" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="indexed-folder-search-input"
            placeholder="キーワードを入力..."
          />
          {isLoading && <Loader2 size={16} className="indexed-folder-search-spinner" />}
        </div>

        <div className="indexed-folder-search-filter-row">
          <label className="indexed-folder-search-filter-label" htmlFor="indexed-folder-search-extension-filter">
            拡張子
          </label>
          <input
            id="indexed-folder-search-extension-filter"
            type="text"
            value={extensionFilterInput}
            onChange={(e) => setExtensionFilterInput(e.target.value)}
            onBlur={handleExtensionFilterBlur}
            onKeyDown={handleKeyDown}
            className="indexed-folder-search-filter-input"
            placeholder="md pdf txt"
            spellCheck={false}
          />
          <span className="indexed-folder-search-filter-note">
            スペース区切り。{normalizedExtensionFilter || "未指定"}
          </span>
        </div>

        <div className="indexed-folder-search-meta">
          <span className="indexed-folder-search-folder">{folderPath || ""}</span>
          <span>{query.trim() ? (normalizedExtensionFilter ? `${filteredTotal} / ${total} 件` : `${total} 件`) : "キーワード待ち"}</span>
        </div>

        {error && <div className="indexed-folder-search-error">{error}</div>}

        {needsIndexGuidance && (
          <div className="indexed-folder-search-guidance">
            この端末では全文検索インデックスが未作成、または未準備の可能性があります。
            先に「全文検索 GUI を開く」から GUI アプリケーションを開いて、インデックス作成を実行してください。
          </div>
        )}

        {showZeroResultGuidance && (
          <div className="indexed-folder-search-guidance subtle">
            結果が 0 件でした。対象フォルダが未インデックスの可能性もあるため、必要に応じて「全文検索 GUI を開く」からインデックス作成または最新化を行ってください。
          </div>
        )}

        <div className="indexed-folder-search-results">
          {!query.trim() && (
            <div className="indexed-folder-search-empty">
              `cmd + p` で開いて、そのままキーワードを入力できます。
            </div>
          )}

          {showZeroResultGuidance && (
            <div className="indexed-folder-search-empty">結果がありません</div>
          )}

          {showFilteredEmptyState && (
            <div className="indexed-folder-search-empty">この拡張子に一致する結果がありません</div>
          )}

          {filteredItems.map((item, index) => {
            const snippetParts = parseHighlightSnippet(item.snippet || "");

            return (
              <button
                key={`${item.file_id}-${item.full_path}`}
                type="button"
                ref={(element) => {
                  resultRefs.current[index] = element;
                }}
                className={`indexed-folder-search-result ${index === selectedIndex ? "selected" : ""}`}
                aria-pressed={index === selectedIndex}
                onMouseEnter={() => setSelectedIndex(index)}
                onFocus={() => setSelectedIndex(index)}
                onClick={() => void handleOpenItem(item)}
              >
                <div className="indexed-folder-search-result-header">
                  <span className="indexed-folder-search-result-name">{item.file_name}</span>
                  <span className="indexed-folder-search-result-date">{formatDateLabel(item.mtime)}</span>
                </div>
                <div className="indexed-folder-search-result-path">{item.full_path}</div>
                {snippetParts.length > 0 && (
                  <div className="indexed-folder-search-result-snippet">
                    {snippetParts.map((part, partIndex) => (
                      <span
                        key={`${item.full_path}-${partIndex}`}
                        className={part.highlighted ? "highlighted" : undefined}
                      >
                        {part.text}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
