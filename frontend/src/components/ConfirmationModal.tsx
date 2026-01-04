import React, { useEffect, useRef } from 'react';
import { Modal } from './Modal';
import './InputModal.css';

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
    confirmButtonClass = 'btn-danger',
}) => {
    const confirmButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => {
                confirmButtonRef.current?.focus();
            }, 50);
        }
    }, [isOpen]);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            width="400px"
            footer={
                <div className="input-modal-footer">
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
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                e.stopPropagation();
                                onConfirm();
                                onClose();
                            }
                        }}
                    >
                        {confirmLabel}
                    </button>
                </div>
            }
        >
            <div className="input-modal-form">
                <p className="input-modal-message">{message}</p>
            </div>
        </Modal>
    );
};
