/**
 * Prompt building logic extracted from projectManager.ts to improve maintainability.
 */

import type { PmAgentConfig } from './contextBuilding.js'

export function buildPromptText(
  contextPack: string,
  systemInstructions: string,
  config: PmAgentConfig
): string {
  const hasImages = config.images && config.images.length > 0
  const isVisionModel = config.openaiModel.includes('vision') || config.openaiModel.includes('gpt-4o')
  let imageInfo = ''
  if (hasImages) {
    const imageList = config.images!.map((img, idx) => `  ${idx + 1}. ${img.filename || `Image ${idx + 1}`} (${img.mimeType || 'image'})`).join('\n')
    if (isVisionModel) {
      imageInfo = `\n\n## Images (included in prompt)\n\n${imageList}\n\n(Note: Images are sent as base64-encoded data URLs in the prompt array, but are not shown in this text representation.)`
    } else {
      imageInfo = `\n\n## Images (provided but ignored)\n\n${imageList}\n\n(Note: Images were provided but the model (${config.openaiModel}) does not support vision. Images are ignored.)`
    }
  }
  return `## System Instructions\n\n${systemInstructions}\n\n---\n\n## User Prompt\n\n${contextPack}${imageInfo}`
}

export function buildPromptForModel(
  contextPack: string,
  config: PmAgentConfig
): string | Array<{ type: 'text' | 'image'; text?: string; image?: string }> {
  const hasImages = config.images && config.images.length > 0
  const isVisionModel = config.openaiModel.includes('vision') || config.openaiModel.includes('gpt-4o')
  
  if (hasImages && isVisionModel) {
    // Vision model: use array format with text and images
    return [
      { type: 'text' as const, text: contextPack },
      ...config.images!.map((img) => ({ type: 'image' as const, image: img.dataUrl })),
    ]
  } else {
    // Non-vision model or no images: use string format
    if (hasImages && !isVisionModel) {
      // Log warning but don't fail - user can still send text
      console.warn('[PM Agent] Images provided but model does not support vision. Images will be ignored.')
    }
    return contextPack
  }
}
