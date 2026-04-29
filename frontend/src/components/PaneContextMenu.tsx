/**
 * ペイン背景用の右クリックメニュー
 */
import { useEffect, useRef } from "react";
import { ListTodo } from "lucide-react";
import "./ContextMenu.css";

interface PaneContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCopyChecklist: () => void;
}

export function PaneContextMenu({ x, y, onClose, onCopyChecklist }: PaneContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const adjustedX = Math.min(x, window.innerWidth - 220);
  const adjustedY = Math.min(y, window.innerHeight - 120);

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: adjustedX, top: adjustedY }}
    >
      <div className="menu-item" onClick={onCopyChecklist}>
        <ListTodo size={16} />
        <span>リスト取得(check_box)</span>
      </div>
    </div>
  );
}
