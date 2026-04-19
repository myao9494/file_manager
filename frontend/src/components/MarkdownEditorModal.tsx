/**
 * Markdownエディタモーダル
 * Obsidian風の編集体験を意識した自前実装のMarkdownエディタを提供する
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
    Heading1,
    Heading2,
    Bold,
    CheckSquare,
    Eye,
    FileText,
    Italic,
    Link as LinkIcon,
    PanelsLeftBottom,
    PencilLine,
} from "lucide-react";
import { Modal } from "./Modal";
import { matchesCmdOrCtrlShortcut } from "../utils/globalShortcuts";
import {
    adjustHeadingLevel,
    insertMarkdownNewline,
    indentSelection,
    outdentSelection,
    setTaskListItemChecked,
    wrapSelection,
    type TextSelectionTransformResult,
} from "../utils/markdownEditorFormatting";
import { toggleBulletListSelection } from "../utils/markdownBulletShortcuts";
import { toggleChecklistSelection } from "../utils/markdownEditorShortcuts";
import { renderMarkdownToHtml } from "../utils/markdownPreview";
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

type EditorMode = "split" | "edit" | "preview";

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
    const [mode, setMode] = useState<EditorMode>("split");
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const previewRef = useRef<HTMLDivElement | null>(null);
    const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);
    const deferredContent = useDeferredValue(content);

    const updateContent = useCallback((nextContent: string) => {
        setContent(nextContent);
        setHasChanges(nextContent !== initialContent);
    }, [initialContent]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        setContent(initialContent);
        setHasChanges(false);
        pendingSelectionRef.current = null;

        const timerId = window.setTimeout(() => {
            textareaRef.current?.focus();
        }, 60);

        return () => window.clearTimeout(timerId);
    }, [initialContent, isOpen]);

    useEffect(() => {
        if (!isOpen || !pendingSelectionRef.current) {
            return;
        }

        const selection = pendingSelectionRef.current;
        const frameId = window.requestAnimationFrame(() => {
            const textarea = textareaRef.current;
            if (!textarea) {
                return;
            }

            textarea.focus();
            textarea.setSelectionRange(selection.start, selection.end);
            pendingSelectionRef.current = null;
        });

        return () => window.cancelAnimationFrame(frameId);
    }, [content, isOpen]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Escape") {
                return;
            }

            e.preventDefault();
            e.stopPropagation();

            if (hasChanges) {
                if (window.confirm("変更を破棄しますか？")) {
                    setHasChanges(false);
                    onClose();
                }
                return;
            }

            onClose();
        };

        document.addEventListener("keydown", handleKeyDown, true);
        return () => document.removeEventListener("keydown", handleKeyDown, true);
    }, [hasChanges, isOpen, onClose]);

    const applySelectionTransform = useCallback((
        transform: (text: string, selectionStart: number, selectionEnd: number) => TextSelectionTransformResult
    ) => {
        const textarea = textareaRef.current;
        if (!textarea) {
            return;
        }

        const result = transform(content, textarea.selectionStart, textarea.selectionEnd);
        pendingSelectionRef.current = {
            start: result.selectionStart,
            end: result.selectionEnd,
        };
        updateContent(result.text);
    }, [content, updateContent]);

    const stopNativeShortcut = useCallback((event: KeyboardEvent) => {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") {
            event.stopImmediatePropagation();
        }
    }, []);

    // Cmd/Ctrl + Shift + [ ] または Cmd/Ctrl + [ ] による見出しレベルの変更判定
    const isHeadingShortcut = useCallback((event: KeyboardEvent | React.KeyboardEvent<HTMLTextAreaElement>, direction: "up" | "down") => {
        const nativeEvent = "nativeEvent" in event ? event.nativeEvent : event;
        // Shiftキーは必須としない（Mac版ChromeでCmd+Shift+[がシステム予約されていてフックできない問題の回避策としてCmd+[も許可）
        if ((!nativeEvent.metaKey && !nativeEvent.ctrlKey) || nativeEvent.altKey) {
            return false;
        }

        const key = nativeEvent.key.toLowerCase();
        
        // event.codeはUS配列の物理キー位置を返すため、JIS配列だと BracketRight が '[' キーになる等
        // 判定が混線する原因となります。そのため、入力された文字(event.key)のみで判定します。
        if (direction === "up") { // 見出しを下げる（#を増やす） / 右ブラケット系
            return key === "]" || key === "}" || key === "」" || key === "』";
        }
        
        // 見出しを上げる（#を減らす） / 左ブラケット系
        return key === "[" || key === "{" || key === "「" || key === "『";
    }, []);

    const isBulletShortcut = useCallback((event: KeyboardEvent | React.KeyboardEvent<HTMLTextAreaElement>) => {
        const nativeEvent = "nativeEvent" in event ? event.nativeEvent : event;
        if ((!nativeEvent.metaKey && !nativeEvent.ctrlKey) || nativeEvent.altKey) {
            return false;
        }

        return nativeEvent.key === ":" || (nativeEvent.shiftKey && (nativeEvent.key === ";" || nativeEvent.code === "Semicolon"));
    }, []);

    const handleSave = useCallback(() => {
        onSave(content);
    }, [content, onSave]);

    const handlePreviewCheckboxToggle = useCallback((target: HTMLInputElement) => {
        const lineNumber = Number(target.dataset.taskLine);
        if (Number.isNaN(lineNumber)) {
            return;
        }

        const result = setTaskListItemChecked(content, lineNumber, target.checked);
        updateContent(result.text);
    }, [content, updateContent]);

    const handleClose = useCallback(() => {
        if (!hasChanges) {
            onClose();
            return;
        }

        if (window.confirm("変更を破棄しますか？")) {
            setHasChanges(false);
            onClose();
        }
    }, [hasChanges, onClose]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        // windowのキャプチャフェーズのみで処理する（textareaへの重複登録はしない）
        const handleDocumentKeyDown = (event: KeyboardEvent) => {
            // エディタモーダル内でのCmd+Shift+[ ]によるタブ切り替えなどのブラウザ挙動を
            // モーダルが開いている間は優先的に無効化する
            if (isHeadingShortcut(event, "up") || isHeadingShortcut(event, "down")) {
                stopNativeShortcut(event);
            }

            const textarea = textareaRef.current;
            if (!textarea) {
                return;
            }

            // モーダル内の要素にフォーカスがあるか確認
            const activeElement = document.activeElement;
            const isInEditor = activeElement === textarea
                || textarea.closest(".markdown-editor-shell")?.contains(activeElement as Node);
            
            // ショートカットの実行はエディタ内にフォーカスがある時のみ
            if (!isInEditor) {
                return;
            }

            if (matchesCmdOrCtrlShortcut(event, "l")) {
                stopNativeShortcut(event);
                applySelectionTransform(toggleChecklistSelection);
                return;
            }

            if (matchesCmdOrCtrlShortcut(event, "b")) {
                stopNativeShortcut(event);
                applySelectionTransform((text, start, end) => wrapSelection(text, start, end, "**", "**"));
                return;
            }

            if (matchesCmdOrCtrlShortcut(event, "i")) {
                stopNativeShortcut(event);
                applySelectionTransform((text, start, end) => wrapSelection(text, start, end, "*", "*"));
                return;
            }

            if (matchesCmdOrCtrlShortcut(event, "k")) {
                stopNativeShortcut(event);
                applySelectionTransform((text, start, end) => wrapSelection(text, start, end, "[", "](url)", "text"));
                return;
            }

            if (matchesCmdOrCtrlShortcut(event, "s")) {
                stopNativeShortcut(event);
                handleSave();
                return;
            }

            if (isBulletShortcut(event)) {
                stopNativeShortcut(event);
                applySelectionTransform(toggleBulletListSelection);
                return;
            }

            // ここで再度判定して処理を実行。上部で既にstopNativeShortcutは行っている
            if (isHeadingShortcut(event, "up")) {
                if (event.repeat) return; // 長押しでの連続発火（一気に######になる現象）を防ぐ
                applySelectionTransform((text, start, end) => adjustHeadingLevel(text, start, end, 1));
                return;
            }

            if (isHeadingShortcut(event, "down")) {
                if (event.repeat) return; // 長押しでの連続発火を防ぐ
                applySelectionTransform((text, start, end) => adjustHeadingLevel(text, start, end, -1));
                return;
            }

            // Tabキーはtextareaにフォーカスがある時のみ処理
            if (event.key === "Tab" && activeElement === textarea) {
                stopNativeShortcut(event);
                applySelectionTransform((text, start, end) => (
                    event.shiftKey ? outdentSelection(text, start, end) : indentSelection(text, start, end)
                ));
                return;
            }

            if (event.key === "Enter" && !event.isComposing && activeElement === textarea) {
                stopNativeShortcut(event);
                applySelectionTransform(insertMarkdownNewline);
            }
        };

        window.addEventListener("keydown", handleDocumentKeyDown, true);

        return () => {
            window.removeEventListener("keydown", handleDocumentKeyDown, true);
        };
    }, [applySelectionTransform, handleSave, isBulletShortcut, isHeadingShortcut, isOpen, stopNativeShortcut]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const preview = previewRef.current;
        if (!preview) {
            return;
        }

        const handlePreviewChange = (event: Event) => {
            const target = event.target;
            if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") {
                return;
            }

            handlePreviewCheckboxToggle(target);
        };

        preview.addEventListener("change", handlePreviewChange, true);
        return () => preview.removeEventListener("change", handlePreviewChange, true);
    }, [handlePreviewCheckboxToggle, isOpen]);

    const previewHtml = useMemo(() => {
        return renderMarkdownToHtml(deferredContent);
    }, [deferredContent]);

    const wordCount = useMemo(() => {
        return content.trim() ? content.trim().split(/\s+/).length : 0;
    }, [content]);

    const lineCount = useMemo(() => {
        return content === "" ? 1 : content.split("\n").length;
    }, [content]);

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
            width="92vw"
            height="88vh"
            footer={footer}
        >
            <div className="markdown-editor-shell">
                <div className="markdown-editor-topbar">
                    <div className="markdown-editor-note-meta">
                        <div className="markdown-editor-note-badge">
                            <FileText size={15} />
                        </div>
                        <div>
                            <div className="markdown-editor-note-label">Obsidian Style Note</div>
                            <div className="markdown-editor-note-name">{fileName}</div>
                        </div>
                    </div>

                    <div className="markdown-editor-mode-switcher" role="tablist" aria-label="editor mode">
                        <button className={mode === "edit" ? "active" : ""} onClick={() => setMode("edit")} type="button">
                            <PencilLine size={15} />
                            Edit
                        </button>
                        <button className={mode === "split" ? "active" : ""} onClick={() => setMode("split")} type="button">
                            <PanelsLeftBottom size={15} />
                            Split
                        </button>
                        <button className={mode === "preview" ? "active" : ""} onClick={() => setMode("preview")} type="button">
                            <Eye size={15} />
                            Preview
                        </button>
                    </div>
                </div>

                <div className="markdown-editor-toolbar">
                    <button type="button" onClick={() => applySelectionTransform((text, start, end) => wrapSelection(text, start, end, "**", "**"))} title="太字 (Cmd/Ctrl+B)">
                        <Bold size={16} />
                    </button>
                    <button type="button" onClick={() => applySelectionTransform((text, start, end) => wrapSelection(text, start, end, "*", "*"))} title="斜体 (Cmd/Ctrl+I)">
                        <Italic size={16} />
                    </button>
                    <button type="button" onClick={() => applySelectionTransform((text, start, end) => adjustHeadingLevel(text, start, end, 1))} title="見出しを上げる (Cmd/Ctrl+Shift+])">
                        <Heading1 size={16} />
                    </button>
                    <button type="button" onClick={() => applySelectionTransform((text, start, end) => adjustHeadingLevel(text, start, end, -1))} title="見出しを下げる (Cmd/Ctrl+Shift+[)">
                        <Heading2 size={16} />
                    </button>
                    <button type="button" onClick={() => applySelectionTransform(toggleBulletListSelection)} title="箇条書き (Cmd/Ctrl+:)">
                        -
                    </button>
                    <button type="button" onClick={() => applySelectionTransform(toggleChecklistSelection)} title="チェックリスト (Cmd/Ctrl+L)">
                        <CheckSquare size={16} />
                    </button>
                    <button type="button" onClick={() => applySelectionTransform((text, start, end) => wrapSelection(text, start, end, "[", "](url)", "text"))} title="リンク (Cmd/Ctrl+K)">
                        <LinkIcon size={16} />
                    </button>
                    <div className="markdown-editor-toolbar-hint">
                        `Cmd/Ctrl+B` 太字 `Cmd/Ctrl+I` 斜体 `Cmd/Ctrl+L` チェックリスト `Cmd/Ctrl+Shift+[ ]` 見出し `Cmd/Ctrl+:` 箇条書き `Enter` リスト継続
                    </div>
                </div>

                <div className={`markdown-editor-workspace mode-${mode}`}>
                    {mode !== "preview" && (
                        <section className="markdown-editor-pane markdown-editor-input-pane">
                            <div className="markdown-editor-pane-header">Editor</div>
                            <textarea
                                ref={textareaRef}
                                className="markdown-editor-textarea"
                                value={content}
                                onChange={(e) => updateContent(e.target.value)}
                                spellCheck={false}
                            />
                        </section>
                    )}

                    {mode !== "edit" && (
                        <section className="markdown-editor-pane markdown-editor-preview-pane">
                            <div className="markdown-editor-pane-header">Preview</div>
                            <div
                                ref={previewRef}
                                className="markdown-editor-preview markdown-preview-content"
                                dangerouslySetInnerHTML={{ __html: previewHtml }}
                            />
                        </section>
                    )}
                </div>

                <div className="markdown-editor-statusbar">
                    <span>{lineCount} lines</span>
                    <span>{wordCount} words</span>
                    <span>{hasChanges ? "Unsaved changes" : "Saved state"}</span>
                </div>
            </div>
        </Modal>
    );
}
