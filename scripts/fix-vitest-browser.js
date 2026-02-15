/**
 * Fix vitest/browser/context.js to allow imports outside of Vitest
 * (needed for Vite config bundling)
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'

const path = 'node_modules/vitest/browser/context.js'

if (!existsSync(path)) {
  console.log('[fix:vitest-browser] File not found, skipping')
  process.exit(0)
}

const content = readFileSync(path, 'utf8')

if (content.includes('Allow import outside of Vitest')) {
  console.log('[fix:vitest-browser] Already patched, skipping')
  process.exit(0)
}

// More robust replacement - handle the actual file structure
let patched = content

// Check if it still has the original throw statement (multiple possible formats)
if (patched.includes("throw new Error") && !patched.includes("Allow import outside of Vitest")) {
  // Find the throw statement and replace it
  // Match from "const pool" to the end of the throw statement
  const throwPattern = /const pool = globalThis\.__vitest_worker__\?\.ctx\?\.pool\s*\n\s*throw new Error\([\s\S]*?\)/g
  
  patched = patched.replace(
    throwPattern,
    `const pool = globalThis.__vitest_worker__?.ctx?.pool

// Allow import outside of Vitest (e.g., during Vite config bundling)
// Only throw if actually running in a test context
if (pool && globalThis.__vitest_worker__) {
  throw new Error(
    // eslint-disable-next-line prefer-template
    'vitest/browser can be imported only inside the Browser Mode. '
    + (pool
      ? \`Your test is running in \${pool} pool. Make sure your regular tests are excluded from the "test.include" glob pattern.\`
      : 'Instead, it was imported outside of Vitest.'),
  )
}
// Otherwise, silently allow the import (for Vite config bundling)`
  )
}

writeFileSync(path, patched)
console.log('[fix:vitest-browser] Patched successfully')
