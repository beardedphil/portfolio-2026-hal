/**
 * Unit tests for status.ts helper functions.
 * Tests the behavior being refactored to ensure equivalence.
 */

import { describe, it, expect } from 'vitest'
import {
  capText,
  isPlaceholderSummary,
  getLastAssistantMessage,
  parseProcessReviewSuggestionsFromText,
} from './status.js'

describe('capText', () => {
  it('returns input unchanged when within maxChars', () => {
    expect(capText('short text', 100)).toBe('short text')
    expect(capText('exactly 10 chars', 20)).toBe('exactly 10 chars')
  })

  it('truncates and appends [truncated] when exceeding maxChars', () => {
    const longText = 'a'.repeat(100)
    const result = capText(longText, 50)
    expect(result).toBe('a'.repeat(50) + '\n\n[truncated]')
    expect(result.length).toBe(50 + '\n\n[truncated]'.length)
  })

  it('handles empty string', () => {
    expect(capText('', 10)).toBe('')
  })

  it('handles exactly maxChars length', () => {
    const text = 'a'.repeat(10)
    expect(capText(text, 10)).toBe(text)
  })
})

describe('isPlaceholderSummary', () => {
  it('returns true for placeholder strings', () => {
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

  it('returns false for non-placeholder strings', () => {
    expect(isPlaceholderSummary('Implementation completed successfully')).toBe(false)
    expect(isPlaceholderSummary('Task done')).toBe(false)
    expect(isPlaceholderSummary('Completed with errors')).toBe(false)
    expect(isPlaceholderSummary('Done!')).toBe(false)
  })

  it('handles case-sensitive matching', () => {
    expect(isPlaceholderSummary('completed.')).toBe(false) // lowercase
    expect(isPlaceholderSummary('COMPLETED.')).toBe(false) // uppercase
    expect(isPlaceholderSummary('Completed')).toBe(false) // no period
  })
})

describe('getLastAssistantMessage', () => {
  it('extracts last assistant message from messages array', () => {
    const conversation = {
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
        { role: 'user', content: 'How are you?' },
        { role: 'assistant', content: 'I am doing well' },
      ],
    }
    const result = getLastAssistantMessage(JSON.stringify(conversation))
    expect(result).toBe('I am doing well')
  })

  it('extracts from conversation.messages structure', () => {
    const conversation = {
      conversation: {
        messages: [
          { role: 'user', content: 'Test' },
          { role: 'assistant', content: 'Response' },
        ],
      },
    }
    const result = getLastAssistantMessage(JSON.stringify(conversation))
    expect(result).toBe('Response')
  })

  it('handles string content in array format', () => {
    const conversation = {
      messages: [
        { role: 'assistant', content: ['First part', 'Second part'] },
      ],
    }
    const result = getLastAssistantMessage(JSON.stringify(conversation))
    expect(result).toBe('First partSecond part')
  })

  it('handles object content with text property', () => {
    const conversation = {
      messages: [
        { role: 'assistant', content: { text: 'Message text' } },
      ],
    }
    const result = getLastAssistantMessage(JSON.stringify(conversation))
    expect(result).toBe('Message text')
  })

  it('handles object content with content property', () => {
    const conversation = {
      messages: [
        { role: 'assistant', content: { content: 'Nested content' } },
      ],
    }
    const result = getLastAssistantMessage(JSON.stringify(conversation))
    expect(result).toBe('Nested content')
  })

  it('handles object content with value property', () => {
    const conversation = {
      messages: [
        { role: 'assistant', content: { value: 'Value content' } },
      ],
    }
    const result = getLastAssistantMessage(JSON.stringify(conversation))
    expect(result).toBe('Value content')
  })

  it('skips empty or whitespace-only messages', () => {
    const conversation = {
      messages: [
        { role: 'assistant', content: '   ' },
        { role: 'assistant', content: 'Valid message' },
      ],
    }
    const result = getLastAssistantMessage(JSON.stringify(conversation))
    expect(result).toBe('Valid message')
  })

  it('returns null when no assistant messages found', () => {
    const conversation = {
      messages: [
        { role: 'user', content: 'Only user messages' },
      ],
    }
    const result = getLastAssistantMessage(JSON.stringify(conversation))
    expect(result).toBeNull()
  })

  it('returns null for invalid JSON', () => {
    expect(getLastAssistantMessage('not json')).toBeNull()
    expect(getLastAssistantMessage('{ invalid }')).toBeNull()
  })

  it('returns null for empty messages array', () => {
    const conversation = { messages: [] }
    const result = getLastAssistantMessage(JSON.stringify(conversation))
    expect(result).toBeNull()
  })

  it('handles complex nested content arrays', () => {
    const conversation = {
      messages: [
        {
          role: 'assistant',
          content: [
            { text: 'Part 1' },
            { content: 'Part 2' },
            { value: 'Part 3' },
            'Part 4',
          ],
        },
      ],
    }
    const result = getLastAssistantMessage(JSON.stringify(conversation))
    expect(result).toBe('Part 1Part 2Part 3Part 4')
  })
})

describe('parseProcessReviewSuggestionsFromText', () => {
  it('parses direct JSON array', () => {
    const input = '[{"text":"Suggestion 1","justification":"Reason 1"}]'
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Suggestion 1', justification: 'Reason 1' }])
  })

  it('parses JSON array with multiple suggestions', () => {
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

  it('parses JSON from markdown code block with json language', () => {
    const input = '```json\n[{"text":"Suggestion","justification":"Reason"}]\n```'
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Suggestion', justification: 'Reason' }])
  })

  it('parses JSON from markdown code block without language', () => {
    const input = '```\n[{"text":"Suggestion","justification":"Reason"}]\n```'
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Suggestion', justification: 'Reason' }])
  })

  it('extracts JSON array from text with surrounding content', () => {
    const input = 'Here are some suggestions:\n[{"text":"Suggestion","justification":"Reason"}]\nThat is all.'
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Suggestion', justification: 'Reason' }])
  })

  it('filters out suggestions with empty text or justification', () => {
    const input = JSON.stringify([
      { text: 'Valid', justification: 'Reason' },
      { text: '', justification: 'Reason' },
      { text: 'Valid 2', justification: '' },
      { text: '   ', justification: 'Reason' },
    ])
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Valid', justification: 'Reason' }])
  })

  it('trims text and justification', () => {
    const input = JSON.stringify([
      { text: '  Suggestion  ', justification: '  Reason  ' },
    ])
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Suggestion', justification: 'Reason' }])
  })

  it('returns null for empty or whitespace-only input', () => {
    expect(parseProcessReviewSuggestionsFromText('')).toBeNull()
    expect(parseProcessReviewSuggestionsFromText('   ')).toBeNull()
    expect(parseProcessReviewSuggestionsFromText('\n\t')).toBeNull()
  })

  it('returns null when no valid array found', () => {
    expect(parseProcessReviewSuggestionsFromText('Just some text')).toBeNull()
    expect(parseProcessReviewSuggestionsFromText('{"not": "an array"}')).toBeNull()
  })

  it('handles nested strings with escaped quotes', () => {
    const input = '[{"text":"Suggestion with \\"quotes\\"","justification":"Reason"}]'
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Suggestion with "quotes"', justification: 'Reason' }])
  })

  it('handles array extraction from complex text', () => {
    const input = 'Before [{"text":"Suggestion","justification":"Reason"}] after'
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Suggestion', justification: 'Reason' }])
  })

  it('filters out non-object items in array', () => {
    const input = JSON.stringify([
      { text: 'Valid', justification: 'Reason' },
      'not an object',
      123,
      null,
    ])
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Valid', justification: 'Reason' }])
  })

  it('filters out objects missing text or justification', () => {
    const input = JSON.stringify([
      { text: 'Valid', justification: 'Reason' },
      { text: 'Missing justification' },
      { justification: 'Missing text' },
      { other: 'field' },
    ])
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Valid', justification: 'Reason' }])
  })
})
