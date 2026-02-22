/**
 * Utility functions for embedding operations:
 * - Chunk hash computation for deduplication
 * - Distilled atom extraction and chunking
 */

import { createHash } from 'crypto'
import { distillArtifact, type DistilledArtifact } from '../context-bundles/_distill.js'

/**
 * Compute a stable hash for a text chunk.
 * Used for deduplication - same content = same hash.
 */
export function computeChunkHash(text: string): string {
  // Normalize: trim whitespace and normalize line endings
  const normalized = text.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  return createHash('sha256').update(normalized, 'utf8').digest('hex')
}

/**
 * Extract distilled knowledge atoms from an artifact.
 * Returns summary, hard_facts, and keywords as separate chunks.
 */
export async function extractDistilledAtoms(
  artifactBodyMd: string,
  artifactTitle?: string
): Promise<{ success: boolean; atoms?: Array<{ type: string; text: string }>; error?: string }> {
  const result = await distillArtifact(artifactBodyMd, artifactTitle)

  if (!result.success || !result.distilled) {
    return {
      success: false,
      error: result.error || 'Distillation failed',
    }
  }

  const distilled = result.distilled
  const atoms: Array<{ type: string; text: string }> = []

  // Add summary as a chunk
  if (distilled.summary && distilled.summary.trim()) {
    atoms.push({
      type: 'summary',
      text: distilled.summary.trim(),
    })
  }

  // Add each hard fact as a separate chunk
  if (Array.isArray(distilled.hard_facts)) {
    for (const fact of distilled.hard_facts) {
      if (fact && fact.trim()) {
        atoms.push({
          type: 'hard_fact',
          text: fact.trim(),
        })
      }
    }
  }

  // Add keywords as a single chunk (comma-separated)
  if (Array.isArray(distilled.keywords) && distilled.keywords.length > 0) {
    const keywordsText = distilled.keywords.filter((k) => k && k.trim()).join(', ')
    if (keywordsText) {
      atoms.push({
        type: 'keywords',
        text: keywordsText,
      })
    }
  }

  return {
    success: true,
    atoms,
  }
}

/**
 * Chunk text into smaller pieces if needed.
 * For distilled atoms, we typically don't need to chunk further,
 * but this function is available if needed.
 */
export function chunkText(text: string, maxChunkSize: number = 1000): string[] {
  if (text.length <= maxChunkSize) {
    return [text]
  }

  const chunks: string[] = []
  let currentChunk = ''

  // Split by sentences first
  const sentences = text.split(/([.!?]\s+)/)

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i]
    if (currentChunk.length + sentence.length <= maxChunkSize) {
      currentChunk += sentence
    } else {
      if (currentChunk) {
        chunks.push(currentChunk.trim())
      }
      // If a single sentence is too long, split it by words
      if (sentence.length > maxChunkSize) {
        const words = sentence.split(/\s+/)
        let wordChunk = ''
        for (const word of words) {
          if (wordChunk.length + word.length + 1 <= maxChunkSize) {
            wordChunk += (wordChunk ? ' ' : '') + word
          } else {
            if (wordChunk) {
              chunks.push(wordChunk.trim())
            }
            wordChunk = word
          }
        }
        if (wordChunk) {
          currentChunk = wordChunk
        } else {
          currentChunk = ''
        }
      } else {
        currentChunk = sentence
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim())
  }

  return chunks.filter((chunk) => chunk.length > 0)
}
