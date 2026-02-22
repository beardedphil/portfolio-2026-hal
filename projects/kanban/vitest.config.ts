import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import type { Plugin } from 'vite'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Plugin to force React and React DOM to resolve from root node_modules
// This prevents the "Invalid hook call" error when running tests from root
const reactDedupePlugin = (): Plugin => {
  const rootReact = resolve(__dirname, '../../node_modules/react')
  const rootReactDom = resolve(__dirname, '../../node_modules/react-dom')
  
  return {
    name: 'react-dedupe-kanban',
    enforce: 'pre',
    resolveId(id, importer) {
      // Always resolve React and React DOM from root when running tests
      // This ensures all React imports use the same instance
      // Skip if already resolving from root to avoid infinite loops
      if (importer && importer.includes('../../node_modules/react')) {
        return null
      }
      if (id === 'react') {
        return rootReact
      }
      if (id === 'react-dom') {
        return rootReactDom
      }
      return null
    },
    load(id) {
      // Ensure React is properly loaded
      if (id === rootReact || id.endsWith('node_modules/react/index.js')) {
        return null // Let Vite handle the actual loading
      }
      return null
    },
  }
}

export default defineConfig({
  plugins: [
    reactDedupePlugin(),
    react({
      jsxRuntime: 'automatic',
      babel: {
        plugins: [],
      },
    }),
  ],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      'react': resolve(__dirname, '../../node_modules/react'),
      'react-dom': resolve(__dirname, '../../node_modules/react-dom'),
    },
    preserveSymlinks: false,
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
    esbuildOptions: {
      resolveExtensions: ['.js', '.jsx', '.ts', '.tsx'],
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.ts',
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
})
