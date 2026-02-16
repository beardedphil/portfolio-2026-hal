import { describe, it, expect } from 'vitest'
import {
  slugFromTitle,
  repoHintPrefix,
  parseTicketNumber,
  evaluateTicketReady,
  type ReadyCheckResult,
} from './projectManagerHelpers'

describe('slugFromTitle', () => {
  it('converts title to lowercase slug', () => {
    expect(slugFromTitle('My Ticket Title')).toBe('my-ticket-title')
  })

  it('replaces spaces with hyphens', () => {
    expect(slugFromTitle('Hello World')).toBe('hello-world')
  })

  it('removes non-alphanumeric characters except hyphens', () => {
    expect(slugFromTitle('Ticket #123!')).toBe('ticket-123')
  })

  it('collapses multiple hyphens into one', () => {
    expect(slugFromTitle('Hello---World')).toBe('hello-world')
  })

  it('removes leading and trailing hyphens', () => {
    expect(slugFromTitle('-Hello World-')).toBe('hello-world')
  })

  it('handles empty string by returning default', () => {
    expect(slugFromTitle('')).toBe('ticket')
  })

  it('handles whitespace-only string by returning default', () => {
    expect(slugFromTitle('   ')).toBe('ticket')
  })

  it('handles string with only special characters', () => {
    expect(slugFromTitle('!!!@@@###')).toBe('ticket')
  })

  it('preserves numbers', () => {
    expect(slugFromTitle('Ticket 123')).toBe('ticket-123')
  })

  it('handles mixed case and special characters', () => {
    // Underscores are removed, so "Ticket" and "Title" merge
    expect(slugFromTitle('My-Ticket_Title!@#')).toBe('my-tickettitle')
  })

  it('handles unicode characters by removing them', () => {
    expect(slugFromTitle('Ticket 🎫 Title')).toBe('ticket-title')
  })

  it('handles very long titles', () => {
    const longTitle = 'A'.repeat(1000) + ' B'
    const result = slugFromTitle(longTitle)
    expect(result).toBe('a'.repeat(1000) + '-b')
  })
})

describe('repoHintPrefix', () => {
  it('extracts short token from repository name', () => {
    expect(repoHintPrefix('owner/my-repo')).toBe('REPO')
  })

  it('handles repository with multiple segments', () => {
    // Function takes last segment and finds first matching token from end
    expect(repoHintPrefix('owner/subdir/my-project')).toBe('MY')
  })

  it('finds token of length 2-6 characters', () => {
    expect(repoHintPrefix('owner/test')).toBe('TEST')
    // "testing" is 7 chars, so function finds "test" (4 chars) first from end
    expect(repoHintPrefix('owner/testing')).toBe('TEST')
  })

  it('searches from end of repository name', () => {
    expect(repoHintPrefix('owner/portfolio-2026-hal')).toBe('HAL')
  })

  it('skips tokens without letters', () => {
    expect(repoHintPrefix('owner/123-456')).toBe('PRJ')
  })

  it('falls back to first 4 letters when no suitable token found', () => {
    expect(repoHintPrefix('owner/abcdefghijklmnop')).toBe('ABCD')
  })

  it('falls back to PRJ when no letters found', () => {
    expect(repoHintPrefix('owner/123-456-789')).toBe('PRJ')
  })

  it('handles repository name without slash', () => {
    expect(repoHintPrefix('my-repo')).toBe('REPO')
  })

  it('handles empty string', () => {
    expect(repoHintPrefix('')).toBe('PRJ')
  })

  it('handles single character repository', () => {
    // Single char doesn't match length criteria, falls back to first 4 letters
    expect(repoHintPrefix('owner/a')).toBe('A')
  })

  it('handles repository with only numbers', () => {
    expect(repoHintPrefix('owner/12345')).toBe('PRJ')
  })

  it('prefers shorter tokens when multiple match', () => {
    // Should find the last token that matches length criteria
    expect(repoHintPrefix('owner/very-long-repo-name')).toBe('NAME')
  })

  it('handles special characters in repository name', () => {
    expect(repoHintPrefix('owner/my_repo.test')).toBe('TEST')
  })

  it('is case-insensitive for token matching but returns uppercase', () => {
    // "MyRepo" splits into one token "myrepo" (6 chars), which matches
    expect(repoHintPrefix('owner/MyRepo')).toBe('MYREPO')
  })
})

describe('parseTicketNumber', () => {
  it('extracts ticket number from simple reference', () => {
    expect(parseTicketNumber('123')).toBe(123)
  })

  it('extracts last number from string with multiple numbers', () => {
    expect(parseTicketNumber('ticket 123 and 456')).toBe(456)
  })

  it('extracts 1-4 digit numbers', () => {
    expect(parseTicketNumber('1')).toBe(1)
    expect(parseTicketNumber('12')).toBe(12)
    expect(parseTicketNumber('123')).toBe(123)
    expect(parseTicketNumber('1234')).toBe(1234)
  })

  it('handles numbers with leading zeros', () => {
    expect(parseTicketNumber('0123')).toBe(123)
  })

  it('handles ticket references with prefix', () => {
    expect(parseTicketNumber('HAL-123')).toBe(123)
  })

  it('handles ticket references with suffix', () => {
    // Function extracts last number sequence, so "123" is found
    expect(parseTicketNumber('123-abc')).toBe(123)
  })

  it('returns null for empty string', () => {
    expect(parseTicketNumber('')).toBe(null)
  })

  it('returns null for whitespace-only string', () => {
    expect(parseTicketNumber('   ')).toBe(null)
  })

  it('returns null when no digits found', () => {
    expect(parseTicketNumber('abc')).toBe(null)
  })

  it('handles null input', () => {
    expect(parseTicketNumber(null as any)).toBe(null)
  })

  it('handles undefined input', () => {
    expect(parseTicketNumber(undefined as any)).toBe(null)
  })

  it('handles numbers longer than 4 digits by taking last 4', () => {
    expect(parseTicketNumber('12345')).toBe(2345) // Last 4 digits
  })

  it('handles mixed alphanumeric strings', () => {
    expect(parseTicketNumber('ticket-abc-123-def')).toBe(123)
  })

  it('handles string with only zeros', () => {
    expect(parseTicketNumber('0000')).toBe(0)
  })

  it('trims whitespace before parsing', () => {
    expect(parseTicketNumber('  123  ')).toBe(123)
  })

  it('handles very long strings', () => {
    const longString = 'a'.repeat(1000) + '123'
    expect(parseTicketNumber(longString)).toBe(123)
  })
})

describe('evaluateTicketReady', () => {
  it('returns ready=true for content longer than baseline', () => {
    const longContent = 'A'.repeat(2000)
    const result = evaluateTicketReady(longContent)
    expect(result.ready).toBe(true)
    expect(result.missingItems).toEqual([])
  })

  it('returns ready=false for content shorter than baseline', () => {
    const shortContent = 'Short content'
    const result = evaluateTicketReady(shortContent)
    expect(result.ready).toBe(false)
    expect(result.missingItems).toContain('Ticket content is too short (needs more content beyond template)')
  })

  it('returns ready=false when content is mostly placeholders', () => {
    // Create content that's long enough but >50% placeholders
    const placeholders = '<AC 1> '.repeat(200) // ~1200 chars
    const actualContent = 'A'.repeat(100) // ~100 chars
    const body = placeholders + actualContent
    const result = evaluateTicketReady(body)
    expect(result.ready).toBe(false)
    expect(result.missingItems).toContain('Ticket contains too many unresolved placeholders')
  })

  it('returns ready=true when content is long and has few placeholders', () => {
    const longContent = 'A'.repeat(2000) + ' <AC 1>'
    const result = evaluateTicketReady(longContent)
    expect(result.ready).toBe(true)
    expect(result.missingItems).toEqual([])
  })

  it('handles empty string', () => {
    const result = evaluateTicketReady('')
    expect(result.ready).toBe(false)
    expect(result.missingItems.length).toBeGreaterThan(0)
  })

  it('handles whitespace-only string', () => {
    const result = evaluateTicketReady('   \n\n   ')
    expect(result.ready).toBe(false)
    expect(result.missingItems.length).toBeGreaterThan(0)
  })

  it('trims whitespace before evaluation', () => {
    const longContent = '   ' + 'A'.repeat(2000) + '   '
    const result = evaluateTicketReady(longContent)
    expect(result.ready).toBe(true)
  })

  it('returns correct checklistResults for ready ticket', () => {
    const longContent = 'A'.repeat(2000)
    const result = evaluateTicketReady(longContent)
    expect(result.checklistResults.goal).toBe(true)
    expect(result.checklistResults.deliverable).toBe(true)
    expect(result.checklistResults.acceptanceCriteria).toBe(true)
    expect(result.checklistResults.constraintsNonGoals).toBe(true)
    expect(result.checklistResults.noPlaceholders).toBe(true)
  })

  it('returns correct checklistResults for not-ready ticket (too short)', () => {
    const shortContent = 'Short'
    const result = evaluateTicketReady(shortContent)
    expect(result.checklistResults.goal).toBe(false)
    expect(result.checklistResults.deliverable).toBe(false)
    expect(result.checklistResults.acceptanceCriteria).toBe(false)
    expect(result.checklistResults.constraintsNonGoals).toBe(false)
    expect(result.checklistResults.noPlaceholders).toBe(true)
  })

  it('returns correct checklistResults for not-ready ticket (too many placeholders)', () => {
    // Create content that's long enough (>1500) but >50% placeholders
    const placeholders = '<AC 1> '.repeat(200) // ~1200 chars
    const actualContent = 'A'.repeat(400) // ~400 chars, total ~1600
    const body = placeholders + actualContent
    const result = evaluateTicketReady(body)
    expect(result.checklistResults.goal).toBe(true) // Has substantial content (>1500)
    expect(result.checklistResults.deliverable).toBe(true)
    expect(result.checklistResults.acceptanceCriteria).toBe(true)
    expect(result.checklistResults.constraintsNonGoals).toBe(true)
    expect(result.checklistResults.noPlaceholders).toBe(false) // Too many placeholders
  })

  it('handles content exactly at baseline', () => {
    const exactBaseline = 'A'.repeat(1500)
    const result = evaluateTicketReady(exactBaseline)
    expect(result.ready).toBe(false) // Must be > baseline, not >=
    expect(result.missingItems).toContain('Ticket content is too short (needs more content beyond template)')
  })

  it('handles content one character over baseline', () => {
    const overBaseline = 'A'.repeat(1501)
    const result = evaluateTicketReady(overBaseline)
    expect(result.ready).toBe(true)
  })

  it('handles various placeholder formats', () => {
    const body = '<AC 1> <task-id> <placeholder> ' + 'A'.repeat(2000)
    const result = evaluateTicketReady(body)
    expect(result.ready).toBe(true) // Placeholders are small relative to content
  })

  it('handles placeholders with different formats', () => {
    const body = '<AC-1> <task_id> <PLACEHOLDER> ' + 'A'.repeat(2000)
    const result = evaluateTicketReady(body)
    expect(result.ready).toBe(true)
  })

  it('handles content with exactly 50% placeholders (should pass)', () => {
    // Create content where placeholders are exactly 50% (not >50%) and over baseline
    const placeholders = '<AC 1> '.repeat(200) // ~1200 chars
    const actualContent = 'A'.repeat(1200) // ~1200 chars, total ~2400, 50% placeholders
    const body = placeholders + actualContent
    const result = evaluateTicketReady(body)
    // Should pass because isMostlyPlaceholders checks > 0.5, not >= 0.5
    expect(result.ready).toBe(true)
  })

  it('handles very long content', () => {
    const veryLongContent = 'A'.repeat(100000)
    const result = evaluateTicketReady(veryLongContent)
    expect(result.ready).toBe(true)
  })

  it('handles markdown content', () => {
    const markdown = `## Goal (one sentence)

This is a goal.

## Human-verifiable deliverable (UI-only)

User sees a button.

## Acceptance criteria (UI-only)

- [ ] Item 1
- [ ] Item 2

## Constraints

None.

## Non-goals

Not doing X.`.repeat(10) // Make it long enough
    const result = evaluateTicketReady(markdown)
    expect(result.ready).toBe(true)
  })
})
