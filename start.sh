#!/bin/bash

# サーバー起動スクリプト (本番用 / PWA配信)
# 指定されたポートが使用されている場合はプロセスを終了してから、
# バックエンドを起動し、フロントエンドのビルド済みファイルを配信する。
#
# 使用方法:
#   ./start.sh

BACKEND_PORT=8001

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

echo "Stopping existing server..."
kill_port_process $BACKEND_PORT

# フロントエンドのビルドを実行（常に実行して最新の変更を反映）
echo "Building frontend..."
cd frontend
npm run build
cd ..

echo "Starting Backend server (Port $BACKEND_PORT)..."
cd backend

# バックエンド起動コマンドの決定
if command -v uv >/dev/null 2>&1; then
    echo "Using uv for backend..."
    uv run uvicorn app.main:app --host 0.0.0.0 --port $BACKEND_PORT &
else
    if [ -d ".venv" ]; then
        source .venv/bin/activate
    fi
    PYTHONPATH=. python -m uvicorn app.main:app --host 0.0.0.0 --port $BACKEND_PORT &
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

# 本番モード: バックエンドのみ（フロントエンドはビルド済みから配信）
echo "---------------------------------------"
echo "Production mode: Backend is serving the frontend."
echo "App: http://localhost:$BACKEND_PORT"
echo "API: http://localhost:$BACKEND_PORT/api"
echo "Press Ctrl+C to stop the server."
echo "---------------------------------------"

trap "echo ' Stopping server...'; kill $BACKEND_PID; exit" INT
wait
