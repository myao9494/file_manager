#!/bin/bash

# Windowsデプロイ用ビルドスクリプト (Mac上で実行)
# 1. フロントエンドをビルド
# 2. ビルド成果物をバックエンドのstaticディレクトリに配置

# スクリプトのディレクトリの親ディレクトリに移動
cd "$(dirname "$0")/.."

echo "Building frontend..."
cd frontend
npm run build
if [ $? -ne 0 ]; then
    echo "Frontend build failed."
    exit 1
fi
cd ..

echo "Cleaning up old static files..."
rm -rf backend/static
mkdir -p backend/static

echo "Copying frontend build to backend/static..."
cp -r frontend/dist/* backend/static/

echo "Build complete. backend/static now contains the frontend."
