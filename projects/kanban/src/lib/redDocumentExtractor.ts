/**
 * RED Document Extractor
 * 
 * Extracts RED JSON documents from ticket attachments
 */

import type { TicketAttachment } from '../components/types'

/**
 * Check if an attachment is a RED document
 */
export function isRedAttachment(attachment: TicketAttachment): boolean {
  const filename = attachment.filename.toLowerCase()
  const mimeType = attachment.mime_type.toLowerCase()
  
  // Check for RED-related filenames
  if (filename.includes('red') && (filename.endsWith('.json') || mimeType === 'application/json')) {
    return true
  }
  
  // Check for JSON MIME type with RED-related name
  if (mimeType === 'application/json' && filename.includes('red')) {
    return true
  }
  
  return false
}

/**
 * Extract RED document from attachment data URL
 */
export async function extractRedFromAttachment(attachment: TicketAttachment): Promise<{ red: unknown | null; error: string | null }> {
  try {
    // If it's a data URL, extract the JSON
    if (attachment.data_url.startsWith('data:')) {
      // Parse data URL: data:application/json;base64,<base64>
      const match = attachment.data_url.match(/^data:([^;]+);base64,(.+)$/)
      if (match) {
        const base64 = match[2]
        const jsonString = atob(base64)
        const red = JSON.parse(jsonString)
        return { red, error: null }
      }
      
      // Try plain text data URL
      const textMatch = attachment.data_url.match(/^data:([^;]+);charset=([^,]+),(.+)$/)
      if (textMatch) {
        const jsonString = decodeURIComponent(textMatch[3])
        const red = JSON.parse(jsonString)
        return { red, error: null }
      }
    }
    
    // If it's a URL, fetch it
    if (attachment.data_url.startsWith('http://') || attachment.data_url.startsWith('https://')) {
      const response = await fetch(attachment.data_url)
      const red = await response.json()
      return { red, error: null }
    }
    
    return { red: null, error: 'Unsupported attachment format' }
  } catch (err) {
    return {
      red: null,
      error: err instanceof Error ? err.message : 'Failed to extract RED document',
    }
  }
}

/**
 * Find RED document from attachments
 */
export async function findRedDocument(attachments: TicketAttachment[]): Promise<{ red: unknown | null; error: string | null }> {
  const redAttachment = attachments.find(isRedAttachment)
  
  if (!redAttachment) {
    return { red: null, error: 'No RED document attachment found' }
  }
  
  return extractRedFromAttachment(redAttachment)
}
