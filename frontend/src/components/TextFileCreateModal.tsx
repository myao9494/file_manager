/**
 * テキストファイルの名前と拡張子を個別に指定して作成するモーダル。
 */
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Modal } from "./Modal";
import "./InputModal.css";

interface TextFileCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultExtension: string;
  onConfirm: (name: string, extension: string) => Promise<void> | void;
}

export function TextFileCreateModal({
  isOpen,
  onClose,
  defaultExtension,
  onConfirm,
}: TextFileCreateModalProps) {
  const [name, setName] = useState("");
  const [extension, setExtension] = useState(defaultExtension);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    // 日本語IMEの変換確定Enterでは送信せず、確定後の次のEnterで作成する。
    if (event.nativeEvent.isComposing) return;
    event.preventDefault();
    void handleSubmit();
  };

  useEffect(() => {
    if (!isOpen) return;
    setName("");
    setExtension(defaultExtension);
    setTimeout(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }, 50);
  }, [defaultExtension, isOpen]);

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!name.trim() || !extension.trim()) return;
    setIsSubmitting(true);
    try {
      await onConfirm(name.trim(), extension.trim());
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="テキストファイル作成"
      width="400px"
      footer={
        <div className="input-modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={isSubmitting} type="button">キャンセル</button>
          <button className="btn-primary" onClick={() => handleSubmit()} disabled={!name.trim() || !extension.trim() || isSubmitting} type="button">
            {isSubmitting ? "処理中..." : "作成"}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="input-modal-form">
        <p className="input-modal-message">ファイル名と拡張子を入力してください</p>
        <label className="input-modal-label">
          ファイル名
          <input
            ref={nameInputRef}
            type="text"
            className="input-modal-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="ファイル名"
            disabled={isSubmitting}
          />
        </label>
        <label className="input-modal-label">
          拡張子
          <input
            type="text"
            className="input-modal-input"
            value={extension}
            onChange={(event) => setExtension(event.target.value.replace(/^\.+/, ""))}
            onKeyDown={handleInputKeyDown}
            onFocus={(event) => event.currentTarget.select()}
            placeholder="txt"
            disabled={isSubmitting}
          />
        </label>
      </form>
    </Modal>
  );
}
