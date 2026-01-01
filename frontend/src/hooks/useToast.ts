/**
 * トースト通知を管理するカスタムフック
 */
import { useState, useCallback } from "react";
import type { ToastType } from "../components/Toast";

interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
}

export function useToast() {
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

  return {
    toasts,
    showToast,
    hideToast,
    showError,
    showSuccess,
    showInfo,
  };
}
