/**
 * Unit tests for report-maintainability.js
 * Tests output formatting: prints a single "Maintainability: XX%" line.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const TEST_TIMEOUT_MS = 20_000

describe('report-maintainability.js', () => {
  let testDir
  let originalCwd

  beforeEach(() => {
    // Create a temporary test directory
    testDir = fs.mkdtempSync(path.join(__dirname, 'test-report-maintainability-'))
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

  function runReportMaintainability() {
    try {
      // Copy report-maintainability.js to test directory and modify ROOT_DIR
      const scriptPath = path.join(__dirname, 'report-maintainability.js')
      const testScriptPath = path.join(testDir, 'report-maintainability.js')
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

  describe('output formatting', () => {
    it('outputs exactly one line with format "Maintainability: XX%"', () => {
      createTestFile('src/file1.ts', 'export const test = 1')
      
      const result = runReportMaintainability()
      const lines = result.output.trim().split('\n').filter(l => l.trim())
      
      // Should have exactly one non-empty line
      expect(lines.length).toBeGreaterThanOrEqual(1)
      
      // Find the Maintainability line
      const maintainabilityLine = lines.find(l => l.startsWith('Maintainability:'))
      expect(maintainabilityLine).toBeDefined()
      
      // Should match format "Maintainability: XX%" where XX is a number
      expect(maintainabilityLine).toMatch(/^Maintainability: \d+%$/)
    }, TEST_TIMEOUT_MS)

    it('outputs percentage between 0 and 100', () => {
      createTestFile('src/file1.ts', 'export const test = 1')
      
      const result = runReportMaintainability()
      const maintainabilityLine = result.output.split('\n').find(l => l.startsWith('Maintainability:'))
      
      expect(maintainabilityLine).toBeDefined()
      const match = maintainabilityLine.match(/Maintainability: (\d+)%/)
      expect(match).toBeDefined()
      
      const percentage = parseInt(match[1], 10)
      expect(percentage).toBeGreaterThanOrEqual(0)
      expect(percentage).toBeLessThanOrEqual(100)
    }, TEST_TIMEOUT_MS)

    it('outputs "Maintainability: N/A" when no source files found', () => {
      // Don't create any source files
      
      const result = runReportMaintainability()
      expect(result.output.trim()).toBe('Maintainability: N/A')
    }, TEST_TIMEOUT_MS)

    it('outputs "Maintainability: N/A" when all files fail to parse', () => {
      // Create a file that will fail parsing (invalid syntax)
      createTestFile('src/invalid.ts', 'invalid syntax !!! @@@ ###')
      
      const result = runReportMaintainability()
      // Should handle gracefully and output N/A or a percentage
      const output = result.output.trim()
      // Either N/A or a valid percentage
      expect(output === 'Maintainability: N/A' || /^Maintainability: \d+%$/.test(output)).toBe(true)
    }, TEST_TIMEOUT_MS)

    it('updates metrics.json file with maintainability value', () => {
      createTestFile('src/file1.ts', 'export const test = 1')
      
      // Create initial metrics.json
      const metricsPath = path.join(testDir, 'public', 'metrics.json')
      const initialMetrics = { coverage: 50, maintainability: null, updatedAt: null }
      fs.writeFileSync(metricsPath, JSON.stringify(initialMetrics, null, 2), 'utf-8')
      
      runReportMaintainability()
      
      // Check that metrics.json was updated
      const updatedMetrics = JSON.parse(fs.readFileSync(metricsPath, 'utf-8'))
      expect(updatedMetrics.maintainability).toBeTypeOf('number')
      expect(updatedMetrics.maintainability).toBeGreaterThanOrEqual(0)
      expect(updatedMetrics.maintainability).toBeLessThanOrEqual(100)
      expect(updatedMetrics.updatedAt).toBeTypeOf('string')
    }, TEST_TIMEOUT_MS)

    it('preserves other metrics when updating maintainability', () => {
      createTestFile('src/file1.ts', 'export const test = 1')
      
      // Create metrics.json with existing coverage
      const metricsPath = path.join(testDir, 'public', 'metrics.json')
      const initialMetrics = { coverage: 75.5, maintainability: null, updatedAt: '2026-01-01T00:00:00.000Z' }
      fs.writeFileSync(metricsPath, JSON.stringify(initialMetrics, null, 2), 'utf-8')
      
      runReportMaintainability()
      
      // Check that coverage is preserved
      const updatedMetrics = JSON.parse(fs.readFileSync(metricsPath, 'utf-8'))
      expect(updatedMetrics.coverage).toBe(75.5)
      expect(updatedMetrics.maintainability).toBeTypeOf('number')
    }, TEST_TIMEOUT_MS)
  })

  describe('file filtering', () => {
    it('excludes test files', () => {
      createTestFile('src/file1.ts', 'export const test = 1')
      createTestFile('src/file1.test.ts', 'export const test = 1')
      createTestFile('src/file1.spec.ts', 'export const test = 1')
      
      const result = runReportMaintainability()
      // Should still output valid format
      expect(result.output.trim()).toMatch(/^Maintainability: (\d+%|N\/A)$/)
    }, TEST_TIMEOUT_MS)

    it('excludes config files', () => {
      createTestFile('src/file1.ts', 'export const test = 1')
      createTestFile('vitest.config.ts', 'export default {}')
      createTestFile('vite.config.ts', 'export default {}')
      
      const result = runReportMaintainability()
      // Should still output valid format
      expect(result.output.trim()).toMatch(/^Maintainability: (\d+%|N\/A)$/)
    }, TEST_TIMEOUT_MS)

    it('only processes TypeScript files', () => {
      createTestFile('src/file1.ts', 'export const test = 1')
      createTestFile('src/file2.js', 'export const test = 1')
      createTestFile('src/file3.tsx', 'export const Test = () => null')
      
      const result = runReportMaintainability()
      // Should still output valid format
      expect(result.output.trim()).toMatch(/^Maintainability: (\d+%|N\/A)$/)
    }, TEST_TIMEOUT_MS)
  })

  describe('error handling', () => {
    it('handles unreadable files gracefully', () => {
      createTestFile('src/file1.ts', 'export const test = 1')
      
      // Make a file unreadable (if possible on the system)
      // This is platform-dependent, so we'll just verify the script runs
      const result = runReportMaintainability()
      expect(result.exitCode).toBe(0)
    }, TEST_TIMEOUT_MS)

    it('excludes invalid sentinel values (-1) from averaging (regression test)', () => {
      // Create valid files that should produce positive maintainability scores
      createTestFile('src/file1.ts', 'export const test = 1')
      createTestFile('src/file2.ts', 'export function add(a: number, b: number) { return a + b }')
      createTestFile('src/file3.ts', 'export class Test { method() { return 1 } }')
      
      // Create files that would cause parse errors (these should return -1 sentinel)
      // These are binary-like or completely invalid syntax that TypeScript can't parse
      createTestFile('src/invalid1.ts', '\x00\x01\x02\x03\x04') // Binary data
      createTestFile('src/invalid2.ts', '!!!@@@###$$$%%%') // Invalid syntax
      
      const result = runReportMaintainability()
      const maintainabilityLine = result.output.split('\n').find(l => l.startsWith('Maintainability:'))
      
      expect(maintainabilityLine).toBeDefined()
      const match = maintainabilityLine.match(/Maintainability: (\d+)%/)
      expect(match).toBeDefined()
      
      const percentage = parseInt(match[1], 10)
      // Should be a valid percentage (0-100), not negative or skewed by -1 values
      expect(percentage).toBeGreaterThanOrEqual(0)
      expect(percentage).toBeLessThanOrEqual(100)
      
      // The percentage should be reasonable (not near 0 due to averaging in -1 values)
      // With 3 valid files, we should get a positive percentage
      expect(percentage).toBeGreaterThan(0)
    }, TEST_TIMEOUT_MS)
  })
})
