/**
 * Unit tests for api/agent-runs/status.ts helper functions.
 * Tests the behavior being refactored to ensure equivalence after refactoring.
 */

import { describe, it, expect } from 'vitest'
import {
  capText,
  isPlaceholderSummary,
  getLastAssistantMessage,
  parseProcessReviewSuggestionsFromText,
} from './status.js'

const MAX_RUN_SUMMARY_CHARS = 20_000

describe('capText', () => {
  it('returns input unchanged when length is within limit', () => {
    const input = 'Short text'
    expect(capText(input, MAX_RUN_SUMMARY_CHARS)).toBe(input)
    expect(capText(input, 100)).toBe(input)
  })

  it('truncates text when exceeding limit and appends [truncated]', () => {
    const longText = 'a'.repeat(MAX_RUN_SUMMARY_CHARS + 100)
    const result = capText(longText, MAX_RUN_SUMMARY_CHARS)
    expect(result.length).toBeLessThanOrEqual(MAX_RUN_SUMMARY_CHARS + 15) // +15 for "\n\n[truncated]"
    expect(result).toContain('[truncated]')
    expect(result.slice(0, MAX_RUN_SUMMARY_CHARS)).toBe(longText.slice(0, MAX_RUN_SUMMARY_CHARS))
  })

  it('handles exact boundary at limit', () => {
    const exactText = 'a'.repeat(MAX_RUN_SUMMARY_CHARS)
    expect(capText(exactText, MAX_RUN_SUMMARY_CHARS)).toBe(exactText)
    
    const oneOver = 'a'.repeat(MAX_RUN_SUMMARY_CHARS + 1)
    const result = capText(oneOver, MAX_RUN_SUMMARY_CHARS)
    expect(result).toContain('[truncated]')
  })
})

describe('isPlaceholderSummary', () => {
  it('returns true for null or undefined', () => {
    expect(isPlaceholderSummary(null)).toBe(true)
    expect(isPlaceholderSummary(undefined)).toBe(true)
  })

  it('returns true for empty or whitespace-only strings', () => {
    expect(isPlaceholderSummary('')).toBe(true)
    expect(isPlaceholderSummary('   ')).toBe(true)
    expect(isPlaceholderSummary('\n\t')).toBe(true)
  })

  it('returns true for known placeholder values', () => {
    expect(isPlaceholderSummary('Completed.')).toBe(true)
    expect(isPlaceholderSummary('Done.')).toBe(true)
    expect(isPlaceholderSummary('Complete.')).toBe(true)
    expect(isPlaceholderSummary('Finished.')).toBe(true)
  })

  it('returns true for placeholder values with whitespace', () => {
    expect(isPlaceholderSummary('  Completed.  ')).toBe(true)
    expect(isPlaceholderSummary('\nDone.\n')).toBe(true)
  })

  it('returns false for non-placeholder text', () => {
    expect(isPlaceholderSummary('Implementation completed successfully')).toBe(false)
    expect(isPlaceholderSummary('Task done with changes')).toBe(false)
    expect(isPlaceholderSummary('Completed: Added feature X')).toBe(false)
  })

  it('is case-sensitive for placeholder detection', () => {
    expect(isPlaceholderSummary('completed.')).toBe(false) // lowercase
    expect(isPlaceholderSummary('COMPLETED.')).toBe(false) // uppercase
  })
})

describe('getLastAssistantMessage', () => {
  it('returns null for invalid JSON', () => {
    expect(getLastAssistantMessage('not json')).toBe(null)
    expect(getLastAssistantMessage('{ invalid }')).toBe(null)
  })

  it('returns null for empty conversation', () => {
    expect(getLastAssistantMessage('{}')).toBe(null)
    expect(getLastAssistantMessage('{"messages": []}')).toBe(null)
  })

  it('extracts last assistant message from messages array', () => {
    const conv = {
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
        { role: 'user', content: 'How are you?' },
        { role: 'assistant', content: 'I am doing well' },
      ],
    }
    expect(getLastAssistantMessage(JSON.stringify(conv))).toBe('I am doing well')
  })

  it('extracts from conversation.messages structure', () => {
    const conv = {
      conversation: {
        messages: [
          { role: 'user', content: 'Test' },
          { role: 'assistant', content: 'Response' },
        ],
      },
    }
    expect(getLastAssistantMessage(JSON.stringify(conv))).toBe('Response')
  })

  it('handles string content', () => {
    const conv = {
      messages: [{ role: 'assistant', content: 'Simple string message' }],
    }
    expect(getLastAssistantMessage(JSON.stringify(conv))).toBe('Simple string message')
  })

  it('handles array content with text property', () => {
    const conv = {
      messages: [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Message from array' }],
        },
      ],
    }
    expect(getLastAssistantMessage(JSON.stringify(conv))).toBe('Message from array')
  })

  it('handles array content with content property', () => {
    const conv = {
      messages: [
        {
          role: 'assistant',
          content: [{ content: 'Message with content prop' }],
        },
      ],
    }
    expect(getLastAssistantMessage(JSON.stringify(conv))).toBe('Message with content prop')
  })

  it('handles object content with text property', () => {
    const conv = {
      messages: [{ role: 'assistant', content: { text: 'Object message' } }],
    }
    expect(getLastAssistantMessage(JSON.stringify(conv))).toBe('Object message')
  })

  it('skips empty or whitespace-only messages', () => {
    const conv = {
      messages: [
        { role: 'assistant', content: '   ' },
        { role: 'assistant', content: 'Valid message' },
      ],
    }
    expect(getLastAssistantMessage(JSON.stringify(conv))).toBe('Valid message')
  })

  it('skips non-assistant messages', () => {
    const conv = {
      messages: [
        { role: 'user', content: 'User message' },
        { role: 'system', content: 'System message' },
      ],
    }
    expect(getLastAssistantMessage(JSON.stringify(conv))).toBe(null)
  })

  it('returns null when no assistant messages found', () => {
    const conv = {
      messages: [
        { role: 'user', content: 'User 1' },
        { role: 'user', content: 'User 2' },
      ],
    }
    expect(getLastAssistantMessage(JSON.stringify(conv))).toBe(null)
  })
})

describe('parseProcessReviewSuggestionsFromText', () => {
  it('returns null for empty or whitespace input', () => {
    expect(parseProcessReviewSuggestionsFromText('')).toBe(null)
    expect(parseProcessReviewSuggestionsFromText('   ')).toBe(null)
    expect(parseProcessReviewSuggestionsFromText('\n\t')).toBe(null)
  })

  it('parses direct JSON array', () => {
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

  it('parses JSON array from markdown code block', () => {
    const json = JSON.stringify([{ text: 'Test', justification: 'Test reason' }])
    const input = `Here is the data:\n\`\`\`json\n${json}\n\`\`\``
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Test', justification: 'Test reason' }])
  })

  it('parses JSON array from plain code block', () => {
    const json = JSON.stringify([{ text: 'Test', justification: 'Test reason' }])
    const input = `\`\`\`\n${json}\n\`\`\``
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Test', justification: 'Test reason' }])
  })

  it('extracts JSON array from text with surrounding content', () => {
    const json = JSON.stringify([{ text: 'Extracted', justification: 'From text' }])
    const input = `Some text before [${json.slice(1, -1)}] and after`
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Extracted', justification: 'From text' }])
  })

  it('filters out invalid suggestions (missing text)', () => {
    const input = JSON.stringify([
      { text: 'Valid', justification: 'Reason' },
      { justification: 'Missing text' },
    ])
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Valid', justification: 'Reason' }])
  })

  it('filters out invalid suggestions (missing justification)', () => {
    const input = JSON.stringify([
      { text: 'Valid', justification: 'Reason' },
      { text: 'Missing justification' },
    ])
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Valid', justification: 'Reason' }])
  })

  it('filters out empty text or justification after trimming', () => {
    const input = JSON.stringify([
      { text: 'Valid', justification: 'Reason' },
      { text: '   ', justification: 'Reason' },
      { text: 'Text', justification: '   ' },
    ])
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'Valid', justification: 'Reason' }])
  })

  it('trims text and justification values', () => {
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

  it('returns null when no valid JSON array found', () => {
    expect(parseProcessReviewSuggestionsFromText('Just plain text')).toBe(null)
    expect(parseProcessReviewSuggestionsFromText('No brackets here')).toBe(null)
  })

  it('handles escaped quotes in JSON strings', () => {
    const input = JSON.stringify([
      { text: 'Text with "quotes"', justification: 'Reason with "quotes"' },
    ])
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([
      { text: 'Text with "quotes"', justification: 'Reason with "quotes"' },
    ])
  })

  it('extracts from code block when direct JSON parse fails due to mixed content', () => {
    const direct = JSON.stringify([{ text: 'Direct', justification: 'Direct reason' }])
    const inBlock = JSON.stringify([{ text: 'In block', justification: 'Block reason' }])
    // When text contains both JSON and code blocks, code block extraction takes precedence
    // because the whole text is not valid JSON
    const input = `${direct}\n\`\`\`json\n${inBlock}\n\`\`\``
    const result = parseProcessReviewSuggestionsFromText(input)
    expect(result).toEqual([{ text: 'In block', justification: 'Block reason' }])
  })
})
