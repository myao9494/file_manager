import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { Toast, type ToastType } from "../components/Toast";
import "../components/ToastContainer.css";

interface ToastMessage {
    id: number;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType) => void;
    hideToast: (id: number) => void;
    showError: (message: string) => void;
    showSuccess: (message: string) => void;
    showInfo: (message: string) => void;
}

// undefined check helper
const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const showToast = useCallback((message: string, type: ToastType = "info") => {
        const id = Date.now();
        setToasts((prev) => [...prev, { id, message, type }]);
    }, []);

    const hideToast = useCallback((id: number) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    const showError = useCallback((message: string) => {
        showToast(message, "error");
    }, [showToast]);

    const showSuccess = useCallback((message: string) => {
        showToast(message, "success");
    }, [showToast]);

    const showInfo = useCallback((message: string) => {
        showToast(message, "info");
    }, [showToast]);

    return (
        <ToastContext.Provider value={{ showToast, hideToast, showError, showSuccess, showInfo }}>
            {children}
            <div className="toast-container">
                {toasts.map((toast) => (
                    <Toast
                        key={toast.id}
                        message={toast.message}
                        type={toast.type}
                        onClose={() => hideToast(toast.id)}
                    />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToastContext() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error("useToastContext must be used within a ToastProvider");
    }
    return context;
}
