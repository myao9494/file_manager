@echo off
setlocal

REM Windows本番環境用バックエンド起動スクリプト
REM ポート: 8001
REM フロントエンドは別途 start_windows_frontend.bat で起動してください。

set PORT=8001

echo Stopping existing process on port %PORT%...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :%PORT% ^| findstr LISTENING') do (
    echo Port %PORT% is in use by PID %%a. Killing process...
    taskkill /F /PID %%a
)

echo Starting Backend Server (Port %PORT%)...
echo API is available at http://localhost:%PORT%

cd backend
set PYTHONPATH=.
python -m uvicorn app.main:app --host 0.0.0.0 --port %PORT% --workers 1 --log-level info

cd ..
pause
