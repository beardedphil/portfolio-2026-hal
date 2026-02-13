import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/entry-lib.tsx'),
      name: 'Portfolio2026Kanban',
      fileName: 'KanbanBoard',
      formats: ['es'],
    },
    outDir: 'dist-kanban-lib',
    cssMinify: false,
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: {
        globals: { react: 'React', 'react-dom': 'ReactDOM' },
        assetFileNames: 'KanbanBoard.[ext]',
      },
    },
    sourcemap: true,
  },
})
