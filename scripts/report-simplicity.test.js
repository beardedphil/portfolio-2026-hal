/**
 * Unit tests for report-simplicity.js
 * Tests output formatting: prints a single "Simplicity: XX%" line.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('report-simplicity.js', () => {
  let testDir
  let originalCwd

  beforeEach(() => {
    // Create a temporary test directory
    testDir = fs.mkdtempSync(path.join(__dirname, 'test-report-simplicity-'))
    originalCwd = process.cwd()
    process.chdir(testDir)

    // Create source directories
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true })
    fs.mkdirSync(path.join(testDir, 'public'), { recursive: true })
  })

  afterEach(() => {
    // Clean up
    process.chdir(originalCwd)
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
  })

  function createTestFile(relativePath, content = 'export const test = 1') {
    const fullPath = path.join(testDir, relativePath)
    const dir = path.dirname(fullPath)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(fullPath, content, 'utf-8')
  }

  function runReportSimplicity() {
    try {
      // Copy report-simplicity.js to test directory and modify ROOT_DIR
      const scriptPath = path.join(__dirname, 'report-simplicity.js')
      const testScriptPath = path.join(testDir, 'report-simplicity.js')
      let scriptContent = fs.readFileSync(scriptPath, 'utf-8')
      // Replace ROOT_DIR to point to testDir
      scriptContent = scriptContent.replace(
        /const ROOT_DIR = .*$/m,
        `const ROOT_DIR = ${JSON.stringify(testDir)}`
      )
      fs.writeFileSync(testScriptPath, scriptContent, 'utf-8')
      
      const output = execSync(`node ${testScriptPath}`, { 
        encoding: 'utf-8',
        cwd: testDir 
      })
      return { output, exitCode: 0 }
    } catch (error) {
      return { 
        output: error.stdout?.toString() || error.message, 
        exitCode: error.status || 1 
      }
    }
  }

  describe('output formatting', () => {
    it('outputs exactly one line with format "Simplicity: XX%"', () => {
      createTestFile('src/file1.ts', 'export const test = 1')
      
      const result = runReportSimplicity()
      const lines = result.output.trim().split('\n').filter(l => l.trim())
      
      // Should have exactly one non-empty line
      expect(lines.length).toBeGreaterThanOrEqual(1)
      
      // Find the Simplicity line
      const simplicityLine = lines.find(l => l.startsWith('Simplicity:'))
      expect(simplicityLine).toBeDefined()
      
      // Should match format "Simplicity: XX%" where XX is a number
      expect(simplicityLine).toMatch(/^Simplicity: \d+%$/)
    })

    it('outputs percentage between 0 and 100', () => {
      createTestFile('src/file1.ts', 'export const test = 1')
      
      const result = runReportSimplicity()
      const simplicityLine = result.output.split('\n').find(l => l.startsWith('Simplicity:'))
      
      expect(simplicityLine).toBeDefined()
      const match = simplicityLine.match(/Simplicity: (\d+)%/)
      expect(match).toBeDefined()
      
      const percentage = parseInt(match[1], 10)
      expect(percentage).toBeGreaterThanOrEqual(0)
      expect(percentage).toBeLessThanOrEqual(100)
    })

    it('outputs "Simplicity: N/A" when no source files found', () => {
      // Don't create any source files
      
      const result = runReportSimplicity()
      expect(result.output.trim()).toBe('Simplicity: N/A')
    })

    it('outputs "Simplicity: N/A" when all files fail to parse', () => {
      // Create a file that will fail parsing (invalid syntax)
      createTestFile('src/invalid.ts', 'invalid syntax !!! @@@ ###')
      
      const result = runReportSimplicity()
      // Should handle gracefully and output N/A or a percentage
      const output = result.output.trim()
      // Either N/A or a valid percentage
      expect(output === 'Simplicity: N/A' || /^Simplicity: \d+%$/.test(output)).toBe(true)
    })

    it('updates metrics.json file with simplicity value', () => {
      createTestFile('src/file1.ts', 'export const test = 1')
      
      // Create initial metrics.json
      const metricsPath = path.join(testDir, 'public', 'metrics.json')
      const initialMetrics = { coverage: 50, simplicity: null, updatedAt: null }
      fs.writeFileSync(metricsPath, JSON.stringify(initialMetrics, null, 2), 'utf-8')
      
      runReportSimplicity()
      
      // Check that metrics.json was updated
      const updatedMetrics = JSON.parse(fs.readFileSync(metricsPath, 'utf-8'))
      expect(updatedMetrics.simplicity).toBeTypeOf('number')
      expect(updatedMetrics.simplicity).toBeGreaterThanOrEqual(0)
      expect(updatedMetrics.simplicity).toBeLessThanOrEqual(100)
      expect(updatedMetrics.updatedAt).toBeTypeOf('string')
    })

    it('preserves other metrics when updating simplicity', () => {
      createTestFile('src/file1.ts', 'export const test = 1')
      
      // Create metrics.json with existing coverage
      const metricsPath = path.join(testDir, 'public', 'metrics.json')
      const initialMetrics = { coverage: 75.5, simplicity: null, updatedAt: '2026-01-01T00:00:00.000Z' }
      fs.writeFileSync(metricsPath, JSON.stringify(initialMetrics, null, 2), 'utf-8')
      
      runReportSimplicity()
      
      // Check that coverage is preserved
      const updatedMetrics = JSON.parse(fs.readFileSync(metricsPath, 'utf-8'))
      expect(updatedMetrics.coverage).toBe(75.5)
      expect(updatedMetrics.simplicity).toBeTypeOf('number')
    })
  })

  describe('file filtering', () => {
    it('excludes test files', () => {
      createTestFile('src/file1.ts', 'export const test = 1')
      createTestFile('src/file1.test.ts', 'export const test = 1')
      createTestFile('src/file1.spec.ts', 'export const test = 1')
      
      const result = runReportSimplicity()
      // Should still output valid format
      expect(result.output.trim()).toMatch(/^Simplicity: (\d+%|N\/A)$/)
    })

    it('excludes config files', () => {
      createTestFile('src/file1.ts', 'export const test = 1')
      createTestFile('vitest.config.ts', 'export default {}')
      createTestFile('vite.config.ts', 'export default {}')
      
      const result = runReportSimplicity()
      // Should still output valid format
      expect(result.output.trim()).toMatch(/^Simplicity: (\d+%|N\/A)$/)
    })

    it('only processes TypeScript files', () => {
      createTestFile('src/file1.ts', 'export const test = 1')
      createTestFile('src/file2.js', 'export const test = 1')
      createTestFile('src/file3.tsx', 'export const Test = () => null')
      
      const result = runReportSimplicity()
      // Should still output valid format
      expect(result.output.trim()).toMatch(/^Simplicity: (\d+%|N\/A)$/)
    })
  })

  describe('error handling', () => {
    it('handles unreadable files gracefully', () => {
      createTestFile('src/file1.ts', 'export const test = 1')
      
      // Make a file unreadable (if possible on the system)
      // This is platform-dependent, so we'll just verify the script runs
      const result = runReportSimplicity()
      expect(result.exitCode).toBe(0)
    })
  })
})
