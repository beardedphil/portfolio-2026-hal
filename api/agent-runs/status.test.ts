/**
 * Unit tests for api/agent-runs/status.ts
 * Tests the behavior of utility functions used in status polling.
 */

import { describe, it, expect } from 'vitest'
import {
  capText,
  isPlaceholderSummary,
  getLastAssistantMessage,
  parseProcessReviewSuggestionsFromText,
} from './status.js'

describe('capText', () => {
  it('returns input unchanged when length is within limit', () => {
    const input = 'Short text'
    expect(capText(input, 100)).toBe(input)
  })

  it('returns input unchanged when length equals limit', () => {
    const input = 'Exactly 20 chars'
    expect(capText(input, 20)).toBe(input)
  })

  it('truncates text and appends [truncated] when exceeding limit', () => {
    const input = 'This is a very long text that exceeds the maximum character limit'
    const result = capText(input, 20)
    expect(result).toBe('This is a very long \n\n[truncated]')
    expect(result.length).toBeGreaterThan(20)
  })

  it('handles empty string', () => {
    expect(capText('', 10)).toBe('')
  })

  it('handles zero maxChars', () => {
    const input = 'Some text'
    const result = capText(input, 0)
    expect(result).toBe('\n\n[truncated]')
  })
})

describe('isPlaceholderSummary', () => {
  it('returns true for empty string', () => {
    expect(isPlaceholderSummary('')).toBe(true)
  })

  it('returns true for null', () => {
    expect(isPlaceholderSummary(null)).toBe(true)
  })

  it('returns true for undefined', () => {
    expect(isPlaceholderSummary(undefined)).toBe(true)
  })

  it('returns true for whitespace-only string', () => {
    expect(isPlaceholderSummary('   ')).toBe(true)
    expect(isPlaceholderSummary('\n\t')).toBe(true)
  })

  it('returns true for "Completed."', () => {
    expect(isPlaceholderSummary('Completed.')).toBe(true)
  })

  it('returns true for "Done."', () => {
    expect(isPlaceholderSummary('Done.')).toBe(true)
  })

  it('returns true for "Complete."', () => {
    expect(isPlaceholderSummary('Complete.')).toBe(true)
  })

  it('returns true for "Finished."', () => {
    expect(isPlaceholderSummary('Finished.')).toBe(true)
  })

  it('returns false for substantive content', () => {
    expect(isPlaceholderSummary('Implementation completed successfully.')).toBe(false)
    expect(isPlaceholderSummary('Added unit tests and refactored code.')).toBe(false)
  })

  it('handles case sensitivity correctly', () => {
    expect(isPlaceholderSummary('completed.')).toBe(false) // lowercase
    expect(isPlaceholderSummary('DONE.')).toBe(false) // uppercase
  })
})

describe('getLastAssistantMessage', () => {
  it('returns null for invalid JSON', () => {
    expect(getLastAssistantMessage('not json')).toBe(null)
    expect(getLastAssistantMessage('{ invalid }')).toBe(null)
  })

  it('returns null for empty object', () => {
    expect(getLastAssistantMessage('{}')).toBe(null)
  })

  it('extracts last assistant message from messages array', () => {
    const conversation = {
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'First response' },
        { role: 'user', content: 'Follow up' },
        { role: 'assistant', content: 'Last response' },
      ],
    }
    expect(getLastAssistantMessage(JSON.stringify(conversation))).toBe('Last response')
  })

  it('extracts from conversation.messages structure', () => {
    const conversation = {
      conversation: {
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Response from nested structure' },
        ],
      },
    }
    expect(getLastAssistantMessage(JSON.stringify(conversation))).toBe('Response from nested structure')
  })

  it('handles array content format', () => {
    const conversation = {
      messages: [
        { role: 'assistant', content: [{ type: 'text', text: 'Array content response' }] },
      ],
    }
    expect(getLastAssistantMessage(JSON.stringify(conversation))).toBe('Array content response')
  })

  it('handles content with text property', () => {
    const conversation = {
      messages: [
        { role: 'assistant', content: { text: 'Text property response' } },
      ],
    }
    expect(getLastAssistantMessage(JSON.stringify(conversation))).toBe('Text property response')
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

  it('returns null when no assistant messages', () => {
    const conversation = {
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'system', content: 'System message' },
      ],
    }
    expect(getLastAssistantMessage(JSON.stringify(conversation))).toBe(null)
  })

  it('handles mixed content types in array', () => {
    const conversation = {
      messages: [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'First part' },
            { type: 'text', text: 'Second part' },
          ],
        },
      ],
    }
    expect(getLastAssistantMessage(JSON.stringify(conversation))).toBe('First partSecond part')
  })
})

describe('parseProcessReviewSuggestionsFromText', () => {
  it('returns null for empty string', () => {
    expect(parseProcessReviewSuggestionsFromText('')).toBe(null)
  })

  it('returns null for whitespace-only string', () => {
    expect(parseProcessReviewSuggestionsFromText('   ')).toBe(null)
  })

  it('parses valid JSON array directly', () => {
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
    const input = '```json\n' + JSON.stringify([
      { text: 'Suggestion', justification: 'Reason' },
    ]) + '\n```'
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([
      { text: 'Suggestion', justification: 'Reason' },
    ])
  })

  it('parses JSON from plain code block', () => {
    const input = '```\n' + JSON.stringify([
      { text: 'Suggestion', justification: 'Reason' },
    ]) + '\n```'
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([
      { text: 'Suggestion', justification: 'Reason' },
    ])
  })

  it('filters out invalid items', () => {
    const input = JSON.stringify([
      { text: 'Valid', justification: 'Reason' },
      { text: '', justification: 'Empty text' }, // Invalid: empty text
      { text: 'Valid 2', justification: '' }, // Invalid: empty justification
      { notText: 'Invalid', notJustification: 'Invalid' }, // Invalid: wrong properties
      { text: 'Valid 3', justification: 'Reason 3' },
    ])
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([
      { text: 'Valid', justification: 'Reason' },
      { text: 'Valid 3', justification: 'Reason 3' },
    ])
  })

  it('trims text and justification', () => {
    const input = JSON.stringify([
      { text: '  Trimmed text  ', justification: '  Trimmed reason  ' },
    ])
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([
      { text: 'Trimmed text', justification: 'Trimmed reason' },
    ])
  })

  it('returns null for non-array JSON', () => {
    expect(parseProcessReviewSuggestionsFromText('{"not": "array"}')).toBe(null)
    expect(parseProcessReviewSuggestionsFromText('"string"')).toBe(null)
    expect(parseProcessReviewSuggestionsFromText('123')).toBe(null)
  })

  it('extracts JSON array from text with surrounding content', () => {
    const input = 'Some text before [{"text": "Suggestion", "justification": "Reason"}] some text after'
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([
      { text: 'Suggestion', justification: 'Reason' },
    ])
  })

  it('handles escaped quotes in JSON', () => {
    const input = JSON.stringify([
      { text: 'Suggestion with "quotes"', justification: 'Reason with "quotes"' },
    ])
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([
      { text: 'Suggestion with "quotes"', justification: 'Reason with "quotes"' },
    ])
  })

  it('returns null for invalid JSON in code block', () => {
    expect(parseProcessReviewSuggestionsFromText('```json\n{ invalid json }\n```')).toBe(null)
  })
})
