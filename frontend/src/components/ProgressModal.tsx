/**
 * プログレスモーダルコンポーネント
 * 
 * 大規模ファイル移動時に進捗を表示し、キャンセル機能を提供する
 */
import React, { useEffect, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import './ProgressModal.css';

// 進捗情報の型
interface TaskProgress {
    id: string;
    status: 'pending' | 'running' | 'completed' | 'cancelled' | 'error';
    progress: number;
    current_file: string;
    total_files: number;
    processed_files: number;
    error_message?: string;
    result?: {
        success_count: number;
        fail_count: number;
        results: any[];
    };
}

// 操作タイプ
type OperationType = 'move' | 'copy' | 'delete';

// 操作タイプの日本語表示
const OPERATION_LABELS: Record<OperationType, { title: string; action: string; complete: string }> = {
    move: { title: 'ファイル移動', action: '移動中', complete: '移動完了' },
    copy: { title: 'ファイルコピー', action: 'コピー中', complete: 'コピー完了' },
    delete: { title: 'ファイル削除', action: '削除中', complete: '削除完了' }
};

interface ProgressModalProps {
    isOpen: boolean;
    taskId: string | null;
    operationType?: OperationType;
    onClose: () => void;
    onComplete?: (result: TaskProgress['result']) => void;
    apiBaseUrl?: string;
}

export const ProgressModal: React.FC<ProgressModalProps> = ({
    isOpen,
    taskId,
    operationType = 'move',
    onClose,
    onComplete,
    apiBaseUrl = 'http://localhost:8001/api'
}) => {
    const labels = OPERATION_LABELS[operationType];
    const [progress, setProgress] = useState<TaskProgress | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isCancelling, setIsCancelling] = useState(false);
    const [hasCalledComplete, setHasCalledComplete] = useState(false);

    // タスクIDが変わるたびにリセット
    useEffect(() => {
        if (taskId) {
            setProgress(null);
            setError(null);
            setHasCalledComplete(false);
        }
    }, [taskId]);

    // 進捗をポーリング
    useEffect(() => {
        if (!taskId || hasCalledComplete) return;

        let cancelled = false;
        let intervalId: ReturnType<typeof setInterval> | null = null;

        const pollProgress = async () => {
            try {
                // 進捗取得
                const response = await fetch(`${apiBaseUrl}/tasks/${taskId}/progress`);
                if (cancelled) return;

                if (!response.ok) {
                    throw new Error('進捗の取得に失敗しました');
                }

                const data: TaskProgress = await response.json();

                if (!cancelled) {
                    setProgress(data);

                    // 完了状態の場合
                    if (data.status === 'completed' || data.status === 'cancelled' || data.status === 'error') {
                        if (!hasCalledComplete) {
                            setHasCalledComplete(true);
                            if (onComplete && data.result) {
                                onComplete(data.result);
                            }
                            // 完了したらポーリング停止
                            if (intervalId) {
                                clearInterval(intervalId);
                            }
                        }
                    }
                }
            } catch (err: any) {
                if (!cancelled) {
                    console.error('Poll error:', err);
                }
            }
        };

        // 初回即時実行
        pollProgress();

        // ポーリング開始
        intervalId = setInterval(pollProgress, 500);

        return () => {
            cancelled = true;
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }, [taskId, apiBaseUrl, onComplete, hasCalledComplete]);

    // キャンセル処理
    const handleCancel = useCallback(async () => {
        if (!taskId || isCancelling) return;

        setIsCancelling(true);
        try {
            const response = await fetch(`${apiBaseUrl}/tasks/${taskId}/cancel`, {
                method: 'POST'
            });
            if (!response.ok) {
                throw new Error('キャンセルに失敗しました');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsCancelling(false);
        }
    }, [taskId, apiBaseUrl, isCancelling]);

    // モーダルを閉じる
    const handleClose = useCallback(() => {
        // 進行中の場合は確認
        if (progress?.status === 'running') {
            if (!window.confirm('処理を中断しますか？')) {
                return;
            }
            handleCancel();
        }
        setProgress(null);
        setError(null);
        onClose();
    }, [progress?.status, handleCancel, onClose]);

    if (!isOpen) return null;

    const isFinished = progress?.status === 'completed' ||
        progress?.status === 'cancelled' ||
        progress?.status === 'error';

    return (
        <div className="progress-modal-overlay" onClick={(e) => e.target === e.currentTarget && handleClose()}>
            <div className="progress-modal">
                <div className="progress-modal-header">
                    <h3>{labels.title}</h3>
                    <button className="progress-modal-close" onClick={handleClose}>
                        <X size={18} />
                    </button>
                </div>

                <div className="progress-modal-body">
                    {error ? (
                        <div className="progress-error">{error}</div>
                    ) : progress ? (
                        <>
                            {/* ステータス表示 */}
                            <div className="progress-status">
                                {progress.status === 'running' && `${labels.action}...`}
                                {progress.status === 'completed' && `✓ ${labels.complete}`}
                                {progress.status === 'cancelled' && '⚠ キャンセルされました'}
                                {progress.status === 'error' && `✗ エラー: ${progress.error_message}`}
                                {progress.status === 'pending' && '開始待ち...'}
                            </div>

                            {/* 現在処理中のファイル */}
                            {progress.current_file && progress.status === 'running' && (
                                <div className="progress-current-file-large" title={progress.current_file}>
                                    📄 {progress.current_file}
                                </div>
                            )}

                            {/* プログレスバー */}
                            <div className="progress-bar-container">
                                <div
                                    className={`progress-bar ${progress.status}`}
                                    style={{ width: `${progress.progress}%` }}
                                />
                                <span className="progress-percent">{Math.round(progress.progress)}%</span>
                            </div>

                            {/* 進捗詳細 */}
                            <div className="progress-details">
                                <div className="progress-files">
                                    処理済み: {progress.processed_files} / {progress.total_files} 件
                                </div>
                            </div>

                            {/* 結果表示（完了時） */}
                            {progress.status === 'completed' && progress.result && (
                                <div className="progress-result">
                                    成功: {progress.result.success_count} /
                                    失敗: {progress.result.fail_count}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="progress-loading">読み込み中...</div>
                    )}
                </div>

                <div className="progress-modal-footer">
                    {!isFinished && (
                        <button
                            className="progress-cancel-btn"
                            onClick={handleCancel}
                            disabled={isCancelling}
                        >
                            {isCancelling ? 'キャンセル中...' : 'キャンセル'}
                        </button>
                    )}
                    {isFinished && (
                        <button className="progress-close-btn" onClick={handleClose}>
                            閉じる
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
