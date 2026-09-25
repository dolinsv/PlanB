import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Must match the GitHub repository name exactly
const REPO_NAME = 'PlanB';

const isPages =
  process.env.VITE_STATIC === 'true' || process.env.GH_PAGES === 'true';

const APP_BUILD = process.env.VITE_APP_BUILD || String(Date.now());

export default defineConfig({
  root: 'client',
  base: isPages ? `/${REPO_NAME}/` : '/',
  plugins: [react()],
  define: {
    'import.meta.env.VITE_STATIC': JSON.stringify(
      isPages ? 'true' : process.env.VITE_STATIC || ''
    ),
    'import.meta.env.VITE_APP_BUILD': JSON.stringify(APP_BUILD),
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: isPages
      ? undefined
      : {
          '/api/': 'http://127.0.0.1:3000',
        },
  },
});
