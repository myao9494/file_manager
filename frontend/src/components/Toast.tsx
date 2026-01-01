/**
 * トースト通知コンポーネント
 * エラーや成功メッセージを表示
 */
import { useEffect } from "react";
import { X, AlertCircle, CheckCircle, Info } from "lucide-react";
import "./Toast.css";

export type ToastType = "error" | "success" | "info";

interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onClose: () => void;
}

export function Toast({ message, type = "info", duration = 5000, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const getIcon = () => {
    switch (type) {
      case "error":
        return <AlertCircle size={20} />;
      case "success":
        return <CheckCircle size={20} />;
      case "info":
        return <Info size={20} />;
    }
  };

  return (
    <div className={`toast toast-${type}`}>
      <div className="toast-icon">{getIcon()}</div>
      <div className="toast-message">{message}</div>
      <button className="toast-close" onClick={onClose}>
        <X size={16} />
      </button>
    </div>
  );
}
