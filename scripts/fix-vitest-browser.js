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
  // Check if the patch is valid (no syntax errors)
  if (content.includes('// Otherwise, silently allow the import (for Vite config bundling)')) {
    const lines = content.split('\n')
    const lastLine = lines[lines.length - 1].trim()
    // Check for duplicate closing braces or malformed structure
    if (lastLine === '}' || lastLine === '// Otherwise, silently allow the import (for Vite config bundling)') {
      // File might be malformed, re-patch it
      console.log('[fix:vitest-browser] File appears malformed, re-patching')
    } else {
      console.log('[fix:vitest-browser] Already patched, skipping')
      process.exit(0)
    }
  } else {
    console.log('[fix:vitest-browser] Already patched, skipping')
    process.exit(0)
  }
}

// Read the original file structure
const lines = content.split('\n')
let poolLineIndex = -1
let throwStartIndex = -1
let throwEndIndex = -1

// Find the pool line and throw statement
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const pool = globalThis.__vitest_worker__')) {
    poolLineIndex = i
  }
  if (poolLineIndex >= 0 && lines[i].includes('throw new Error(')) {
    throwStartIndex = i
  }
  if (throwStartIndex >= 0) {
    // Find the closing parenthesis of the throw statement
    let parenCount = 0
    let foundOpen = false
    for (let j = throwStartIndex; j < lines.length; j++) {
      const line = lines[j]
      for (const char of line) {
        if (char === '(') {
          parenCount++
          foundOpen = true
        } else if (char === ')') {
          parenCount--
          if (foundOpen && parenCount === 0) {
            throwEndIndex = j
            break
          }
        }
      }
      if (throwEndIndex >= 0) break
    }
    if (throwEndIndex >= 0) break
  }
}

if (poolLineIndex >= 0 && throwStartIndex >= 0 && throwEndIndex >= 0) {
  // Replace the throw block with conditional check
  const beforePool = lines.slice(0, poolLineIndex).join('\n')
  const afterThrow = lines.slice(throwEndIndex + 1).join('\n')
  
  const patched = `${beforePool}
const pool = globalThis.__vitest_worker__?.ctx?.pool

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
// Otherwise, silently allow the import (for Vite config bundling)
${afterThrow}`

  writeFileSync(path, patched)
  console.log('[fix:vitest-browser] Patched successfully')
} else {
  console.log('[fix:vitest-browser] Could not find throw statement to patch')
  process.exit(0)
}
