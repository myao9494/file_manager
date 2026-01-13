#!/bin/bash

# サーバー起動スクリプト (macOS/Linux用)
# 指定されたポートが使用されている場合はプロセスを終了してから、
# バックエンドとフロントエンドを起動する。

BACKEND_PORT=8001
FRONTEND_PORT=5173

# 関数: ポートを使用しているプロセスを終了する
kill_port_process() {
    local port=$1
    echo "Checking port $port..."
    local pids=$(lsof -ti :$port)
    if [ ! -z "$pids" ]; then
        echo "Port $port is in use by PID(s): $pids. Killing processes..."
        kill -9 $pids
        # ポートが解放されるのを待つ
        while lsof -ti :$port > /dev/null; do
            sleep 0.5
        done
        echo "Port $port is now free."
    else
        echo "Port $port is free."
    fi
}

echo "Stopping existing servers..."
kill_port_process $BACKEND_PORT
kill_port_process $FRONTEND_PORT

echo "Starting Backend server (Port $BACKEND_PORT)..."
cd backend

# バックエンド起動コマンドの決定
if command -v uv >/dev/null 2>&1; then
    echo "Using uv for backend..."
    # --host 0.0.0.0 を追加してIPv4/IPv6の両方でアクセス可能にする
    uv run uvicorn app.main:app --reload --host 0.0.0.0 --port $BACKEND_PORT &
else
    echo "uv not found. Falling back to standard python..."
    if [ -d ".venv" ]; then
        source .venv/bin/activate
    fi
    PYTHONPATH=. python -m uvicorn app.main:app --reload --host 0.0.0.0 --port $BACKEND_PORT &
fi
BACKEND_PID=$!
cd ..

# バックエンドが起動するのを待つ
echo "Waiting for Backend to respond on http://localhost:$BACKEND_PORT ..."
max_attempts=15
attempt=1
while ! curl -s http://localhost:$BACKEND_PORT/ > /dev/null; do
    if [ $attempt -ge $max_attempts ]; then
        echo "Backend failed to start in time."
        kill $BACKEND_PID
        exit 1
    fi
    printf "."
    sleep 1
    attempt=$((attempt + 1))
done
echo " Backend is ready!"

echo "Starting Frontend server (Port $FRONTEND_PORT)..."
cd frontend

# フロントエンド起動コマンドの決定
if command -v pnpm >/dev/null 2>&1; then
    echo "Using pnpm for frontend..."
    pnpm run dev &
else
    echo "pnpm not found. Falling back to npm..."
    npm run dev &
fi
FRONTEND_PID=$!
cd ..

echo "---------------------------------------"
echo "Servers are running."
echo "Frontend: http://localhost:$FRONTEND_PORT"
echo "Backend API: http://localhost:$BACKEND_PORT/api"
echo "Press Ctrl+C to stop both servers."
echo "---------------------------------------"

# Trap CTRL+C to kill both background processes
trap "echo ' Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID; exit" INT

wait
