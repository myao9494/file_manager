"""
ファイル操作APIルーター
- ファイル一覧取得
- ファイル検索（Liveモード）
- ファイル操作（コピー、移動、削除、リネーム）

注: インデックス検索は外部サービス（file_index_service）に移行
"""
import fnmatch
import hashlib
import threading
import queue
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple
import webbrowser
import urllib.parse

from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel

import os
import io
import shutil
import platform
import subprocess

from app.config import settings
from app.task_manager import task_manager, TaskInfo

router = APIRouter()


class FileItem(BaseModel):
    """ファイル/フォルダアイテムのスキーマ"""

    name: str
    type: str  # "file" or "directory"
    path: str
    size: Optional[int] = None
    modified: Optional[str] = None


class DirectoryResponse(BaseModel):
    """ディレクトリ一覧のレスポンススキーマ"""

    type: str = "directory"
    items: List[FileItem]


class SearchResponse(BaseModel):
    """検索結果のレスポンススキーマ"""

    query: str
    path: str
    depth: int
    total: int
    items: List[FileItem]


def normalize_path(path: str) -> Path:
    """
    パスを正規化
    - 絶対パス: そのまま使用（Windows UNCパス \\server\share\folder を含む）
    - 相対パス: ベースディレクトリからの相対パスとして扱う
    - パストラバーサル対策を実施
    """
    if not path:
        return settings.base_dir

    normalized = Path(path)

    if normalized.is_absolute():
        try:
            resolved = normalized.resolve()
            return resolved
        except (ValueError, RuntimeError) as e:
            raise HTTPException(status_code=400, detail=f"無効なパスです: {str(e)}")

    try:
        resolved = (settings.base_dir / normalized).resolve()

        if not str(resolved).startswith(str(settings.base_dir.resolve())):
            raise HTTPException(status_code=403, detail="許可されていないパスです")

        return resolved
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=f"無効なパスです: {str(e)}")


@router.get("/files", response_model=DirectoryResponse)
async def get_files(path: str = "") -> DirectoryResponse:
    """
    ファイル一覧を取得

    Args:
        path: 絶対パスまたはベースディレクトリからの相対パス

    Returns:
        DirectoryResponse: ディレクトリ内のファイル/フォルダ一覧
    """
    target_path = normalize_path(path)

    if not target_path.exists():
        raise HTTPException(status_code=404, detail="パスが見つかりません")

    if not target_path.is_dir():
        raise HTTPException(status_code=400, detail="指定されたパスはディレクトリではありません")

    items: List[FileItem] = []

    for item in target_path.iterdir():
        try:
            if item.is_symlink():
                try:
                    resolved = item.resolve(strict=True)
                    if str(resolved).startswith(str(target_path)):
                        continue
                except (OSError, RuntimeError):
                    continue

            item_absolute_path = str(item)

            if item.is_dir():
                items.append(
                    FileItem(
                        name=item.name,
                        type="directory",
                        path=item_absolute_path,
                    )
                )
            else:
                stat = item.stat()
                items.append(
                    FileItem(
                        name=item.name,
                        type="file",
                        path=item_absolute_path,
                        size=stat.st_size,
                        modified=datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    )
                )
        except (PermissionError, OSError):
            continue

    return DirectoryResponse(type="directory", items=items)


def should_ignore(path: Path, ignore_patterns: List[str]) -> bool:
    """
    パスが除外パターンに一致するかチェック
    """
    name = path.name
    path_str = str(path)
    for pattern in ignore_patterns:
        pattern = pattern.strip()
        if not pattern:
            continue
        if fnmatch.fnmatch(name, pattern):
            return True
        if name == pattern:
            return True
        if pattern in path_str:
            return True
    return False


def search_files_recursive(
    base_path: Path,
    query: str,
    current_depth: int,
    max_depth: int,
    ignore_patterns: List[str],
    results: List[FileItem],
    max_results: int = 1000,
) -> None:
    """
    再帰的にファイルを検索

    Args:
        base_path: 検索開始ディレクトリ
        query: 検索クエリ（大文字小文字を区別しない）
        current_depth: 現在の階層
        max_depth: 最大検索階層（0=無制限）
        ignore_patterns: 除外パターンのリスト
        results: 検索結果を格納するリスト
        max_results: 最大結果数
    """
    if len(results) >= max_results:
        return

    if max_depth > 0 and current_depth > max_depth:
        return

    try:
        for item in base_path.iterdir():
            if len(results) >= max_results:
                return

            try:
                if should_ignore(item, ignore_patterns):
                    continue

                if item.is_symlink():
                    try:
                        resolved = item.resolve(strict=True)
                        if str(resolved).startswith(str(base_path)):
                            continue
                    except (OSError, RuntimeError):
                        continue

                name_lower = item.name.lower()
                query_lower = query.lower()

                if query_lower in name_lower:
                    item_absolute_path = str(item)
                    if item.is_dir():
                        results.append(
                            FileItem(
                                name=item.name,
                                type="directory",
                                path=item_absolute_path,
                            )
                        )
                    else:
                        try:
                            stat = item.stat()
                            results.append(
                                FileItem(
                                    name=item.name,
                                    type="file",
                                    path=item_absolute_path,
                                    size=stat.st_size,
                                    modified=datetime.fromtimestamp(stat.st_mtime).isoformat(),
                                )
                            )
                        except (PermissionError, OSError):
                            results.append(
                                FileItem(
                                    name=item.name,
                                    type="file",
                                    path=item_absolute_path,
                                )
                            )

                if item.is_dir():
                    search_files_recursive(
                        item,
                        query,
                        current_depth + 1,
                        max_depth,
                        ignore_patterns,
                        results,
                        max_results,
                    )

            except (PermissionError, OSError):
                continue

    except (PermissionError, OSError):
        pass


class PathInfoResponse(BaseModel):
    """パス情報のレスポンススキーマ"""

    path: str
    type: str  # "file", "directory", or "not_found"
    parent: Optional[str] = None


@router.get("/path-info", response_model=PathInfoResponse)
async def get_path_info(path: str = "") -> PathInfoResponse:
    """
    パスの種別を判定（ファイル/ディレクトリ/存在しない）

    Args:
        path: 確認するパス

    Returns:
        PathInfoResponse: パスの種別情報
    """
    target_path = normalize_path(path)

    if not target_path.exists():
        return PathInfoResponse(
            path=str(target_path),
            type="not_found",
        )

    if target_path.is_dir():
        return PathInfoResponse(
            path=str(target_path),
            type="directory",
        )

    parent_path = target_path.parent
    return PathInfoResponse(
        path=str(target_path),
        type="file",
        parent=str(parent_path),
    )


@router.get("/search", response_model=SearchResponse)
async def search_files(
    path: str = Query("", description="検索開始ディレクトリ"),
    query: str = Query("", description="検索クエリ（ファイル名の部分一致）"),
    depth: int = Query(0, ge=0, le=100, description="検索階層（0=無制限）"),
    ignore: str = Query("", description="除外パターン（カンマ区切り）"),
    max_results: int = Query(1000, ge=1, le=10000, description="最大結果数"),
    file_type: str = Query("all", description="ファイルタイプフィルタ（all/file/directory）"),
) -> SearchResponse:
    """
    ファイル検索（Liveモード - ディレクトリ走査）

    インデックス検索は外部サービス（file_index_service）を使用してください。

    Args:
        path: 検索開始ディレクトリ
        query: 検索クエリ（ファイル名の部分一致、大文字小文字を区別しない）
        depth: 検索階層（0=無制限、1=現在のディレクトリのみ、2=1階層下まで...）
        ignore: 除外パターン（カンマ区切り、例: "node_modules,*.pyc,.git"）
        max_results: 最大結果数（デフォルト1000、最大10000）
        file_type: ファイルタイプフィルタ（all/file/directory）

    Returns:
        SearchResponse: 検索結果
    """
    ignore_patterns = [p.strip() for p in ignore.split(",") if p.strip()]
    default_ignores = [".git", ".svn", "__pycache__", ".DS_Store"]
    ignore_patterns.extend(default_ignores)

    if not query.strip():
        return SearchResponse(
            query=query,
            path=path,
            depth=depth,
            total=0,
            items=[],
        )

    target_path = normalize_path(path)

    if not target_path.exists():
        raise HTTPException(status_code=404, detail="パスが見つかりません")

    if not target_path.is_dir():
        raise HTTPException(status_code=400, detail="指定されたパスはディレクトリではありません")

    results: List[FileItem] = []
    search_files_recursive(
        target_path,
        query,
        1,
        depth,
        ignore_patterns,
        results,
        max_results,
    )

    if file_type != "all":
        results = [r for r in results if r.type == file_type]

    return SearchResponse(
        query=query,
        path=str(target_path),
        depth=depth,
        total=len(results),
        items=results,
    )


class DeleteRequest(BaseModel):
    """削除リクエストのスキーマ"""

    path: str
    async_mode: bool = False  # 非同期モード
    debug_mode: bool = False  # デバッグモード


def _is_network_drive(path: Path) -> bool:
    """ネットワークドライブかどうかを判定"""
    path_str = str(path)
    # macOS/Linuxのネットワークドライブ判定
    if path_str.startswith('/Volumes/') and not path_str.startswith('/Volumes/Macintosh'):
        return True
    # Windowsのネットワークドライブ判定
    if path_str.startswith('\\\\') or (len(path_str) >= 2 and path_str[1] == ':' and path_str[0] in 'DEFGHIJKLMNOPQRSTUVWXYZ'):
        # ネットワークドライブの可能性が高い（完全な判定にはさらなるチェックが必要）
        return True
    return False


def _safe_delete(path: Path, debug_mode: bool = False) -> tuple[bool, str]:
    """
    安全にファイル/フォルダを削除する（一括削除版）

    Returns:
        (成功フラグ, メッセージ) のタプル
    """
    def log(msg: str):
        if debug_mode:
            print(f"[DELETE] {msg}")

    try:
        is_network = _is_network_drive(path)

        if is_network:
            # ネットワークドライブの場合は直接削除
            log(f"ネットワークドライブ検出、直接削除: {path}")
            if path.is_file():
                path.unlink()
            else:
                shutil.rmtree(str(path))
            return True, "削除しました（ネットワークドライブ）"
        else:
            # ローカルドライブの場合はゴミ箱に移動
            log(f"ローカルドライブ、ゴミ箱に移動: {path}")
            from send2trash import send2trash
            send2trash(str(path))
            return True, "ゴミ箱に移動しました"

    except Exception as e:
        log(f"削除エラー: {e}")
        return False, str(e)


def collect_all_files(path: Path) -> List[Path]:
    """
    フォルダ内のすべてのファイルとディレクトリを収集する（深い階層から）

    Args:
        path: 収集対象のパス

    Returns:
        ファイルとディレクトリのリスト（深い階層から浅い階層の順）
    """
    if path.is_file():
        return [path]

    items = []
    try:
        # rglob("*")で全アイテムを取得し、深さでソート（深い順）
        all_items = list(path.rglob("*"))
        # パスの深さ（セパレータの数）で降順ソート
        all_items.sort(key=lambda p: str(p).count(os.sep), reverse=True)
        items.extend(all_items)
        # 最後にルートディレクトリ自体を追加
        items.append(path)
    except (PermissionError, OSError):
        pass

    return items


def _safe_delete_with_progress(
    path: Path,
    task_id: Optional[str] = None,
    debug_mode: bool = False
) -> Tuple[bool, str, int, int]:
    """
    安全にファイル/フォルダを削除する（進捗対応版）

    ディレクトリの場合、内部のファイルを一つずつ削除して進捗を報告する。

    Args:
        path: 削除対象のパス
        task_id: タスクID（進捗追跡用）
        debug_mode: デバッグモード

    Returns:
        (成功フラグ, メッセージ, 成功数, 失敗数) のタプル
    """
    def log(msg: str):
        if debug_mode:
            print(f"[DELETE_PROGRESS] {msg}")

    is_network = _is_network_drive(path)

    try:
        # ファイルリストを収集
        log(f"ファイルリスト収集開始: {path}")
        items = collect_all_files(path)
        total_items = len(items)
        log(f"削除対象: {total_items}件")

        # タスクの総ファイル数を更新
        if task_id:
            task = task_manager.get_task(task_id)
            if task:
                task.total_files = total_items

        success_count = 0
        fail_count = 0

        # 各アイテムを削除（深い階層から）
        for i, item in enumerate(items):
            # キャンセルチェック
            if task_id and task_manager.is_cancelled(task_id):
                log("キャンセルが検出されました")
                return False, "キャンセルされました", success_count, fail_count

            # 進捗更新
            if task_id:
                task_manager.update_progress(
                    task_id,
                    processed_files=i,
                    current_file=item.name
                )

            try:
                if item.is_file() or item.is_symlink():
                    # ファイルまたはシンボリックリンクを削除
                    if is_network:
                        item.unlink()
                    else:
                        # ローカルの場合はゴミ箱に移動（ファイル単位）
                        from send2trash import send2trash
                        send2trash(str(item))
                    log(f"削除成功 ({i+1}/{total_items}): {item.name}")
                    success_count += 1
                elif item.is_dir():
                    # ディレクトリを削除（この時点で中身は空のはず）
                    try:
                        if is_network:
                            item.rmdir()  # 空のディレクトリを削除
                        else:
                            # ローカルの場合はゴミ箱に移動
                            from send2trash import send2trash
                            send2trash(str(item))
                        log(f"ディレクトリ削除成功 ({i+1}/{total_items}): {item.name}")
                        success_count += 1
                    except OSError as e:
                        # ディレクトリが空でない場合は警告を出すが続行
                        log(f"ディレクトリ削除スキップ ({i+1}/{total_items}): {item.name} - {e}")
                        # 空でないディレクトリは強制削除を試みる
                        if is_network:
                            try:
                                shutil.rmtree(str(item))
                                success_count += 1
                            except Exception:
                                fail_count += 1
                        else:
                            fail_count += 1
            except Exception as e:
                log(f"削除エラー ({i+1}/{total_items}): {item.name} - {e}")
                fail_count += 1

        # 最終進捗更新
        if task_id:
            task_manager.update_progress(task_id, processed_files=total_items)

        if fail_count > 0:
            return False, f"一部の削除に失敗しました（成功: {success_count}, 失敗: {fail_count}）", success_count, fail_count

        message = "削除しました（ネットワークドライブ）" if is_network else "ゴミ箱に移動しました"
        return True, message, success_count, fail_count

    except Exception as e:
        log(f"削除エラー: {e}")
        return False, str(e), 0, 1


def _execute_delete_async(task_id: str, target_path: Path, debug_mode: bool):
    """削除を実行（バックグラウンドスレッド用・進捗対応）"""
    def log(msg: str):
        if debug_mode:
            print(f"[DELETE] {msg}")

    task_manager.set_running(task_id)
    task_manager.update_progress(task_id, processed_files=0, current_file=target_path.name)
    log(f"削除開始: {target_path}")

    # 進捗対応版の削除を実行
    success, message, success_count, fail_count = _safe_delete_with_progress(
        target_path,
        task_id,
        debug_mode
    )

    if success:
        log(f"削除完了: {target_path.name} (成功: {success_count}件)")
        task_manager.complete_task(task_id, result={
            "status": "completed",
            "success_count": success_count,
            "fail_count": fail_count,
            "results": [{"path": str(target_path), "status": "success", "message": message}]
        })
    else:
        log(f"削除エラー: {message}")
        task_manager.fail_task(task_id, message)


@router.delete("/delete")
async def delete_item(request: DeleteRequest):
    """
    ファイル/フォルダをゴミ箱に移動（ネットワークドライブの場合は直接削除）

    Args:
        request: 削除リクエスト（pathを含む）

    Returns:
        削除成功メッセージ
    """
    target_path = normalize_path(request.path)

    if not target_path.exists():
        raise HTTPException(status_code=404, detail="パスが見つかりません")

    # 非同期モードの場合
    if request.async_mode:
        task = task_manager.create_task(total_files=1)
        task_id = task.id

        thread = threading.Thread(
            target=_execute_delete_async,
            args=(task_id, target_path, request.debug_mode)
        )
        thread.start()

        return {"status": "async", "task_id": task_id, "message": "削除処理を開始しました"}

    # 同期モード
    success, message = _safe_delete(target_path, request.debug_mode)
    if success:
        return {"status": "success", "message": message}
    else:
        raise HTTPException(status_code=500, detail=f"削除に失敗しました: {message}")


def count_files_in_directory(path: Path, max_depth: int = 3, current_depth: int = 0) -> int:
    """
    ディレクトリ内のファイル数をカウント（指定した深さまで）

    Args:
        path: カウント対象のパス
        max_depth: 最大探索深度（デフォルト3）
        current_depth: 現在の深度（内部用）

    Returns:
        ファイル数
    """
    if not path.exists():
        return 0

    if path.is_file():
        return 1

    if not path.is_dir():
        return 0

    # 最大深度に達したら0を返す
    if current_depth >= max_depth:
        return 0

    count = 0
    try:
        for item in path.iterdir():
            try:
                if item.is_file():
                    count += 1
                elif item.is_dir() and current_depth < max_depth:
                    count += count_files_in_directory(item, max_depth, current_depth + 1)
            except (PermissionError, OSError):
                continue
    except (PermissionError, OSError):
        pass

    return count


class CountFilesRequest(BaseModel):
    """ファイル数カウントリクエストのスキーマ"""
    paths: List[str]
    max_depth: int = 3


class CountFilesResponse(BaseModel):
    """ファイル数カウントレスポンスのスキーマ"""
    total_count: int
    details: List[dict]


@router.post("/count-files", response_model=CountFilesResponse)
async def count_files(request: CountFilesRequest):
    """
    指定されたパスのファイル数をカウント
    フォルダの場合は指定した深さまで再帰的にカウント

    Args:
        request: パスのリストと最大深度

    Returns:
        合計ファイル数と詳細
    """
    total = 0
    details = []

    for path_str in request.paths:
        try:
            path = normalize_path(path_str)
            count = count_files_in_directory(path, request.max_depth)
            total += count
            details.append({
                "path": path_str,
                "count": count,
                "type": "directory" if path.is_dir() else "file"
            })
        except Exception as e:
            details.append({
                "path": path_str,
                "count": 0,
                "type": "error",
                "error": str(e)
            })

    return CountFilesResponse(total_count=total, details=details)


class BatchDeleteRequest(BaseModel):
    """一括削除リクエストのスキーマ"""
    paths: List[str]
    async_mode: bool = False
    debug_mode: bool = False


def _execute_batch_delete_async(
    task_id: str,
    paths: List[str],
    debug_mode: bool
):
    """バッチ削除を実行（バックグラウンドスレッド用・進捗対応・並列化）"""
    def log(msg: str):
        if debug_mode:
            print(f"[BATCH_DELETE:{task_id[:8]}] {msg}")

    task_manager.set_running(task_id)
    # 即座に準備中を表示
    task_manager.update_progress(task_id, processed_files=0, current_file="準備中...")
    log(f"削除開始: {len(paths)} パス")

    # 削除キュー: path
    del_queue = queue.Queue()
    # ディレクトリリスト（後で削除するため）
    dir_list = []
    
    total_files = 0
    scanned_files = 0
    scanner_finished = False

    # 統計
    success_count = 0
    fail_count = 0
    lock = threading.Lock()
    results = []

    def scanner_thread():
        nonlocal total_files, scanner_finished
        try:
             for path_str in paths:
                try:
                    p = normalize_path(path_str)
                    if not p.exists():
                        continue
                    
                    if p.is_file() or p.is_symlink():
                        # 単一ファイル
                        total_files += 1
                        del_queue.put(p)
                    else:
                        # ディレクトリの場合、再帰的に収集
                        # topdown=Falseで深い方から...と言いたいが、
                        # 並列削除の場合はファイルだけ先に全消しして、最後にディレクトリを消す方が安全かつ高速
                        for root, dirs, files in os.walk(p):
                            for name in files:
                                file_path = Path(root) / name
                                total_files += 1
                                del_queue.put(file_path)
                            
                            for name in dirs:
                                dir_path = Path(root) / name
                                dir_list.append(dir_path)
                        
                        # ルートディレクトリも追加
                        dir_list.append(p)
                                
                    # 定期的にタスク情報の総数を更新
                    task = task_manager.get_task(task_id)
                    if task:
                        task.total_files = total_files

                except Exception as e:
                    log(f"スキャンエラー: {path_str} - {e}")

        except Exception as e:
            log(f"スキャンクリティカルエラー: {e}")
        finally:
            scanner_finished = True
            log(f"スキャン完了: {total_files} ファイル")
            # タスク情報の総数を最終更新
            task = task_manager.get_task(task_id)
            if task:
                task.total_files = total_files

    def worker_thread():
        nonlocal success_count, fail_count, scanned_files
        while True:
            try:
                # キューから取得（タイムアウト付き）
                try:
                    target_path = del_queue.get(timeout=0.5)
                except queue.Empty:
                    if scanner_finished:
                        break
                    continue

                # 削除実行
                is_network = _is_network_drive(target_path)
                item_success = False
                error_msg = ""
                
                try:
                    if is_network:
                        if target_path.is_file() or target_path.is_symlink():
                            target_path.unlink()
                        elif target_path.is_dir():
                            target_path.rmdir()
                        item_success = True
                    else:
                        from send2trash import send2trash
                        send2trash(str(target_path))
                        item_success = True
                except Exception as e:
                    error_msg = str(e)
                    # 再試行ロジック（オプション）
                
                with lock:
                    if item_success:
                        success_count += 1
                        if debug_mode:
                            log(f"削除成功: {target_path.name}")
                    else:
                        fail_count += 1
                        log(f"削除失敗: {target_path.name} - {error_msg}")
                        results.append({
                            "path": str(target_path),
                            "status": "error",
                            "message": error_msg
                        })
                    
                    scanned_files += 1
                    # 進捗更新（頻度を落とすか、ここで行う）
                    task_manager.update_progress(
                        task_id,
                        processed_files=scanned_files,
                        current_file=target_path.name
                    )

                del_queue.task_done()

            except Exception as e:
                log(f"ワーカースレッドエラー: {e}")

    # スキャナー開始
    t_scanner = threading.Thread(target=scanner_thread, daemon=True)
    t_scanner.start()

    # ワーカー開始
    workers = []
    for _ in range(MAX_WORKERS):
        t = threading.Thread(target=worker_thread, daemon=True)
        t.start()
        workers.append(t)

    # 全て終了するまで待機
    t_scanner.join()
    for t in workers:
        t.join()

    # 残ったディレクトリを削除（深い順にソートして削除）
    # os.walkで集めたdir_listは順不同の可能性があるため、パスの深さでソート
    dir_list.sort(key=lambda x: str(x).count(os.sep), reverse=True)
    
    log(f"ディレクトリ削除フェーズ: {len(dir_list)} 件")
    
    for d in dir_list:
        if task_manager.is_cancelled(task_id):
            break
        
        # 進捗更新
        task_manager.update_progress(task_id, processed_files=scanned_files, current_file=d.name)
        
        try:
            if d.exists():
                is_network = _is_network_drive(d)
                if is_network:
                     d.rmdir()
                else:
                     from send2trash import send2trash
                     send2trash(str(d))
                log(f"ディレクトリ削除: {d.name}")
        except Exception as e:
            # 既に消えている、または中身が残っている場合
            # 中身が残っているならrmtreeを試みる（安全のため）
            try:
                if d.exists():
                    shutil.rmtree(str(d))
                    log(f"ディレクトリ強制削除: {d.name}")
            except Exception as e2:
                log(f"ディレクトリ削除失敗: {d} - {e2}")

    # 完了処理
    log(f"完了: 成功={success_count}, 失敗={fail_count}")
    task_manager.complete_task(task_id, result={
        "status": "completed",
        "success_count": success_count,
        "fail_count": fail_count,
        "results": results
    })


@router.post("/delete/batch")
async def delete_items_batch(request: BatchDeleteRequest):
    """
    複数のファイル/フォルダをゴミ箱に移動

    async_mode が True の場合、バックグラウンドで処理しタスクIDを返す。
    """
    if request.debug_mode:
        print(f"[BATCH_DELETE] 開始: Paths={request.paths}, Async={request.async_mode}")

    # 非同期モードの場合
    if request.async_mode:
        task = task_manager.create_task(total_files=len(request.paths))
        task_id = task.id

        def run_batch_delete():
            _execute_batch_delete_async(
                task_id=task_id,
                paths=request.paths,
                debug_mode=request.debug_mode
            )

        thread = threading.Thread(target=run_batch_delete, daemon=True)
        thread.start()

        return {"status": "async", "task_id": task_id, "message": "削除処理を開始しました"}

    # 同期モード（従来通り）
    results = []
    success_count = 0
    fail_count = 0

    for path_str in request.paths:
        try:
            target_path = normalize_path(path_str)
        except Exception as e:
            result = {"path": path_str, "status": "error", "message": f"パスの正規化に失敗: {str(e)}"}
            fail_count += 1
            results.append(result)
            continue

        result = {"path": path_str, "status": "pending", "message": ""}

        if not target_path.exists():
            result["status"] = "error"
            result["message"] = "ファイルが見つかりません"
            fail_count += 1
            results.append(result)
            continue

        delete_success, delete_message = _safe_delete(target_path, False)

        if delete_success:
            result["status"] = "success"
            result["message"] = delete_message
            success_count += 1
        else:
            result["status"] = "error"
            result["message"] = delete_message
            fail_count += 1

        results.append(result)

    return {
        "status": "completed",
        "success_count": success_count,
        "fail_count": fail_count,
        "results": results
    }


class CreateFolderRequest(BaseModel):
    """フォルダ作成リクエストのスキーマ"""

    path: str
    name: str


@router.post("/create-folder")
async def create_folder(request: CreateFolderRequest):
    """
    フォルダを作成

    Args:
        request: 作成リクエスト（親パスと名前を含む）

    Returns:
        作成成功メッセージ
    """
    parent_path = normalize_path(request.path)

    if not parent_path.exists():
        raise HTTPException(status_code=404, detail="親ディレクトリが見つかりません")

    if not parent_path.is_dir():
        raise HTTPException(status_code=400, detail="指定されたパスはディレクトリではありません")

    new_folder = parent_path / request.name

    if new_folder.exists():
        raise HTTPException(status_code=400, detail="同名のファイル/フォルダが既に存在します")

    try:
        new_folder.mkdir()
        return {"status": "success", "message": f"フォルダを作成しました: {new_folder}"}
    except PermissionError:
        raise HTTPException(status_code=403, detail="作成権限がありません")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"フォルダ作成に失敗しました: {str(e)}")



class CreateFileRequest(BaseModel):
    """ファイル作成リクエストのスキーマ"""

    path: str
    name: str
    content: Optional[str] = ""


@router.post("/create-file")
async def create_file(request: CreateFileRequest):
    """
    ファイルを作成
    """
    parent_path = normalize_path(request.path)

    if not parent_path.exists():
        raise HTTPException(status_code=404, detail="親ディレクトリが見つかりません")

    if not parent_path.is_dir():
        raise HTTPException(status_code=400, detail="指定されたパスはディレクトリではありません")

    new_file = parent_path / request.name

    if new_file.exists():
        raise HTTPException(status_code=400, detail="同名のファイル/フォルダが既に存在します")

    try:
        with open(new_file, 'w', encoding='utf-8') as f:
            if request.content:
                f.write(request.content)
            else:
                pass # 空ファイルを作成
        return {"status": "success", "message": f"ファイルを作成しました: {new_file}", "path": str(new_file)}
    except PermissionError:
        raise HTTPException(status_code=403, detail="作成権限がありません")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ファイル作成に失敗しました: {str(e)}")


class UpdateFileRequest(BaseModel):
    """ファイル更新リクエストのスキーマ"""

    path: str
    content: str


@router.post("/update-file")
async def update_file(request: UpdateFileRequest):
    """
    ファイルの内容を更新
    """
    target_path = normalize_path(request.path)

    if not target_path.exists():
        raise HTTPException(status_code=404, detail="ファイルが見つかりません")

    if target_path.is_dir():
        raise HTTPException(status_code=400, detail="指定されたパスはディレクトリです")

    try:
        with open(target_path, 'w', encoding='utf-8') as f:
            f.write(request.content)
        return {"status": "success", "message": f"ファイルを更新しました: {target_path}"}
    except PermissionError:
        raise HTTPException(status_code=403, detail="更新権限がありません")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ファイル更新に失敗しました: {str(e)}")


class RenameRequest(BaseModel):
    """リネームリクエストのスキーマ"""

    old_path: str
    new_name: str


@router.post("/rename")
async def rename_item(request: RenameRequest):
    """
    ファイル/フォルダをリネーム

    Args:
        request: リネームリクエスト（元パスと新しい名前を含む）

    Returns:
        リネーム成功メッセージ
    """
    old_path = normalize_path(request.old_path)

    if not old_path.exists():
        raise HTTPException(status_code=404, detail="対象が見つかりません")

    new_path = old_path.parent / request.new_name

    if new_path.exists():
        raise HTTPException(status_code=400, detail="同名のファイル/フォルダが既に存在します")

    try:
        old_path.rename(new_path)
        return {"status": "success", "message": f"リネームしました: {old_path} → {new_path}"}
    except PermissionError:
        raise HTTPException(status_code=403, detail="リネーム権限がありません")
        raise HTTPException(status_code=500, detail=f"リネームに失敗しました: {str(e)}")


# ----------------------------------------------------------------
# 並列コピー・検証・安全な移動のヘルパー関数
# ----------------------------------------------------------------

# 並列処理のワーカー数（Turboモード）
# I/O待ち時間を埋めるため、CPUコア数の64倍、最大512まで許可
MAX_WORKERS = min(64, (os.cpu_count() or 4) * 8)


def calculate_file_checksum(file_path: Path, chunk_size: int = 65536) -> str:
    """
    ファイルのSHA256チェックサムを計算する
    
    Args:
        file_path: チェックサムを計算するファイルのパス
        chunk_size: 読み込みチャンクサイズ（デフォルト64KB）
    
    Returns:
        SHA256ハッシュの16進文字列
    """
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(chunk_size), b""):
            sha256_hash.update(chunk)
    return sha256_hash.hexdigest()


def get_directory_stats(dir_path: Path) -> Tuple[int, int]:
    """
    ディレクトリのファイル数と合計サイズを取得する
    
    Args:
        dir_path: 統計を取得するディレクトリのパス
    
    Returns:
        (ファイル数, 合計サイズ) のタプル
    """
    file_count = 0
    total_size = 0
    for item in dir_path.rglob("*"):
        if item.is_file():
            file_count += 1
            total_size += item.stat().st_size
    return file_count, total_size


def verify_copy(src: Path, dest: Path, use_checksum: bool = False) -> Tuple[bool, str]:
    """
    コピー結果を検証する
    
    Args:
        src: コピー元のパス
        dest: コピー先のパス
        use_checksum: チェックサム検証を使用するか（Falseの場合はサイズ比較のみ）
    
    Returns:
        (成功フラグ, メッセージ) のタプル
    """
    if not dest.exists():
        return False, "コピー先が存在しません"
    
    if src.is_file():
        # ファイルの場合
        src_size = src.stat().st_size
        dest_size = dest.stat().st_size
        if src_size != dest_size:
            return False, f"サイズが一致しません (元: {src_size}, 先: {dest_size})"
        
        if use_checksum:
            src_hash = calculate_file_checksum(src)
            dest_hash = calculate_file_checksum(dest)
            if src_hash != dest_hash:
                return False, "チェックサムが一致しません"
        
        return True, "検証成功"
    
    elif src.is_dir():
        # ディレクトリの場合
        src_count, src_size = get_directory_stats(src)
        dest_count, dest_size = get_directory_stats(dest)
        
        if src_count != dest_count:
            return False, f"ファイル数が一致しません (元: {src_count}, 先: {dest_count})"
        if src_size != dest_size:
            return False, f"合計サイズが一致しません (元: {src_size}, 先: {dest_size})"
        
        if use_checksum:
            # ディレクトリ内の全ファイルをチェックサム検証
            for src_file in src.rglob("*"):
                if src_file.is_file():
                    rel_path = src_file.relative_to(src)
                    dest_file = dest / rel_path
                    if not dest_file.exists():
                        return False, f"ファイルが見つかりません: {rel_path}"
                    src_hash = calculate_file_checksum(src_file)
                    dest_hash = calculate_file_checksum(dest_file)
                    if src_hash != dest_hash:
                        return False, f"チェックサムが一致しません: {rel_path}"
        
        return True, "検証成功"
    
    return False, "不明なファイルタイプ"


def copy_file_worker(args: Tuple[Path, Path]) -> Tuple[Path, bool, str]:
    """
    並列コピー用のワーカー関数（単一ファイルをコピー）
    
    Args:
        args: (コピー元パス, コピー先パス) のタプル
    
    Returns:
        (コピー元パス, 成功フラグ, メッセージ) のタプル
    """
    src, dest = args
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(str(src), str(dest))
        return (src, True, "成功")
    except Exception as e:
        return (src, False, str(e))


def parallel_copy_directory(
    src: Path,
    dest: Path,
    task_id: Optional[str] = None,
    debug_mode: bool = False
) -> Tuple[bool, str, int, int]:
    """
    ディレクトリを並列コピーする
    
    Args:
        src: コピー元ディレクトリ
        dest: コピー先ディレクトリ
        task_id: タスクID（進捗追跡とキャンセル用）
        debug_mode: デバッグモード
    
    Returns:
        (成功フラグ, メッセージ, 成功数, 失敗数) のタプル
    """
    def log(msg: str):
        if debug_mode:
            print(f"[PARALLEL_COPY] {msg}")
    
    # コピー対象のファイルリストを収集
    copy_tasks: List[Tuple[Path, Path]] = []
    for src_file in src.rglob("*"):
        if src_file.is_file():
            rel_path = src_file.relative_to(src)
            dest_file = dest / rel_path
            copy_tasks.append((src_file, dest_file))
    
    if not copy_tasks:
        # ファイルがない場合（空ディレクトリ）
        dest.mkdir(parents=True, exist_ok=True)
        # 空のサブディレクトリも作成
        for src_dir in src.rglob("*"):
            if src_dir.is_dir():
                rel_path = src_dir.relative_to(src)
                (dest / rel_path).mkdir(parents=True, exist_ok=True)
        return True, "空ディレクトリをコピーしました", 0, 0
    
    total_files = len(copy_tasks)
    log(f"コピー開始: {total_files}ファイル")
    
    # タスクの総ファイル数を更新
    if task_id:
        task = task_manager.get_task(task_id)
        if task:
            task.total_files = total_files
    
    success_count = 0
    fail_count = 0
    errors: List[str] = []
    cancelled = False
    
    # 並列コピー実行
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(copy_file_worker, task): task for task in copy_tasks}
        for future in as_completed(futures):
            # キャンセルチェック
            if task_id and task_manager.is_cancelled(task_id):
                log("キャンセルが検出されました")
                cancelled = True
                executor.shutdown(wait=False, cancel_futures=True)
                break
            
            src_file, success, msg = future.result()
            if success:
                success_count += 1
                log(f"コピー完了 ({success_count}/{total_files}): {src_file.name}")
            else:
                fail_count += 1
                errors.append(f"{src_file.name}: {msg}")
            
            # タスク進捗更新
            if task_id:
                task_manager.update_progress(
                    task_id,
                    processed_files=success_count + fail_count,
                    current_file=src_file.name
                )
    
    if cancelled:
        return False, "キャンセルされました", success_count, fail_count
    
    if fail_count > 0:
        return False, f"一部のファイルでコピー失敗: {', '.join(errors[:3])}", success_count, fail_count
    
    return True, f"{success_count}ファイルをコピーしました", success_count, fail_count


def safe_move(
    src: Path,
    dest: Path,
    verify_checksum: bool = False,
    task_id: Optional[str] = None,
    debug_mode: bool = False
) -> Tuple[bool, str]:
    """
    安全な移動を実行する（コピー → 検証 → 削除）
    
    Args:
        src: 移動元のパス
        dest: 移動先のパス
        verify_checksum: チェックサム検証を使用するか
        task_id: タスクID（非同期モード時に進捗追跡とキャンセルチェック用）
        debug_mode: デバッグモード（ログ出力用）
    
    Returns:
        (成功フラグ, メッセージ) のタプル
    """
    def log(msg: str):
        """デバッグログ出力"""
        if debug_mode:
            print(f"[SAFE_MOVE] {msg}")
    
    def check_cancelled() -> bool:
        """キャンセルチェック"""
        if task_id and task_manager.is_cancelled(task_id):
            log("キャンセルが検出されました")
            return True
        return False
    
    try:
        log(f"開始: {src} -> {dest}")
        
        # キャンセルチェック
        if check_cancelled():
            return False, "キャンセルされました"
        
        # ステップ1: コピー
        log("ステップ1: コピー開始")
        if src.is_file():
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(str(src), str(dest))
            log(f"ファイルコピー完了: {src.name}")
        else:
            success, msg, _, fail_count = parallel_copy_directory(src, dest, task_id, debug_mode)
            if not success or fail_count > 0:
                # コピー失敗時はコピー先を削除
                if dest.exists():
                    shutil.rmtree(str(dest))
                return False, f"コピー失敗: {msg}"
        
        # キャンセルチェック
        if check_cancelled():
            # コピー先をクリーンアップ
            if dest.exists():
                if dest.is_file():
                    dest.unlink()
                else:
                    shutil.rmtree(str(dest))
            return False, "キャンセルされました"
        
        # ステップ2: 検証
        log("ステップ2: 検証開始")
        verified, verify_msg = verify_copy(src, dest, verify_checksum)
        if not verified:
            # 検証失敗時はコピー先を削除
            if dest.is_file():
                dest.unlink()
            else:
                shutil.rmtree(str(dest))
            return False, f"検証失敗: {verify_msg}"
        log("検証成功")
        
        # ステップ3: 元ファイル削除
        log("ステップ3: 元ファイル削除")
        try:
            if src.is_file():
                src.unlink()
                log(f"ファイル削除完了: {src.name}")
            else:
                shutil.rmtree(str(src))
                log(f"ディレクトリ削除完了: {src.name}")
        except Exception as del_err:
            log(f"削除エラー: {del_err}")
            return False, f"削除エラー: {str(del_err)}"
        
        log("移動完了")
        return True, "移動完了"
    
    except Exception as e:
        log(f"エラー発生: {str(e)}")
        # エラー時はコピー先を削除して元ファイルを保持
        try:
            if dest.exists():
                if dest.is_file():
                    dest.unlink()
                else:
                    shutil.rmtree(str(dest))
        except:
            pass
        return False, f"移動エラー: {str(e)}"


class MoveRequest(BaseModel):
    """移動リクエストのスキーマ"""

    src_path: str
    dest_path: str


class BatchMoveRequest(BaseModel):
    """一括移動リクエストのスキーマ"""
    src_paths: List[str]
    dest_path: str
    overwrite: bool = False
    verify_checksum: bool = False  # チェックサム検証を有効化
    async_mode: bool = False  # 非同期モード（プログレス追跡用）
    debug_mode: bool = False  # デバッグモード（ログ出力用）



@router.post("/move")
async def move_item(request: MoveRequest):
    """
    ファイル/フォルダを安全に移動（コピー → 検証 → 削除）

    Args:
        request: 移動リクエスト（元パスと移動先パスを含む）

    Returns:
        移動成功メッセージ
    """
    src_path = normalize_path(request.src_path)
    dest_path = normalize_path(request.dest_path)

    if not src_path.exists():
        raise HTTPException(status_code=404, detail="移動元のファイル/フォルダが見つかりません")

    # 移動先がディレクトリの場合、その中に移動する
    if dest_path.is_dir():
        final_dest = dest_path / src_path.name
    else:
        # 移動先がディレクトリでない（新規ファイル名など）場合はそのまま使用
        final_dest = dest_path

    if final_dest.exists():
        raise HTTPException(status_code=400, detail="移動先に同名のファイル/フォルダが既に存在します")

    # 自分自身のサブディレクトリへの移動をチェック
    try:
        if src_path.is_dir() and str(final_dest.resolve()).startswith(str(src_path.resolve())):
             raise HTTPException(status_code=400, detail="自分自身のサブディレクトリには移動できません")
    except ValueError:
        pass # パス関係のエラーは無視して続行

    # 安全な移動を実行（コピー → 検証 → 削除）
    success, message = safe_move(src_path, final_dest, verify_checksum=False)
    if success:
        return {"status": "success", "message": f"移動しました: {src_path} → {final_dest}"}
    else:
        raise HTTPException(status_code=500, detail=f"移動に失敗しました: {message}")

@router.post("/move/batch")
async def move_items_batch(request: BatchMoveRequest, background_tasks: BackgroundTasks):
    """
    複数のファイル/フォルダを安全に移動（コピー → 検証 → 削除）
    
    並列コピーを使用して高速化し、検証後に元ファイルを削除する。
    verify_checksum が True の場合、SHA256によるチェックサム検証を行う。
    async_mode が True の場合、バックグラウンドで処理しタスクIDを返す。
    """
    dest_path = normalize_path(request.dest_path)
    
    # 移動先が存在しない場合はエラー
    if not dest_path.exists():
         raise HTTPException(status_code=404, detail="移動先フォルダが見つかりません")
    
    if not dest_path.is_dir():
         raise HTTPException(status_code=400, detail="移動先はディレクトリである必要があります")

    if request.debug_mode:
        print(f"[BATCH_MOVE] 開始: Dest={dest_path}, Sources={request.src_paths}, Async={request.async_mode}")

    # 非同期モードの場合
    if request.async_mode:
        # タスクを作成
        task = task_manager.create_task(total_files=len(request.src_paths))
        task_manager.set_running(task.id)
        
        # バックグラウンドスレッドで処理
        def run_batch_move():
            _execute_batch_move(
                task_id=task.id,
                src_paths=request.src_paths,
                dest_path=dest_path,
                overwrite=request.overwrite,
                verify_checksum=request.verify_checksum,
                debug_mode=request.debug_mode
            )
        
        thread = threading.Thread(target=run_batch_move, daemon=True)
        thread.start()
        
        return {"status": "async", "task_id": task.id}
    
    # 同期モード（従来通り）
    return _execute_batch_move_sync(
        src_paths=request.src_paths,
        dest_path=dest_path,
        overwrite=request.overwrite,
        verify_checksum=request.verify_checksum,
        debug_mode=request.debug_mode
    )


def _execute_batch_move(
    task_id: str,
    src_paths: List[str],
    dest_path: Path,
    overwrite: bool,
    verify_checksum: bool,
    debug_mode: bool
):
    """
    バッチ移動をバックグラウンドで実行する（Producer-Consumerパターン）
    スキャンとコピーを並列化して開始遅延を解消
    """
    import queue
    import time
    
    def log(msg: str):
        if debug_mode:
            print(f"[BATCH_MOVE:{task_id[:8]}] {msg}")

    task_manager.set_running(task_id)
    # 即座に準備中を表示
    task_manager.update_progress(task_id, processed_files=0, current_file="準備中...")
    log(f"移動開始: {len(src_paths)} パス -> {dest_path}")

    # キュー: (action, src_item, dest_item, root_src_path)
    # action: "copy_file", "mkdir", "delete_file", "delete_dir"
    work_queue = queue.Queue(maxsize=10000)
    
    # 結果管理
    results_lock = threading.Lock()
    results = []
    stats = {"success": 0, "fail": 0, "total_files_discovered": 0}
    
    # パス毎のエラー情報を保持
    path_errors = {}  # {src_path_str: error_message}
    
    # 完了フラグ
    scan_complete = threading.Event()
    
    # 初期の予定総数を仮設定（進捗バーを動かすため）
    initial_estimate = len(src_paths) * 10
    task_manager.get_task(task_id).total_files = initial_estimate

    # ---------------------------------------------------------
    # スキャナー（Producer）: ディレクトリを走査してキューに入れる
    # ---------------------------------------------------------
    def scanner_thread():
        log("スキャン開始")
        total_discovered = 0
        
        for src_str in src_paths:
            # キャンセルチェック（ループ毎）
            if task_manager.is_cancelled(task_id):
                break
                
            try:
                src_path = normalize_path(src_str)
                if not src_path.exists():
                    with results_lock:
                        path_errors[src_str] = "ファイルが見つかりません"
                        results.append({"path": src_str, "status": "error", "message": "ファイルが見つかりません"})
                        stats["fail"] += 1
                    continue
                
                # 自分自身のサブディレクトリへの移動チェック
                if src_path.is_dir():
                    try:
                        if str(dest_path.resolve()).startswith(str(src_path.resolve())):
                            with results_lock:
                                path_errors[src_str] = "自分自身のサブディレクトリには移動できません"
                                results.append({"path": src_str, "status": "error", "message": "自分自身のサブディレクトリには移動できません"})
                                stats["fail"] += 1
                            continue
                    except ValueError:
                        pass

                final_dest = dest_path / src_path.name
                
                # 同一パスチェック
                try:
                    if src_path.resolve() == final_dest.resolve():
                        with results_lock:
                            results.append({"path": src_str, "status": "success", "message": "移動元と移動先が同じです"})
                            stats["success"] += 1
                        continue
                except OSError:
                    pass

                # ファイル/ディレクトリの場合分け
                if src_path.is_file():
                    work_queue.put(("copy_file", src_path, final_dest, src_path))
                    total_discovered += 1
                    with results_lock:
                        stats["total_files_discovered"] += 1
                        # 移動（コピー+削除）なので2カウント
                        task_manager.get_task(task_id).total_files = stats["total_files_discovered"] * 2
                
                elif src_path.is_dir():
                    # まずルートディレクトリ作成タスク
                    work_queue.put(("mkdir", src_path, final_dest, src_path))
                    
                    # 再帰的にスキャン (os.scandir使用で高速化)
                    # delete用のリストは、コピー完了後に「深い順」に処理する必要があるため
                    # ここではコピー順序（浅い順）でキューに入れ、削除はコピー完了を待つか、
                    # あるいは別の戦略をとる。
                    # 「移動」はコピー成功後に削除なので、ファイル単位で「コピー→削除」はできない（ディレクトリが消せない）
                    # したがって、コピーフェーズと削除フェーズを分ける。
                    
                    # scan_treeはジェネレータ
                    for root, dirs, files in os.walk(str(src_path)):
                        if task_manager.is_cancelled(task_id):
                            break
                            
                        root_path = Path(root)
                        rel_path = root_path.relative_to(src_path)
                        current_dest_dir = final_dest / rel_path
                        
                        # ディレクトリ作成
                        for d in dirs:
                            d_src = root_path / d
                            d_dest = current_dest_dir / d
                            work_queue.put(("mkdir", d_src, d_dest, src_path))
                        
                        # ファイルコピー
                        for f in files:
                            f_src = root_path / f
                            f_dest = current_dest_dir / f
                            work_queue.put(("copy_file", f_src, f_dest, src_path))
                            
                            total_discovered += 1
                            if total_discovered % 10 == 0:
                                with results_lock:
                                    stats["total_files_discovered"] = total_discovered
                                    # 移動操作なので x2
                                    task_manager.get_task(task_id).total_files = total_discovered * 2 + 100 # バッファ

            except Exception as e:
                with results_lock:
                    path_errors[src_str] = str(e)
                    results.append({"path": src_str, "status": "error", "message": f"Scan error: {e}"})
                    stats["fail"] += 1

        log(f"スキャン完了: {total_discovered} ファイル")
        with results_lock:
             stats["total_files_discovered"] = total_discovered
             task_manager.get_task(task_id).total_files = total_discovered * 2
        scan_complete.set()

    # ---------------------------------------------------------
    # ワーカー（Consumer）: キューから取り出して実行
    # ---------------------------------------------------------
    def worker_thread():
        while True:
            try:
                # タイムアウト付きで取得して完了チェック
                item = work_queue.get(timeout=0.1)
            except queue.Empty:
                if scan_complete.is_set():
                    break
                continue
                
            if task_manager.is_cancelled(task_id):
                work_queue.task_done()
                continue
            
            action, src, dest, root_src = item
            
            try:
                if action == "copy_file":
                    # 親ディレクトリ作成はmkdirタスクで行われるが、念のため
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    
                    # 上書きチェック
                    if dest.exists():
                        if overwrite:
                            if dest.is_dir():
                                shutil.rmtree(str(dest))
                            else:
                                dest.unlink()
                        else:
                            # スキップ
                            with results_lock:
                                stats["fail"] += 1
                                # エラーログ等は省略
                            work_queue.task_done()
                            continue
                    
                    shutil.copy2(str(src), str(dest))
                    
                    if verify_checksum:
                        if calculate_file_checksum(src) != calculate_file_checksum(dest):
                            raise Exception("Checksum mismatch")

                    with results_lock:
                        stats["success"] += 1
                        processed = stats["success"] + stats["fail"]
                        task_manager.update_progress(task_id, processed_files=processed, current_file=f"コピー: {src.name}")
                    
                    log(f"コピー成功: {src.name} -> {dest.name}")

                elif action == "mkdir":
                    dest.mkdir(parents=True, exist_ok=True)
                    log(f"ディレクトリ作成: {dest.name}")
            
            except Exception as e:
                log(f"Error {action} {src}: {e}")
                with results_lock:
                    stats["fail"] += 1
                    path_errors[str(root_src)] = str(e) # 親パスにエラーを紐付け
            
            finally:
                work_queue.task_done()

    # スレッド開始
    scanner = threading.Thread(target=scanner_thread, daemon=True)
    scanner.start()
    
    workers = []
    for _ in range(MAX_WORKERS):
        t = threading.Thread(target=worker_thread, daemon=True)
        t.start()
        workers.append(t)
        
    # コピー完了を待機
    scanner.join()
    for t in workers:
        t.join()
        
    log("コピーフェーズ完了。削除フェーズ開始")
    
    # ---------------------------------------------------------
    # 削除フェーズ（移動の場合のみ）
    # ---------------------------------------------------------
    # コピーでエラーが出ていない root_src のみを削除対象とする
    
    del_success = 0
    del_fail = 0
    
    # 削除は安全のため、ルートごとにシングルスレッドで行うか、
    # あるいは delete 用のパラレル処理を行う。
    # ここでは、確実に消すために shutil.rmtree を使う（高速）
    # ただし、進捗を出すために send2trash を使うか、rmtree前にカウントするか...
    # ユーザー要望は「削除も高速な並列処理」かつ「プログレスバー」
    
    # ここでは、削除対象となるルートパスを特定し、
    # その中のファイルを並列削除タスクとして再度キューに入れるか、
    # あるいは shutil.rmtree で一気に消すか。
    # 「プログレスバー」が必要なので、rmtreeだと一瞬で終わるかスタックするか不明。
    # 安全かつ高速なのは「トップレベルでエラーがなければ rmtree」だが、
    # 進捗が見たいとのことなので、パラレル削除を実装する。
    
    # エラーが発生したルートパスは削除しない
    safe_to_delete_roots = []
    for src_str in src_paths:
        if src_str not in path_errors and normalize_path(src_str).exists():
            safe_to_delete_roots.append(normalize_path(src_str))
            
    if not safe_to_delete_roots:
        log("削除可能なパスがありません")
    else:
        # 削除用キュー再利用
        # キューは空のはず
        
        del_scan_complete = threading.Event()
        
        def del_scanner():
            count = 0
            for root_path in safe_to_delete_roots:
                if task_manager.is_cancelled(task_id): break
                
                # ファイルを収集（削除は深い順でなくても、ファイル単位なら順不同でOK。ディレクトリは最後）
                # 並列削除戦略:
                # 1. 全ファイルを列挙して "delete_file" タスクへ
                # 2. 全ディレクトリを深さ逆順でソートして "delete_dir" タスクへ (ファイル削除待ちが必要だが...)
                # 
                # 簡単な戦略: ファイルは並列削除。ディレクトリは最後にメインスレッド等で削除。
                
                all_dirs = []
                # ファイルを先にキューへ
                for root, dirs, files in os.walk(str(root_path), topdown=False):
                    for name in files:
                        file_path = Path(root) / name
                        work_queue.put(("delete_file", file_path, None, None))
                        count += 1
                        if count % 100 == 0:
                            # 進捗用total更新（コピー分は完了済みとして加算維持）
                            pass
                    
                    for name in dirs:
                        dir_path = Path(root) / name
                        all_dirs.append(dir_path)
                
                # ルート自体も
                all_dirs.append(root_path)
                
                # ディレクトリ削除タスクは、ファイル削除が終わってから実行されるべきだが、
                # 並列実行だとタイミング制御が難しい。
                # したがって、ワーカーは「ファイル削除」のみ行い、ディレクトリ削除は scanner スレッドが最後にやるか、
                # あるいは「削除リトライ」を行うか。
                
                # ここでは「ファイル削除」のみ並列化し、ディレクトリは後でまとめて消すアプローチをとる
                pass
            del_scan_complete.set()
            return all_dirs # ディレクトリリストを返す

        # ディレクトリリストを受け取るためのfuture的なもの
        dir_list_holder = []
        
        def del_scanner_wrapper():
            dirs = del_scanner_logic(safe_to_delete_roots, work_queue, task_manager, task_id)
            dir_list_holder.extend(dirs)
            del_scan_complete.set()
            
        # ロジック分離
        def del_scanner_logic(roots, q, tm, tid):
            dirs_to_remove = []
            for root_path in roots:
                if tm.is_cancelled(tid): break
                try:
                    for root, dirs, files in os.walk(str(root_path), topdown=False):
                        for name in files:
                            p = Path(root) / name
                            q.put(("delete_file", p, None, None))
                        for name in dirs:
                            dirs_to_remove.append(Path(root) / name)
                    dirs_to_remove.append(root_path)
                except Exception as e:
                    log(f"削除スキャンエラー: {e}")
            return dirs_to_remove

        # リセット
        scan_complete.clear() # 再利用
        
        # 削除スキャナ起動
        ds_thread = threading.Thread(target=del_scanner_wrapper, daemon=True)
        ds_thread.start()
        
        # 削除ワーカー起動 (既存ワーカー関数をそのまま使うが、delete_fileアクションを追加)
        # ワーカー関数を少し修正する必要があるので、内部定義しなおすか、アクション分岐を追加
        
        # ワーカー再定義（クロージャの関係で）
        def del_worker_thread():
            while True:
                try:
                    item = work_queue.get(timeout=0.1)
                except queue.Empty:
                    if del_scan_complete.is_set():
                        break
                    continue
                
                if task_manager.is_cancelled(task_id):
                    work_queue.task_done()
                    continue
                
                action, src, _, _ = item
                try:
                    if action == "delete_file":
                        if src.is_symlink() or src.is_file():
                           src.unlink()
                        
                        with results_lock:
                            # stats["success"] はコピー成功数なので、削除成功数は別途管理あるいは合算
                            stats["success"] += 1 
                            processed = stats["success"] + stats["fail"]
                            task_manager.update_progress(task_id, processed_files=processed, current_file=f"削除: {src.name}")
                        
                        log(f"削除成功: {src.name}")
                            
                except Exception as e:
                    log(f"Delete error {src}: {e}")
                    with results_lock:
                        stats["fail"] += 1
                finally:
                    work_queue.task_done()

        # 旧ワーカーは終了しているので、新しく起動
        del_workers = []
        for _ in range(MAX_WORKERS):
            t = threading.Thread(target=del_worker_thread, daemon=True)
            t.start()
            del_workers.append(t)
            
        ds_thread.join()
        for t in del_workers:
            t.join()
            
        # 最後にディレクトリを削除（これは高速なのでシーケンシャルで良い、あるいはエラー無視で上から）
        log("ディレクトリ削除開始")
        for d in dir_list_holder:
            try:
                if d.exists():
                    d.rmdir() # 中身は空のはず
            except OSError:
                # 残っているファイルがある場合（.DS_Storeなど湧いてくるもの）、強制削除
                shutil.rmtree(str(d), ignore_errors=True)
    
    # 最終結果
    log(f"全完了: 成功={stats['success']}, 失敗={stats['fail']}")
    
    # Resultsリスト作成（ルートごとの結果）
    final_results = []
    for src_str in src_paths:
        if src_str in path_errors:
             final_results.append({"path": src_str, "status": "error", "message": path_errors[src_str]})
        else:
             final_results.append({"path": src_str, "status": "success", "message": "移動完了"})

    task_manager.complete_task(task_id, result={
        "status": "completed",
        "success_count": stats["success"],
        "fail_count": stats["fail"],
        "results": final_results
    })


def _execute_batch_move_sync(
    src_paths: List[str],
    dest_path: Path,
    overwrite: bool,
    verify_checksum: bool,
    debug_mode: bool
):
    """
    バッチ移動を同期で実行する（従来モード）
    """
    results = []
    success_count = 0
    fail_count = 0

    for src_str in src_paths:
        src_path = normalize_path(src_str)
        result = {"path": src_str, "status": "pending", "message": ""}

        if not src_path.exists():
            result["status"] = "error"
            result["message"] = "ファイルが見つかりません"
            fail_count += 1
            results.append(result)
            continue

        try:
            if src_path.is_dir() and str(dest_path.resolve()).startswith(str(src_path.resolve())):
                 result["status"] = "error"
                 result["message"] = "自分自身のサブディレクトリには移動できません"
                 fail_count += 1
                 results.append(result)
                 continue
            
            final_dest = dest_path / src_path.name

            try:
                if src_path.resolve() == final_dest.resolve():
                    result["status"] = "success"
                    result["message"] = "移動元と移動先が同じです"
                    success_count += 1
                    results.append(result)
                    continue
            except OSError:
                pass

            if final_dest.exists():
                if overwrite:
                    if final_dest.is_dir():
                        shutil.rmtree(final_dest)
                    else:
                        final_dest.unlink()
                else:
                     result["status"] = "error"
                     result["message"] = "同名のファイルが存在します"
                     fail_count += 1
                     results.append(result)
                     continue

            success, message = safe_move(src_path, final_dest, verify_checksum, None, debug_mode)
            if success:
                result["status"] = "success"
                result["message"] = "移動完了"
                success_count += 1
            else:
                result["status"] = "error"
                result["message"] = message
                fail_count += 1
            
        except Exception as e:
            result["status"] = "error"
            result["message"] = str(e)
            fail_count += 1
        
        results.append(result)

    return {
        "status": "completed", 
        "success_count": success_count, 
        "fail_count": fail_count,
        "results": results
    }


def _execute_batch_copy_async(
    task_id: str,
    src_paths: List[str],
    dest_path: Path,
    overwrite: bool,
    verify_checksum: bool,
    debug_mode: bool
):
    """
    バッチコピーを実行（Producer-Consumerパターン）
    スキャンとコピーを並列化して開始遅延を解消
    """
    import queue
    import time

    def log(msg: str):
        if debug_mode:
            print(f"[BATCH_COPY] {msg}")

    task_manager.set_running(task_id)
    # 即座に準備中を表示
    task_manager.update_progress(task_id, processed_files=0, current_file="準備中...")
    log(f"コピー開始: {len(src_paths)} パス -> {dest_path}")

    # キュー: (action, src_item, dest_item, root_src_path)
    # action: "copy_file", "mkdir"
    work_queue = queue.Queue(maxsize=10000)
    
    # 結果管理
    results_lock = threading.Lock()
    results = []
    stats = {"success": 0, "fail": 0, "total_files_discovered": 0}
    path_errors = {}
    
    # 完了フラグ
    scan_complete = threading.Event()
    
    # 初期見積もり
    task_manager.get_task(task_id).total_files = len(src_paths) * 10

    # ---------------------------------------------------------
    # スキャナー（Producer）
    # ---------------------------------------------------------
    def scanner_thread():
        log("スキャン開始")
        total_discovered = 0
        
        for src_str in src_paths:
            if task_manager.is_cancelled(task_id): break
                
            try:
                src_path = normalize_path(src_str)
                if not src_path.exists():
                    with results_lock:
                        path_errors[src_str] = "ファイルが見つかりません"
                        results.append({"path": src_str, "status": "error", "message": "ファイルが見つかりません"})
                        stats["fail"] += 1
                    continue

                # 自分自身のサブディレクトリへのコピーチェック
                if src_path.is_dir():
                    try:
                        if str(dest_path.resolve()).startswith(str(src_path.resolve())):
                            with results_lock:
                                path_errors[src_str] = "自分自身のサブディレクトリにはコピーできません"
                                results.append({"path": src_str, "status": "error", "message": "自分自身のサブディレクトリにはコピーできません"})
                                stats["fail"] += 1
                            continue
                    except ValueError:
                        pass
                
                final_dest = dest_path / src_path.name
                
                # 同一ファイルへのコピーチェック
                try:
                    if src_path.resolve() == final_dest.resolve():
                        with results_lock:
                            # エラーとするかスキップするか。Windowsだとエラーになる。
                            path_errors[src_str] = "同一ファイルへのコピーはできません"
                            results.append({"path": src_str, "status": "error", "message": "同一ファイルへのコピーはできません"})
                            stats["fail"] += 1
                        continue
                except OSError:
                    pass

                # ファイル/ディレクトリの場合分け
                if src_path.is_file():
                    work_queue.put(("copy_file", src_path, final_dest, src_path))
                    total_discovered += 1
                    with results_lock:
                        stats["total_files_discovered"] += 1
                        task_manager.get_task(task_id).total_files = stats["total_files_discovered"]
                
                elif src_path.is_dir():
                    work_queue.put(("mkdir", src_path, final_dest, src_path))
                    
                    # 再帰的にスキャン
                    for root, dirs, files in os.walk(str(src_path)):
                        if task_manager.is_cancelled(task_id): break
                            
                        root_path = Path(root)
                        rel_path = root_path.relative_to(src_path)
                        current_dest_dir = final_dest / rel_path
                        
                        for d in dirs:
                            d_src = root_path / d
                            d_dest = current_dest_dir / d
                            work_queue.put(("mkdir", d_src, d_dest, src_path))
                        
                        for f in files:
                            f_src = root_path / f
                            f_dest = current_dest_dir / f
                            work_queue.put(("copy_file", f_src, f_dest, src_path))
                            
                            total_discovered += 1
                            if total_discovered % 100 == 0:
                                with results_lock:
                                    stats["total_files_discovered"] = total_discovered
                                    task_manager.get_task(task_id).total_files = total_discovered + 100

            except Exception as e:
                with results_lock:
                    path_errors[src_str] = str(e)
                    results.append({"path": src_str, "status": "error", "message": f"Scan error: {e}"})
                    stats["fail"] += 1

        log(f"スキャン完了: {total_discovered} ファイル")
        with results_lock:
             stats["total_files_discovered"] = total_discovered
             task_manager.get_task(task_id).total_files = total_discovered
        scan_complete.set()

    # ---------------------------------------------------------
    # ワーカー（Consumer）
    # ---------------------------------------------------------
    def worker_thread():
        while True:
            try:
                item = work_queue.get(timeout=0.1)
            except queue.Empty:
                if scan_complete.is_set():
                    break
                continue
                
            if task_manager.is_cancelled(task_id):
                work_queue.task_done()
                continue
            
            action, src, dest, root_src = item
            
            try:
                if action == "copy_file":
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    
                    if dest.exists():
                        if overwrite:
                            if dest.is_dir():
                                shutil.rmtree(str(dest))
                            else:
                                dest.unlink()
                        else:
                            # スキップ (同名エラーとしてカウントするか、リネームするか)
                            # ここではエラーとしてカウント
                            with results_lock:
                                stats["fail"] += 1
                            work_queue.task_done()
                            continue
                            
                    shutil.copy2(str(src), str(dest))
                    
                    if verify_checksum:
                        if calculate_file_checksum(src) != calculate_file_checksum(dest):
                            raise Exception("Checksum mismatch")

                    with results_lock:
                        stats["success"] += 1
                        processed = stats["success"] + stats["fail"]
                        task_manager.update_progress(task_id, processed_files=processed, current_file=f"コピー: {src.name}")
                    
                    log(f"コピー成功: {src.name} -> {dest.name}")

                elif action == "mkdir":
                    dest.mkdir(parents=True, exist_ok=True)
                    log(f"ディレクトリ作成: {dest.name}")
            
            except Exception as e:
                log(f"Error {action} {src}: {e}")
                with results_lock:
                    stats["fail"] += 1
                    path_errors[str(root_src)] = str(e)
            
            finally:
                work_queue.task_done()

    # スレッド開始
    scanner = threading.Thread(target=scanner_thread, daemon=True)
    scanner.start()
    
    workers = []
    for _ in range(MAX_WORKERS):
        t = threading.Thread(target=worker_thread, daemon=True)
        t.start()
        workers.append(t)
        
    scanner.join()
    for t in workers:
        t.join()
        
    # 最終結果
    log(f"全完了: 成功={stats['success']}, 失敗={stats['fail']}")
    
    final_results = []
    for src_str in src_paths:
        if src_str in path_errors:
             final_results.append({"path": src_str, "status": "error", "message": path_errors[src_str]})
        else:
             final_results.append({"path": src_str, "status": "success", "message": "コピー完了"})

    task_manager.complete_task(task_id, result={
        "status": "completed",
        "success_count": stats["success"],
        "fail_count": stats["fail"],
        "results": final_results
    })

class BatchCopyRequest(BaseModel):
    """一括コピーリクエストのスキーマ"""
    src_paths: List[str]
    dest_path: str
    overwrite: bool = False
    verify_checksum: bool = False
    async_mode: bool = False  # 非同期モード
    debug_mode: bool = False  # デバッグモード


@router.post("/copy/batch")
async def copy_items_batch(request: BatchCopyRequest):
    dest_path = normalize_path(request.dest_path)
    
    if not dest_path.exists() or not dest_path.is_dir():
         raise HTTPException(status_code=404, detail="コピー先フォルダが見つかりません")

    # 非同期モードの場合
    if request.async_mode:
        task = task_manager.create_task(total_files=len(request.src_paths))
        task_id = task.id
        
        def run_copy():
            _execute_batch_copy_async(
                task_id, request.src_paths, dest_path, 
                request.overwrite, request.verify_checksum, request.debug_mode
            )
        
        thread = threading.Thread(target=run_copy)
        thread.start()
        
        return {"status": "async", "task_id": task_id, "message": "コピー処理を開始しました"}

    # 同期モードの場合（従来の処理）
    results = []
    success_count = 0
    fail_count = 0

    import shutil

    def get_unique_path(base_dir: Path, name: str) -> Path:
        """
        同名ファイルが存在する場合、ユニークな名前を生成する
        example.txt -> example copy.txt -> example copy 2.txt
        """
        candidate = base_dir / name
        if not candidate.exists():
            return candidate

        stem = candidate.stem
        suffix = candidate.suffix
        
        candidate = base_dir / f"{stem} copy{suffix}"
        if not candidate.exists():
            return candidate
            
        counter = 2
        while True:
             candidate = base_dir / f"{stem} copy {counter}{suffix}"
             if not candidate.exists():
                 return candidate
             counter += 1

    for src_str in request.src_paths:
        src_path = normalize_path(src_str)
        result = {"path": src_str, "status": "pending", "message": ""}

        if not src_path.exists():
            result["status"] = "error"
            result["message"] = "ファイルが見つかりません"
            fail_count += 1
            results.append(result)
            continue

        try:
            # 自分自身のサブディレクトリへのコピーチェック（ディレクトリの場合）
            if src_path.is_dir() and str(dest_path.resolve()).startswith(str(src_path.resolve())):
                 result["status"] = "error"
                 result["message"] = "自分自身のサブディレクトリにはコピーできません"
                 fail_count += 1
                 results.append(result)
                 continue
            
            # デスティネーションの決定
            final_dest = dest_path / src_path.name
            
            # 同一ファイルへのコピーをチェック
            try:
                if src_path.resolve() == final_dest.resolve():
                    result["status"] = "error"
                    result["message"] = "同一ファイルへのコピーはできません"
                    fail_count += 1
                    results.append(result)
                    continue
            except OSError:
                pass

            if final_dest.exists():
                if request.overwrite:
                    # 上書きの場合、削除してからコピー
                    if final_dest.is_dir():
                        shutil.rmtree(final_dest)
                    else:
                        final_dest.unlink()
                else:
                    # 上書きでない場合、同名チェック（自動リネーム廃止）
                    result["status"] = "error"
                    result["message"] = "同名のファイルが存在します"
                    fail_count += 1
                    results.append(result)
                    continue

            if src_path.is_dir():
                shutil.copytree(str(src_path), str(final_dest))
            else:
                shutil.copy2(str(src_path), str(final_dest))

            result["status"] = "success"
            result["message"] = f"コピーしました: {final_dest.name}"
            success_count += 1
            
        except Exception as e:
            result["status"] = "error"
            result["message"] = str(e)
            fail_count += 1
        
        results.append(result)

    return {
        "status": "completed", 
        "success_count": success_count, 
        "fail_count": fail_count,
        "results": results
    }

class OpenRequest(BaseModel):
    path: str

@router.post("/open/vscode")
async def open_in_vscode(request: OpenRequest):
    """
    指定されたパスをVS Codeで開く
    """
    path = normalize_path(request.path)
    
    if platform.system() == 'Darwin':
        vscode_path = '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'
        # Fallback for other locations or names if needed
        if not os.path.exists(vscode_path):
             # Try generic 'code' command
             vscode_path = 'code'
    elif platform.system() == 'Windows':
        vscode_path = r'C:\Users\kabu_server\AppData\Local\Programs\Microsoft VS Code\Code.exe'
    else:
        raise HTTPException(status_code=501, detail="サポートされていないOSです")

    # ファイル/フォルダが存在するか確認
    target_path = path if path.exists() else path.parent

    try:
        if platform.system() == 'Darwin':
             # macOS specific AppleScript for focus (optional, keeping simple subprocess first)
             subprocess.Popen([vscode_path, str(target_path)])
        else:
             subprocess.Popen([vscode_path, str(target_path)])
        return {"status": "success", "message": "VS Codeで開きました"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"VS Codeの起動に失敗しました: {str(e)}")

@router.post("/open/explorer")
async def open_in_explorer(request: OpenRequest):
    """
    指定されたパスをエクスプローラー/Finderで開く
    """
    path = normalize_path(request.path)
    target_path = path if path.is_dir() else path.parent
    
    if not target_path.exists():
         raise HTTPException(status_code=404, detail="パスが見つかりません")

    try:
        if platform.system() == "Windows":
            subprocess.Popen(['explorer', str(target_path).replace('/', '\\')])
        elif platform.system() == "Darwin":
            subprocess.Popen(["open", str(target_path)])
        else:
            subprocess.Popen(["xdg-open", str(target_path)])
        return {"status": "success", "message": "フォルダを開きました"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"フォルダを開けませんでした: {str(e)}")

@router.get("/download")
async def download_file(path: str = Query(..., description="ダウンロードするファイルのパス")):
    """
    ファイルをダウンロード
    """
    target_path = normalize_path(path)
    
    if not target_path.exists():
        raise HTTPException(status_code=404, detail="ファイルが見つかりません")
    
    if target_path.is_dir():
         raise HTTPException(status_code=400, detail="ディレクトリはダウンロードできません（ZIP機能未実装）")

    return FileResponse(
        path=target_path,
        filename=target_path.name,
        media_type='application/octet-stream'
    )

@router.get("/view-pdf")
async def view_pdf(path: str = Query(..., description="表示するPDFファイルのパス")):
    """
    PDFファイルをブラウザ内で表示（ダウンロードではなくインライン表示）
    """
    target_path = normalize_path(path)

    if not target_path.exists():
        raise HTTPException(status_code=404, detail="ファイルが見つかりません")

    if target_path.is_dir():
        raise HTTPException(status_code=400, detail="ディレクトリは表示できません")

    if not target_path.name.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="PDFファイルではありません")

    # 日本語ファイル名に対応するため、RFC 2231形式でエンコード
    encoded_filename = urllib.parse.quote(target_path.name)

    return FileResponse(
        path=target_path,
        filename=target_path.name,
        media_type='application/pdf',
        headers={"Content-Disposition": f"inline; filename*=UTF-8''{encoded_filename}"}
    )


@router.post("/open/default")
async def open_in_default_app(request: OpenRequest):
    """
    指定されたファイルをOSのデフォルトアプリケーションで開く
    """
    path = normalize_path(request.path)
    
    if not path.exists():
        raise HTTPException(status_code=404, detail="ファイルが見つかりません")

    try:
        if platform.system() == "Windows":
            os.startfile(str(path))
        elif platform.system() == "Darwin":  # macOS
            subprocess.Popen(["open", str(path)])
        else:  # Linux
            subprocess.Popen(["xdg-open", str(path)])
        return {"status": "success", "message": "ファイルを開きました"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ファイルを開けませんでした: {str(e)}")


class SmartOpenResponse(BaseModel):
    """
    スマートオープンの結果
    action: 実行されたアクション
    - "opened": 外部アプリで開いた
    - "open_modal": フロントエンドでモーダルを開く（md編集用）
    """
    status: str
    action: str
    message: str
    content: Optional[str] = None  # action=open_modalの場合のファイル内容


@router.post("/open/smart", response_model=SmartOpenResponse)
async def open_smart(request: OpenRequest):
    """
    ファイル種類に応じてスマートに開く
    - Excalidraw系 → localhost:3001で開く
    - ipynb → JupyterLab (localhost:8888/lab/tree)で開く
    - md (obsidianパス) → Obsidian URIで開く
    - md (通常) → action=open_modal を返し、フロントでエディタを開く
    - その他 → OSデフォルトアプリで開く
    """
    path = normalize_path(request.path)
    
    if not path.exists():
        raise HTTPException(status_code=404, detail="ファイルが見つかりません")
    
    if path.is_dir():
        raise HTTPException(status_code=400, detail="ディレクトリは開けません")

    file_name = path.name.lower()
    file_path_str = str(path).lower()
    
    # --- Excalidraw系 ---
    if (file_name.endswith('.excalidraw') or 
        file_name.endswith('.excalidraw.md') or 
        file_name.endswith('.excalidraw.svg') or 
        file_name.endswith('.excalidraw.png')):
        
        encoded_path = urllib.parse.quote(str(path))
        target_url = f"http://localhost:3001/?filepath={encoded_path}"
        try:
            webbrowser.open(target_url)
            return SmartOpenResponse(
                status="success",
                action="opened",
                message="Excalidrawで開きました"
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Excalidrawの起動に失敗: {str(e)}")
    
    # --- ipynb (Jupyter) ---
    if file_name.endswith('.ipynb'):
        JUPYTER_BASE_URL = "http://localhost:8888/lab/tree"
        try:
            relative_path = path.relative_to(settings.base_dir)
            url_path = urllib.parse.quote(str(relative_path).replace('\\', '/'))
            target_url = f"{JUPYTER_BASE_URL}/{url_path}"
            webbrowser.open(target_url)
            return SmartOpenResponse(
                status="success",
                action="opened",
                message="JupyterLabで開きました"
            )
        except ValueError:
            # BASE_DIR外の場合はフルパスでtreeを試みる
            # 注: Jupyterの起動設定によっては失敗する可能性
            raise HTTPException(status_code=400, detail="JupyterLabのルートディレクトリ外のファイルです")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"JupyterLabの起動に失敗: {str(e)}")
    
    # --- Markdown ---
    if file_name.endswith('.md'):
        # Obsidianパスかどうか判定
        if 'obsidian' in file_path_str:
            # Obsidian URI で開く
            parts = str(path).replace('\\', '/').split('/')
            obsidian_idx = -1
            for i, part in enumerate(parts):
                if 'obsidian' in part.lower():
                    obsidian_idx = i
                    break
            
            if obsidian_idx == -1:
                raise HTTPException(status_code=400, detail='パスにobsidianディレクトリが見つかりません')
            
            vault_name = parts[obsidian_idx]
            relative_file_path = '/'.join(parts[obsidian_idx+1:])
            
            encoded_file = urllib.parse.quote(relative_file_path)
            obsidian_uri = f"obsidian://open?vault={vault_name}&file={encoded_file}"
            
            try:
                if platform.system() == 'Darwin':
                    subprocess.Popen(['open', obsidian_uri])
                elif platform.system() == 'Windows':
                    os.startfile(obsidian_uri)
                else:
                    raise HTTPException(status_code=501, detail="サポートされていないOSです")
                
                return SmartOpenResponse(
                    status="success",
                    action="opened",
                    message="Obsidianで開きました"
                )
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Obsidianの起動に失敗: {str(e)}")
        else:
            # 通常のMarkdown → フロントでモーダルを開く
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                return SmartOpenResponse(
                    status="success",
                    action="open_modal",
                    message="エディタで開きます",
                    content=content
                )
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"ファイル読み込み失敗: {str(e)}")
    
    # --- PDF → OS別処理 ---
    # Mac: ブラウザの別タブで開く（HTTP経由で配信）
    # Windows: OSのデフォルトアプリで開く
    if file_name.endswith('.pdf'):
        try:
            if platform.system() == "Darwin":  # macOS
                # バックエンドのview-pdfエンドポイント経由でブラウザで開く
                encoded_path = urllib.parse.quote(str(path))
                view_url = f"http://localhost:8001/api/view-pdf?path={encoded_path}"
                webbrowser.open(view_url)
                return SmartOpenResponse(
                    status="success",
                    action="opened",
                    message="PDFをブラウザで開きました"
                )
            elif platform.system() == "Windows":
                # Windowsは従来通りOSデフォルトアプリ
                os.startfile(str(path))
                return SmartOpenResponse(
                    status="success",
                    action="opened",
                    message="ファイルを開きました"
                )
            else:
                subprocess.Popen(["xdg-open", str(path)])
                return SmartOpenResponse(
                    status="success",
                    action="opened",
                    message="ファイルを開きました"
                )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"PDFを開けませんでした: {str(e)}")
    
    # --- その他 → OSデフォルトアプリ ---
    try:
        if platform.system() == "Windows":
            os.startfile(str(path))
        elif platform.system() == "Darwin":
            subprocess.Popen(["open", str(path)])
        else:
            subprocess.Popen(["xdg-open", str(path)])
        return SmartOpenResponse(
            status="success",
            action="opened",
            message="ファイルを開きました"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ファイルを開けませんでした: {str(e)}")

@router.post("/open/antigravity")
async def open_in_antigravity(request: OpenRequest):
    """
    指定されたパスをAntigravityで開く
    """
    path = normalize_path(request.path)
    
    if platform.system() == 'Darwin':
        antigravity_path = '/Applications/Antigravity.app/Contents/MacOS/Electron'
    else:
        raise HTTPException(status_code=501, detail="AntigravityはmacOSでのみサポートされています")

    # ファイル/フォルダが存在するか確認
    target_path = path if path.exists() else path.parent

    if not os.path.exists(antigravity_path):
        raise HTTPException(status_code=404, detail="Antigravityが見つかりません")

    try:
        subprocess.Popen([antigravity_path, str(target_path)])
        return {"status": "success", "message": "Antigravityで開きました"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Antigravityの起動に失敗しました: {str(e)}")

@router.post("/open/jupyter")
async def open_in_jupyter(request: OpenRequest):
    """
    指定されたパスをJupyterで開く
    """
    path = normalize_path(request.path)
    
    # JupyterのルートBase URL (環境に合わせて調整)
    # /lab/tree 形式でJupyterLabを開く
    JUPYTER_BASE_URL = "http://localhost:8888/lab/tree"
    
    # BASE_DIRからの相対パスを取得
    try:
        relative_path = path.relative_to(settings.base_dir)
    except ValueError:
        # BASE_DIR外の場合はエラーにするか、絶対パスで試みる（Jupyterの起動構成による）
        # ここではBASE_DIR以下のみサポート
        raise HTTPException(status_code=400, detail="Jupyterのルートディレクトリ外のファイルです")

    # URLエンコード
    # Note: jupyterはパス区切りをスラッシュにする必要がある
    url_path = urllib.parse.quote(str(relative_path).replace('\\', '/'))
    target_url = f"{JUPYTER_BASE_URL}/{url_path}"

    try:
        webbrowser.open(target_url)
        return {"status": "success", "message": f"Jupyterを開きました: {target_url}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Jupyterの起動に失敗しました: {str(e)}")

@router.post("/open/excalidraw")
async def open_in_excalidraw(request: OpenRequest):
    """
    指定されたパスをExcalidraw (Port 3001) で開く
    """
    path = normalize_path(request.path)
    
    EXCALIDRAW_BASE_URL = "http://localhost:3001"
    
    # Excalidrawアプリ（ローカルホスト3001）がどうパスを受け取るかによるが、
    # 一般的には ?file=... 形式か、あるいはAPI経由
    # file_viewer の実装（claude.md記述）によると "Port 3001のExcalidrawエディタで開く"機能がある
    # ここではシンプルにローカルパスを渡すクエリパラメータ形式と仮定
    # 実装例: http://localhost:3001/?file=/absolute/path/to/file.excalidraw
    
    encoded_path = urllib.parse.quote(str(path))
    target_url = f"{EXCALIDRAW_BASE_URL}/?filepath={encoded_path}"

    try:
        webbrowser.open(target_url)
        return {"status": "success", "message": f"Excalidrawを開きました"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Excalidrawの起動に失敗しました: {str(e)}")


@router.post("/open/obsidian")
async def open_in_obsidian(request: OpenRequest):
    """
    パスから Vault 名とファイルパスを特定し、Obsidian URI で開く
    パスに「obsidian」を含むディレクトリがある必要がある
    """
    file_path = request.path
    if not file_path:
        raise HTTPException(status_code=400, detail="パスが指定されていません")
    
    try:
        # パスを正規化
        normalized_path = str(normalize_path(file_path)).replace('\\', '/')
        
        # パスの中から「obsidian」を含むディレクトリを探す
        parts = normalized_path.split('/')
        obsidian_idx = -1
        for i, part in enumerate(parts):
            if 'obsidian' in part.lower():
                obsidian_idx = i
                break
        
        if obsidian_idx == -1:
            raise HTTPException(status_code=400, detail='パスに「obsidian」を含むディレクトリが見つかりません')
        
        vault_name = parts[obsidian_idx]
        # Vault以降のパスを特定
        relative_file_path = '/'.join(parts[obsidian_idx+1:])
        
        # フォルダの場合は末尾に / を付けるとObsidianでフォルダが開く
        target_path = Path(file_path)
        if target_path.is_dir() and relative_file_path and not relative_file_path.endswith('/'):
            relative_file_path += '/'
        
        # Obsidian URI を構築
        encoded_file = urllib.parse.quote(relative_file_path)
        obsidian_uri = f"obsidian://open?vault={vault_name}&file={encoded_file}"
        
        if platform.system() == 'Darwin':  # macOS
            subprocess.Popen(['open', obsidian_uri])
        elif platform.system() == 'Windows':
            os.startfile(obsidian_uri)
        else:
            raise HTTPException(status_code=501, detail="サポートされていないOSです")
        
        return {"status": "success", "message": "Obsidianで開きました", "uri": obsidian_uri}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Obsidianの起動に失敗しました: {str(e)}")


@router.get("/file-content")
async def get_file_content(path: str = Query(..., description="ファイルのパス")):
    """
    ファイルの内容を取得（テキストファイル用）
    """
    target_path = normalize_path(path)
    
    if not target_path.exists():
        raise HTTPException(status_code=404, detail="ファイルが見つかりません")
    
    if target_path.is_dir():
        raise HTTPException(status_code=400, detail="ディレクトリは読み込めません")

    try:
        with open(target_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return {"path": str(target_path), "content": content}
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="テキストファイルではありません")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ファイルの読み込みに失敗しました: {str(e)}")


# ----------------------------------------------------------------
# 外部連携用API（file_viewerと互換性あり）
# ブラウザやcmdから直接呼び出し可能
# ----------------------------------------------------------------

@router.get("/fullpath")
async def fullpath(path: str = Query(..., description="開くファイルのフルパス")):
    """
    フルパスでファイルを開く（file_viewer互換）
    例: http://localhost:5001/api/fullpath?path=/path/to/file.pdf
    """
    if not path:
        raise HTTPException(status_code=400, detail="パスが指定されていません")
    
    # URLデコード
    decoded_path = urllib.parse.unquote(path)
    
    # ネットワークパス（UNC）の処理
    if decoded_path.startswith('//'):
        decoded_path = decoded_path.replace('/', '\\')  # //server/share → \\server\share
    
    # スマートオープンを呼び出し
    request = OpenRequest(path=decoded_path)
    return await open_smart(request)


@router.post("/open-path")
async def open_path(request: OpenRequest):
    """
    パスを開く（file_viewer互換）
    ファイルの場合はファイルを、フォルダの場合はフォルダを開く
    """
    path = normalize_path(request.path)
    
    if not path.exists():
        return {"success": False, "error": f"パスが見つかりません: {request.path}"}
    
    try:
        if platform.system() == "Windows":
            if path.is_dir():
                subprocess.Popen(['explorer', str(path).replace('/', '\\')])
            else:
                os.startfile(str(path))
        elif platform.system() == "Darwin":
            subprocess.Popen(["open", str(path)])
        else:
            subprocess.Popen(["xdg-open", str(path)])
        return {"success": True, "message": f"開きました: {path}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/open-folder")
async def open_folder(request: OpenRequest):
    """
    フォルダを開く（file_viewer互換）
    ファイルパスが渡された場合は親フォルダを開く
    """
    path = normalize_path(request.path)
    
    # ファイルの場合は親フォルダを開く
    if path.is_file():
        path = path.parent
    
    if not path.exists():
        return {"success": False, "error": f"フォルダが見つかりません: {request.path}"}
    
    try:
        if platform.system() == "Windows":
            subprocess.Popen(['explorer', str(path).replace('/', '\\')])
        elif platform.system() == "Darwin":
            subprocess.Popen(["open", str(path)])
        else:
            subprocess.Popen(["xdg-open", str(path)])
        return {"success": True, "message": f"フォルダを開きました: {path}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ========================================
# タスク管理API
# ========================================

@router.get("/tasks/{task_id}/progress")
async def get_task_progress(task_id: str):
    """
    タスクの進捗を取得する
    
    Returns:
        {
            id: タスクID
            status: "pending" | "running" | "completed" | "cancelled" | "error"
            progress: 0-100
            current_file: 現在処理中のファイル名
            total_files: 総ファイル数
            processed_files: 処理済みファイル数
            error_message: エラーメッセージ（エラー時のみ）
            result: 完了時の結果
        }
    """
    task = task_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="タスクが見つかりません")
    
    response = task.to_dict()
    
    # 完了済みの場合は結果も返す
    if task.status == "completed" and task.result:
        response["result"] = task.result
    
    return response


@router.post("/tasks/{task_id}/cancel")
async def cancel_task(task_id: str):
    """
    タスクをキャンセルする
    
    実際のキャンセルは非同期で行われる。
    ワーカースレッドがフラグを検知して処理を中断する。
    """
    task = task_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="タスクが見つかりません")
    
    if task.status in ("completed", "cancelled", "error"):
        return {"success": False, "message": "タスクは既に終了しています", "status": task.status}
    
    success = task_manager.cancel_task(task_id)
    if success:
        return {"success": True, "message": "キャンセルをリクエストしました"}
    else:
        return {"success": False, "message": "キャンセルに失敗しました"}
