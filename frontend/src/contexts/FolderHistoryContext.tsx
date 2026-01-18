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

export interface HistoryItem {
    path: string;
    count: number;
    timestamp: number;
}

interface FolderHistoryContextType {
    history: HistoryItem[];
    addToHistory: (path: string) => void;
    searchHistory: (query: string) => HistoryItem[];
    removeFromHistory: (path: string) => void;
    clearHistory: () => void;
}

const FolderHistoryContext = createContext<FolderHistoryContextType | undefined>(undefined);

export function FolderHistoryProvider({ children }: { children: ReactNode }) {
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [isInitialized, setIsInitialized] = useState(false);

    // 履歴をバックエンドに保存する関数
    const saveHistoryToBackend = useCallback(async (newHistory: HistoryItem[]) => {
        try {
            await fetch(`${API_BASE_URL}/api/history`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ history: newHistory }),
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
                let fetchedData: HistoryItem[] = [];
                if (response.ok) {
                    const data = await response.json();
                    if (Array.isArray(data)) {
                        fetchedData = data;
                    }
                }

                setHistory((prev) => {
                    // ローカルの変更(prev)を優先し、バックエンドのデータ(fetchedData)をマージ
                    // prevにあるものは、起動後にユーザーが移動したものなので最新とみなす
                    const prevPaths = new Set(prev.map(p => p.path));
                    
                    // バックエンドにあってローカルにないものを追加
                    const newItems = fetchedData.filter(item => !prevPaths.has(item.path));
                    const merged = [...prev, ...newItems].slice(0, MAX_HISTORY_ITEMS);
                    
                    // マージ結果を保存して整合性を保つ
                    saveHistoryToBackend(merged); 
                    return merged;
                });
            } catch (error) {
                console.error('Failed to load history:', error);
            } finally {
                setIsInitialized(true);
            }
        };
        fetchHistory();
    }, [saveHistoryToBackend]);

    // 履歴に追加
    const addToHistory = useCallback((path: string) => {
        if (!path || path.trim() === "") return;

        setHistory((prev) => {
            // 既存のエントリを探す
            const existingIndex = prev.findIndex((item) => item.path === path);
            let newItem: HistoryItem;
            let newHistory: HistoryItem[];

            if (existingIndex !== -1) {
                // 既存: カウントアップしてタイムスタンプ更新
                const existingItem = prev[existingIndex];
                newItem = {
                    ...existingItem,
                    count: existingItem.count + 1,
                    timestamp: Date.now()
                };
                // 既存を除外
                const remaining = [...prev];
                remaining.splice(existingIndex, 1);
                // 先頭に追加
                newHistory = [newItem, ...remaining];
            } else {
                // 新規: カウント1
                newItem = {
                    path: path,
                    count: 1,
                    timestamp: Date.now()
                };
                newHistory = [newItem, ...prev];
            }

            // 最大件数制限
            newHistory = newHistory.slice(0, MAX_HISTORY_ITEMS);

            // 初期化完了後のみバックエンドに保存（初期化中は後でマージされるためスキップ）
            if (isInitialized) {
                saveHistoryToBackend(newHistory);
            }

            return newHistory;
        });
    }, [saveHistoryToBackend, isInitialized]);

    // 履歴検索
    const searchHistory = useCallback((query: string) => {
        let results = history;
        if (query) {
            const lowerQuery = query.toLowerCase();
            results = history.filter(item =>
                item.path.toLowerCase().includes(lowerQuery)
            );
        }

        // ソート: 回数（降順） -> 日付（降順）
        return [...results].sort((a, b) => {
            if (a.count !== b.count) {
                return b.count - a.count; // 回数が多い順
            }
            return b.timestamp - a.timestamp; // 新しい順
        });
    }, [history]);

    // 履歴から削除
    const removeFromHistory = useCallback((path: string) => {
        setHistory((prev) => {
            const newHistory = prev.filter(item => item.path !== path);
            if (isInitialized) {
                saveHistoryToBackend(newHistory);
            }
            return newHistory;
        });
    }, [saveHistoryToBackend, isInitialized]);

    // 履歴クリア
    const clearHistory = useCallback(() => {
        setHistory([]);
        if (isInitialized) {
            saveHistoryToBackend([]);
        }
    }, [saveHistoryToBackend, isInitialized]);

    return (
        <FolderHistoryContext.Provider value={{ history, addToHistory, searchHistory, removeFromHistory, clearHistory }}>
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
