/**
 * Prompt building utilities for PM agent.
 */

export interface ImageData {
  filename?: string
  mimeType?: string
  dataUrl: string
}

export interface PromptBuildingConfig {
  contextPack: string
  systemInstructions: string
  message: string
  images?: ImageData[]
  openaiModel: string
}

export interface BuiltPrompt {
  prompt: string | Array<{ type: 'text' | 'image'; text?: string; image?: string }>
  fullPromptText: string
}

/**
 * Builds the prompt for the PM agent, handling both text-only and vision model formats.
 * 
 * @param config - Configuration including context pack, system instructions, message, images, and model
 * @returns Built prompt (string for non-vision models, array for vision models) and full text representation
 */
export function buildPrompt(config: PromptBuildingConfig): BuiltPrompt {
  const { contextPack, systemInstructions, message, images, openaiModel } = config

  const promptBase = `${contextPack}\n\n---\n\nRespond to the user message above using the tools as needed.`

  const hasImages = images && images.length > 0
  const isVisionModel = openaiModel.includes('vision') || openaiModel.includes('gpt-4o')

  let imageInfo = ''
  if (hasImages) {
    const imageList = images!
      .map((img, idx) => `  ${idx + 1}. ${img.filename || `Image ${idx + 1}`} (${img.mimeType || 'image'})`)
      .join('\n')
    if (isVisionModel) {
      imageInfo = `\n\n## Images (included in prompt)\n\n${imageList}\n\n(Note: Images are sent as base64-encoded data URLs in the prompt array, but are not shown in this text representation.)`
    } else {
      imageInfo = `\n\n## Images (provided but ignored)\n\n${imageList}\n\n(Note: Images were provided but the model (${openaiModel}) does not support vision. Images are ignored.)`
    }
  }

  const fullPromptText = `## System Instructions\n\n${systemInstructions}\n\n---\n\n## User Prompt\n\n${promptBase}${imageInfo}`

  let prompt: string | Array<{ type: 'text' | 'image'; text?: string; image?: string }>
  if (hasImages && isVisionModel) {
    // Vision model: use array format with text and images
    prompt = [
      { type: 'text' as const, text: promptBase },
      ...images!.map((img) => ({ type: 'image' as const, image: img.dataUrl })),
    ]
  } else {
    // Non-vision model or no images: use string format
    prompt = promptBase
  }

  return { prompt, fullPromptText }
}
