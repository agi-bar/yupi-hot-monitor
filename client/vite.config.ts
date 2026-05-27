import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@hot-monitor/types': path.resolve(__dirname, '../packages/shared/src')
      }
    },
    server: {
      host: env.VITE_USE_HTTPS === 'true' ? undefined : '0.0.0.0',
      port: parseInt(env.VITE_PORT || '5173'),
      proxy: {
        '/api': {
          target: env.VITE_API_BASE_URL || 'http://localhost:3001',
          changeOrigin: true
        },
        '/socket.io': {
          target: env.VITE_WS_URL || 'http://localhost:3001',
          ws: true
        }
      }
    },
    build: {
      outDir: 'dist',
      sourcemap: mode !== 'production'
    }
  }
})
