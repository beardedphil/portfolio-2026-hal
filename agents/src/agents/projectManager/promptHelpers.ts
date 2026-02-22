/**
 * Helper functions for building prompts in PM agent.
 * Extracted from projectManager.ts to reduce complexity.
 */

import type { PmAgentConfig } from './contextBuilding.js'

/**
 * Build image info text for prompt display.
 */
export function buildImageInfo(config: PmAgentConfig): string {
  const hasImages = config.images && config.images.length > 0
  if (!hasImages) return ''

  const isVisionModel = config.openaiModel.includes('vision') || config.openaiModel.includes('gpt-4o')
  const imageList = config.images!.map((img, idx) => `  ${idx + 1}. ${img.filename || `Image ${idx + 1}`} (${img.mimeType || 'image'})`).join('\n')
  
  if (isVisionModel) {
    return `\n\n## Images (included in prompt)\n\n${imageList}\n\n(Note: Images are sent as base64-encoded data URLs in the prompt array, but are not shown in this text representation.)`
  } else {
    return `\n\n## Images (provided but ignored)\n\n${imageList}\n\n(Note: Images were provided but the model (${config.openaiModel}) does not support vision. Images are ignored.)`
  }
}

/**
 * Build full prompt text for display (system instructions + context pack + user message + images).
 */
export function buildFullPromptText(
  systemInstructions: string,
  contextPack: string,
  _userMessage: string,
  imageInfo: string
): string {
  const promptBase = `${contextPack}\n\n---\n\nRespond to the user message above using the tools as needed.`
  return `## System Instructions\n\n${systemInstructions}\n\n---\n\n## User Prompt\n\n${promptBase}${imageInfo}`
}

/**
 * Build prompt for AI SDK (string or array format for vision models).
 */
export function buildPrompt(
  contextPack: string,
  config: PmAgentConfig
): string | Array<{ type: 'text' | 'image'; text?: string; image?: string }> {
  const promptBase = `${contextPack}\n\n---\n\nRespond to the user message above using the tools as needed.`
  const hasImages = config.images && config.images.length > 0
  const isVisionModel = config.openaiModel.includes('vision') || config.openaiModel.includes('gpt-4o')

  if (hasImages && isVisionModel) {
    return [
      { type: 'text' as const, text: promptBase },
      ...config.images!.map((img) => ({ type: 'image' as const, image: img.dataUrl })),
    ]
  } else {
    if (hasImages && !isVisionModel) {
      console.warn('[PM Agent] Images provided but model does not support vision. Images will be ignored.')
    }
    return promptBase
  }
}
