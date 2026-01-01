/**
 * 操作履歴のContext API
 * アプリ全体で履歴を共有するためのコンテキスト
 */

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { useOperationHistory } from "../hooks/useOperationHistory";
import type { OperationHistoryEntry } from "../hooks/useOperationHistory";

interface OperationHistoryContextType {
  addOperation: (entry: OperationHistoryEntry) => void;
  undo: () => Promise<{ success: boolean; message: string }>;
  redo: () => Promise<{ success: boolean; message: string }>;
  clearHistory: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoStack: OperationHistoryEntry[];
  redoStack: OperationHistoryEntry[];
}

const OperationHistoryContext = createContext<OperationHistoryContextType | undefined>(undefined);

export function OperationHistoryProvider({ children }: { children: ReactNode }) {
  const history = useOperationHistory();

  return (
    <OperationHistoryContext.Provider value={history}>
      {children}
    </OperationHistoryContext.Provider>
  );
}

export function useOperationHistoryContext() {
  const context = useContext(OperationHistoryContext);
  if (!context) {
    throw new Error("useOperationHistoryContext must be used within OperationHistoryProvider");
  }
  return context;
}
