import { defineConfig, loadEnv } from 'vite';
export default defineConfig(({ mode }) => ({
  server: {
    host: '127.0.0.1', strictPort: true,
    proxy: {
      '/backend': {
        target: loadEnv(mode, '.', 'ICT_').ICT_BACKEND_URL || 'http://127.0.0.1:38082',
        rewrite: path => path.replace(/^\/backend/, ''),
        // This loopback server acts as the same-origin development API proxy.
        configure: proxy => proxy.on('proxyReq', request => request.removeHeader('origin'))
      }
    }
  }
}));
