import type { Plugin } from 'vite'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const COVERAGE_DIR = path.join(ROOT, 'coverage')
const PUBLIC_DIR = path.join(ROOT, 'public')
const COVERAGE_DETAILS_FILE = path.join(PUBLIC_DIR, 'coverage-details.json')

/** Minimal JSON so the Test Coverage Report modal never receives HTML (SPA fallback). */
const FALLBACK_COVERAGE_DETAILS = {
  topOffenders: [],
  mostRecentImprovements: [],
  generatedAt: '',
}

let coverageRunInProgress = false

/** Serve coverage JSON and /coverage-details.json so the Test Coverage Report gets JSON, not SPA HTML. */
export function serveCoveragePlugin(): Plugin {
  return {
    name: 'serve-coverage',
    configureServer(server) {
      // POST /api/run-coverage — run npm run test:coverage in background (one at a time)
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? ''
        const pathname = url.split('?')[0]
        if (pathname === '/api/run-coverage' && req.method === 'POST') {
          res.setHeader('Content-Type', 'application/json')
          if (coverageRunInProgress) {
            res.statusCode = 200
            res.end(JSON.stringify({ started: false, message: 'Coverage run already in progress' }))
            return
          }
          coverageRunInProgress = true
          const child = spawn('npm', ['run', 'test:coverage'], {
            cwd: ROOT,
            shell: true,
            stdio: 'ignore',
          })
          child.on('close', () => {
            coverageRunInProgress = false
          })
          res.statusCode = 200
          res.end(JSON.stringify({ started: true }))
          return
        }
        next()
      })

      server.middlewares.use((req, res, next) => {
        const url = req.url ?? ''
        const pathname = url.split('?')[0]

        // Modal fetches /coverage-details.json; serve from public or fallback so we never return HTML
        if (pathname === '/coverage-details.json') {
          const filePath = COVERAGE_DETAILS_FILE
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Cache-Control', 'no-cache')
            res.end(fs.readFileSync(filePath))
          } else {
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Cache-Control', 'no-cache')
            res.end(JSON.stringify(FALLBACK_COVERAGE_DETAILS))
          }
          return
        }

        if (!pathname.startsWith('/coverage/')) {
          next()
          return
        }
        const subpath = pathname.slice('/coverage/'.length) || 'coverage-summary.json'
        const safe = path.normalize(subpath).split(path.sep).filter(Boolean).join(path.sep)
        if (safe.startsWith('..') || safe.includes('..')) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Invalid path' }))
          return
        }
        const filePath = path.join(COVERAGE_DIR, safe)
        const relative = path.relative(COVERAGE_DIR, filePath)
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Invalid path' }))
          return
        }
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error: 'Coverage not found. Run: npm run test:coverage',
              total: { lines: { pct: 0 }, statements: { pct: 0 }, functions: { pct: 0 }, branches: { pct: 0 } },
            })
          )
          return
        }
        const ext = path.extname(filePath).toLowerCase()
        const contentType = ext === '.json' ? 'application/json' : ext === '.html' ? 'text/html' : 'application/octet-stream'
        res.statusCode = 200
        res.setHeader('Content-Type', contentType)
        res.setHeader('Cache-Control', 'no-cache')
        res.end(fs.readFileSync(filePath))
      })
    },
  }
}
