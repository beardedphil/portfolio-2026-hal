/**
 * Utility functions for embedding pipeline:
 * - Chunk hash computation for deduplication
 * - Knowledge atom extraction from distilled artifacts
 * - Chunking logic for knowledge atoms
 */

import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import type { DistilledArtifact } from '../context-bundles/_distill.js'

/**
 * Compute a stable hash for a chunk of text.
 * Used for deduplication - same content = same hash.
 */
export function computeChunkHash(text: string): string {
  const normalized = text.trim().toLowerCase()
  const hashBytes = sha256(normalized)
  return bytesToHex(hashBytes)
}

/**
 * Extract knowledge atoms from a distilled artifact.
 * Returns an array of text chunks containing:
 * - Summary
 * - Each hard fact
 * - Each keyword (as a standalone chunk)
 */
export function extractKnowledgeAtoms(distilled: DistilledArtifact): string[] {
  const atoms: string[] = []

  // Add summary as an atom
  if (distilled.summary && distilled.summary.trim()) {
    atoms.push(distilled.summary.trim())
  }

  // Add each hard fact as an atom
  if (Array.isArray(distilled.hard_facts)) {
    for (const fact of distilled.hard_facts) {
      if (typeof fact === 'string' && fact.trim()) {
        atoms.push(fact.trim())
      }
    }
  }

  // Add each keyword as an atom (prefixed with context)
  if (Array.isArray(distilled.keywords)) {
    for (const keyword of distilled.keywords) {
      if (typeof keyword === 'string' && keyword.trim()) {
        // Keywords are short, so we add context to make them searchable
        atoms.push(`Keyword: ${keyword.trim()}`)
      }
    }
  }

  return atoms.filter((atom) => atom.length > 0)
}

/**
 * Chunk text into smaller pieces if needed.
 * For knowledge atoms, we typically don't need to chunk further
 * since they're already small, but this function handles edge cases.
 */
export function chunkText(text: string, maxChunkSize: number = 1000): string[] {
  if (text.length <= maxChunkSize) {
    return [text]
  }

  const chunks: string[] = []
  let currentChunk = ''

  // Split by sentences first (period, exclamation, question mark followed by space)
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
