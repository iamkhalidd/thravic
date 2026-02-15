import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [react()],
    optimizeDeps: {
        include: ['@exodus/bytes'],
    },
    ssr: {
        optimizeDeps: {
            include: ['@exodus/bytes'],
        },
    },
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/tests/setup.ts'],
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
        server: {
            deps: {
                inline: [
                    '@exodus/bytes',
                    'html-encoding-sniffer',
                ],
            },
        },
        deps: {
            optimizer: {
                web: {
                    include: ['@exodus/bytes', 'html-encoding-sniffer'],
                },
                ssr: {
                    include: ['@exodus/bytes', 'html-encoding-sniffer'],
                },
            },
        },
    },
});
