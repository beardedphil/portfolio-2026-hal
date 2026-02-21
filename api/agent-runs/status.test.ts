/**
 * Unit tests for api/agent-runs/status.ts
 * Tests the behavior of utility functions and status handling logic.
 */

import { describe, it, expect } from 'vitest'
import {
  capText,
  isPlaceholderSummary,
  getLastAssistantMessage,
  parseProcessReviewSuggestionsFromText,
} from './status.js'

describe('capText', () => {
  it('preserves text within max length', () => {
    const input = 'Short text'
    expect(capText(input, 100)).toBe('Short text')
  })

  it('truncates text exceeding max length and adds [truncated] marker', () => {
    const input = 'A'.repeat(100)
    const result = capText(input, 50)
    expect(result.length).toBeLessThanOrEqual(50 + '\n\n[truncated]'.length)
    expect(result).toContain('[truncated]')
    expect(result.slice(0, 50)).toBe('A'.repeat(50))
  })

  it('handles exact max length boundary', () => {
    const input = 'A'.repeat(50)
    expect(capText(input, 50)).toBe('A'.repeat(50))
  })
})

describe('isPlaceholderSummary', () => {
  it('returns true for empty string', () => {
    expect(isPlaceholderSummary('')).toBe(true)
    expect(isPlaceholderSummary('   ')).toBe(true)
  })

  it('returns true for null or undefined', () => {
    expect(isPlaceholderSummary(null)).toBe(true)
    expect(isPlaceholderSummary(undefined)).toBe(true)
  })

  it('returns true for placeholder strings', () => {
    expect(isPlaceholderSummary('Completed.')).toBe(true)
    expect(isPlaceholderSummary('Done.')).toBe(true)
    expect(isPlaceholderSummary('Complete.')).toBe(true)
    expect(isPlaceholderSummary('Finished.')).toBe(true)
  })

  it('returns false for non-placeholder summaries', () => {
    expect(isPlaceholderSummary('Implementation completed successfully.')).toBe(false)
    expect(isPlaceholderSummary('Added unit tests and refactored code.')).toBe(false)
    expect(isPlaceholderSummary('Completed with changes.')).toBe(false)
  })

  it('handles whitespace around placeholder strings', () => {
    expect(isPlaceholderSummary('  Completed.  ')).toBe(true)
    expect(isPlaceholderSummary('\nDone.\n')).toBe(true)
  })
})

describe('getLastAssistantMessage', () => {
  it('extracts last assistant message from messages array', () => {
    const conversation = {
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'First response' },
        { role: 'user', content: 'Follow up' },
        { role: 'assistant', content: 'Last response' },
      ],
    }
    const result = getLastAssistantMessage(JSON.stringify(conversation))
    expect(result).toBe('Last response')
  })

  it('handles conversation.messages structure', () => {
    const conversation = {
      conversation: {
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Response' },
        ],
      },
    }
    const result = getLastAssistantMessage(JSON.stringify(conversation))
    expect(result).toBe('Response')
  })

  it('handles array content format', () => {
    const conversation = {
      messages: [
        { role: 'assistant', content: [{ type: 'text', text: 'Array content' }] },
      ],
    }
    const result = getLastAssistantMessage(JSON.stringify(conversation))
    expect(result).toBe('Array content')
  })

  it('handles object content with text property', () => {
    const conversation = {
      messages: [
        { role: 'assistant', content: { text: 'Object text content' } },
      ],
    }
    const result = getLastAssistantMessage(JSON.stringify(conversation))
    expect(result).toBe('Object text content')
  })

  it('skips empty assistant messages', () => {
    const conversation = {
      messages: [
        { role: 'assistant', content: '   ' },
        { role: 'assistant', content: 'Valid message' },
      ],
    }
    const result = getLastAssistantMessage(JSON.stringify(conversation))
    expect(result).toBe('Valid message')
  })

  it('returns null for invalid JSON', () => {
    expect(getLastAssistantMessage('not json')).toBe(null)
    expect(getLastAssistantMessage('{ invalid }')).toBe(null)
  })

  it('returns null when no assistant messages found', () => {
    const conversation = {
      messages: [
        { role: 'user', content: 'Only user messages' },
      ],
    }
    const result = getLastAssistantMessage(JSON.stringify(conversation))
    expect(result).toBe(null)
  })
})

describe('parseProcessReviewSuggestionsFromText', () => {
  it('parses JSON array from plain text', () => {
    const input = '[{"text": "Suggestion 1", "justification": "Reason 1"}]'
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Suggestion 1', justification: 'Reason 1' }])
  })

  it('extracts JSON from markdown code blocks', () => {
    const input = '```json\n[{"text": "Suggestion", "justification": "Reason"}]\n```'
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Suggestion', justification: 'Reason' }])
  })

  it('extracts JSON from code blocks without language tag', () => {
    const input = '```\n[{"text": "Suggestion", "justification": "Reason"}]\n```'
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Suggestion', justification: 'Reason' }])
  })

  it('handles nested JSON array extraction from text', () => {
    const input = 'Some text before [{"text": "Suggestion", "justification": "Reason"}] and after'
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Suggestion', justification: 'Reason' }])
  })

  it('filters out invalid suggestions', () => {
    const input = '[{"text": "Valid", "justification": "Reason"}, {"text": "", "justification": "Invalid"}]'
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Valid', justification: 'Reason' }])
  })

  it('trims text and justification values', () => {
    const input = '[{"text": "  Suggestion  ", "justification": "  Reason  "}]'
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Suggestion', justification: 'Reason' }])
  })

  it('returns null for empty or invalid input', () => {
    expect(parseProcessReviewSuggestionsFromText('')).toBe(null)
    expect(parseProcessReviewSuggestionsFromText('   ')).toBe(null)
    expect(parseProcessReviewSuggestionsFromText('not json')).toBe(null)
    expect(parseProcessReviewSuggestionsFromText('{"not": "array"}')).toBe(null)
  })

  it('handles multiple suggestions', () => {
    const input = JSON.stringify([
      { text: 'Suggestion 1', justification: 'Reason 1' },
      { text: 'Suggestion 2', justification: 'Reason 2' },
    ])
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([
      { text: 'Suggestion 1', justification: 'Reason 1' },
      { text: 'Suggestion 2', justification: 'Reason 2' },
    ])
  })
})
