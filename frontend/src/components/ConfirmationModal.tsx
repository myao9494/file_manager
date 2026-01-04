import React, { useEffect, useRef } from 'react';
import './InputModal.css'; // Reuse InputModal styles for consistency

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmLabel?: string;
    cancelLabel?: string;
    confirmButtonClass?: string;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    isOpen,
    onClose,
    title,
    message,
    onConfirm,
    confirmLabel = 'OK',
    cancelLabel = 'キャンセル',
    confirmButtonClass = 'btn-danger', // Default to danger for delete actions
}) => {
    const confirmButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (isOpen) {
            // Focus the confirm button (or cancel?) - usually cancel is safer for destructive, 
            // but standard confirm often focuses Confirm. Let's focus Confirm for now or leave it.
            // Actually, standard web behavior doesn't auto-focus dangerously usually.
            // Let's focus the container or just let valid tab order work.
            // For now, let's focus the confirm button for keyboard accessibility speed, 
            // assuming the user triggered the action intentionally.
            setTimeout(() => {
                confirmButtonRef.current?.focus();
            }, 50);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content input-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{title}</h3>
                    <button className="close-btn" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    <p className="confirm-message">{message}</p>
                </div>
                <div className="modal-footer">
                    <button className="btn-secondary" onClick={onClose}>
                        {cancelLabel}
                    </button>
                    <button
                        ref={confirmButtonRef}
                        className={`btn-primary ${confirmButtonClass}`}
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};
