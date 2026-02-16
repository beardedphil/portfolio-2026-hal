/**
 * Fix nanoid async/index.native.js that imports expo-random
 * 
 * nanoid contains a React Native-specific file that imports expo-random,
 * which is not available in Node.js/web environments. This causes build
 * errors when Vite tries to process it during config loading.
 * This script removes or patches this file.
 */
import { unlinkSync, existsSync } from 'fs'
import { join } from 'path'

const nanoidNativePath = join(process.cwd(), 'node_modules/nanoid/async/index.native.js')

if (!existsSync(nanoidNativePath)) {
  console.log('[fix:nanoid] index.native.js not found, skipping')
  process.exit(0)
}

try {
  unlinkSync(nanoidNativePath)
  console.log('[fix:nanoid] Removed index.native.js (React Native specific file)')
} catch (err) {
  console.log('[fix:nanoid] Error:', err.message)
  process.exit(0) // Non-fatal
}
