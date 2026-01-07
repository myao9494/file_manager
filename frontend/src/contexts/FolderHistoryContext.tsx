/**
 * フォルダ履歴管理コンテキスト
 * 
 * ・左/中央ペインで共有される履歴を管理
 * ・履歴は最大300件まで保存
 * ・バックエンドのJSONファイルに永続化 (/api/history)
 */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

// 履歴の最大保存数
const MAX_HISTORY_ITEMS = 300;
import { API_BASE_URL } from '../config';

interface FolderHistoryContextType {
    history: string[];
    addToHistory: (path: string) => void;
    searchHistory: (query: string) => string[];
    clearHistory: () => void;
}

const FolderHistoryContext = createContext<FolderHistoryContextType | undefined>(undefined);

export function FolderHistoryProvider({ children }: { children: ReactNode }) {
    const [history, setHistory] = useState<string[]>([]);

    // 履歴をバックエンドに保存する関数
    const saveHistoryToBackend = useCallback(async (newHistory: string[]) => {
        try {
            await fetch(`${API_BASE_URL}/api/history`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ paths: newHistory }),
            });
        } catch (error) {
            console.error('Failed to save history:', error);
        }
    }, []);

    // 初期化時にバックエンドから読み込み
    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/history`);
                if (response.ok) {
                    const data = await response.json();
                    if (Array.isArray(data)) {
                        setHistory(data.slice(0, MAX_HISTORY_ITEMS));
                    }
                }
            } catch (error) {
                console.error('Failed to load history:', error);
            }
        };
        fetchHistory();
    }, []);

    // 履歴に追加
    const addToHistory = useCallback((path: string) => {
        if (!path || path.trim() === "") return;

        setHistory((prev) => {
            // 既存の履歴から同じパスを除外して先頭に追加
            const newHistory = [path, ...prev.filter((p) => p !== path)].slice(0, MAX_HISTORY_ITEMS);

            // バックエンドに保存
            saveHistoryToBackend(newHistory);

            return newHistory;
        });
    }, [saveHistoryToBackend]);

    // 履歴検索
    const searchHistory = useCallback((query: string) => {
        if (!query) return history;

        const lowerQuery = query.toLowerCase();
        return history.filter(path =>
            path.toLowerCase().includes(lowerQuery)
        );
    }, [history]);

    // 履歴クリア
    const clearHistory = useCallback(() => {
        setHistory([]);
        saveHistoryToBackend([]);
    }, [saveHistoryToBackend]);

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
