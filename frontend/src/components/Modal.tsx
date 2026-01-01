/**
 * 汎用モーダルコンポーネント
 * React Portalを使用してDOM外にレンダリング
 * ESCキーで閉じる、オーバーレイクリックで閉じる機能付き
 */
import { useEffect, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import "./Modal.css";

interface ModalProps {
    /** モーダルの表示/非表示 */
    isOpen: boolean;
    /** 閉じるコールバック */
    onClose: () => void;
    /** モーダルのタイトル */
    title?: string;
    /** モーダルの内容 */
    children: ReactNode;
    /** モーダルの幅（デフォルト: 600px） */
    width?: string;
    /** モーダルの高さ（デフォルト: auto） */
    height?: string;
    /** フッターの内容（保存ボタンなど） */
    footer?: ReactNode;
}

export function Modal({
    isOpen,
    onClose,
    title,
    children,
    width = "600px",
    height = "auto",
    footer,
}: ModalProps) {
    // ESCキーでモーダルを閉じる
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
            }
        },
        [onClose]
    );

    useEffect(() => {
        if (isOpen) {
            document.addEventListener("keydown", handleKeyDown);
            // スクロールを無効化
            document.body.style.overflow = "hidden";
        }

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            document.body.style.overflow = "";
        };
    }, [isOpen, handleKeyDown]);

    if (!isOpen) return null;

    // オーバーレイクリックでモーダルを閉じる
    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    const modalContent = (
        <div className="modal-overlay" onClick={handleOverlayClick}>
            <div
                className="modal-container"
                style={{ width, height }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* ヘッダー */}
                <div className="modal-header">
                    {title && <h2 className="modal-title">{title}</h2>}
                    <button
                        className="modal-close-btn"
                        onClick={onClose}
                        title="閉じる (Esc)"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* コンテンツ */}
                <div className="modal-content">{children}</div>

                {/* フッター */}
                {footer && <div className="modal-footer">{footer}</div>}
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
}
