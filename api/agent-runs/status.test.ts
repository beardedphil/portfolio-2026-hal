import { describe, it, expect } from 'vitest'
import {
  capText,
  isPlaceholderSummary,
  getLastAssistantMessage,
  parseProcessReviewSuggestionsFromText,
} from './status.js'

describe('status.ts helper functions', () => {
  describe('capText', () => {
    it('returns text unchanged if within maxChars limit', () => {
      const input = 'Short text'
      const maxChars = 20
      const result = capText(input, maxChars)
      expect(result).toBe('Short text')
    })

    it('truncates text and adds [truncated] marker when exceeding maxChars', () => {
      const input = 'This is a very long text that exceeds the maximum character limit'
      const maxChars = 20
      const result = capText(input, maxChars)
      expect(result).toBe('This is a very long \n\n[truncated]')
    })

    it('handles empty string', () => {
      const input = ''
      const maxChars = 20
      const result = capText(input, maxChars)
      expect(result).toBe('')
    })

    it('handles exact maxChars length', () => {
      const input = 'Exactly twenty chars'
      const maxChars = 20
      const result = capText(input, maxChars)
      expect(result).toBe('Exactly twenty chars')
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

    it('returns false for substantive summary', () => {
      expect(isPlaceholderSummary('Implemented feature X with tests and documentation')).toBe(false)
    })

    it('handles whitespace-only strings', () => {
      expect(isPlaceholderSummary('   ')).toBe(true)
    })
  })

  describe('getLastAssistantMessage', () => {
    it('extracts last assistant message from simple conversation', () => {
      const conversationText = JSON.stringify({
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
      })
      
      const result = getLastAssistantMessage(conversationText)
      expect(result).toBe('Hi there!')
    })

    it('returns null for empty conversation', () => {
      const conversationText = JSON.stringify({ messages: [] })
      const result = getLastAssistantMessage(conversationText)
      expect(result).toBeNull()
    })

    it('handles conversation with nested structure', () => {
      const conversationText = JSON.stringify({
        conversation: {
          messages: [
            { role: 'user', content: 'Question' },
            { role: 'assistant', content: 'Answer' },
          ],
        },
      })
      
      const result = getLastAssistantMessage(conversationText)
      expect(result).toBe('Answer')
    })

    it('returns null for invalid JSON', () => {
      const conversationText = 'invalid json'
      const result = getLastAssistantMessage(conversationText)
      expect(result).toBeNull()
    })

    it('handles array content format', () => {
      const conversationText = JSON.stringify({
        messages: [
          { role: 'user', content: 'Question' },
          { 
            role: 'assistant', 
            content: [
              { type: 'text', text: 'First part' },
              { type: 'text', text: 'Second part' },
            ]
          },
        ],
      })
      
      const result = getLastAssistantMessage(conversationText)
      expect(result).toBe('First partSecond part')
    })

    it('handles object content with text property', () => {
      const conversationText = JSON.stringify({
        messages: [
          { role: 'assistant', content: { text: 'Message text' } },
        ],
      })
      
      const result = getLastAssistantMessage(conversationText)
      expect(result).toBe('Message text')
    })
  })

  describe('parseProcessReviewSuggestionsFromText', () => {
    it('parses JSON array directly', () => {
      const input = JSON.stringify([
        { text: 'Suggestion 1', justification: 'Reason 1' },
        { text: 'Suggestion 2', justification: 'Reason 2' },
      ])
      
      const result = parseProcessReviewSuggestionsFromText(input)
      
      expect(result).not.toBeNull()
      expect(result).toHaveLength(2)
      expect(result![0].text).toBe('Suggestion 1')
      expect(result![0].justification).toBe('Reason 1')
      expect(result![1].text).toBe('Suggestion 2')
      expect(result![1].justification).toBe('Reason 2')
    })

    it('parses JSON from markdown code block', () => {
      const input = '```json\n' + JSON.stringify([
        { text: 'Suggestion', justification: 'Reason' },
      ]) + '\n```'
      
      const result = parseProcessReviewSuggestionsFromText(input)
      
      expect(result).not.toBeNull()
      expect(result).toHaveLength(1)
      expect(result![0].text).toBe('Suggestion')
      expect(result![0].justification).toBe('Reason')
    })

    it('parses JSON from plain markdown code block', () => {
      const input = '```\n' + JSON.stringify([
        { text: 'Suggestion', justification: 'Reason' },
      ]) + '\n```'
      
      const result = parseProcessReviewSuggestionsFromText(input)
      
      expect(result).not.toBeNull()
      expect(result).toHaveLength(1)
    })

    it('returns null for empty text', () => {
      const result = parseProcessReviewSuggestionsFromText('')
      expect(result).toBeNull()
    })

    it('filters out invalid suggestions', () => {
      const input = JSON.stringify([
        { text: 'Valid', justification: 'Reason' },
        { text: '', justification: 'Invalid' }, // Empty text
        { text: 'Valid2', justification: '' }, // Empty justification
        { notText: 'Wrong', notJustification: 'Wrong' }, // Missing fields
      ])
      
      const result = parseProcessReviewSuggestionsFromText(input)
      
      expect(result).not.toBeNull()
      expect(result).toHaveLength(1)
      expect(result![0].text).toBe('Valid')
      expect(result![0].justification).toBe('Reason')
    })

    it('extracts JSON array from text with surrounding content', () => {
      const input = 'Some text before [{"text": "Suggestion", "justification": "Reason"}] and after'
      const result = parseProcessReviewSuggestionsFromText(input)
      
      expect(result).not.toBeNull()
      expect(result).toHaveLength(1)
      expect(result![0].text).toBe('Suggestion')
    })

    it('handles escaped quotes in JSON strings', () => {
      const input = JSON.stringify([
        { text: 'Suggestion with "quotes"', justification: 'Reason with "quotes"' },
      ])
      
      const result = parseProcessReviewSuggestionsFromText(input)
      
      expect(result).not.toBeNull()
      expect(result).toHaveLength(1)
      expect(result![0].text).toBe('Suggestion with "quotes"')
    })
  })
})
