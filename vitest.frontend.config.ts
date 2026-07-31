import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'happy-dom',
        include: ['tests/frontend/**/*.test.tsx'],
        setupFiles: ['./tests/setup-frontend.ts'],
        hookTimeout: 30000,
        testTimeout: 30000,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});