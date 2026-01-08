"""
フォルダ履歴管理ルーター
"""
import json
import os
from pathlib import Path
from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings

router = APIRouter()

# 履歴ファイルの保存先 (バックエンド実行ディレクトリ直下)
HISTORY_FILE = Path("folder_history.json")


import time

class HistoryItem(BaseModel):
    path: str
    count: int = 1
    timestamp: float = 0

class HistoryPayload(BaseModel):
    history: List[HistoryItem]


@router.get("/history", response_model=List[HistoryItem])
async def get_history():
    """
    フォルダ履歴を取得する
    """
    if not HISTORY_FILE.exists():
        return []

    try:
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            
            # リスト形式であるか確認
            if not isinstance(data, list):
                return []
                
            # 文字列のリスト（旧形式）の場合
            if data and isinstance(data[0], str):
                current_time = time.time()
                # 旧形式を新形式に変換して返す (count=1)
                # 順序は維持されるので、タイムスタンプを少しずつずらすか、同じにするか
                return [
                    HistoryItem(path=path, count=1, timestamp=current_time)
                    for path in data
                ]
            
            # 新形式（オブジェクトのリスト）の場合
            return [HistoryItem(**item) for item in data]
            
    except Exception as e:
        print(f"Error reading history file: {e}")
        return []


@router.post("/history")
async def save_history(payload: HistoryPayload):
    """
    フォルダ履歴を保存する
    """
    try:
        # dict形式に変換して保存
        save_data = [item.dict() for item in payload.history]
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(save_data, f, ensure_ascii=False, indent=2)
        return {"status": "success"}
    except Exception as e:
        print(f"Error saving history file: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save history: {str(e)}")
