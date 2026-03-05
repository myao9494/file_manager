/**
 * Vite設定
 * - 開発時: /apiリクエストをバックエンド(port 8001)にプロキシ
 * - ビルド時: dist/にPWA対応の静的ファイルを生成
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 開発サーバーのプロキシ設定
    // /apiへのリクエストをバックエンドに転送
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
    },
  },
})
