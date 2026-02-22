/**
 * Utilities for embedding distilled knowledge atoms.
 * Extracts distilled atoms (summary, hard_facts, keywords) and computes chunk hashes.
 */

import { createHash } from 'crypto'
import type { DistilledArtifact } from '../context-bundles/_distill.js'
import { distillArtifact } from '../context-bundles/_distill.js'

export interface DistilledAtomChunk {
  text: string
  atomType: 'summary' | 'hard_fact' | 'keyword'
  chunkIndex: number
  chunkHash: string
}

/**
 * Computes a stable SHA-256 hash of a text chunk.
 */
export function computeChunkHash(text: string): string {
  return createHash('sha256').update(text.trim().toLowerCase()).digest('hex')
}

/**
 * Extracts distilled knowledge atoms from an artifact and returns them as chunks.
 * Only returns distilled atoms (summary, hard_facts, keywords), not raw document text.
 */
export async function extractDistilledAtomChunks(
  artifactBodyMd: string,
  artifactTitle?: string
): Promise<{
  success: boolean
  chunks?: DistilledAtomChunk[]
  error?: string
}> {
  // Distill the artifact to get structured knowledge atoms
  const distillResult = await distillArtifact(artifactBodyMd, artifactTitle)

  if (!distillResult.success || !distillResult.distilled) {
    return {
      success: false,
      error: distillResult.error || 'Failed to distill artifact',
    }
  }

  const distilled = distillResult.distilled
  const chunks: DistilledAtomChunk[] = []

  // Extract summary as a chunk
  if (distilled.summary && distilled.summary.trim()) {
    const summaryText = distilled.summary.trim()
    chunks.push({
      text: summaryText,
      atomType: 'summary',
      chunkIndex: 0,
      chunkHash: computeChunkHash(summaryText),
    })
  }

  // Extract each hard fact as a separate chunk
  if (Array.isArray(distilled.hard_facts)) {
    distilled.hard_facts.forEach((fact, index) => {
      if (fact && typeof fact === 'string' && fact.trim()) {
        const factText = fact.trim()
        chunks.push({
          text: factText,
          atomType: 'hard_fact',
          chunkIndex: chunks.length,
          chunkHash: computeChunkHash(factText),
        })
      }
    })
  }

  // Extract each keyword as a separate chunk
  if (Array.isArray(distilled.keywords)) {
    distilled.keywords.forEach((keyword, index) => {
      if (keyword && typeof keyword === 'string' && keyword.trim()) {
        const keywordText = keyword.trim()
        chunks.push({
          text: keywordText,
          atomType: 'keyword',
          chunkIndex: chunks.length,
          chunkHash: computeChunkHash(keywordText),
        })
      }
    })
  }

  return {
    success: true,
    chunks,
  }
}

/**
 * Splits a long text into smaller chunks if needed (for very long summaries).
 * This is a fallback for cases where a single atom is too long for embedding.
 */
export function chunkTextIfNeeded(text: string, maxChunkSize: number = 1000): string[] {
  if (text.length <= maxChunkSize) {
    return [text]
  }

  // Try to split on sentence boundaries
  const sentences = text.split(/([.!?]\s+)/)
  const chunks: string[] = []
  let currentChunk = ''

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i]
    if (currentChunk.length + sentence.length <= maxChunkSize) {
      currentChunk += sentence
    } else {
      if (currentChunk) {
        chunks.push(currentChunk.trim())
      }
      // If a single sentence is too long, split by words
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
        currentChunk = wordChunk
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
