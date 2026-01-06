/**
 * 右クリックメニューコンポーネント
 * README.mdで定義された機能を提供
 */
import { useEffect, useRef, useState } from "react";
import {
  Copy,
  Scissors,
  Clipboard,
  Trash2,
  Edit3,
  PanelLeftOpen,
  PanelRightOpen,
} from "lucide-react";
import { useRenameItem } from "../hooks/useFiles";
import { useOperationHistoryContext } from "../contexts/OperationHistoryContext";
import type { FileItem } from "../types/file";
import "./ContextMenu.css";
import { COMPOUND_EXTENSIONS } from "../config";

interface ContextMenuProps {
  x: number;
  y: number;
  item: FileItem;
  onClose: () => void;
  currentPath: string;
  onOpenInLeft?: () => void;
  onOpenInRight?: () => void;
  onDeleteRequest: (item: FileItem) => void;
}

// クリップボード用のグローバル状態（簡易実装）
let clipboardItem: { item: FileItem; action: "copy" | "cut" } | null = null;

// ファイル名と拡張子を分離するヘルパー関数
const splitFileName = (filename: string) => {
  // 複合拡張子チェック (最長一致優先)
  // COMPOUND_EXTENSIONSは長さ順にソートしておくとより安全だが、
  // ここでは定義順にチェックして最初に見つかったものを採用する
  for (const ext of COMPOUND_EXTENSIONS) {
    if (filename.endsWith(ext)) {
      return {
        base: filename.slice(0, -ext.length),
        ext: ext
      };
    }
  }

  // 通常の拡張子チェック
  const lastDotIndex = filename.lastIndexOf('.');
  if (lastDotIndex > 0) {
    return {
      base: filename.substring(0, lastDotIndex),
      ext: filename.substring(lastDotIndex)
    };
  }

  // 拡張子なし
  return { base: filename, ext: '' };
};

export function ContextMenu({
  x,
  y,
  item,
  onClose,
  currentPath,
  onOpenInLeft,
  onOpenInRight,
  onDeleteRequest,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [extension, setExtension] = useState("");

  // const deleteItemsBatch = useDeleteItemsBatch(); // Moved to FileList
  const renameItem = useRenameItem();
  const { addOperation } = useOperationHistoryContext();

  // リネームモード開始時の初期化
  useEffect(() => {
    if (renaming) {
      const { base, ext } = splitFileName(item.name);
      setNewName(base);
      setExtension(ext);
    }
  }, [renaming, item.name]);

  // メニュー外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // ESCキーで閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // リネーム実行
  const handleRename = async () => {
    // 拡張子を結合して完全なファイル名を作成
    const fullNewName = newName + extension;

    if (fullNewName && fullNewName !== item.name) {
      const oldName = item.name;
      const oldPath = item.path;
      const parentPath = oldPath.substring(0, oldPath.lastIndexOf("/"));
      const newPath = `${parentPath}/${fullNewName}`;

      await renameItem.mutateAsync({ oldPath, newName: fullNewName });

      // 履歴に追加
      addOperation({
        type: "RENAME",
        canUndo: true,
        timestamp: Date.now(),
        data: {
          oldPath,
          newPath,
          oldName,
          newName: fullNewName,
        },
      });
    }
    onClose();
  };

  // 削除実行
  const handleDelete = async () => {
    onDeleteRequest(item);
    onClose();
  };

  // コピー
  const handleCopy = () => {
    clipboardItem = { item, action: "copy" };
    onClose();
  };

  // 切り取り
  const handleCut = () => {
    clipboardItem = { item, action: "cut" };
    onClose();
  };

  // 貼り付け（未実装 - バックエンドAPI必要）
  const handlePaste = () => {
    if (clipboardItem) {
      console.log("Paste:", clipboardItem, "to", currentPath);
      // TODO: バックエンドAPIを呼び出す
    }
    onClose();
  };

  // 画面外にはみ出さないように位置調整
  const adjustedX = Math.min(x, window.innerWidth - 200);
  const adjustedY = Math.min(y, window.innerHeight - 250);

  if (renaming) {
    return (
      <div
        ref={menuRef}
        className="context-menu rename-popup"
        style={{ left: adjustedX, top: adjustedY }}
      >
        <h4>ファイル名の変更</h4>
        <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>
          拡張子: {extension}
        </div>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleRename();
            if (e.key === "Escape") onClose();
          }}
          autoFocus
        />
        <div className="rename-buttons">
          <button className="ok-btn" onClick={handleRename}>
            OK
          </button>
          <button className="cancel-btn" onClick={onClose}>
            キャンセル
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: adjustedX, top: adjustedY }}
    >
      {onOpenInLeft && (
        <div className="menu-item" onClick={onOpenInLeft}>
          <PanelRightOpen size={16} />
          <span>左ペインで開く</span>
        </div>
      )}
      {onOpenInRight && (
        <div className="menu-item" onClick={onOpenInRight}>
          <PanelLeftOpen size={16} />
          <span>右ペインで開く</span>
        </div>
      )}
      {(onOpenInLeft || onOpenInRight) && <div className="menu-divider" />}

      <div className="menu-item" onClick={() => setRenaming(true)}>
        <Edit3 size={16} />
        <span>名前を変更</span>
      </div>
      <div className="menu-item delete" onClick={handleDelete}>
        <Trash2 size={16} />
        <span>削除</span>
      </div>
      <div className="menu-divider" />
      <div className="menu-item" onClick={handleCopy}>
        <Copy size={16} />
        <span>コピー</span>
      </div>
      <div className="menu-item" onClick={handleCut}>
        <Scissors size={16} />
        <span>切り取り</span>
      </div>
      <div
        className={`menu-item ${!clipboardItem ? "disabled" : ""}`}
        onClick={clipboardItem ? handlePaste : undefined}
      >
        <Clipboard size={16} />
        <span>貼り付け</span>
      </div>
    </div>
  );
}
