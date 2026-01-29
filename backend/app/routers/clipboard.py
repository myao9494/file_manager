"""
クリップボード操作用ルーター
Windows環境において、Explorerで貼り付け可能な形式（CF_HDROP）でファイルパスをクリップボードにコピーする機能を提供
"""
import sys
import os
from typing import List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import ctypes
from ctypes import wintypes

router = APIRouter()

class CopyFilesRequest(BaseModel):
    paths: List[str]

# Windows API定数
CF_HDROP = 15
GMEM_MOVEABLE = 0x0002
GMEM_ZEROINIT = 0x0040

class DROPFILES(ctypes.Structure):
    _fields_ = [
        ("pFiles", wintypes.DWORD),
        ("pt", wintypes.POINT),
        ("fNC", wintypes.BOOL),
        ("fWide", wintypes.BOOL),
    ]

@router.post("/clipboard/copy")
async def copy_files_to_clipboard(request: CopyFilesRequest):
    """
    指定されたファイルパスリストをOSのクリップボードにコピーする
    Windows環境のみ動作し、Explorerでの貼り付け（Ctrl+V）を可能にする
    """
    if sys.platform != "win32":
        # Mac/Linuxでは何もしない（エラーにはしない）
        return {"status": "skipped", "message": "Clipboard sync is only available on Windows"}

    try:
        # pywin32を使用してクリップボード操作
        # 標準ライブラリのctypesを使用する方法もあるが、pywin32の方が安定している場合が多い
        # ここではpywin32への依存を最小限にするため、ctypesでの実装を試みるが、
        # 複雑さを避けるためpywin32がインストールされていることを前提とするのが望ましい
        # しかし、pywin32がない環境でもエラーハンドリングする
        
        try:
            import win32clipboard
            import win32con
        except ImportError:
            return {"status": "error", "message": "pywin32 module is not installed"}

        # ファイルパスの検証
        valid_paths = [p for p in request.paths if os.path.exists(p)]
        if not valid_paths:
            return {"status": "warning", "message": "No valid paths found"}

        # パスリストをNULL区切りの文字列にし、さらにダブルNULLで終端
        # Windowsのパス区切り文字に変換
        file_list_str = "\0".join([p.replace("/", "\\") for p in valid_paths]) + "\0\0"
        file_list_bytes = file_list_str.encode("utf-16le")

        # DROPFILES構造体の作成
        drop_files = DROPFILES()
        drop_files.pFiles = ctypes.sizeof(DROPFILES)
        drop_files.fWide = True
        
        # 必要なメモリサイズの計算
        drop_files_size = ctypes.sizeof(DROPFILES)
        total_size = drop_files_size + len(file_list_bytes)

        # クリップボードを開く
        win32clipboard.OpenClipboard()
        try:
            win32clipboard.EmptyClipboard()
            
            # グローバルメモリの確保
            h_global = win32clipboard.SetClipboardData(win32clipboard.CF_HDROP, None)
            # win32clipboard.SetClipboardDataでハンドラを渡す必要があるため、
            # pywin32の作法に従うと、データを直接渡すことも可能だが、CF_HDROPは特殊
            
            # pywin32のSetClipboardDataはバイト列を受け取ることもできるが、
            # CF_HDROPの場合は構造体 + パスデータのバイナリが必要
            
            # バイナリデータの構築
            structure_bytes = bytes(drop_files)
            data = structure_bytes + file_list_bytes
            
            win32clipboard.SetClipboardData(win32clipboard.CF_HDROP, data)
            
        finally:
            win32clipboard.CloseClipboard()

        return {"status": "success", "count": len(valid_paths)}

    except Exception as e:
        print(f"Clipboard error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
