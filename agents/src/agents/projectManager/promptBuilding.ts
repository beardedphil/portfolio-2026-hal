/**
 * Prompt building logic for the PM agent.
 * Extracted from projectManager.ts to improve maintainability.
 */

export interface PromptBuildingConfig {
  contextPack: string
  systemInstructions: string
  images?: Array<{ filename?: string; mimeType?: string; dataUrl: string }>
  openaiModel: string
}

export interface PromptResult {
  prompt: string | Array<{ type: 'text' | 'image'; text?: string; image?: string }>
  fullPromptText: string
}

export function buildPrompt(config: PromptBuildingConfig): PromptResult {
  const promptBase = `${config.contextPack}\n\n---\n\nRespond to the user message above using the tools as needed.`

  // Build full prompt text for display (system instructions + context pack + user message + images if present)
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
  const fullPromptText = `## System Instructions\n\n${config.systemInstructions}\n\n---\n\n## User Prompt\n\n${promptBase}${imageInfo}`

  // Build prompt with images if present
  // For vision models, prompt must be an array of content parts
  // For non-vision models, prompt is a string (images are ignored)
  let prompt: string | Array<{ type: 'text' | 'image'; text?: string; image?: string }>
  if (hasImages && isVisionModel) {
    // Vision model: use array format with text and images
    prompt = [
      { type: 'text' as const, text: promptBase },
      ...config.images!.map((img) => ({ type: 'image' as const, image: img.dataUrl })),
    ]
    // For vision models, note that images are included but not shown in text representation
    // The fullPromptText will show the text portion
  } else {
    // Non-vision model or no images: use string format
    prompt = promptBase
    if (hasImages && !isVisionModel) {
      // Log warning but don't fail - user can still send text
      console.warn('[PM Agent] Images provided but model does not support vision. Images will be ignored.')
    }
  }

  return { prompt, fullPromptText }
}
