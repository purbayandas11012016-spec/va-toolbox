import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// COOP/COEP unlock SharedArrayBuffer + the ffmpeg.wasm multithread core.
const crossOriginIsolation = {
  name: 'va-cross-origin-isolation',
  configureServer(server) {
    server.middlewares.use(addHeaders)
  },
  configurePreviewServer(server) {
    server.middlewares.use(addHeaders)
  },
}

function addHeaders(_req, res, next) {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless')
  next()
}

export default defineConfig({
  plugins: [react(), crossOriginIsolation],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
  build: { target: 'esnext', chunkSizeWarningLimit: 4096 },
})
