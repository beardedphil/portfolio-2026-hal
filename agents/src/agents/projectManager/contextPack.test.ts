/**
 * Unit tests for contextPack.ts
 */

import { describe, it, expect } from 'vitest'
import { recentTurnsWithinCharBudget, formatPmInputsSummary } from './contextPack.js'
import type { PmAgentConfig, ConversationTurn } from './types.js'

describe('recentTurnsWithinCharBudget', () => {
  it('should return empty arrays when turns is empty', () => {
    const result = recentTurnsWithinCharBudget([], 1000)
    expect(result.recent).toEqual([])
    expect(result.omitted).toBe(0)
  })

  it('should include all turns when total length is within budget', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ]
    const result = recentTurnsWithinCharBudget(turns, 1000)
    expect(result.recent).toHaveLength(2)
    expect(result.omitted).toBe(0)
    expect(result.recent[0].content).toBe('Hello')
    expect(result.recent[1].content).toBe('Hi there')
  })

  it('should truncate turns when total length exceeds budget', () => {
    // Create turns that exceed the budget
    const longContent = 'x'.repeat(1000)
    const turns: ConversationTurn[] = [
      { role: 'user', content: longContent },
      { role: 'assistant', content: longContent },
      { role: 'user', content: longContent },
    ]
    const result = recentTurnsWithinCharBudget(turns, 500)
    // Should include some turns but not all
    expect(result.recent.length).toBeLessThan(turns.length)
    expect(result.omitted).toBeGreaterThan(0)
    // Should always include at least the most recent turn
    expect(result.recent.length).toBeGreaterThan(0)
  })

  it('should process turns from most recent to oldest', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Second' },
      { role: 'user', content: 'Third' },
    ]
    const result = recentTurnsWithinCharBudget(turns, 1000)
    // Most recent turn should be last in the array
    expect(result.recent[result.recent.length - 1].content).toBe('Third')
  })

  it('should calculate character count including role and formatting overhead', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', content: 'Test' },
    ]
    const result = recentTurnsWithinCharBudget(turns, 5) // Very small budget
    // Should still include the turn even if content alone fits, because we account for overhead
    expect(result.recent.length).toBeGreaterThanOrEqual(1)
  })
})

describe('formatPmInputsSummary', () => {
  const baseConfig: Partial<PmAgentConfig> = {
    repoRoot: '/test/repo',
    openaiApiKey: 'test-key',
    openaiModel: 'gpt-4',
  }

  it('should format inputs summary with all tools enabled when Supabase is available', () => {
    const config: PmAgentConfig = {
      ...baseConfig,
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-key',
      repoFullName: 'test/repo',
      images: [{ dataUrl: 'data:image/png;base64,test', filename: 'img.png', mimeType: 'image/png' }],
    } as PmAgentConfig

    const result = formatPmInputsSummary(config)
    
    // Should show Supabase as available
    expect(result).toContain('**supabase**: available (ticket tools enabled)')
    // Should list ticket tools as enabled
    expect(result).toContain('create_ticket')
    expect(result).toContain('sync_tickets')
    // Should not show "Tools not available" section when all required inputs are present
    expect(result).not.toContain('Tools not available')
  })

  it('should format inputs summary with ticket tools disabled when Supabase is missing', () => {
    const config: PmAgentConfig = {
      ...baseConfig,
      repoFullName: 'test/repo',
      // No supabaseUrl or supabaseAnonKey
    } as PmAgentConfig

    const result = formatPmInputsSummary(config)
    
    // Should show Supabase as not provided
    expect(result).toContain('**supabase**: not provided (ticket tools disabled)')
    // Should list ticket tools as disabled
    expect(result).toContain('Tools not available')
    expect(result).toContain('create_ticket')
  })

  it('should include image count and vision model detection', () => {
    const config: PmAgentConfig = {
      ...baseConfig,
      openaiModel: 'gpt-4o',
      images: [
        { dataUrl: 'data:image/png;base64,test1', filename: 'img1.png', mimeType: 'image/png' },
        { dataUrl: 'data:image/png;base64,test2', filename: 'img2.png', mimeType: 'image/png' },
      ],
    } as PmAgentConfig

    const result = formatPmInputsSummary(config)
    
    // Should show image count
    expect(result).toContain('**images**: 2')
    // Should detect vision model
    expect(result).toContain('included')
  })

  it('should show conversation source correctly', () => {
    const configWithContextPack: PmAgentConfig = {
      ...baseConfig,
      conversationContextPack: 'Pre-built context',
    } as PmAgentConfig

    const result1 = formatPmInputsSummary(configWithContextPack)
    expect(result1).toContain('**conversation context**: conversationContextPack (DB-derived)')

    const configWithHistory: PmAgentConfig = {
      ...baseConfig,
      conversationHistory: [{ role: 'user', content: 'Hello' }],
    } as PmAgentConfig

    const result2 = formatPmInputsSummary(configWithHistory)
    expect(result2).toContain('**conversation context**: conversationHistory (client-provided)')

    const configWithNeither: PmAgentConfig = {
      ...baseConfig,
    } as PmAgentConfig

    const result3 = formatPmInputsSummary(configWithNeither)
    expect(result3).toContain('**conversation context**: none')
  })

  it('should show working memory status', () => {
    const configWithMemory: PmAgentConfig = {
      ...baseConfig,
      workingMemoryText: 'Working memory content',
    } as PmAgentConfig

    const result = formatPmInputsSummary(configWithMemory)
    expect(result).toContain('**working memory**: present')

    const configWithoutMemory: PmAgentConfig = {
      ...baseConfig,
    } as PmAgentConfig

    const result2 = formatPmInputsSummary(configWithoutMemory)
    expect(result2).toContain('**working memory**: absent')
  })

  it('should handle attach_image_to_ticket tool availability based on Supabase and images', () => {
    const configWithSupabaseAndImages: PmAgentConfig = {
      ...baseConfig,
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-key',
      images: [{ dataUrl: 'data:image/png;base64,test', filename: 'img.png', mimeType: 'image/png' }],
    } as PmAgentConfig

    const result1 = formatPmInputsSummary(configWithSupabaseAndImages)
    // Should show attach_image_to_ticket as available
    expect(result1).toContain('attach_image_to_ticket')
    expect(result1).not.toContain('Tools not available')

    const configWithSupabaseNoImages: PmAgentConfig = {
      ...baseConfig,
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-key',
      images: [],
    } as PmAgentConfig

    const result2 = formatPmInputsSummary(configWithSupabaseNoImages)
    // Should show attach_image_to_ticket as not available
    expect(result2).toContain('Tools not available')
    expect(result2).toContain('attach_image_to_ticket')
  })
})
