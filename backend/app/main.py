"""
FastAPI ファイルマネージャー メインアプリケーション
- ファイル一覧取得
- ファイル操作（コピー、移動、削除、リネーム）
- CORS対応（個人利用・VPN内利用前提）

注: インデックス検索機能は外部サービス（file_index_service）に移行
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import files
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi import Request

app = FastAPI(
    title="File Manager API",
    description="軽量ファイルマネージャー API",
    version="2.0.0",
)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    import sys
    print(f"[ValidationError] {exc.errors()}", file=sys.stderr)
    try:
        if hasattr(exc, "body"):
             print(f"[ValidationErrorBody] {exc.body}", file=sys.stderr)
    except:
        pass
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
    )

# CORS設定（個人利用のため全てのオリジンからのアクセスを許可）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ルーター登録
app.include_router(files.router, prefix="/api", tags=["files"])


@app.get("/")
async def root():
    """ヘルスチェック用エンドポイント"""
    return {"status": "ok", "base_dir": str(settings.base_dir)}


@app.get("/api/config")
async def get_config():
    """
    フロントエンド用設定を取得
    - defaultBasePath: デフォルトのベースディレクトリ
    - isWindows: Windows環境かどうか
    """
    return {
        "defaultBasePath": str(settings.base_dir),
        "isWindows": settings.is_windows,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=settings.host, port=settings.port, reload=True)
