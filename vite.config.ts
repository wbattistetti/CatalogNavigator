import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
    include: ['mammoth', 'xlsx'],
  },
  assetsInclude: ['**/*.worker.min.js'],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          pdfjs: ['pdfjs-dist'],
          mammoth: ['mammoth'],
          xlsx: ['xlsx'],
        },
      },
    },
  },
});
