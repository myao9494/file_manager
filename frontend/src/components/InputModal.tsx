import { useState, useEffect, useRef, type FormEvent } from "react";
import { Modal } from "./Modal";
import "./InputModal.css";

interface InputModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    message?: string;
    initialValue?: string;
    placeholder?: string;
    onConfirm: (value: string) => Promise<void> | void;
    confirmLabel?: string;
}

export function InputModal({
    isOpen,
    onClose,
    title,
    message,
    initialValue = "",
    placeholder = "",
    onConfirm,
    confirmLabel = "決定",
}: InputModalProps) {
    const [value, setValue] = useState(initialValue);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setValue(initialValue);
            // Timeout to ensure modal is rendered and focus works
            setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            }, 50);
        }
    }, [isOpen, initialValue]);

    const handleSubmit = async (e?: FormEvent) => {
        e?.preventDefault();
        const trimmed = value.trim();
        if (!trimmed) return;

        setIsSubmitting(true);
        try {
            await onConfirm(trimmed);
            onClose();
        } catch (err) {
            console.error(err);
            // Caller should handle error display generally, 
            // but we ensure loading state is cleared if error propagates
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            width="400px"
            footer={
                <div className="input-modal-footer">
                    <button
                        className="btn-secondary"
                        onClick={onClose}
                        disabled={isSubmitting}
                        type="button"
                    >
                        キャンセル
                    </button>
                    <button
                        className="btn-primary"
                        onClick={() => handleSubmit()}
                        disabled={!value.trim() || isSubmitting}
                        type="button"
                    >
                        {isSubmitting ? "処理中..." : confirmLabel}
                    </button>
                </div>
            }
        >
            <form onSubmit={handleSubmit} className="input-modal-form">
                {message && <p className="input-modal-message">{message}</p>}
                <input
                    ref={inputRef}
                    type="text"
                    className="input-modal-input"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={placeholder}
                    disabled={isSubmitting}
                />
            </form>
        </Modal>
    );
}
