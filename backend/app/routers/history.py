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


class HistoryList(BaseModel):
    paths: List[str]


@router.get("/history", response_model=List[str])
async def get_history():
    """
    フォルダ履歴を取得する
    """
    if not HISTORY_FILE.exists():
        return []

    try:
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                return data
            return []
    except Exception as e:
        print(f"Error reading history file: {e}")
        return []


@router.post("/history")
async def save_history(history: HistoryList):
    """
    フォルダ履歴を保存する
    """
    try:
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(history.paths, f, ensure_ascii=False, indent=2)
        return {"status": "success"}
    except Exception as e:
        print(f"Error saving history file: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save history: {str(e)}")
