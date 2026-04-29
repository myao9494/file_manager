"""
FastAPI ファイルマネージャー メインアプリケーション
- ファイル一覧取得
- ファイル操作（コピー、移動、削除、リネーム）
- CORS対応（個人利用・VPN内利用前提）
- PWA: フロントエンドのビルド済みファイルを静的配信
- PWA更新反映: HTML/Service Workerは再検証、ハッシュ付きアセットは長期キャッシュ

注: インデックス検索機能は外部サービス（file_index_service）に移行
"""
import re
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from app.config import get_editor_preferences, save_editor_preferences, settings
from app.routers import files, everything, history, clipboard, terminal, fulltext
from fastapi.exceptions import RequestValidationError
from fastapi import Request
import mimetypes

# Windows環境でSVGのMIMEタイプが正しく認識されない場合があるため明示的に設定
mimetypes.add_type("image/svg+xml", ".svg")

# フロントエンドのビルドディレクトリ（backend/の親ディレクトリ → frontend/dist）
FRONTEND_DIST_DIR = Path(__file__).parent.parent.parent / "frontend" / "dist"
HASHED_ASSET_PATTERN = re.compile(r".*-[0-9A-Za-z]{6,}\.(js|css|mjs)$")

app = FastAPI(
    title="File Manager API",
    description="軽量ファイルマネージャー API",
    version="2.0.0",
)


def build_static_cache_headers(path: Path) -> dict[str, str]:
    """配信ファイル種別ごとに適切なキャッシュヘッダーを返す"""
    if path.name in {"index.html", "sw.js", "manifest.json"}:
        return {"Cache-Control": "no-cache, no-store, must-revalidate"}

    if HASHED_ASSET_PATTERN.fullmatch(path.name):
        return {"Cache-Control": "public, max-age=31536000, immutable"}

    return {"Cache-Control": "public, max-age=3600"}

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
app.include_router(everything.router, prefix="/api", tags=["everything"])
app.include_router(fulltext.router, prefix="/api", tags=["fulltext"])
app.include_router(history.router, prefix="/api", tags=["history"])
app.include_router(clipboard.router, prefix="/api", tags=["clipboard"])
app.include_router(terminal.router, prefix="/api", tags=["terminal"])


class EditorPreferencesRequest(BaseModel):
    """エディタ設定更新リクエスト"""

    textFileOpenMode: str
    markdownOpenMode: str


@app.get("/api/config")
async def get_config():
    """
    フロントエンド用設定を取得
    - defaultBasePath: デフォルトのベースディレクトリ
    - isWindows: Windows環境かどうか
    """
    return {
        "defaultBasePath": settings.start_dir.as_posix(),
        "isWindows": settings.is_windows,
        **get_editor_preferences(),
    }


@app.post("/api/config/preferences")
async def update_editor_preferences(request: EditorPreferencesRequest):
    """エディタ設定を設定ファイルへ保存する"""
    return save_editor_preferences(
        text_file_open_mode=request.textFileOpenMode,  # type: ignore[arg-type]
        markdown_open_mode=request.markdownOpenMode,  # type: ignore[arg-type]
    )


# --- PWA: フロントエンド配信 ---
# frontend/dist/ が存在する場合のみ、静的ファイル配信を有効化
if FRONTEND_DIST_DIR.is_dir():
    # SPAフォールバック: /api以外のGETリクエストでファイルが見つからない場合はindex.htmlを返す
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """
        SPAフォールバック
        - 静的ファイルが存在すればそのファイルを返す
        - 存在しなければ index.html を返す（SPA対応）
        """
        # 静的ファイルが存在すればそのファイルを返す
        file_path = FRONTEND_DIST_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path, headers=build_static_cache_headers(file_path))

        # index.html を返す（SPAルーティング対応）
        index_path = FRONTEND_DIST_DIR / "index.html"
        if index_path.is_file():
            return FileResponse(index_path, headers=build_static_cache_headers(index_path))

        return JSONResponse(status_code=404, content={"detail": "Not found"})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=settings.host, port=settings.port, reload=True)
