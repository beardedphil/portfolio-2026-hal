import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'

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
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      ticketId?: string
      ticketPk?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() || undefined : undefined
    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() || undefined : undefined
    // Use credentials from request body if provided, otherwise fall back to server environment variables
    const supabaseUrl =
      (typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() : undefined) ||
      process.env.SUPABASE_URL?.trim() ||
      process.env.VITE_SUPABASE_URL?.trim() ||
      undefined
    const supabaseAnonKey =
      (typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey.trim() : undefined) ||
      process.env.SUPABASE_ANON_KEY?.trim() ||
      process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
      undefined

    if (!ticketId && !ticketPk) {
      json(res, 400, {
        success: false,
        error: 'ticketPk (preferred) or ticketId is required.',
      })
      return
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Fetch ticket to get PK
    let ticketFetch: any = null
    
    if (ticketPk) {
      ticketFetch = await supabase.from('tickets').select('pk').eq('pk', ticketPk).maybeSingle()
    } else if (ticketId) {
      // Try multiple lookup strategies
      ticketFetch = await supabase.from('tickets').select('pk').eq('id', ticketId).maybeSingle()
      
      if (ticketFetch.error || !ticketFetch.data) {
        ticketFetch = await supabase.from('tickets').select('pk').eq('display_id', ticketId).maybeSingle()
      }
      
      if ((ticketFetch.error || !ticketFetch.data) && /^[A-Z]+-/.test(ticketId)) {
        const numericPart = ticketId.replace(/^[A-Z]+-/, '')
        const idValue = numericPart.replace(/^0+/, '') || numericPart
        if (idValue !== ticketId) {
          ticketFetch = await supabase.from('tickets').select('pk').eq('id', idValue).maybeSingle()
        }
      }
      
      if ((ticketFetch.error || !ticketFetch.data) && /^\d+$/.test(ticketId) && ticketId.startsWith('0')) {
        const withoutLeadingZeros = ticketId.replace(/^0+/, '') || ticketId
        if (withoutLeadingZeros !== ticketId) {
          ticketFetch = await supabase.from('tickets').select('pk').eq('id', withoutLeadingZeros).maybeSingle()
        }
      }
    }

    if (ticketFetch.error || !ticketFetch.data) {
      json(res, 200, {
        success: false,
        error: `Ticket ${ticketId || ticketPk} not found.`,
      })
      return
    }

    const ticketPkValue = (ticketFetch.data as any).pk

    // Fetch artifacts to count failures
    const { data: artifacts } = await supabase
      .from('agent_artifacts')
      .select('agent_type, body_md, created_at')
      .eq('ticket_pk', ticketPkValue)
      .in('agent_type', ['qa', 'human-in-the-loop'])
      .order('created_at', { ascending: false })

    let qaFailCount = 0
    let hitlFailCount = 0

    if (artifacts) {
      for (const artifact of artifacts) {
        const bodyMd = artifact.body_md || ''
        
        if (artifact.agent_type === 'qa') {
          // QA failures: look for "QA RESULT: FAIL" or "verdict.*fail" patterns
          const isFail = /QA RESULT:\s*FAIL|verdict.*fail|qa.*fail/i.test(bodyMd) && 
                        !/QA RESULT:\s*PASS|verdict.*pass|qa.*pass/i.test(bodyMd)
          if (isFail) {
            qaFailCount++
          }
        } else if (artifact.agent_type === 'human-in-the-loop') {
          // HITL failures: look for "FAIL" verdict or failure indicators
          const isFail = /verdict.*fail|fail.*verdict|This ticket failed/i.test(bodyMd) && 
                        !/verdict.*pass|pass.*verdict/i.test(bodyMd)
          if (isFail) {
            hitlFailCount++
          }
        }
      }
    }

    json(res, 200, {
      success: true,
      qaFailCount,
      hitlFailCount,
    })
  } catch (err) {
    json(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) })
  }
}
