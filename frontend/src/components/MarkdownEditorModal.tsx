/**
 * Markdownエディタモーダル
 * @uiw/react-md-editorを使用したプレビュー付きエディタ
 * 新規作成・編集両対応
 */
import { useState, useCallback, useEffect } from "react";
import MDEditor from "@uiw/react-md-editor";
import { Modal } from "./Modal";
import "./MarkdownEditorModal.css";

interface MarkdownEditorModalProps {
    /** モーダルの表示/非表示 */
    isOpen: boolean;
    /** 閉じるコールバック */
    onClose: () => void;
    /** 保存コールバック（contentを渡す） */
    onSave: (content: string) => void;
    /** 初期内容 */
    initialContent?: string;
    /** ファイル名（タイトル表示用） */
    fileName: string;
    /** 保存中フラグ */
    isSaving?: boolean;
}

export function MarkdownEditorModal({
    isOpen,
    onClose,
    onSave,
    initialContent = "",
    fileName,
    isSaving = false,
}: MarkdownEditorModalProps) {
    const [content, setContent] = useState(initialContent);
    const [hasChanges, setHasChanges] = useState(false);

    // initialContentが変わったときにcontentをリセット
    useEffect(() => {
        setContent(initialContent);
        setHasChanges(false);
    }, [initialContent]);

    // Escキーでモーダルを閉じる（MDEditor内でも動作するようにキャプチャフェーズで処理）
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                // 変更がある場合は確認ダイアログを表示
                if (hasChanges) {
                    if (confirm("変更を破棄しますか？")) {
                        setHasChanges(false);
                        onClose();
                    }
                } else {
                    onClose();
                }
            }
        };

        // キャプチャフェーズで処理することでMDEditorより先にイベントを受け取る
        document.addEventListener("keydown", handleKeyDown, true);
        return () => document.removeEventListener("keydown", handleKeyDown, true);
    }, [isOpen, hasChanges, onClose]);

    // 内容変更ハンドラ
    const handleChange = useCallback((value: string | undefined) => {
        const newValue = value || "";
        if (newValue !== content) {
            setContent(newValue);
            // 初期内容から変わった場合のみhasChanges=trueにする
            if (newValue !== initialContent) {
                setHasChanges(true);
            }
        }
    }, [content, initialContent]);

    // 保存ハンドラ
    const handleSave = useCallback(() => {
        onSave(content);
    }, [content, onSave]);

    // 閉じる前の確認
    const handleClose = useCallback(() => {
        if (hasChanges) {
            if (confirm("変更を破棄しますか？")) {
                setHasChanges(false);
                onClose();
            }
        } else {
            onClose();
        }
    }, [hasChanges, onClose]);

    // フッターボタン
    const footer = (
        <>
            <button
                className="btn-secondary"
                onClick={handleClose}
                disabled={isSaving}
            >
                キャンセル
            </button>
            <button
                className="btn-primary"
                onClick={handleSave}
                disabled={isSaving}
            >
                {isSaving ? "保存中..." : "保存"}
            </button>
        </>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title={`Markdown編集: ${fileName}`}
            width="90vw"
            height="85vh"
            footer={footer}
        >
            <div className="markdown-editor-container" data-color-mode="dark">
                <MDEditor
                    value={content}
                    onChange={handleChange}
                    height="100%"
                    preview="live"
                    visibleDragbar={false}
                />
            </div>
        </Modal>
    );
}
