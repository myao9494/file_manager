@echo off
setlocal

REM Windows本番環境用一括起動スクリプト
REM バックエンド(8001)とフロントエンド(5173, dist配信)を同時に起動します。

set BACKEND_PORT=8001
set FRONTEND_PORT=5173

echo Stopping existing servers...

REM バックエンドのポート確認と停止
echo Checking port %BACKEND_PORT%...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :%BACKEND_PORT% ^| findstr LISTENING') do (
    echo Port %BACKEND_PORT% is in use by PID %%a. Killing process...
    taskkill /F /PID %%a
)

REM フロントエンドのポート確認と停止
echo Checking port %FRONTEND_PORT%...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :%FRONTEND_PORT% ^| findstr LISTENING') do (
    echo Port %FRONTEND_PORT% is in use by PID %%a. Killing process...
    taskkill /F /PID %%a
)

REM distフォルダのチェック
if not exist "frontend\dist" (
    echo Error: frontend/dist folder not found. Please run 'npm run build' in frontend directory first.
    pause
    exit /b 1
)

echo Starting Backend server (Port %BACKEND_PORT%)...
cd backend
start "File Manager Backend" cmd /c "set PYTHONPATH=. && python -m uvicorn app.main:app --host 0.0.0.0 --port %BACKEND_PORT% --workers 1 --log-level info"
cd ..

echo Starting Frontend server (Port %FRONTEND_PORT%)...
cd frontend
start "File Manager Frontend" cmd /c "npx serve -s dist -l %FRONTEND_PORT%"
cd ..

echo Servers are starting up.
echo Backend API: http://localhost:%BACKEND_PORT%
echo Frontend:    http://localhost:%FRONTEND_PORT%
echo.
echo Please access http://localhost:%FRONTEND_PORT%
echo.

pause
