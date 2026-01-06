"""
Everything検索プロキシ (CURL版)
EverythingのHTTPサーバー(localhost:8080)にCURL経由でリクエストを転送し、
フロントエンドが期待する形式に変換して返す。
httpxでプロキシ回避が難しい場合のバックアップ実装。
"""
import subprocess
import json
import platform
import urllib.parse
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional, Any

router = APIRouter()

EVERYTHING_BASE_URL = "http://localhost:8080"
TIMEOUT = 5.0

class EverythingItem(BaseModel):
    name: str
    path: str
    type: str
    size: Optional[int] = None
    date_modified: Optional[int] = None

class EverythingResponse(BaseModel):
    totalResults: int
    results: List[EverythingItem]

# フロントエンドが期待する形式のモデル
class FileItem(BaseModel):
    name: str
    type: str  # "file" or "directory"
    path: str
    size: Optional[int] = None
    date_modified: Optional[float] = None  # Unix Timestamp (seconds)

class SearchResponse(BaseModel):
    totalResults: int
    results: List[FileItem]

class StatusResponse(BaseModel):
    ready: bool
    total_indexed: int

def windows_filetime_to_timestamp(filetime: Optional[str]) -> Optional[float]:
    """Windows File Time (Ticks) を Unix Timestamp (Seconds) に変換"""
    if not filetime:
        return None
    try:
        # Windows File Time (100-nanosecond intervals since January 1, 1601)
        ticks = int(filetime)
        # 1601-01-01 -> 1970-01-01 is 11,644,473,600 seconds
        # ticks / 10,000,000 = seconds
        seconds_since_1601 = ticks / 10000000
        seconds_since_1970 = seconds_since_1601 - 11644473600
        return float(seconds_since_1970)
    except:
        return None

def curl_get(url: str, params: dict) -> dict:
    """CURLを使ってGETリクエストを送信し、JSONレスポンスを返す"""
    # パラメータをクエリ文字列に変換
    query_string = urllib.parse.urlencode(params)
    full_url = f"{url}?{query_string}"
    
    # curlコマンドの構築
    # --noproxy "*" でプロキシを確実に回避
    # -s でサイレントモード
    command = ["curl", "-s", "--noproxy", "*", full_url]
    
    try:
        result = subprocess.run(
            command, 
            capture_output=True, 
            text=True, 
            encoding='utf-8',
            check=True
        )
        return json.loads(result.stdout)
    except subprocess.CalledProcessError as e:
        print(f"Curl error: {e.stderr}")
        raise Exception(f"Curl command failed: {e}")
    except json.JSONDecodeError as e:
        print(f"JSON decode error: {result.stdout}")
        raise Exception(f"Invalid JSON response: {e}")
    except Exception as e:
        print(f"Unexpected error: {e}")
        raise e

@router.get("/index/status", response_model=StatusResponse)
async def get_status():
    """
    Everythingサービスのステータス確認
    """
    try:
        params = {"search": "", "json": 1, "count": 1}
        # curlを使用（非同期化していないが、バックアップ用なので許容）
        data = curl_get(f"{EVERYTHING_BASE_URL}/", params)
        
        return {
            "ready": True,
            "total_indexed": data.get("totalResults", 0)
        }
    except Exception as e:
        print(f"Index service connection error: {e}")
        return {
            "ready": False,
            "total_indexed": 0
        }

@router.get("/index")
async def search(
    search: str = Query(..., description="検索クエリ"),
    count: int = Query(100, description="取得件数"),
    offset: int = Query(0, description="オフセット"),
    sort: str = Query("name", description="ソート順"),
    ascending: int = Query(1, description="昇順(1)/降順(0)"),
    path: Optional[str] = Query(None, description="検索対象フォルダ")
):
    """
    Everythingでファイルを検索 (CURL版)
    """
    is_windows = platform.system() == "Windows"

    if not is_windows:
        # Mac: パススループロキシ
        params = {
            "search": search,
            "json": 1,
            "count": count,
            "offset": offset,
            "sort": sort,
            "ascending": ascending
        }
        if path:
            params["path"] = path

        try:
            data = curl_get(f"{EVERYTHING_BASE_URL}/", params)
            return data
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"Index service error: {e}")

    # Windows: Everything API 変換
    search_query = search
    if path:
        search_query = f'"{path}" {search}'

    params = {
        "search": search_query,
        "json": 1,
        "count": count,
        "offset": offset,
        "path_column": 1,
        "size_column": 1,
        "date_modified_column": 1,
        "sort": sort,
        "ascending": ascending
    }

    try:
        data = curl_get(f"{EVERYTHING_BASE_URL}/", params)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Everythingサービスに接続できません: {e}")

    results = []
    for item in data.get("results", []):
        try:
            name = item.get("name", "")
            parent_path = item.get("path", "")
            
            full_path = f"{parent_path}\\{name}" if parent_path else name
            if parent_path.endswith("\\"): 
                full_path = f"{parent_path}{name}"
                
            size_str = item.get("size")
            size = int(size_str) if size_str else None
            
            date_str = item.get("date_modified")
            timestamp = windows_filetime_to_timestamp(date_str)
            
            item_type = item.get("type", "file")
            file_type = "directory" if item_type == "folder" else "file"
            
            results.append({
                "name": name,
                "type": file_type,
                "path": full_path,
                "size": size,
                "date_modified": timestamp
            })
        except Exception as e:
            continue

    return {
        "totalResults": data.get("totalResults", 0),
        "results": results
    }
