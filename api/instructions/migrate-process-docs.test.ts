/**
 * Unit tests for migrate-process-docs.ts
 * Tests the core functions: determineAgentTypes, determineInstructionType, parseProcessDoc, and findProcessDocs
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  determineAgentTypes,
  determineInstructionType,
  parseProcessDoc,
  findProcessDocs,
} from './migrate-process-docs.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('determineAgentTypes', () => {
  it('identifies "all agents" from content with "all agent" text', () => {
    const result = determineAgentTypes('test.md', 'This applies to all agents in the system.')
    expect(result).toContain('all')
  })

  it('identifies "all agents" from content with "all agents" text', () => {
    const result = determineAgentTypes('test.md', 'This applies to all agents.')
    expect(result).toContain('all')
  })

  it('identifies "all agents" from filename with hal-tool-call-contract', () => {
    const result = determineAgentTypes('hal-tool-call-contract.mdc', 'Some content')
    expect(result).toContain('all')
  })

  it('identifies "all agents" from filename with agent-supabase-api-paradigm', () => {
    const result = determineAgentTypes('agent-supabase-api-paradigm.md', 'Some content')
    expect(result).toContain('all')
  })

  it('identifies "all agents" from filename with single-source-agents', () => {
    const result = determineAgentTypes('single-source-agents.md', 'Some content')
    expect(result).toContain('all')
  })

  it('identifies PM agent from content with "pm agent" text', () => {
    const result = determineAgentTypes('test.md', 'This is for PM agent use only.')
    expect(result).toContain('project-manager')
  })

  it('identifies PM agent from content with "project manager" text', () => {
    const result = determineAgentTypes('test.md', 'This is for project manager use.')
    expect(result).toContain('project-manager')
  })

  it('identifies PM agent from filename with pm-handoff', () => {
    const result = determineAgentTypes('pm-handoff.md', 'Some content')
    expect(result).toContain('project-manager')
  })

  it('identifies PM agent from filename with ready-to-start-checklist', () => {
    const result = determineAgentTypes('ready-to-start-checklist.md', 'Some content')
    expect(result).toContain('project-manager')
  })

  it('identifies QA agent from content with "qa agent" text', () => {
    const result = determineAgentTypes('test.md', 'This is for QA agent use.')
    expect(result).toContain('qa-agent')
  })

  it('identifies QA agent from filename with qa-agent', () => {
    const result = determineAgentTypes('qa-agent-rules.md', 'QA rules')
    expect(result).toContain('qa-agent')
  })

  it('identifies QA agent from filename with ticket-verification-rules', () => {
    const result = determineAgentTypes('ticket-verification-rules.md', 'Some content')
    expect(result).toContain('qa-agent')
  })

  it('identifies implementation agent from content', () => {
    const result = determineAgentTypes('test.md', 'This is for implementation agent use.')
    expect(result).toContain('implementation-agent')
  })

  it('identifies implementation agent from filename with implementation', () => {
    const result = determineAgentTypes('implementation-guide.md', 'Some content')
    expect(result).toContain('implementation-agent')
  })

  it('identifies process-review agent from content', () => {
    const result = determineAgentTypes('test.md', 'This is for process review use.')
    expect(result).toContain('process-review-agent')
  })

  it('identifies process-review agent from filename', () => {
    const result = determineAgentTypes('process-review-guide.md', 'Some content')
    expect(result).toContain('process-review-agent')
  })

  it('defaults to "all" when no specific agent types found', () => {
    const result = determineAgentTypes('generic-doc.md', 'Generic documentation without agent-specific content.')
    expect(result).toEqual(['all'])
  })

  it('can identify multiple agent types', () => {
    const result = determineAgentTypes('test.md', 'This applies to all agents and PM agent use.')
    expect(result).toContain('all')
    expect(result).toContain('project-manager')
  })
})

describe('determineInstructionType', () => {
  it('identifies basic instruction from hal-tool-call-contract filename', () => {
    const result = determineInstructionType('hal-tool-call-contract.mdc', 'Contract content')
    expect(result.isBasic).toBe(true)
    expect(result.isSituational).toBe(false)
  })

  it('identifies basic instruction from agent-supabase-api-paradigm filename', () => {
    const result = determineInstructionType('agent-supabase-api-paradigm.md', 'Some content')
    expect(result.isBasic).toBe(true)
    expect(result.isSituational).toBe(false)
  })

  it('identifies basic instruction from ready-to-start-checklist filename', () => {
    const result = determineInstructionType('ready-to-start-checklist.md', 'Some content')
    expect(result.isBasic).toBe(true)
    expect(result.isSituational).toBe(false)
  })

  it('identifies situational instruction from migration filename', () => {
    const result = determineInstructionType('migration-procedure.md', 'Migration steps')
    expect(result.isBasic).toBe(false)
    expect(result.isSituational).toBe(true)
  })

  it('identifies situational instruction from staging-test filename', () => {
    const result = determineInstructionType('staging-test-guide.md', 'Some content')
    expect(result.isBasic).toBe(false)
    expect(result.isSituational).toBe(true)
  })

  it('identifies situational instruction from smoke-test filename', () => {
    const result = determineInstructionType('smoke-test-procedure.md', 'Some content')
    expect(result.isBasic).toBe(false)
    expect(result.isSituational).toBe(true)
  })

  it('identifies situational instruction from procedure filename', () => {
    const result = determineInstructionType('some-procedure.md', 'Some content')
    expect(result.isBasic).toBe(false)
    expect(result.isSituational).toBe(true)
  })

  it('defaults to basic for core process docs', () => {
    const result = determineInstructionType('core-process.md', 'Core process documentation')
    expect(result.isBasic).toBe(true)
    expect(result.isSituational).toBe(false)
  })
})

describe('parseProcessDoc', () => {
  let tempDir: string
  let tempProcessDocsDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(__dirname, 'test-'))
    tempProcessDocsDir = path.join(tempDir, 'docs', 'process')
    fs.mkdirSync(tempProcessDocsDir, { recursive: true })
  })

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('extracts title from first heading', () => {
    const filename = 'test.md'
    const content = '# My Title\n\nSome content here.'
    const filePath = path.join(tempProcessDocsDir, filename)
    fs.writeFileSync(filePath, content)

    const result = parseProcessDoc(filePath, content, tempProcessDocsDir)
    expect(result.title).toBe('My Title')
    expect(result.filename).toBe(filename)
  })

  it('extracts title from filename when no heading', () => {
    const filename = 'my-test-doc.md'
    const content = 'Some content without heading.'
    const filePath = path.join(tempProcessDocsDir, filename)
    fs.writeFileSync(filePath, content)

    const result = parseProcessDoc(filePath, content, tempProcessDocsDir)
    expect(result.title).toBe('my test doc')
  })

  it('extracts description from frontmatter', () => {
    const filename = 'test.md'
    const content = `---
description: "This is a test description"
---
# Title

Content here.`
    const filePath = path.join(tempProcessDocsDir, filename)
    fs.writeFileSync(filePath, content)

    const result = parseProcessDoc(filePath, content, tempProcessDocsDir)
    expect(result.description).toBe('This is a test description')
  })

  it('extracts description from first paragraph when no frontmatter', () => {
    const filename = 'test.md'
    const content = '# Title\n\nThis is the first paragraph with description.'
    const filePath = path.join(tempProcessDocsDir, filename)
    fs.writeFileSync(filePath, content)

    const result = parseProcessDoc(filePath, content, tempProcessDocsDir)
    expect(result.description).toBe('This is the first paragraph with description.')
  })

  it('defaults to "No description" when no description found', () => {
    const filename = 'test.md'
    const content = '# Title\n\n'
    const filePath = path.join(tempProcessDocsDir, filename)
    fs.writeFileSync(filePath, content)

    const result = parseProcessDoc(filePath, content, tempProcessDocsDir)
    expect(result.description).toBe('No description')
  })

  it('generates topic ID from filename', () => {
    const filename = 'my-test-doc.md'
    const content = '# Title\n\nContent'
    const filePath = path.join(tempProcessDocsDir, filename)
    fs.writeFileSync(filePath, content)

    const result = parseProcessDoc(filePath, content, tempProcessDocsDir)
    expect(result.topicId).toBe('my-test-doc')
  })

  it('handles subdirectory in topic ID', () => {
    const subDir = path.join(tempProcessDocsDir, 'subdir')
    fs.mkdirSync(subDir, { recursive: true })

    const filename = 'doc.md'
    const content = '# Title\n\nContent'
    const filePath = path.join(subDir, filename)
    fs.writeFileSync(filePath, content)

    const result = parseProcessDoc(filePath, content, tempProcessDocsDir)
    expect(result.topicId).toBe('subdir-doc')
    expect(result.originalPath).toBe('subdir/doc.md')
  })

  it('normalizes topic ID to lowercase with hyphens', () => {
    const filename = 'My_Test_Doc.md'
    const content = '# Title\n\nContent'
    const filePath = path.join(tempProcessDocsDir, filename)
    fs.writeFileSync(filePath, content)

    const result = parseProcessDoc(filePath, content, tempProcessDocsDir)
    expect(result.topicId).toBe('my-test-doc')
  })

  it('includes agent types in result', () => {
    const filename = 'pm-handoff.md'
    const content = '# PM Handoff\n\nContent for PM agents.'
    const filePath = path.join(tempProcessDocsDir, filename)
    fs.writeFileSync(filePath, content)

    const result = parseProcessDoc(filePath, content, tempProcessDocsDir)
    expect(result.agentTypes).toContain('project-manager')
  })

  it('includes instruction type in result', () => {
    const filename = 'migration-procedure.md'
    const content = '# Migration\n\nMigration steps.'
    const filePath = path.join(tempProcessDocsDir, filename)
    fs.writeFileSync(filePath, content)

    const result = parseProcessDoc(filePath, content, tempProcessDocsDir)
    expect(result.isBasic).toBe(false)
    expect(result.isSituational).toBe(true)
  })
})

describe('findProcessDocs', () => {
  let tempDir: string
  let tempProcessDocsDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(__dirname, 'test-'))
    tempProcessDocsDir = path.join(tempDir, 'docs', 'process')
    fs.mkdirSync(tempProcessDocsDir, { recursive: true })
  })

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('finds markdown files in process docs directory', () => {
    fs.writeFileSync(path.join(tempProcessDocsDir, 'doc1.md'), '# Doc 1')
    fs.writeFileSync(path.join(tempProcessDocsDir, 'doc2.mdc'), '# Doc 2')
    fs.writeFileSync(path.join(tempProcessDocsDir, 'readme.txt'), 'Not a markdown file')

    const result = findProcessDocs(tempProcessDocsDir)
    expect(result).toHaveLength(2)
    expect(result.some(p => p.endsWith('doc1.md'))).toBe(true)
    expect(result.some(p => p.endsWith('doc2.mdc'))).toBe(true)
    expect(result.some(p => p.endsWith('readme.txt'))).toBe(false)
  })

  it('recursively finds files in subdirectories', () => {
    const subDir = path.join(tempProcessDocsDir, 'subdir')
    fs.mkdirSync(subDir, { recursive: true })

    fs.writeFileSync(path.join(tempProcessDocsDir, 'root.md'), '# Root')
    fs.writeFileSync(path.join(subDir, 'sub.md'), '# Sub')

    const result = findProcessDocs(tempProcessDocsDir)
    expect(result).toHaveLength(2)
    expect(result.some(p => p.endsWith('root.md'))).toBe(true)
    expect(result.some(p => p.endsWith('sub.md'))).toBe(true)
  })

  it('skips supabase-migrations subdirectory', () => {
    const migrationsDir = path.join(tempProcessDocsDir, 'supabase-migrations')
    fs.mkdirSync(migrationsDir, { recursive: true })

    fs.writeFileSync(path.join(tempProcessDocsDir, 'doc.md'), '# Doc')
    fs.writeFileSync(path.join(migrationsDir, 'migration.sql'), 'SQL content')
    fs.writeFileSync(path.join(migrationsDir, 'migration.md'), '# Migration')

    const result = findProcessDocs(tempProcessDocsDir)
    expect(result).toHaveLength(1)
    expect(result.some(p => p.endsWith('doc.md'))).toBe(true)
    expect(result.some(p => p.includes('supabase-migrations'))).toBe(false)
  })

  it('returns empty array for empty directory', () => {
    const result = findProcessDocs(tempProcessDocsDir)
    expect(result).toEqual([])
  })
})
