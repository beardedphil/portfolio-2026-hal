/**
 * Unit tests for helper functions in status-helpers.ts
 * Tests cover: capText, isPlaceholderSummary, getLastAssistantMessage, parseProcessReviewSuggestionsFromText
 */

import { describe, it, expect } from 'vitest'
import {
  capText,
  isPlaceholderSummary,
  getLastAssistantMessage,
  parseProcessReviewSuggestionsFromText,
  MAX_RUN_SUMMARY_CHARS,
} from './status-helpers.js'

describe('capText', () => {
  it('returns input unchanged when within maxChars', () => {
    const input = 'Short text'
    expect(capText(input, 100)).toBe(input)
  })

  it('truncates and appends [truncated] when exceeding maxChars', () => {
    const input = 'A'.repeat(100)
    const result = capText(input, 50)
    expect(result).toBe('A'.repeat(50) + '\n\n[truncated]')
    expect(result.length).toBe(50 + 13) // 50 chars + '\n\n[truncated]'
  })

  it('handles exact maxChars boundary', () => {
    const input = 'A'.repeat(50)
    expect(capText(input, 50)).toBe(input)
  })

  it('handles empty string', () => {
    expect(capText('', 100)).toBe('')
  })

  it('handles very long input', () => {
    const input = 'A'.repeat(50000)
    const result = capText(input, MAX_RUN_SUMMARY_CHARS)
    expect(result.endsWith('\n\n[truncated]')).toBe(true)
    expect(result.length).toBe(MAX_RUN_SUMMARY_CHARS + 13)
  })
})

describe('isPlaceholderSummary', () => {
  it('returns true for placeholder summaries', () => {
    expect(isPlaceholderSummary('Completed.')).toBe(true)
    expect(isPlaceholderSummary('Done.')).toBe(true)
    expect(isPlaceholderSummary('Complete.')).toBe(true)
    expect(isPlaceholderSummary('Finished.')).toBe(true)
  })

  it('returns true for null or undefined', () => {
    expect(isPlaceholderSummary(null)).toBe(true)
    expect(isPlaceholderSummary(undefined)).toBe(true)
  })

  it('returns true for empty or whitespace-only strings', () => {
    expect(isPlaceholderSummary('')).toBe(true)
    expect(isPlaceholderSummary('   ')).toBe(true)
    expect(isPlaceholderSummary('\n\t')).toBe(true)
  })

  it('returns false for non-placeholder summaries', () => {
    expect(isPlaceholderSummary('Implementation completed successfully.')).toBe(false)
    expect(isPlaceholderSummary('Added unit tests for status.ts')).toBe(false)
    expect(isPlaceholderSummary('Completed: Added tests')).toBe(false)
  })

  it('handles case-sensitive matching', () => {
    expect(isPlaceholderSummary('completed.')).toBe(false) // lowercase
    expect(isPlaceholderSummary('COMPLETED.')).toBe(false) // uppercase
    expect(isPlaceholderSummary('Completed')).toBe(false) // no period
  })
})

describe('getLastAssistantMessage', () => {
  it('extracts last assistant message from simple conversation structure', () => {
    const conversation = {
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
        { role: 'user', content: 'How are you?' },
        { role: 'assistant', content: 'I am doing well' },
      ],
    }
    expect(getLastAssistantMessage(JSON.stringify(conversation))).toBe('I am doing well')
  })

  it('handles conversation.messages structure', () => {
    const conversation = {
      conversation: {
        messages: [
          { role: 'user', content: 'Test' },
          { role: 'assistant', content: 'Response' },
        ],
      },
    }
    expect(getLastAssistantMessage(JSON.stringify(conversation))).toBe('Response')
  })

  it('skips empty assistant messages', () => {
    const conversation = {
      messages: [
        { role: 'assistant', content: '' },
        { role: 'assistant', content: '   ' },
        { role: 'assistant', content: 'Valid message' },
      ],
    }
    expect(getLastAssistantMessage(JSON.stringify(conversation))).toBe('Valid message')
  })

  it('handles array content format', () => {
    const conversation = {
      messages: [
        { role: 'assistant', content: [{ type: 'text', text: 'Message from array' }] },
      ],
    }
    expect(getLastAssistantMessage(JSON.stringify(conversation))).toBe('Message from array')
  })

  it('handles object content with text property', () => {
    const conversation = {
      messages: [
        { role: 'assistant', content: { text: 'Message from object' } },
      ],
    }
    expect(getLastAssistantMessage(JSON.stringify(conversation))).toBe('Message from object')
  })

  it('handles object content with content property', () => {
    const conversation = {
      messages: [
        { role: 'assistant', content: { content: 'Message from content property' } },
      ],
    }
    expect(getLastAssistantMessage(JSON.stringify(conversation))).toBe('Message from content property')
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
    expect(getLastAssistantMessage(JSON.stringify(conversation))).toBe(null)
  })

  it('returns null for empty messages array', () => {
    const conversation = { messages: [] }
    expect(getLastAssistantMessage(JSON.stringify(conversation))).toBe(null)
  })

  it('handles missing messages property', () => {
    const conversation = {}
    expect(getLastAssistantMessage(JSON.stringify(conversation))).toBe(null)
  })
})

describe('parseProcessReviewSuggestionsFromText', () => {
  it('parses direct JSON array', () => {
    const input = '[{"text": "Suggestion 1", "justification": "Reason 1"}]'
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Suggestion 1', justification: 'Reason 1' }])
  })

  it('parses multiple suggestions', () => {
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

  it('parses JSON from markdown code block', () => {
    const input = '```json\n[{"text": "Suggestion", "justification": "Reason"}]\n```'
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Suggestion', justification: 'Reason' }])
  })

  it('parses JSON from code block without language', () => {
    const input = '```\n[{"text": "Suggestion", "justification": "Reason"}]\n```'
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Suggestion', justification: 'Reason' }])
  })

  it('extracts JSON array from text with surrounding content', () => {
    const input = 'Here are my suggestions:\n[{"text": "Suggestion", "justification": "Reason"}]\n\nMore text'
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Suggestion', justification: 'Reason' }])
  })

  it('filters out invalid suggestions (missing text)', () => {
    const input = JSON.stringify([
      { justification: 'Reason 1' }, // missing text
      { text: 'Valid', justification: 'Reason 2' },
    ])
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Valid', justification: 'Reason 2' }])
  })

  it('filters out invalid suggestions (missing justification)', () => {
    const input = JSON.stringify([
      { text: 'Suggestion 1' }, // missing justification
      { text: 'Valid', justification: 'Reason' },
    ])
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Valid', justification: 'Reason' }])
  })

  it('filters out empty text or justification', () => {
    const input = JSON.stringify([
      { text: '', justification: 'Reason' },
      { text: 'Valid', justification: '' },
      { text: 'Valid', justification: 'Reason' },
    ])
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Valid', justification: 'Reason' }])
  })

  it('trims whitespace from text and justification', () => {
    const input = JSON.stringify([
      { text: '  Suggestion  ', justification: '  Reason  ' },
    ])
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Suggestion', justification: 'Reason' }])
  })

  it('returns null for empty input', () => {
    expect(parseProcessReviewSuggestionsFromText('')).toBe(null)
    expect(parseProcessReviewSuggestionsFromText('   ')).toBe(null)
  })

  it('returns null for invalid JSON', () => {
    expect(parseProcessReviewSuggestionsFromText('not json')).toBe(null)
    expect(parseProcessReviewSuggestionsFromText('{ invalid }')).toBe(null)
  })

  it('returns null when no array found', () => {
    expect(parseProcessReviewSuggestionsFromText('Just some text')).toBe(null)
  })

  it('handles escaped quotes in strings', () => {
    const input = '[{"text": "Suggestion with \\"quotes\\"", "justification": "Reason"}]'
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Suggestion with "quotes"', justification: 'Reason' }])
  })

  it('extracts nested arrays from objects', () => {
    const input = '{"suggestions": [{"text": "Suggestion", "justification": "Reason"}]}'
    // The function extracts the first array it finds, even if nested
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Suggestion', justification: 'Reason' }])
  })
})
