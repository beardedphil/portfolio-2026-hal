import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@hal-agents': path.resolve(__dirname, 'projects/project-1/src'),
    },
  },
  server: {
    port: 5173,
  },
})
