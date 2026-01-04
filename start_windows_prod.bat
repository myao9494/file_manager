@echo off
setlocal

REM Windows本番環境用起動スクリプト
REM バックエンドが静的ファイルとしてフロントエンドも配信するため、
REM フロントエンドサーバー(Vite)の起動は不要。

set PORT=8001

echo Stopping existing process on port %PORT%...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :%PORT% ^| findstr LISTENING') do (
    echo Port %PORT% is in use by PID %%a. Killing process...
    taskkill /F /PID %%a
)

echo Starting Server (Port %PORT%)...
echo Access http://localhost:%PORT% to use the application.

cd backend
set PYTHONPATH=.
python -m uvicorn app.main:app --host 0.0.0.0 --port %PORT% --workers 1 --log-level info

cd ..
pause
