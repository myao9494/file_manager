/**
 * フォルダ履歴管理コンテキスト
 * 
 * ・左/中央ペインで共有される履歴を管理
 * ・履歴は最大300件まで保存
 * ・localStorageに永続化 (キー: file-manager-history-shared)
 */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

// 履歴の最大保存数
const MAX_HISTORY_ITEMS = 300;
// localStorageのキー
const HISTORY_STORAGE_KEY = 'file-manager-history-shared';

interface FolderHistoryContextType {
    history: string[];
    addToHistory: (path: string) => void;
    searchHistory: (query: string) => string[];
    clearHistory: () => void;
}

const FolderHistoryContext = createContext<FolderHistoryContextType | undefined>(undefined);

export function FolderHistoryProvider({ children }: { children: ReactNode }) {
    const [history, setHistory] = useState<string[]>([]);

    // 初期化時にlocalStorageから読み込み
    useEffect(() => {
        try {
            const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    setHistory(parsed.slice(0, MAX_HISTORY_ITEMS));
                }
            }
        } catch (error) {
            console.error('Failed to load history:', error);
        }
    }, []);

    // 履歴に追加
    const addToHistory = useCallback((path: string) => {
        if (!path || path.trim() === "") return;

        setHistory((prev) => {
            // 既存の履歴から同じパスを除外して先頭に追加
            const newHistory = [path, ...prev.filter((p) => p !== path)].slice(0, MAX_HISTORY_ITEMS);

            // localStorageに保存
            try {
                localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(newHistory));
            } catch (error) {
                console.error('Failed to save history:', error);
            }

            return newHistory;
        });
    }, []);

    // 履歴検索
    const searchHistory = useCallback((query: string) => {
        if (!query) return history;

        const lowerQuery = query.toLowerCase();
        return history.filter(path =>
            path.toLowerCase().includes(lowerQuery)
        );
    }, [history]);

    // 履歴クリア（デバッグ用など）
    const clearHistory = useCallback(() => {
        setHistory([]);
        localStorage.removeItem(HISTORY_STORAGE_KEY);
    }, []);

    return (
        <FolderHistoryContext.Provider value={{ history, addToHistory, searchHistory, clearHistory }}>
            {children}
        </FolderHistoryContext.Provider>
    );
}

export function useFolderHistory() {
    const context = useContext(FolderHistoryContext);
    if (context === undefined) {
        throw new Error('useFolderHistory must be used within a FolderHistoryProvider');
    }
    return context;
}
