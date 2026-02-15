import { describe, it, expect } from 'vitest'
import {
  extractTicketId,
  extractFeatureBranch,
  stripQAInformationBlockFromBody,
  checkMergedToMain,
  normalizeTitleLineInBody,
} from './ticketBody'

describe('extractTicketId', () => {
  it('extracts 4-digit ticket ID from valid filename', () => {
    expect(extractTicketId('0009-something.md')).toBe('0009')
    expect(extractTicketId('0123-feature-branch.md')).toBe('0123')
    expect(extractTicketId('9999-ticket.md')).toBe('9999')
  })

  it('returns null for invalid filenames', () => {
    expect(extractTicketId('something.md')).toBeNull()
    expect(extractTicketId('123.md')).toBeNull() // less than 4 digits
    expect(extractTicketId('abc-0009.md')).toBeNull() // doesn't start with digits
    expect(extractTicketId('')).toBeNull()
    expect(extractTicketId('000')).toBeNull() // only 3 digits
  })
})

describe('extractFeatureBranch', () => {
  it('extracts branch name from "**Branch**: `branch-name`" format', () => {
    const body = '**Branch**: `ticket/0009-feature`'
    expect(extractFeatureBranch(body)).toBe('ticket/0009-feature')
  })

  it('extracts branch name from "- **Branch**: `branch-name`" format', () => {
    const body = '- **Branch**: `feature/new-thing`'
    expect(extractFeatureBranch(body)).toBe('feature/new-thing')
  })

  it('extracts branch name when on new line', () => {
    const body = 'Some text\n**Branch**: `ticket/1234`\nMore text'
    expect(extractFeatureBranch(body)).toBe('ticket/1234')
  })

  it('handles case-insensitive matching', () => {
    const body = '**branch**: `test-branch`'
    expect(extractFeatureBranch(body)).toBe('test-branch')
  })

  it('trims whitespace from branch name', () => {
    const body = '**Branch**: `  ticket/0009  `'
    expect(extractFeatureBranch(body)).toBe('ticket/0009')
  })

  it('returns null when branch is not present', () => {
    expect(extractFeatureBranch('Some text without branch')).toBeNull()
    expect(extractFeatureBranch(null)).toBeNull()
    expect(extractFeatureBranch('')).toBeNull()
  })

  it('returns null for malformed branch syntax', () => {
    expect(extractFeatureBranch('**Branch**: branch-name')).toBeNull() // missing backticks
    expect(extractFeatureBranch('Branch: `branch-name`')).toBeNull() // missing **
  })
})

describe('stripQAInformationBlockFromBody', () => {
  it('removes markdown QA heading and content', () => {
    const body = `## Goal

Some goal text.

## QA Information

QA content here.

## Acceptance criteria

- [ ] Item 1`
    const result = stripQAInformationBlockFromBody(body)
    expect(result).not.toContain('QA Information')
    expect(result).not.toContain('QA content here')
    expect(result).toContain('Goal')
    expect(result).toContain('Acceptance criteria')
  })

  it('removes HTML QA div blocks', () => {
    const body = `## Goal

Some text.

<div class="qa-info-section">
  <p>QA information</p>
</div>

## Acceptance criteria

- [ ] Item 1`
    const result = stripQAInformationBlockFromBody(body)
    expect(result).not.toContain('qa-info-section')
    expect(result).not.toContain('QA information')
    expect(result).toContain('Goal')
    expect(result).toContain('Acceptance criteria')
  })

  it('removes nested HTML QA div blocks', () => {
    const body = `<div class="qa-section">
  <div>
    <p>Nested content</p>
  </div>
</div>

## Goal

Some text.`
    const result = stripQAInformationBlockFromBody(body)
    expect(result).not.toContain('qa-section')
    expect(result).not.toContain('Nested content')
    expect(result).toContain('Goal')
  })

  it('removes QA heading variants', () => {
    const body1 = `# QA\nQA content`
    const body2 = `**QA Information**\nQA content`
    const body3 = `<h2>QA Information</h2>\nQA content`

    expect(stripQAInformationBlockFromBody(body1)).not.toContain('QA')
    expect(stripQAInformationBlockFromBody(body2)).not.toContain('QA')
    expect(stripQAInformationBlockFromBody(body3)).not.toContain('QA')
  })

  it('preserves non-QA sections', () => {
    const body = `## Goal

Goal text.

## Acceptance criteria

- [ ] Item 1

## Constraints

Some constraints.`
    const result = stripQAInformationBlockFromBody(body)
    expect(result).toContain('Goal')
    expect(result).toContain('Acceptance criteria')
    expect(result).toContain('Constraints')
  })

  it('stops removing at next section heading', () => {
    const body = `## QA Information

QA content.

## Goal

Goal text.`
    const result = stripQAInformationBlockFromBody(body)
    expect(result).not.toContain('QA Information')
    expect(result).not.toContain('QA content')
    expect(result).toContain('Goal')
    expect(result).toContain('Goal text')
  })

  it('handles empty or null input', () => {
    expect(stripQAInformationBlockFromBody('')).toBe('')
    expect(stripQAInformationBlockFromBody('   ')).toBe('   ')
  })

  it('normalizes multiple newlines', () => {
    const body = `## Goal\n\n\n\n## Acceptance criteria`
    const result = stripQAInformationBlockFromBody(body)
    expect(result).not.toMatch(/\n{3,}/)
  })
})

describe('checkMergedToMain', () => {
  it('detects "Merged to main: Yes" format', () => {
    const body = '**Merged to main**: Yes'
    const result = checkMergedToMain(body)
    expect(result.merged).toBe(true)
  })

  it('detects "Merged to main: ✅" format', () => {
    const body = '**Merged to main**: ✅'
    const result = checkMergedToMain(body)
    expect(result.merged).toBe(true)
  })

  it('detects "- **Merged to main**: Yes" format', () => {
    const body = '- **Merged to main**: Yes'
    const result = checkMergedToMain(body)
    expect(result.merged).toBe(true)
  })

  it('detects "merged to main for qa access" text', () => {
    const body = 'merged to main for qa access'
    const result = checkMergedToMain(body)
    expect(result.merged).toBe(true)
  })

  it('detects "merged to main for cloud qa access" text', () => {
    const body = 'merged to main for cloud qa access'
    const result = checkMergedToMain(body)
    expect(result.merged).toBe(true)
  })

  it('extracts timestamp when present', () => {
    const body = 'Merged to main: Yes on 2024-01-15T10:30:00'
    const result = checkMergedToMain(body)
    expect(result.merged).toBe(true)
    expect(result.timestamp).toBe('2024-01-15T10:30:00')
  })

  it('extracts timestamp in alternative format', () => {
    const body = 'merged to main for qa access on 01/15/2024 10:30:00'
    const result = checkMergedToMain(body)
    expect(result.merged).toBe(true)
    expect(result.timestamp).toMatch(/\d/)
  })

  it('returns false when not merged', () => {
    const body = 'Some other text without merge info'
    const result = checkMergedToMain(body)
    expect(result.merged).toBe(false)
    expect(result.timestamp).toBeNull()
  })

  it('handles null input', () => {
    const result = checkMergedToMain(null)
    expect(result.merged).toBe(false)
    expect(result.timestamp).toBeNull()
  })

  it('handles empty string', () => {
    const result = checkMergedToMain('')
    expect(result.merged).toBe(false)
    expect(result.timestamp).toBeNull()
  })
})

describe('normalizeTitleLineInBody', () => {
  it('adds ID prefix when missing', () => {
    const body = '- **Title**: Some Title'
    const result = normalizeTitleLineInBody(body, '0009')
    expect(result.wasNormalized).toBe(true)
    expect(result.normalized).toBe('- **Title**: 0009 — Some Title')
  })

  it('does not change when correct prefix already exists', () => {
    const body = '- **Title**: 0009 — Some Title'
    const result = normalizeTitleLineInBody(body, '0009')
    expect(result.wasNormalized).toBe(false)
    expect(result.normalized).toBe(body)
  })

  it('removes wrong ID prefix and adds correct one', () => {
    const body = '- **Title**: 0048 — Some Title'
    const result = normalizeTitleLineInBody(body, '0009')
    expect(result.wasNormalized).toBe(true)
    expect(result.normalized).toBe('- **Title**: 0009 — Some Title')
  })

  it('removes HAL- prefix format and adds correct ID', () => {
    const body = '- **Title**: HAL-0048 - Some Title'
    const result = normalizeTitleLineInBody(body, '0009')
    expect(result.wasNormalized).toBe(true)
    expect(result.normalized).toBe('- **Title**: 0009 — Some Title')
  })

  it('handles different dash types', () => {
    const body = '- **Title**: 0048 – Some Title' // en dash
    const result = normalizeTitleLineInBody(body, '0009')
    expect(result.wasNormalized).toBe(true)
    expect(result.normalized).toBe('- **Title**: 0009 — Some Title')
  })

  it('handles hyphen separator', () => {
    const body = '- **Title**: 0048 - Some Title'
    const result = normalizeTitleLineInBody(body, '0009')
    expect(result.wasNormalized).toBe(true)
    expect(result.normalized).toBe('- **Title**: 0009 — Some Title')
  })

  it('preserves newline at end of title line', () => {
    const body = '- **Title**: Some Title\n'
    const result = normalizeTitleLineInBody(body, '0009')
    expect(result.normalized).toMatch(/\n$/)
  })

  it('returns unchanged when no Title line found', () => {
    const body = 'Some text without Title line'
    const result = normalizeTitleLineInBody(body, '0009')
    expect(result.wasNormalized).toBe(false)
    expect(result.normalized).toBe(body)
  })

  it('handles empty body', () => {
    const result = normalizeTitleLineInBody('', '0009')
    expect(result.wasNormalized).toBe(false)
    expect(result.normalized).toBe('')
  })

  it('handles empty ticketId', () => {
    const body = '- **Title**: Some Title'
    const result = normalizeTitleLineInBody(body, '')
    expect(result.wasNormalized).toBe(false)
    expect(result.normalized).toBe(body)
  })

  it('handles null body', () => {
    const result = normalizeTitleLineInBody(null as any, '0009')
    expect(result.wasNormalized).toBe(false)
    expect(result.normalized).toBe(null)
  })
})
