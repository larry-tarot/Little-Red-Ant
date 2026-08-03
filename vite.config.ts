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
        manualChunks(id) {
          // 将第三方依赖按包名拆分为独立 chunk，降低首页主包体积
          if (id.includes('node_modules')) {
            if (id.includes('recharts')) return 'vendor-recharts';
            if (id.includes('xlsx')) return 'vendor-xlsx';
            if (id.includes('lucide-react')) return 'vendor-lucide';

            // 其余 node_modules 按包名前缀分组
            const match = id.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/);
            if (match) {
              return `vendor-${match[1].replace('@', '').replace('/', '-')}`;
            }
          }
        },
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