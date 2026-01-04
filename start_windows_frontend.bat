@echo off
setlocal

REM Windows本番環境用フロントエンド起動スクリプト
REM npm run build でビルドされた dist フォルダを配信します。
REM ポート: 5173

cd frontend

if not exist "dist" (
    echo Error: dist folder not found. Please run 'npm run build' first.
    pause
    exit /b 1
)

echo Starting Frontend Server (Port 5173)...
echo Access http://localhost:5173 to use the application.

call npx serve -s dist -l 5173

pause
