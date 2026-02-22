import { describe, it, expect } from 'vitest'
import { buildPrompt } from './promptBuilding.js'
import type { ImageData } from './promptBuilding.js'

describe('buildPrompt', () => {
  const baseConfig = {
    contextPack: 'Context pack content',
    systemInstructions: 'System instructions',
    message: 'User message',
    openaiModel: 'gpt-4',
  }

  describe('text-only prompts (non-vision models)', () => {
    it('builds string prompt for non-vision model without images', () => {
      const result = buildPrompt(baseConfig)

      expect(typeof result.prompt).toBe('string')
      expect(result.prompt).toContain('Context pack content')
      expect(result.prompt).toContain('Respond to the user message above')
      expect(result.fullPromptText).toContain('System Instructions')
      expect(result.fullPromptText).toContain('User Prompt')
    })

    it('builds string prompt for non-vision model with images (images ignored)', () => {
      const images: ImageData[] = [
        { filename: 'test.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,test' },
      ]

      const result = buildPrompt({
        ...baseConfig,
        images,
      })

      expect(typeof result.prompt).toBe('string')
      expect(result.fullPromptText).toContain('Images (provided but ignored)')
      expect(result.fullPromptText).toContain('test.png')
      expect(result.fullPromptText).toContain('does not support vision')
    })

    it('handles images without filename', () => {
      const images: ImageData[] = [
        { mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,test' },
      ]

      const result = buildPrompt({
        ...baseConfig,
        images,
      })

      expect(result.fullPromptText).toContain('Image 1')
    })

    it('handles images without mimeType', () => {
      const images: ImageData[] = [
        { filename: 'test.png', dataUrl: 'data:image/png;base64,test' },
      ]

      const result = buildPrompt({
        ...baseConfig,
        images,
      })

      expect(result.fullPromptText).toContain('test.png')
      expect(result.fullPromptText).toContain('(image)')
    })
  })

  describe('vision model prompts', () => {
    it('builds array prompt for vision model with images', () => {
      const images: ImageData[] = [
        { filename: 'test.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,test' },
      ]

      const result = buildPrompt({
        ...baseConfig,
        openaiModel: 'gpt-4o',
        images,
      })

      expect(Array.isArray(result.prompt)).toBe(true)
      const promptArray = result.prompt as Array<{ type: string; text?: string; image?: string }>
      expect(promptArray[0]).toEqual({ type: 'text', text: expect.stringContaining('Context pack content') })
      expect(promptArray[1]).toEqual({ type: 'image', image: 'data:image/png;base64,test' })
      expect(result.fullPromptText).toContain('Images (included in prompt)')
    })

    it('builds array prompt for vision model with multiple images', () => {
      const images: ImageData[] = [
        { filename: 'test1.png', dataUrl: 'data:image/png;base64,test1' },
        { filename: 'test2.jpg', dataUrl: 'data:image/jpeg;base64,test2' },
      ]

      const result = buildPrompt({
        ...baseConfig,
        openaiModel: 'gpt-4-vision',
        images,
      })

      expect(Array.isArray(result.prompt)).toBe(true)
      const promptArray = result.prompt as Array<{ type: string; text?: string; image?: string }>
      expect(promptArray.length).toBe(3) // 1 text + 2 images
      expect(promptArray[0].type).toBe('text')
      expect(promptArray[1]).toEqual({ type: 'image', image: 'data:image/png;base64,test1' })
      expect(promptArray[2]).toEqual({ type: 'image', image: 'data:image/jpeg;base64,test2' })
    })

    it('builds string prompt for vision model without images', () => {
      const result = buildPrompt({
        ...baseConfig,
        openaiModel: 'gpt-4o',
      })

      expect(typeof result.prompt).toBe('string')
      expect(result.fullPromptText).not.toContain('Images')
    })
  })

  describe('full prompt text generation', () => {
    it('includes system instructions in full prompt text', () => {
      const result = buildPrompt(baseConfig)

      expect(result.fullPromptText).toContain('## System Instructions')
      expect(result.fullPromptText).toContain('System instructions')
    })

    it('includes context pack in full prompt text', () => {
      const result = buildPrompt(baseConfig)

      expect(result.fullPromptText).toContain('Context pack content')
    })

    it('includes user prompt section in full prompt text', () => {
      const result = buildPrompt(baseConfig)

      expect(result.fullPromptText).toContain('## User Prompt')
    })

    it('formats image list correctly in full prompt text', () => {
      const images: ImageData[] = [
        { filename: 'test1.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,test1' },
        { filename: 'test2.jpg', mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,test2' },
      ]

      const result = buildPrompt({
        ...baseConfig,
        images,
      })

      expect(result.fullPromptText).toContain('1. test1.png (image/png)')
      expect(result.fullPromptText).toContain('2. test2.jpg (image/jpeg)')
    })
  })

  describe('edge cases', () => {
    it('handles empty context pack', () => {
      const result = buildPrompt({
        ...baseConfig,
        contextPack: '',
      })

      expect(result.prompt).toBeDefined()
      expect(result.fullPromptText).toBeDefined()
    })

    it('handles empty system instructions', () => {
      const result = buildPrompt({
        ...baseConfig,
        systemInstructions: '',
      })

      expect(result.fullPromptText).toContain('## System Instructions')
    })

    it('handles empty message', () => {
      const result = buildPrompt({
        ...baseConfig,
        message: '',
      })

      expect(result.prompt).toBeDefined()
    })

    it('handles empty images array', () => {
      const result = buildPrompt({
        ...baseConfig,
        images: [],
      })

      expect(typeof result.prompt).toBe('string')
      expect(result.fullPromptText).not.toContain('Images')
    })
  })
})
