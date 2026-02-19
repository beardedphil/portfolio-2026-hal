/**
 * Unit tests for check-lines.js
 * Tests allowlist baseline enforcement and non-allowlisted 250-line cap.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('check-lines.js', () => {
  let testDir
  let originalCwd

  beforeEach(() => {
    // Create a temporary test directory
    testDir = fs.mkdtempSync(path.join(__dirname, 'test-check-lines-'))
    originalCwd = process.cwd()
    process.chdir(testDir)

    // Create source directories
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true })
    fs.mkdirSync(path.join(testDir, 'api'), { recursive: true })
  })

  afterEach(() => {
    // Clean up
    process.chdir(originalCwd)
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
  })

  function createTestFile(relativePath, lineCount) {
    const fullPath = path.join(testDir, relativePath)
    const dir = path.dirname(fullPath)
    fs.mkdirSync(dir, { recursive: true })
    const content = Array(lineCount).fill('// line').join('\n')
    fs.writeFileSync(fullPath, content, 'utf-8')
  }

  function runCheckLines() {
    try {
      // Copy check-lines.js to test directory and modify ROOT_DIR
      const scriptPath = path.join(__dirname, 'check-lines.js')
      const testScriptPath = path.join(testDir, 'check-lines.js')
      let scriptContent = fs.readFileSync(scriptPath, 'utf-8')
      // Replace ROOT_DIR to point to testDir
      scriptContent = scriptContent.replace(
        /const ROOT_DIR = .*$/m,
        `const ROOT_DIR = ${JSON.stringify(testDir)}`
      )
      fs.writeFileSync(testScriptPath, scriptContent, 'utf-8')
      
      // Use execFileSync to avoid quoting issues on Windows paths with spaces.
      const output = execFileSync(process.execPath, [testScriptPath], {
        encoding: 'utf-8',
        cwd: testDir,
      })
      return { output, exitCode: 0 }
    } catch (error) {
      return { 
        output: error.stdout?.toString() || error.message, 
        exitCode: error.status || 1 
      }
    }
  }

  describe('non-allowlisted 250-line cap', () => {
    it('passes when all files are under 250 lines', () => {
      createTestFile('src/file1.ts', 100)
      createTestFile('api/file2.ts', 200)
      
      const result = runCheckLines()
      expect(result.output).toContain('✓ All source files under 250 lines')
      expect(result.exitCode).toBe(0)
    })

    it('reports files exactly at 250 lines as passing', () => {
      createTestFile('src/file1.ts', 250)
      
      const result = runCheckLines()
      expect(result.output).toContain('✓ All source files under 250 lines')
      expect(result.exitCode).toBe(0)
    })

    it('reports files over 250 lines', () => {
      createTestFile('src/file1.ts', 251)
      createTestFile('api/file2.ts', 300)
      
      const result = runCheckLines()
      expect(result.output).toContain('file(s) over limit')
      expect(result.output).toContain('file1.ts')
      expect(result.output).toContain('file2.ts')
      expect(result.output).toContain('251')
      expect(result.output).toContain('300')
      expect(result.exitCode).toBe(0) // Advisory, doesn't block
    })

    it('sorts files by line count descending', () => {
      createTestFile('src/file1.ts', 300)
      createTestFile('api/file2.ts', 400)
      createTestFile('src/file3.ts', 350)
      
      const result = runCheckLines()
      const lines = result.output.split('\n')
      const file2Index = lines.findIndex(l => l.includes('file2.ts'))
      const file3Index = lines.findIndex(l => l.includes('file3.ts'))
      const file1Index = lines.findIndex(l => l.includes('file1.ts'))
      
      // file2 (400) should come before file3 (350) which should come before file1 (300)
      expect(file2Index).toBeLessThan(file3Index)
      expect(file3Index).toBeLessThan(file1Index)
    })
  })

  describe('allowlist baseline enforcement', () => {
    it('allows allowlisted files to exceed 250 lines if under baseline', () => {
      createTestFile('src/file1.ts', 300)
      createTestFile('src/file2.ts', 400)
      
      // Create allowlist with baseline of 500 for file1
      const allowlist = {
        'src/file1.ts': 500
      }
      fs.writeFileSync(
        path.join(testDir, '.line-limit-allowlist.json'),
        JSON.stringify(allowlist, null, 2),
        'utf-8'
      )
      
      const result = runCheckLines()
      // file1.ts should not be reported (under baseline)
      // file2.ts should be reported (not in allowlist, over 250)
      expect(result.output).toContain('file2.ts')
      expect(result.output).not.toContain('file1.ts')
    })

    it('reports allowlisted files that exceed their baseline', () => {
      createTestFile('src/file1.ts', 600)
      
      // Create allowlist with baseline of 500 for file1
      const allowlist = {
        'src/file1.ts': 500
      }
      fs.writeFileSync(
        path.join(testDir, '.line-limit-allowlist.json'),
        JSON.stringify(allowlist, null, 2),
        'utf-8'
      )
      
      const result = runCheckLines()
      expect(result.output).toContain('file(s) over limit')
      expect(result.output).toContain('file1.ts')
      expect(result.output).toContain('600')
      expect(result.output).toContain('500') // baseline should be shown
    })

    it('allows allowlisted files exactly at baseline', () => {
      createTestFile('src/file1.ts', 500)
      
      const allowlist = {
        'src/file1.ts': 500
      }
      fs.writeFileSync(
        path.join(testDir, '.line-limit-allowlist.json'),
        JSON.stringify(allowlist, null, 2),
        'utf-8'
      )
      
      const result = runCheckLines()
      expect(result.output).toContain('✓ All source files under 250 lines')
      expect(result.output).not.toContain('file1.ts')
    })

    it('handles multiple allowlisted files with different baselines', () => {
      createTestFile('src/file1.ts', 600) // Over baseline of 500
      createTestFile('api/file2.ts', 400) // Under baseline of 500
      createTestFile('src/file3.ts', 300) // Not allowlisted, over 250
      
      const allowlist = {
        'src/file1.ts': 500,
        'api/file2.ts': 500
      }
      fs.writeFileSync(
        path.join(testDir, '.line-limit-allowlist.json'),
        JSON.stringify(allowlist, null, 2),
        'utf-8'
      )
      
      const result = runCheckLines()
      expect(result.output).toContain('file(s) over limit')
      expect(result.output).toContain('file1.ts') // Over baseline
      expect(result.output).toContain('file3.ts') // Not allowlisted, over 250
      expect(result.output).not.toContain('file2.ts') // Under baseline
    })

    it('handles missing or invalid allowlist file gracefully', () => {
      createTestFile('src/file1.ts', 300)
      
      // No allowlist file - should use 250-line cap
      const result = runCheckLines()
      expect(result.output).toContain('file1.ts')
    })

    it('handles malformed allowlist JSON gracefully', () => {
      createTestFile('src/file1.ts', 300)
      
      // Create invalid JSON
      fs.writeFileSync(
        path.join(testDir, '.line-limit-allowlist.json'),
        '{ invalid json }',
        'utf-8'
      )
      
      // Should fall back to 250-line cap
      const result = runCheckLines()
      expect(result.output).toContain('file1.ts')
    })
  })

  describe('file discovery and filtering', () => {
    it('only checks source file extensions', () => {
      createTestFile('src/file1.ts', 300)
      createTestFile('src/file2.txt', 300) // Not a source file
      
      const result = runCheckLines()
      expect(result.output).toContain('file1.ts')
      expect(result.output).not.toContain('file2.txt')
    })

    it('excludes node_modules and other excluded directories', () => {
      createTestFile('src/file1.ts', 300)
      createTestFile('node_modules/vendor/file.ts', 300)
      createTestFile('dist/file.ts', 300)
      
      const result = runCheckLines()
      expect(result.output).toContain('file1.ts')
      expect(result.output).not.toContain('node_modules')
      expect(result.output).not.toContain('dist')
    })
  })
})
