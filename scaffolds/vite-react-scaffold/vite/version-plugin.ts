import { readFileSync, writeFileSync, existsSync } from 'fs'
import { execSync } from 'child_process'
import { resolve } from 'path'
import type { Plugin } from 'vite'

interface VersionData {
  commitSha: string
  buildTimestamp: string
  environment: string
  appName: string
}

/**
 * Vite plugin that generates a version.json file with build metadata.
 * The file is served at /version.json and contains git commit SHA,
 * build timestamp, and environment information.
 */
export function versionPlugin(): Plugin {
  let buildMode: string = 'development'
  let outDir: string = 'dist'
  let versionData: VersionData | null = null

  return {
    name: 'version-plugin',
    configResolved(config) {
      buildMode = config.mode
      outDir = config.build.outDir || 'dist'
      // Generate version data once when config is resolved
      versionData = generateVersionData(buildMode)
    },
    configureServer(server) {
      // Serve version.json during development
      server.middlewares.use('/version.json', (req, res, next) => {
        if (req.method === 'GET' && req.url === '/version.json') {
          const data = versionData || generateVersionData(buildMode)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(data, null, 2))
        } else {
          next()
        }
      })
    },
    buildStart() {
      // Generate version data during build
      const data = generateVersionData(buildMode)
      versionData = data
      
      // Write to public directory for dev server
      const versionPath = resolve(process.cwd(), 'public', 'version.json')
      
      // Ensure public directory exists
      const publicDir = resolve(process.cwd(), 'public')
      if (!existsSync(publicDir)) {
        const { mkdirSync } = require('fs')
        mkdirSync(publicDir, { recursive: true })
      }
      
      writeFileSync(versionPath, JSON.stringify(data, null, 2), 'utf-8')
    },
    generateBundle() {
      // Also include version.json in the build output
      const data = versionData || generateVersionData(buildMode)
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify(data, null, 2),
      })
    },
  }
}

function generateVersionData(mode: string): VersionData {
  // Get git commit SHA - try multiple methods for CI/CD compatibility
  let commitSha = 'unknown'
  
  // Method 1: Try VERCEL_GIT_COMMIT_SHA (Vercel provides this)
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    commitSha = process.env.VERCEL_GIT_COMMIT_SHA
  }
  // Method 2: Try GITHUB_SHA (GitHub Actions)
  else if (process.env.GITHUB_SHA) {
    commitSha = process.env.GITHUB_SHA
  }
  // Method 3: Try git command (works in most environments)
  else {
    try {
      commitSha = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim()
    } catch (error) {
      // Method 4: Try reading .git/HEAD directly
      try {
        const gitHeadPath = resolve(process.cwd(), '.git', 'HEAD')
        if (existsSync(gitHeadPath)) {
          const headContent = readFileSync(gitHeadPath, 'utf-8').trim()
          
          if (headContent.startsWith('ref: ')) {
            // Detached HEAD or branch reference
            const refPath = resolve(process.cwd(), '.git', headContent.substring(5))
            if (existsSync(refPath)) {
              commitSha = readFileSync(refPath, 'utf-8').trim()
            }
          } else {
            // Direct commit SHA (detached HEAD)
            commitSha = headContent
          }
        }
      } catch (readError) {
        console.warn('Could not read git commit SHA, using "unknown"')
      }
    }
  }

  // Determine environment
  let environment = mode
  if (process.env.VERCEL_ENV) {
    // Vercel provides VERCEL_ENV: production, preview, or development
    environment = process.env.VERCEL_ENV
  } else if (process.env.NODE_ENV === 'production') {
    environment = 'production'
  } else {
    environment = mode || 'development'
  }

  // Get app name from env or use default
  const appName = process.env.VITE_APP_NAME || 'Vite + React App'

  return {
    commitSha: commitSha.substring(0, 40), // Limit to 40 chars (full SHA)
    buildTimestamp: new Date().toISOString(),
    environment,
    appName,
  }
}
