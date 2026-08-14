import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    // Project GitHub Pages site is served under /<repo>/. Override with PAGES_BASE
    // (e.g. PAGES_BASE=/ for a custom domain, or a different repo slug).
    base: process.env.PAGES_BASE ?? '/tabs/',
    plugins: [react()],
    server: {
        host: '127.0.0.1',
        open: false,
        port: 5173,
        strictPort: true,
    },
});
