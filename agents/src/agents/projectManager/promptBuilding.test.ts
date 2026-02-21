import { describe, it, expect } from 'vitest'
import {
  buildImageInfo,
  isVisionModel,
  buildFullPromptText,
  buildPrompt,
} from './promptBuilding'
import type { PmAgentConfig } from './contextBuilding'

describe('isVisionModel', () => {
  it('detects vision models', () => {
    expect(isVisionModel('gpt-4o')).toBe(true)
    expect(isVisionModel('gpt-4-vision')).toBe(true)
    expect(isVisionModel('gpt-4o-preview')).toBe(true)
  })

  it('detects non-vision models', () => {
    expect(isVisionModel('gpt-4')).toBe(false)
    expect(isVisionModel('gpt-3.5-turbo')).toBe(false)
    expect(isVisionModel('claude-3')).toBe(false)
  })
})

describe('buildImageInfo', () => {
  it('returns empty string when no images', () => {
    expect(buildImageInfo(undefined, true, 'gpt-4o')).toBe('')
    expect(buildImageInfo([], true, 'gpt-4o')).toBe('')
  })

  it('builds info for vision models', () => {
    const images = [
      { dataUrl: 'data:image/png;base64,xxx', filename: 'test.png', mimeType: 'image/png' },
    ]
    const result = buildImageInfo(images, true, 'gpt-4o')
    expect(result).toContain('Images (included in prompt)')
    expect(result).toContain('test.png')
    expect(result).not.toContain('ignored')
  })

  it('builds info for non-vision models', () => {
    const images = [
      { dataUrl: 'data:image/png;base64,xxx', filename: 'test.png', mimeType: 'image/png' },
    ]
    const result = buildImageInfo(images, false, 'gpt-4')
    expect(result).toContain('Images (provided but ignored)')
    expect(result).toContain('test.png')
    expect(result).toContain('gpt-4')
  })

  it('handles multiple images', () => {
    const images = [
      { dataUrl: 'data:image/png;base64,xxx', filename: 'test1.png', mimeType: 'image/png' },
      { dataUrl: 'data:image/jpeg;base64,yyy', filename: 'test2.jpg', mimeType: 'image/jpeg' },
    ]
    const result = buildImageInfo(images, true, 'gpt-4o')
    expect(result).toContain('test1.png')
    expect(result).toContain('test2.jpg')
  })
})

describe('buildFullPromptText', () => {
  const baseConfig: PmAgentConfig = {
    repoRoot: '/test',
    openaiApiKey: 'test-key',
    openaiModel: 'gpt-4',
  }

  it('builds prompt without images', () => {
    const result = buildFullPromptText('System instructions', 'Context pack', baseConfig)
    expect(result).toContain('System Instructions')
    expect(result).toContain('Context pack')
    expect(result).not.toContain('Images')
  })

  it('builds prompt with images for vision model', () => {
    const config: PmAgentConfig = {
      ...baseConfig,
      openaiModel: 'gpt-4o',
      images: [{ dataUrl: 'data:image/png;base64,xxx', filename: 'test.png', mimeType: 'image/png' }],
    }
    const result = buildFullPromptText('System instructions', 'Context pack', config)
    expect(result).toContain('Images (included in prompt)')
    expect(result).toContain('test.png')
  })

  it('builds prompt with images for non-vision model', () => {
    const config: PmAgentConfig = {
      ...baseConfig,
      images: [{ dataUrl: 'data:image/png;base64,xxx', filename: 'test.png', mimeType: 'image/png' }],
    }
    const result = buildFullPromptText('System instructions', 'Context pack', config)
    expect(result).toContain('Images (provided but ignored)')
    expect(result).toContain('gpt-4')
  })
})

describe('buildPrompt', () => {
  const baseConfig: PmAgentConfig = {
    repoRoot: '/test',
    openaiApiKey: 'test-key',
    openaiModel: 'gpt-4',
  }

  it('returns string for non-vision model', () => {
    const result = buildPrompt('Context pack', baseConfig)
    expect(typeof result).toBe('string')
    expect(result).toContain('Context pack')
  })

  it('returns array for vision model with images', () => {
    const config: PmAgentConfig = {
      ...baseConfig,
      openaiModel: 'gpt-4o',
      images: [{ dataUrl: 'data:image/png;base64,xxx', filename: 'test.png', mimeType: 'image/png' }],
    }
    const result = buildPrompt('Context pack', config)
    expect(Array.isArray(result)).toBe(true)
    if (Array.isArray(result)) {
      expect(result[0].type).toBe('text')
      expect(result[1].type).toBe('image')
    }
  })

  it('returns string for vision model without images', () => {
    const config: PmAgentConfig = {
      ...baseConfig,
      openaiModel: 'gpt-4o',
    }
    const result = buildPrompt('Context pack', config)
    expect(typeof result).toBe('string')
  })
})
