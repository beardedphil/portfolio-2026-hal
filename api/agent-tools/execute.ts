import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { readJsonBody, json } from './_http-utils.js'
import { insertImplementationArtifact } from './_tools/insert-implementation-artifact.js'
import { insertQaArtifact } from './_tools/insert-qa-artifact.js'
import { updateTicketBody } from './_tools/update-ticket-body.js'
import { moveTicketColumn } from './_tools/move-ticket-column.js'
import { getTicketContent } from './_tools/get-ticket-content.js'
import { getArtifacts } from './_tools/get-artifacts.js'

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
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      tool?: string
      params?: unknown
    }

    const tool = typeof body.tool === 'string' ? body.tool.trim() : undefined
    const params = body.params || {}

    // Log tool call request for tracing
    if (tool === 'insert_implementation_artifact' || tool === 'insert_qa_artifact') {
      const p = params as { ticketId?: string; artifactType?: string; title?: string; body_md?: string }
      console.log(`[agent-tools] Tool call received: tool=${tool}, ticketId=${p.ticketId}, title="${p.title}", body_md length=${p.body_md?.length ?? 'undefined'}, body_md type=${typeof p.body_md}`)
    }

    if (!tool) {
      json(res, 400, {
        success: false,
        error: 'tool is required. Available tools: insert_implementation_artifact, insert_qa_artifact, update_ticket_body, move_ticket_column, get_ticket_content, get_artifacts',
      })
      return
    }

    // Get Supabase credentials from server environment
    const supabaseUrl = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim()
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY?.trim() || process.env.VITE_SUPABASE_ANON_KEY?.trim()

    if (!supabaseUrl || !supabaseAnonKey) {
      json(res, 500, {
        success: false,
        error: 'Supabase credentials not configured on HAL server. Set SUPABASE_URL and SUPABASE_ANON_KEY in server environment.',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Execute the requested tool
    let result: unknown
    switch (tool) {
      case 'insert_implementation_artifact': {
        const p = params as { ticketId?: string; artifactType?: string; title?: string; body_md?: string }
        console.log(`[agent-tools] Processing insert_implementation_artifact: ticketId=${p.ticketId}, artifactType=${p.artifactType}, title="${p.title}", body_md length=${p.body_md?.length ?? 'undefined'}, body_md present=${p.body_md !== undefined && p.body_md !== null}`)
        if (!p.ticketId || !p.artifactType || !p.title || !p.body_md) {
          const missing = []
          if (!p.ticketId) missing.push('ticketId')
          if (!p.artifactType) missing.push('artifactType')
          if (!p.title) missing.push('title')
          if (!p.body_md) missing.push('body_md')
          console.error(`[agent-tools] Missing required parameters: ${missing.join(', ')}`)
          result = { success: false, error: `Missing required parameters: ${missing.join(', ')}. All of ticketId, artifactType, title, and body_md are required.` }
        } else {
          result = await insertImplementationArtifact(supabase, {
            ticketId: p.ticketId,
            artifactType: p.artifactType,
            title: p.title,
            body_md: p.body_md,
          })
        }
        break
      }
      case 'insert_qa_artifact': {
        const p = params as { ticketId?: string; title?: string; body_md?: string }
        console.log(`[agent-tools] Processing insert_qa_artifact: ticketId=${p.ticketId}, title="${p.title}", body_md length=${p.body_md?.length ?? 'undefined'}, body_md present=${p.body_md !== undefined && p.body_md !== null}`)
        if (!p.ticketId || !p.title || !p.body_md) {
          const missing = []
          if (!p.ticketId) missing.push('ticketId')
          if (!p.title) missing.push('title')
          if (!p.body_md) missing.push('body_md')
          console.error(`[agent-tools] Missing required parameters: ${missing.join(', ')}`)
          result = { success: false, error: `Missing required parameters: ${missing.join(', ')}. All of ticketId, title, and body_md are required.` }
        } else {
          result = await insertQaArtifact(supabase, {
            ticketId: p.ticketId,
            title: p.title,
            body_md: p.body_md,
          })
        }
        break
      }
      case 'update_ticket_body': {
        const p = params as { ticketId?: string; body_md?: string }
        if (!p.ticketId || !p.body_md) {
          result = { success: false, error: 'ticketId and body_md are required.' }
        } else {
          result = await updateTicketBody(supabase, {
            ticketId: p.ticketId,
            body_md: p.body_md,
          })
        }
        break
      }
      case 'move_ticket_column': {
        const p = params as { ticketId?: string; columnId?: string }
        if (!p.ticketId || !p.columnId) {
          result = { success: false, error: 'ticketId and columnId are required.' }
        } else {
          result = await moveTicketColumn(supabase, {
            ticketId: p.ticketId,
            columnId: p.columnId,
          })
        }
        break
      }
      case 'get_ticket_content': {
        const p = params as { ticketId?: string }
        if (!p.ticketId) {
          result = { success: false, error: 'ticketId is required.' }
        } else {
          result = await getTicketContent(supabase, {
            ticketId: p.ticketId,
          })
        }
        break
      }
      case 'get_artifacts': {
        const p = params as { ticketId?: string; summary?: boolean }
        if (!p.ticketId) {
          result = { success: false, error: 'ticketId is required.' }
        } else {
          result = await getArtifacts(supabase, {
            ticketId: p.ticketId,
            summary: p.summary === true,
          })
        }
        break
      }
      default:
        result = {
          success: false,
          error: `Unknown tool: ${tool}. Available tools: insert_implementation_artifact, insert_qa_artifact, update_ticket_body, move_ticket_column, get_ticket_content, get_artifacts`,
        }
    }

    json(res, 200, result)
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
