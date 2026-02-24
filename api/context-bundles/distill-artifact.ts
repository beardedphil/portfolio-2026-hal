/**
 * API endpoint to distill an artifact into structured fields (summary, hard_facts, keywords).
 * Uses OpenAI to extract structured information from artifact body_md.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { distillArtifact } from './_distill.js'

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as unknown
}

function json(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS: Allow cross-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' })
  }

  try {
    const body = (await readJsonBody(req)) as {
      artifactBodyMd?: string
      artifactId?: string
      artifactTitle?: string
    }

    const artifactBodyMd = typeof body.artifactBodyMd === 'string' ? body.artifactBodyMd.trim() : undefined
    const artifactId = typeof body.artifactId === 'string' ? body.artifactId.trim() : undefined
    const artifactTitle = typeof body.artifactTitle === 'string' ? body.artifactTitle.trim() : undefined

    if (!artifactBodyMd) {
      return json(res, 400, {
        success: false,
        error: 'artifactBodyMd is required.',
      })
    }

    const result = await distillArtifact(artifactBodyMd, artifactTitle)

    if (!result.success) {
      return json(res, 500, {
        success: false,
        error: result.error || 'Distillation failed',
      })
    }

    return json(res, 200, {
      success: true,
      distilled: result.distilled,
      artifact_id: artifactId || null,
    })
  } catch (err) {
    console.error('Error in distill artifact handler:', err)
    return json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : 'Internal server error',
    })
  }
}
