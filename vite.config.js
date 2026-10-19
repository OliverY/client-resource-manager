import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 前端源码在 web/，构建产物直接落到 server/public，
// 这样 server/index.js 的 express.static 不需要任何改动。
export default defineConfig({
  root: 'web',
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:5173',
      '/uploads': 'http://localhost:5173',
      '/artifacts': 'http://localhost:5173',
    },
  },
  build: {
    outDir: '../server/public',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // antd 体积较大且变动少，单独拆包便于浏览器缓存
        manualChunks: {
          antd: ['antd', '@ant-design/icons'],
        },
      },
    },
  },
});
