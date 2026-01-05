/**
 * アプリケーションのZoomレベルを管理するコンテキスト
 * 範囲: 50% - 200%
 */
import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

type ZoomContextType = {
    zoomLevel: number;
    zoomIn: () => void;
    zoomOut: () => void;
    resetZoom: () => void;
};

const ZoomContext = createContext<ZoomContextType | undefined>(undefined);

const STORAGE_KEY = 'file_manager_zoom_level';

export function ZoomProvider({ children }: { children: ReactNode }) {
    const [zoomLevel, setZoomLevel] = useState(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? parseFloat(saved) : 1.0;
    });

    // Zoomレベルが変更されたら保存
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, zoomLevel.toString());
    }, [zoomLevel]);

    const zoomIn = () => {
        setZoomLevel((prev) => Math.min(prev + 0.1, 2.0));
    };

    const zoomOut = () => {
        setZoomLevel((prev) => Math.max(prev - 0.1, 0.5));
    };

    const resetZoom = () => {
        setZoomLevel(1.0);
    };

    return (
        <ZoomContext.Provider value={{ zoomLevel, zoomIn, zoomOut, resetZoom }}>
            {children}
        </ZoomContext.Provider>
    );
}

export function useZoomContext() {
    const context = useContext(ZoomContext);
    if (context === undefined) {
        throw new Error("useZoomContext must be used within a ZoomProvider");
    }
    return context;
}
