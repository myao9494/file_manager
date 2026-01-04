/**
 * トースト通知フック
 * ToastContextを使用
 */
import { useToastContext } from "../contexts/ToastContext";

export function useToast() {
  return useToastContext();
}
