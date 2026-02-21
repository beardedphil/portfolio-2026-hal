/**
 * Helper functions for building prompts in PM agent.
 * Extracted to improve maintainability.
 */

import type { PmAgentConfig } from './contextBuilding.js'

/**
 * Builds image info text for prompt display.
 */
export function buildImageInfo(
  images: Array<{ dataUrl: string; filename: string; mimeType: string }> | undefined,
  isVisionModel: boolean,
  modelName: string
): string {
  if (!images || images.length === 0) return ''
  
  const imageList = images
    .map((img, idx) => `  ${idx + 1}. ${img.filename || `Image ${idx + 1}`} (${img.mimeType || 'image'})`)
    .join('\n')
  
  if (isVisionModel) {
    return `\n\n## Images (included in prompt)\n\n${imageList}\n\n(Note: Images are sent as base64-encoded data URLs in the prompt array, but are not shown in this text representation.)`
  } else {
    return `\n\n## Images (provided but ignored)\n\n${imageList}\n\n(Note: Images were provided but the model (${modelName}) does not support vision. Images are ignored.)`
  }
}

/**
 * Checks if model supports vision.
 */
export function isVisionModel(model: string): boolean {
  return model.includes('vision') || model.includes('gpt-4o')
}

/**
 * Builds the full prompt text for display (system instructions + context pack + user message + images).
 */
export function buildFullPromptText(
  systemInstructions: string,
  contextPack: string,
  config: PmAgentConfig
): string {
  const promptBase = `${contextPack}\n\n---\n\nRespond to the user message above using the tools as needed.`
  const visionModel = isVisionModel(config.openaiModel)
  const imageInfo = buildImageInfo(config.images, visionModel, config.openaiModel)
  
  return `## System Instructions\n\n${systemInstructions}\n\n---\n\n## User Prompt\n\n${promptBase}${imageInfo}`
}

/**
 * Builds the prompt for the LLM (string or array format for vision models).
 */
export function buildPrompt(
  contextPack: string,
  config: PmAgentConfig
): string | Array<{ type: 'text' | 'image'; text?: string; image?: string }> {
  const promptBase = `${contextPack}\n\n---\n\nRespond to the user message above using the tools as needed.`
  const visionModel = isVisionModel(config.openaiModel)
  
  if (config.images && config.images.length > 0 && visionModel) {
    return [
      { type: 'text' as const, text: promptBase },
      ...config.images.map((img) => ({ type: 'image' as const, image: img.dataUrl })),
    ]
  }
  
  return promptBase
}
