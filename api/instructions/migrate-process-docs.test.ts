/**
 * Unit tests for migrate-process-docs.ts
 * Tests the core functions for parsing and processing documentation files.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  determineAgentTypes,
  determineInstructionType,
  parseProcessDoc,
  findProcessDocs,
} from './migrate-process-docs'

describe('determineAgentTypes', () => {
  it('identifies "all" agent type from content indicators', () => {
    expect(determineAgentTypes('test.md', 'This applies to all agents')).toContain('all')
    expect(determineAgentTypes('test.md', 'This applies to all agent types')).toContain('all')
  })

  it('identifies "all" agent type from filename indicators', () => {
    expect(determineAgentTypes('hal-tool-call-contract.md', 'Some content')).toContain('all')
    expect(determineAgentTypes('agent-supabase-api-paradigm.md', 'Some content')).toContain('all')
    expect(determineAgentTypes('single-source-agents.md', 'Some content')).toContain('all')
  })

  it('identifies project-manager agent type from content', () => {
    expect(determineAgentTypes('test.md', 'This is for pm agent')).toContain('project-manager')
    expect(determineAgentTypes('test.md', 'This is for project manager')).toContain('project-manager')
    expect(determineAgentTypes('test.md', 'This is for project-manager')).toContain('project-manager')
  })

  it('identifies project-manager agent type from filename', () => {
    expect(determineAgentTypes('pm-handoff.md', 'Some content')).toContain('project-manager')
    expect(determineAgentTypes('ready-to-start-checklist.md', 'Some content')).toContain('project-manager')
  })

  it('identifies qa-agent type from content', () => {
    expect(determineAgentTypes('test.md', 'This is for qa agent')).toContain('qa-agent')
    expect(determineAgentTypes('test.md', 'This is for qa-agent')).toContain('qa-agent')
  })

  it('identifies qa-agent type from filename', () => {
    expect(determineAgentTypes('qa-agent.md', 'Some content')).toContain('qa-agent')
    expect(determineAgentTypes('ticket-verification-rules.md', 'Some content')).toContain('qa-agent')
  })

  it('identifies implementation-agent type from content', () => {
    expect(determineAgentTypes('test.md', 'This is for implementation agent')).toContain('implementation-agent')
    expect(determineAgentTypes('test.md', 'This is for implementation-agent')).toContain('implementation-agent')
  })

  it('identifies implementation-agent type from filename', () => {
    expect(determineAgentTypes('implementation.md', 'Some content')).toContain('implementation-agent')
  })

  it('identifies process-review-agent type from content', () => {
    expect(determineAgentTypes('test.md', 'This is for process review')).toContain('process-review-agent')
    expect(determineAgentTypes('test.md', 'This is for process-review')).toContain('process-review-agent')
  })

  it('identifies process-review-agent type from filename', () => {
    expect(determineAgentTypes('process-review.md', 'Some content')).toContain('process-review-agent')
  })

  it('defaults to "all" when no specific agent types are found', () => {
    const result = determineAgentTypes('generic-doc.md', 'Some generic content without agent indicators')
    expect(result).toEqual(['all'])
  })

  it('can identify multiple agent types', () => {
    const result = determineAgentTypes(
      'pm-handoff.md',
      'This is for pm agent and also mentions qa agent'
    )
    expect(result).toContain('project-manager')
    expect(result).toContain('qa-agent')
  })

  it('is case-insensitive', () => {
    expect(determineAgentTypes('TEST.md', 'PM AGENT CONTENT')).toContain('project-manager')
    expect(determineAgentTypes('test.md', 'PM Agent Content')).toContain('project-manager')
  })
})

describe('determineInstructionType', () => {
  it('identifies basic instruction from filename', () => {
    expect(determineInstructionType('hal-tool-call-contract.md', '')).toEqual({
      isBasic: true,
      isSituational: false,
    })
    expect(determineInstructionType('agent-supabase-api-paradigm.md', '')).toEqual({
      isBasic: true,
      isSituational: false,
    })
    expect(determineInstructionType('ready-to-start-checklist.md', '')).toEqual({
      isBasic: true,
      isSituational: false,
    })
    expect(determineInstructionType('ticket-verification-rules.md', '')).toEqual({
      isBasic: true,
      isSituational: false,
    })
    expect(determineInstructionType('single-source-agents.md', '')).toEqual({
      isBasic: true,
      isSituational: false,
    })
  })

  it('identifies situational instruction from filename', () => {
    expect(determineInstructionType('staging-test.md', '')).toEqual({
      isBasic: false,
      isSituational: true,
    })
    expect(determineInstructionType('smoke-test.md', '')).toEqual({
      isBasic: false,
      isSituational: true,
    })
    expect(determineInstructionType('migration.md', '')).toEqual({
      isBasic: false,
      isSituational: true,
    })
    expect(determineInstructionType('procedure.md', '')).toEqual({
      isBasic: false,
      isSituational: true,
    })
  })

  it('defaults to basic for core process docs', () => {
    expect(determineInstructionType('generic-doc.md', 'Some content')).toEqual({
      isBasic: true,
      isSituational: false,
    })
  })

  it('is case-insensitive', () => {
    expect(determineInstructionType('STAGING-TEST.md', '')).toEqual({
      isBasic: false,
      isSituational: true,
    })
    expect(determineInstructionType('HAL-TOOL-CALL-CONTRACT.md', '')).toEqual({
      isBasic: true,
      isSituational: false,
    })
  })
})

describe('parseProcessDoc', () => {
  const processDocsDir = '/test/docs/process'

  it('extracts title from first heading', () => {
    const content = '# My Document Title\n\nSome content here'
    const result = parseProcessDoc('/test/docs/process/test.md', content, processDocsDir)
    expect(result.title).toBe('My Document Title')
  })

  it('falls back to filename when no heading found', () => {
    const content = 'No heading here, just content'
    const result = parseProcessDoc('/test/docs/process/my-document.md', content, processDocsDir)
    expect(result.title).toBe('my document')
  })

  it('extracts description from frontmatter', () => {
    const content = `---
description: This is a test description
---

# Title
Content here`
    const result = parseProcessDoc('/test/docs/process/test.md', content, processDocsDir)
    expect(result.description).toBe('This is a test description')
  })

  it('extracts description from first paragraph when no frontmatter', () => {
    const content = `# Title

This is the first paragraph that should be used as description.

More content here.`
    const result = parseProcessDoc('/test/docs/process/test.md', content, processDocsDir)
    expect(result.description).toBe('This is the first paragraph that should be used as description.')
  })

  it('defaults description to "No description" when not found', () => {
    const content = '# Title\n\n\nMore content'
    const result = parseProcessDoc('/test/docs/process/test.md', content, processDocsDir)
    expect(result.description).toBe('No description')
  })

  it('generates topic ID from filename', () => {
    const content = '# Test Document'
    const result = parseProcessDoc('/test/docs/process/test-doc.md', content, processDocsDir)
    expect(result.topicId).toBe('test-doc')
  })

  it('generates topic ID with subdirectory prefix when in subdirectory', () => {
    const content = '# Test Document'
    const result = parseProcessDoc('/test/docs/process/subdir/test-doc.md', content, processDocsDir)
    expect(result.topicId).toBe('subdir-test-doc')
  })

  it('sanitizes topic ID to lowercase alphanumeric with hyphens', () => {
    const content = '# Test Document'
    const result = parseProcessDoc('/test/docs/process/Test_Doc@123.md', content, processDocsDir)
    expect(result.topicId).toBe('test-doc-123')
  })

  it('preserves original path relative to process docs directory', () => {
    const content = '# Test Document'
    const result = parseProcessDoc('/test/docs/process/subdir/test.md', content, processDocsDir)
    expect(result.originalPath).toBe('subdir/test.md')
  })

  it('includes full content in contentMd and contentBody', () => {
    const content = '# Test Document\n\nSome content here'
    const result = parseProcessDoc('/test/docs/process/test.md', content, processDocsDir)
    expect(result.contentMd).toBe(content)
    expect(result.contentBody).toBe(content)
  })

  it('determines agent types and instruction type', () => {
    const content = '# PM Agent Document\n\nThis is for pm agent'
    const result = parseProcessDoc('/test/docs/process/pm-doc.md', content, processDocsDir)
    expect(result.agentTypes).toContain('project-manager')
    expect(result.isBasic).toBe(true)
    expect(result.isSituational).toBe(false)
  })
})

describe('findProcessDocs', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-process-docs-test-'))
  })

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('finds markdown files in root directory', () => {
    fs.writeFileSync(path.join(tempDir, 'doc1.md'), '# Doc 1')
    fs.writeFileSync(path.join(tempDir, 'doc2.mdc'), '# Doc 2')
    fs.writeFileSync(path.join(tempDir, 'not-a-doc.txt'), 'Not a doc')

    const files = findProcessDocs(tempDir)
    expect(files).toHaveLength(2)
    expect(files.some(f => f.endsWith('doc1.md'))).toBe(true)
    expect(files.some(f => f.endsWith('doc2.mdc'))).toBe(true)
    expect(files.some(f => f.endsWith('not-a-doc.txt'))).toBe(false)
  })

  it('finds markdown files recursively in subdirectories', () => {
    const subDir = path.join(tempDir, 'subdir')
    fs.mkdirSync(subDir, { recursive: true })
    fs.writeFileSync(path.join(tempDir, 'root.md'), '# Root')
    fs.writeFileSync(path.join(subDir, 'sub.md'), '# Sub')

    const files = findProcessDocs(tempDir)
    expect(files).toHaveLength(2)
    expect(files.some(f => f.endsWith('root.md'))).toBe(true)
    expect(files.some(f => f.endsWith('sub.md'))).toBe(true)
  })

  it('skips supabase-migrations subdirectory', () => {
    const migrationsDir = path.join(tempDir, 'supabase-migrations')
    fs.mkdirSync(migrationsDir, { recursive: true })
    fs.writeFileSync(path.join(tempDir, 'root.md'), '# Root')
    fs.writeFileSync(path.join(migrationsDir, 'migration.md'), '# Migration')

    const files = findProcessDocs(tempDir)
    expect(files).toHaveLength(1)
    expect(files.some(f => f.endsWith('root.md'))).toBe(true)
    expect(files.some(f => f.endsWith('migration.md'))).toBe(false)
  })

  it('returns empty array for empty directory', () => {
    const files = findProcessDocs(tempDir)
    expect(files).toEqual([])
  })

  it('handles nested subdirectories', () => {
    const level1 = path.join(tempDir, 'level1')
    const level2 = path.join(level1, 'level2')
    fs.mkdirSync(level2, { recursive: true })
    fs.writeFileSync(path.join(tempDir, 'root.md'), '# Root')
    fs.writeFileSync(path.join(level1, 'level1.md'), '# Level 1')
    fs.writeFileSync(path.join(level2, 'level2.md'), '# Level 2')

    const files = findProcessDocs(tempDir)
    expect(files).toHaveLength(3)
  })
})
