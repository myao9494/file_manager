@echo off
setlocal

REM サーバー起動スクリプト (Windows用)
REM 指定されたポートが使用されている場合はプロセスを終了してから、
REM バックエンドとフロントエンドを起動する。

set BACKEND_PORT=8001
set FRONTEND_PORT=5173
set PYTHON_EXE=python

if exist "backend\.venv_fix\Scripts\python.exe" (
    set PYTHON_EXE=%~dp0backend\.venv_fix\Scripts\python.exe
) else if exist "backend\.venv\Scripts\python.exe" (
    set PYTHON_EXE=%~dp0backend\.venv\Scripts\python.exe
)

echo Stopping existing servers...

REM ポートを使用しているプロセスのPIDを取得して終了する
echo Checking port %BACKEND_PORT%...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :%BACKEND_PORT% ^| findstr LISTENING') do (
    echo Port %BACKEND_PORT% is in use by PID %%a. Killing process...
    taskkill /F /PID %%a
)

echo Checking port %FRONTEND_PORT%...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :%FRONTEND_PORT% ^| findstr LISTENING') do (
    echo Port %FRONTEND_PORT% is in use by PID %%a. Killing process...
    taskkill /F /PID %%a
)

echo Starting Backend server (Port %BACKEND_PORT%)...
start "File Manager Backend" cmd /c "cd /d %~dp0backend && "%PYTHON_EXE%" -m uvicorn --app-dir %~dp0backend app.main:app --reload --port %BACKEND_PORT%"

echo Starting Frontend server (Port %FRONTEND_PORT%)...
cd frontend
echo Building Frontend...
call npm run build
start "File Manager Frontend" cmd /c "npm run dev"
cd ..

echo Servers are starting up.
echo Backend: http://localhost:%BACKEND_PORT%
echo Frontend: http://localhost:%FRONTEND_PORT%

pause
