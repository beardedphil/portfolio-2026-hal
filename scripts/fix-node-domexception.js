/**
 * Fix node-domexception .history files that cause build errors
 * 
 * node-domexception contains .history files with invalid syntax that cause
 * build errors when Vite tries to process them during config loading.
 * This script removes or patches these files.
 */
import { readdirSync, unlinkSync, existsSync, statSync } from 'fs'
import { join } from 'path'

const nodeDomexceptionPath = join(process.cwd(), 'node_modules/node-domexception/.history')

if (!existsSync(nodeDomexceptionPath)) {
  console.log('[fix:node-domexception] .history directory not found, skipping')
  process.exit(0)
}

let removedCount = 0

try {
  const files = readdirSync(nodeDomexceptionPath)
  for (const file of files) {
    const filePath = join(nodeDomexceptionPath, file)
    const stats = statSync(filePath)
    if (stats.isFile()) {
      unlinkSync(filePath)
      removedCount++
      console.log(`[fix:node-domexception] Removed ${file}`)
    }
  }
  
  if (removedCount > 0) {
    console.log(`[fix:node-domexception] Removed ${removedCount} history files`)
  } else {
    console.log('[fix:node-domexception] No history files found')
  }
} catch (err) {
  console.log('[fix:node-domexception] Error:', err.message)
  process.exit(0) // Non-fatal
}
