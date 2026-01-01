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
import { useDeleteItemsBatch, useRenameItem } from "../hooks/useFiles";
import type { FileItem } from "../types/file";
import "./ContextMenu.css";

interface ContextMenuProps {
  x: number;
  y: number;
  item: FileItem;
  onClose: () => void;
  currentPath: string;
  onOpenInLeft?: () => void;
  onOpenInRight?: () => void;
}

// クリップボード用のグローバル状態（簡易実装）
let clipboardItem: { item: FileItem; action: "copy" | "cut" } | null = null;

export function ContextMenu({
  x,
  y,
  item,
  onClose,
  currentPath,
  onOpenInLeft,
  onOpenInRight,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(item.name);

  const deleteItemsBatch = useDeleteItemsBatch();
  const renameItem = useRenameItem();

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
    if (newName && newName !== item.name) {
      await renameItem.mutateAsync({ oldPath: item.path, newName });
    }
    onClose();
  };

  // 削除実行
  const handleDelete = async () => {
    if (confirm(`「${item.name}」を削除しますか？`)) {
      const debugMode = localStorage.getItem('file_manager_debug_mode') === 'true';

      try {
        // クライアントサイドでの再帰カウント（countFiles）はNAS等で遅いため廃止
        // シンプルに「フォルダの場合は非同期モード」とする
        const isDirectory = item.type === "directory";
        // 非同期モード判定: ディレクトリなら非同期

        // 実際には、フォルダなら非同期、ファイルなら同期と割り切る
        // ファイル1つでもNASだと遅い可能性があるが、削除は比較的速い

        await deleteItemsBatch.mutateAsync({
          paths: [item.path],
          asyncMode: isDirectory, // ディレクトリなら非同期
          debugMode
        });
      } catch (err) {
        console.error("Delete failed:", err);
      }
    }
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
          <PanelLeftOpen size={16} />
          <span>左ペインで開く</span>
        </div>
      )}
      {onOpenInRight && (
        <div className="menu-item" onClick={onOpenInRight}>
          <PanelRightOpen size={16} />
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
