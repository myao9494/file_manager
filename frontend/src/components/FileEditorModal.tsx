/**
 * 汎用ファイルエディタモーダル
 * VS Code風の見た目でテキスト/コードファイルをシンタックスハイライト付きで編集する
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Braces, FileCode2, Save } from "lucide-react";

import { Modal } from "./Modal";
import { matchesCmdOrCtrlShortcut } from "../utils/globalShortcuts";
import {
  detectEditorLanguage,
  renderCodeToHighlightedHtml,
  type EditorLanguage,
} from "../utils/codeEditorHighlight";
import "./FileEditorModal.css";

interface FileEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (content: string) => void;
  initialContent?: string;
  fileName: string;
  isSaving?: boolean;
  initialLanguage?: EditorLanguage;
}

export function FileEditorModal({
  isOpen,
  onClose,
  onSave,
  initialContent = "",
  fileName,
  isSaving = false,
  initialLanguage,
}: FileEditorModalProps) {
  const [content, setContent] = useState(initialContent);
  const [hasChanges, setHasChanges] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightRef = useRef<HTMLPreElement | null>(null);
  const lineNumbersRef = useRef<HTMLDivElement | null>(null);
  const language = initialLanguage ?? detectEditorLanguage(fileName);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setContent(initialContent);
    setHasChanges(false);

    const timerId = window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 60);

    return () => window.clearTimeout(timerId);
  }, [initialContent, isOpen]);

  const lineCount = useMemo(() => Math.max(content.split("\n").length, 1), [content]);
  const highlightedHtml = useMemo(
    () => renderCodeToHighlightedHtml(content, language),
    [content, language],
  );

  const handleSave = useCallback(() => {
    onSave(content);
  }, [content, onSave]);

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

  const handleScroll = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    if (highlightRef.current) {
      highlightRef.current.scrollTop = textarea.scrollTop;
      highlightRef.current.scrollLeft = textarea.scrollLeft;
    }

    if (lineNumbersRef.current) {
      lineNumbersRef.current.style.transform = `translateY(${-textarea.scrollTop}px)`;
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (matchesCmdOrCtrlShortcut(event, "s")) {
        event.preventDefault();
        event.stopPropagation();
        handleSave();
        return;
      }

      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      handleClose();
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [handleClose, handleSave, isOpen]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      width="min(1120px, 94vw)"
      height="min(88vh, 880px)"
    >
      <div className="code-editor-shell">
        <div className="code-editor-topbar">
          <div className="code-editor-file-meta">
            <div className="code-editor-file-badge">
              <FileCode2 size={18} />
            </div>
            <div className="code-editor-file-copy">
              <div className="code-editor-file-kind">File Editor</div>
              <div className="code-editor-file-name">{fileName}</div>
            </div>
          </div>
          <div className="code-editor-language-pill">
            <Braces size={14} />
            <span>{language}</span>
          </div>
        </div>

        <div className="code-editor-workspace">
          <div className="code-editor-gutter">
            <div ref={lineNumbersRef} className="code-editor-line-numbers">
              {Array.from({ length: lineCount }, (_, index) => (
                <div key={index + 1} className="code-editor-line-number">
                  {index + 1}
                </div>
              ))}
            </div>
          </div>

          <div className="code-editor-pane">
            <pre
              ref={highlightRef}
              className="code-editor-highlight"
              aria-hidden="true"
            >
              <code dangerouslySetInnerHTML={{ __html: highlightedHtml || " " }} />
            </pre>
            <textarea
              ref={textareaRef}
              className="code-editor-textarea"
              value={content}
              spellCheck={false}
              onChange={(event) => {
                const nextContent = event.target.value;
                setContent(nextContent);
                setHasChanges(nextContent !== initialContent);
              }}
              onScroll={handleScroll}
            />
          </div>
        </div>

        <div className="code-editor-statusbar">
          <span>{lineCount} lines</span>
          <span>{hasChanges ? "Unsaved changes" : "Saved"}</span>
          <button
            type="button"
            className="code-editor-save-button"
            onClick={handleSave}
            disabled={isSaving}
          >
            <Save size={14} />
            <span>{isSaving ? "Saving..." : "Save"}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
