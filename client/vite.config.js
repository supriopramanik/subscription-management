import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:4000' } },
  build: {
    target: ['chrome80', 'edge80', 'firefox78', 'safari14'],
    cssTarget: 'chrome80',
    sourcemap: false,
    rollupOptions: { output: { manualChunks: { charts: ['recharts'] } } },
  },
});
