import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const gatewayPort = env.CONVAI_GATEWAY_PORT || env.VITE_CONVAI_GATEWAY_PORT || '3110';
  const gatewayTarget = `http://127.0.0.1:${gatewayPort}`;
  const vbEnginePort = env.VITE_VB_ENGINE_PORT || '5190';
  const vbEngineTarget = `http://127.0.0.1:${vbEnginePort}`;
  const devPort = Number(env.VITE_DEV_PORT) || 5180;

  return {
    plugins: [react()],
    server: {
      port: devPort,
      strictPort: true,
      proxy: {
        '/elevenlabs': gatewayTarget,
        '/api': gatewayTarget,
        '/vb-engine': {
          target: vbEngineTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/vb-engine/, ''),
        },
      },
    },
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
  };
});
