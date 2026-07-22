import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/unit/**/*.test.ts'],
        hookTimeout: 30_000,
        testTimeout: 30_000,
        setupFiles: ['./tests/setup.ts'],
    },
    resolve: {
        alias: {
            '@': new URL('./src/', import.meta.url).pathname,
        },
    },
});
