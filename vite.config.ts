import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    react({
      babel: { plugins: ['react-dev-locator'] },
    }),
    tsconfigPaths(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: { 'vendor-recharts': ['recharts'] },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:14753',
        changeOrigin: true,
      },
      '/uploads': { target: 'http://localhost:14753', changeOrigin: true },
      '/outputs': { target: 'http://localhost:14753', changeOrigin: true },
      '/audio': { target: 'http://localhost:14753', changeOrigin: true },
    },
  },
  // 强制预打包 zustand/middleware, 避免 CJS 模块在浏览器中直接加载
  optimizeDeps: {
    include: ['zustand', 'zustand/middleware'],
  },
})