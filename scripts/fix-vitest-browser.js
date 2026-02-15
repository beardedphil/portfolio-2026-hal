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

const patched = content.replace(
  /const pool = globalThis\.__vitest_worker__\?\.ctx\?\.pool\n\nthrow new Error\([\s\S]*?\)/,
  `const pool = globalThis.__vitest_worker__?.ctx?.pool

// Allow import outside of Vitest (e.g., during Vite config bundling)
// Only throw if actually running in a test context
if (pool && globalThis.__vitest_worker__) {
  throw new Error(
    'vitest/browser can be imported only inside the Browser Mode. ' +
    \`Your test is running in \${pool} pool. Make sure your regular tests are excluded from the "test.include" glob pattern.\`
  )
}
// Otherwise, silently allow the import (for Vite config bundling)`
)

writeFileSync(path, patched)
console.log('[fix:vitest-browser] Patched successfully')
