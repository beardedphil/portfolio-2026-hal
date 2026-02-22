import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { versionPlugin } from './vite/version-plugin'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    versionPlugin(),
  ],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    port: 5173,
    strictPort: false,
  },
})
