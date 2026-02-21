/**
 * Unit tests for create-from-suggestion.ts
 * Tests the helper functions and core behaviors used by the ticket creation handler.
 */

import { describe, it, expect } from 'vitest'
import { slugFromTitle, repoHintPrefix, isUniqueViolation } from './create-from-suggestion.js'

describe('create-from-suggestion helper functions', () => {
  describe('slugFromTitle', () => {
    it('converts title to lowercase slug with hyphens', () => {
      expect(slugFromTitle('My Test Title')).toBe('my-test-title')
    })

    it('removes special characters from title', () => {
      expect(slugFromTitle('Test@Title#123!')).toBe('testtitle123')
    })

    it('collapses multiple spaces and hyphens', () => {
      expect(slugFromTitle('Test   Title---With   Spaces')).toBe('test-title-with-spaces')
    })

    it('removes leading and trailing hyphens', () => {
      expect(slugFromTitle('-Test Title-')).toBe('test-title')
    })

    it('handles empty string by returning default', () => {
      expect(slugFromTitle('')).toBe('ticket')
      expect(slugFromTitle('   ')).toBe('ticket')
    })

    it('handles title with only special characters', () => {
      expect(slugFromTitle('!!!@@@###')).toBe('ticket')
    })
  })

  describe('repoHintPrefix', () => {
    it('extracts prefix from repo name with standard format', () => {
      // Function iterates backwards, so 'name' (4 chars) is found before 'repo' (4 chars)
      expect(repoHintPrefix('owner/repo-name')).toBe('NAME')
    })

    it('prefers shorter token (2-6 chars) from end of repo name', () => {
      // Function iterates backwards, so 'my' (2 chars) is found before 'project' (7 chars)
      expect(repoHintPrefix('owner/my-project')).toBe('MY')
    })

    it('falls back to first 4 letters if no suitable token found', () => {
      expect(repoHintPrefix('owner/verylongreponame')).toBe('VERY')
    })

    it('handles repo name without owner', () => {
      expect(repoHintPrefix('my-repo')).toBe('REPO')
    })

    it('handles repo with numbers and special chars', () => {
      expect(repoHintPrefix('owner/repo-2026')).toBe('REPO')
    })

    it('returns PRJ as default for edge cases', () => {
      expect(repoHintPrefix('123456')).toBe('PRJ')
    })
  })

  describe('isUniqueViolation', () => {
    it('returns true for PostgreSQL unique violation code', () => {
      expect(isUniqueViolation({ code: '23505' })).toBe(true)
    })

    it('returns true for error message with "duplicate key"', () => {
      expect(isUniqueViolation({ message: 'duplicate key value violates unique constraint' })).toBe(true)
    })

    it('returns true for error message with "unique constraint"', () => {
      expect(isUniqueViolation({ message: 'unique constraint violation' })).toBe(true)
    })

    it('returns false for null error', () => {
      expect(isUniqueViolation(null)).toBe(false)
    })

    it('returns false for error without matching code or message', () => {
      expect(isUniqueViolation({ code: '42P01', message: 'relation does not exist' })).toBe(false)
    })

    it('handles case-insensitive message matching', () => {
      expect(isUniqueViolation({ message: 'DUPLICATE KEY ERROR' })).toBe(true)
      expect(isUniqueViolation({ message: 'Unique Constraint Failed' })).toBe(true)
    })

    it('handles error with both code and message', () => {
      expect(isUniqueViolation({ code: '23505', message: 'some other error' })).toBe(true)
    })
  })
})
