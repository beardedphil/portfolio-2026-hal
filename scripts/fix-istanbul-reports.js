/**
 * Fix istanbul-reports JSX in .js files by patching them to work with esbuild
 * 
 * istanbul-reports contains JSX syntax in .js files, which causes build errors.
 * This script patches those files to either:
 * 1. Remove JSX (convert to React.createElement calls)
 * 2. Or mark them to be excluded from processing
 * 
 * Since option 1 is complex, we'll use a simpler approach: patch the files
 * to export empty modules so they don't cause build errors.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const istanbulReportsPath = join(process.cwd(), 'node_modules/istanbul-reports/lib/html-spa/src')

if (!existsSync(istanbulReportsPath)) {
  // Try alternative path
  const altPath = join(process.cwd(), 'node_modules/istanbul-reports')
  if (!existsSync(altPath)) {
    console.log('[fix:istanbul-reports] istanbul-reports not found, skipping')
    process.exit(0)
  }
  // If the html-spa path doesn't exist, the files might not be there yet
  // This is fine - the plugin will handle it
  console.log('[fix:istanbul-reports] html-spa path not found, files may not exist yet')
  process.exit(0)
}

// Files that contain JSX in .js files
const jsxFiles = [
  'fileBreadcrumbs.js',
  'filterToggle.js',
  'flattenToggle.js',
  'index.js',
  'summaryHeader.js',
  'summaryTableHeader.js',
  'summaryTableLine.js',
]

let patchedCount = 0

for (const file of jsxFiles) {
  const filePath = join(istanbulReportsPath, file)
  if (!existsSync(filePath)) {
    continue
  }

  const content = readFileSync(filePath, 'utf8')
  
  // Check if already patched
  if (content.includes('// PATCHED BY fix-istanbul-reports')) {
    continue
  }

  // Replace the file with a simple export that doesn't use JSX
  // This is safe because istanbul-reports is only used for coverage reports,
  // not in the production build
  const patched = `// PATCHED BY fix-istanbul-reports
// Original file contained JSX in .js file, which causes build errors
// This file is only used for test coverage reports, not in production builds
export default {}
export {}
`

  writeFileSync(filePath, patched)
  patchedCount++
  console.log(`[fix:istanbul-reports] Patched ${file}`)
}

if (patchedCount > 0) {
  console.log(`[fix:istanbul-reports] Patched ${patchedCount} files`)
} else {
  console.log('[fix:istanbul-reports] All files already patched or not found')
}
