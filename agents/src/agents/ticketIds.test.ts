import { describe, it, expect } from 'vitest'
import { parseTicketNumber, slugFromTitle, repoHintPrefix } from './ticketIds'

describe('parseTicketNumber', () => {
  it('extracts ticket number from HAL-XXXX format', () => {
    expect(parseTicketNumber('HAL-0065')).toBe(65)
    expect(parseTicketNumber('HAL-0001')).toBe(1)
    expect(parseTicketNumber('HAL-1234')).toBe(1234)
  })

  it('extracts last number sequence from string', () => {
    expect(parseTicketNumber('ticket-42')).toBe(42)
    expect(parseTicketNumber('prefix-123-suffix')).toBe(123)
    expect(parseTicketNumber('multiple-456-numbers-789')).toBe(789)
  })

  it('handles 1-4 digit numbers', () => {
    expect(parseTicketNumber('1')).toBe(1)
    expect(parseTicketNumber('12')).toBe(12)
    expect(parseTicketNumber('123')).toBe(123)
    expect(parseTicketNumber('1234')).toBe(1234)
  })

  it('returns null for strings without numbers', () => {
    expect(parseTicketNumber('no-numbers')).toBe(null)
    expect(parseTicketNumber('')).toBe(null)
    expect(parseTicketNumber('   ')).toBe(null)
  })

  it('handles whitespace', () => {
    expect(parseTicketNumber('  HAL-0065  ')).toBe(65)
    expect(parseTicketNumber('\n123\n')).toBe(123)
  })

  it('handles null/undefined input', () => {
    expect(parseTicketNumber(null as any)).toBe(null)
    expect(parseTicketNumber(undefined as any)).toBe(null)
  })
})

describe('slugFromTitle', () => {
  it('converts title to lowercase slug', () => {
    expect(slugFromTitle('My Ticket Title')).toBe('my-ticket-title')
  })

  it('replaces spaces with hyphens', () => {
    expect(slugFromTitle('Hello World')).toBe('hello-world')
    expect(slugFromTitle('Multiple   Spaces')).toBe('multiple-spaces')
  })

  it('strips non-alphanumeric characters except hyphens', () => {
    expect(slugFromTitle('Ticket #123!')).toBe('ticket-123')
    expect(slugFromTitle('Hello, World!')).toBe('hello-world')
    expect(slugFromTitle('Test@#$%Title')).toBe('testtitle')
  })

  it('collapses multiple hyphens', () => {
    expect(slugFromTitle('Hello---World')).toBe('hello-world')
    expect(slugFromTitle('Test---Title---Here')).toBe('test-title-here')
  })

  it('removes leading and trailing hyphens', () => {
    expect(slugFromTitle('-Hello World-')).toBe('hello-world')
    expect(slugFromTitle('---Test---')).toBe('test')
  })

  it('handles empty string', () => {
    expect(slugFromTitle('')).toBe('ticket')
    expect(slugFromTitle('   ')).toBe('ticket')
  })

  it('handles special characters only', () => {
    expect(slugFromTitle('!!!')).toBe('ticket')
    expect(slugFromTitle('@#$%')).toBe('ticket')
  })

  it('preserves hyphens in middle', () => {
    expect(slugFromTitle('pre-existing-title')).toBe('pre-existing-title')
  })
})

describe('repoHintPrefix', () => {
  it('extracts prefix from repo full name', () => {
    expect(repoHintPrefix('beardedphil/portfolio-2026-hal')).toBe('HAL')
    expect(repoHintPrefix('org/project-name')).toBe('NAME')
  })

  it('handles repo name without slash', () => {
    expect(repoHintPrefix('portfolio-2026-hal')).toBe('HAL')
    expect(repoHintPrefix('myproject')).toBe('MYPR')
  })

  it('prefers 2-6 character tokens from end', () => {
    expect(repoHintPrefix('org/very-long-project-name')).toBe('NAME')
    expect(repoHintPrefix('company/short')).toBe('SHORT')
  })

  it('skips non-letter tokens', () => {
    // The function prefers 2-6 char tokens from the end, skipping "2026" (numbers only)
    // It will find "project" but that's 7 chars, so it falls back to first 4 letters
    expect(repoHintPrefix('org/project-2026')).toBe('PROJ')
  })

  it('falls back to first 4 letters if no suitable token', () => {
    expect(repoHintPrefix('a/b')).toBe('B')
    expect(repoHintPrefix('x')).toBe('X')
  })

  it('handles empty string', () => {
    expect(repoHintPrefix('')).toBe('PRJ')
  })

  it('handles repo with only numbers', () => {
    expect(repoHintPrefix('org/123456')).toBe('PRJ')
  })

  it('extracts from complex repo names', () => {
    expect(repoHintPrefix('github-actions/action-name')).toBe('NAME')
    // "v2" is 2 chars and matches the 2-6 range, so it's preferred over "repo" (4 chars)
    expect(repoHintPrefix('my-org/my-repo-v2')).toBe('V2')
  })
})
