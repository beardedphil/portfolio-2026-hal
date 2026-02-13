import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'

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

  // Store these for error handling
  let ticketPk: string | undefined
  let ticketId: string | undefined
  let supabaseUrl: string | undefined
  let supabaseAnonKey: string | undefined
  let supabase: ReturnType<typeof createClient> | null = null
  let ticket: { pk: string; id: string; display_id?: string | null } | null = null

  try {
    const body = (await readJsonBody(req)) as {
      ticketPk?: string
      ticketId?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() : undefined
    ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() : undefined

    // Use credentials from request body if provided, otherwise fall back to server environment variables
    supabaseUrl =
      (typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() : undefined) ||
      process.env.SUPABASE_URL?.trim() ||
      process.env.VITE_SUPABASE_URL?.trim() ||
      undefined
    supabaseAnonKey =
      (typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey.trim() : undefined) ||
      process.env.SUPABASE_ANON_KEY?.trim() ||
      process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
      undefined

    if ((!ticketPk && !ticketId) || !supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'ticketPk (preferred) or ticketId, and Supabase credentials are required.',
      })
      return
    }

    supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Fetch ticket and artifacts
    const ticketQuery = ticketPk
      ? await supabase.from('tickets').select('pk, id, display_id, title, body_md, repo_full_name').eq('pk', ticketPk).maybeSingle()
      : await supabase.from('tickets').select('pk, id, display_id, title, body_md, repo_full_name').eq('id', ticketId!).maybeSingle()

    if (ticketQuery.error || !ticketQuery.data) {
      const errorMsg = `Ticket not found: ${ticketQuery.error?.message || 'Unknown error'}`
      json(res, 200, {
        success: false,
        error: errorMsg,
      })
      return
    }

    ticket = ticketQuery.data

    // Fetch all artifacts for this ticket
    const { data: artifacts, error: artifactsError } = await supabase
      .from('agent_artifacts')
      .select('artifact_id, ticket_pk, agent_type, title, body_md, created_at')
      .eq('ticket_pk', ticket.pk)
      .order('created_at', { ascending: false })

    if (artifactsError) {
      const errorMsg = `Failed to fetch artifacts: ${artifactsError.message}`
      // Try to store failure as artifact (if we have ticket.pk)
      if (ticketQuery.data?.pk) {
        const artifactBody = `# Process Review Result

Status: failed

Error: ${errorMsg}

## Suggestions

### Unable to fetch artifacts
Justification: Process review requires access to ticket artifacts to analyze patterns.
`
        await supabase
          .from('agent_artifacts')
          .insert({
            ticket_pk: ticketQuery.data.pk,
            agent_type: 'process-review-result',
            title: `Process Review for ticket ${ticketQuery.data.display_id || ticketQuery.data.id}`,
            body_md: artifactBody,
          })
          .catch((err) => console.error('Failed to store process review artifact:', err))
      }
      json(res, 200, {
        success: false,
        error: errorMsg,
      })
      return
    }

    if (!artifacts || artifacts.length === 0) {
      // Store result as artifact (success with message)
      const artifactBody = `# Process Review Result

Status: success

Note: No artifacts found for this ticket. Process review requires artifacts to analyze.

## Suggestions

### No artifacts available
Justification: Process review requires ticket artifacts to analyze patterns and suggest improvements.
`
      await supabase
        .from('agent_artifacts')
        .insert({
          ticket_pk: ticket.pk,
          agent_type: 'process-review-result',
          title: `Process Review for ticket ${ticket.display_id || ticket.id}`,
          body_md: artifactBody,
        })
        .catch((err) => console.error('Failed to store process review artifact:', err))

      json(res, 200, {
        success: true,
        suggestions: [{ text: 'No artifacts found for this ticket. Process review requires artifacts to analyze.', justification: 'Process review requires ticket artifacts to analyze patterns and suggest improvements.' }],
      })
      return
    }

    // Prepare artifact summaries for the LLM
    const artifactSummaries = artifacts.map((a) => {
      const bodyPreview = (a.body_md || '').slice(0, 500)
      return `- ${a.title || a.agent_type} (${a.agent_type}): ${bodyPreview}${bodyPreview.length >= 500 ? '...' : ''}`
    }).join('\n')

    // Use OpenAI to generate suggestions
    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      const errorMsg = 'OPENAI_API_KEY not configured. Process review requires OpenAI API access.'
      // Store failure as artifact
      const artifactBody = `# Process Review Result

Status: failed

Error: ${errorMsg}

## Suggestions

### Configure OpenAI API key
Justification: Process review uses OpenAI to analyze artifacts and generate improvement suggestions.
`
      await supabase
        .from('agent_artifacts')
        .insert({
          ticket_pk: ticket.pk,
          agent_type: 'process-review-result',
          title: `Process Review for ticket ${ticket.display_id || ticket.id}`,
          body_md: artifactBody,
        })
        .catch((err) => console.error('Failed to store process review artifact:', err))

      json(res, 200, {
        success: false,
        error: errorMsg,
      })
      return
    }

    const openai = createOpenAI({ apiKey: openaiApiKey })

    const prompt = `You are a process review agent analyzing ticket artifacts to suggest improvements to agent instructions.

Ticket: ${ticket.display_id || ticket.id} — ${ticket.title}

Artifacts found:
${artifactSummaries}

Review the artifacts above and suggest specific, actionable improvements to agent instructions (rules, templates, or process documentation) that would help prevent issues or improve outcomes for similar tickets in the future.

Format your response as JSON array with this structure:
[
  {
    "suggestion": "Add a rule requiring agents to verify file paths exist before attempting to read them",
    "justification": "The artifacts show multiple file read errors that could be prevented by path validation."
  },
  {
    "suggestion": "Update the ticket template to include a 'Dependencies' section",
    "justification": "Several tickets lacked dependency information, causing implementation delays."
  }
]

Each suggestion should be:
- Specific and actionable
- Focused on improving agent instructions/rules
- Clear about what should change

Each justification should be:
- Brief (1-2 sentences)
- Explain why this improvement would help
- Reference specific issues or patterns from the artifacts

Provide 3-5 suggestions. If no meaningful improvements are apparent, return an empty array [].`

    let suggestionsWithJustifications: Array<{ suggestion: string; justification: string }> = []
    let errorMessage: string | undefined

    try {
      const result = await generateText({
        model: openai('gpt-4o-mini'),
        prompt,
        maxTokens: 1500,
      })

      const responseText = result.text.trim()
      
      // Try to parse as JSON first
      try {
        const parsed = JSON.parse(responseText)
        if (Array.isArray(parsed)) {
          suggestionsWithJustifications = parsed
            .filter((item) => item && typeof item.suggestion === 'string')
            .map((item) => ({
              suggestion: item.suggestion.trim(),
              justification: (typeof item.justification === 'string' ? item.justification.trim() : 'No justification provided') || 'No justification provided',
            }))
        }
      } catch {
        // Fallback 1: Try parsing as markdown with ### headers
        const suggestionBlocks = responseText.split(/^###\s+/m).filter(Boolean)
        if (suggestionBlocks.length > 0) {
          for (const block of suggestionBlocks) {
            const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
            if (lines.length === 0) continue
            
            const suggestion = lines[0]
            const justificationMatch = block.match(/Justification:\s*(.+?)(?=\n\n|\n###|$)/is)
            const justification = justificationMatch?.[1]?.trim() || 'Generated from artifact analysis'
            
            if (suggestion) {
              suggestionsWithJustifications.push({ suggestion, justification })
            }
          }
        }
        
        // Fallback 2: Parse as bulleted list
        if (suggestionsWithJustifications.length === 0) {
          const lines = responseText
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => {
              if (!line) return false
              return /^[-*•]\s+/.test(line) || /^\d+\.\s+/.test(line)
            })
            .map((line) => {
              return line.replace(/^[-*•]\s+/, '').replace(/^\d+\.\s+/, '').trim()
            })
            .filter((line) => line.length > 0)

          suggestionsWithJustifications = lines.map((line) => ({
            suggestion: line,
            justification: 'Generated from artifact analysis',
          }))
        }
      }

      // If still no suggestions, check for "no improvements" message
      if (suggestionsWithJustifications.length === 0) {
        const lowerText = responseText.toLowerCase()
        if (lowerText.includes('no significant improvements') || lowerText.includes('no meaningful improvements')) {
          // This is valid - no suggestions needed
          suggestionsWithJustifications = []
        } else if (responseText.length > 0) {
          // Use the full response as a single suggestion
          suggestionsWithJustifications = [
            {
              suggestion: responseText,
              justification: 'Generated from artifact analysis',
            },
          ]
        }
      }
    } catch (llmError) {
      errorMessage = llmError instanceof Error ? llmError.message : String(llmError)
    }

    // Store review results in database
    const reviewStatus = errorMessage ? 'failed' : 'success'
    const { data: reviewData, error: reviewError } = await supabase
      .from('process_reviews')
      .insert({
        ticket_pk: ticket.pk,
        repo_full_name: ticket.repo_full_name,
        suggestions_json: suggestionsWithJustifications,
        status: reviewStatus,
        error_message: errorMessage || null,
      })
      .select('review_id, created_at, status')
      .single()

    if (reviewError) {
      json(res, 200, {
        success: false,
        error: `Failed to store review results: ${reviewError.message}`,
      })
      return
    }

    if (errorMessage) {
      json(res, 200, {
        success: false,
        error: errorMessage,
        reviewId: reviewData.review_id,
        createdAt: reviewData.created_at,
      })
      return
    }

    json(res, 200, {
      success: true,
      suggestions: suggestionsWithJustifications.map((s) => s.suggestion),
      suggestionsWithJustifications,
      reviewId: reviewData.review_id,
      createdAt: reviewData.created_at,
      status: reviewData.status,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    
    // Try to store failure as artifact if we have ticket info
    if (supabase && ticket) {
      try {
        const artifactBody = `# Process Review Result

Status: failed

Error: ${errorMsg}

## Suggestions

### Review failed
Justification: An error occurred during process review execution.
`
        await supabase
          .from('agent_artifacts')
          .insert({
            ticket_pk: ticket.pk,
            agent_type: 'process-review-result',
            title: `Process Review for ticket ${ticket.display_id || ticket.id}`,
            body_md: artifactBody,
          })
          .catch((artifactErr) => console.error('Failed to store process review artifact:', artifactErr))
      } catch (artifactStoreErr) {
        // Ignore errors when trying to store failure artifact
        console.error('Failed to store process review failure artifact:', artifactStoreErr)
      }
    }

    json(res, 500, {
      success: false,
      error: errorMsg,
    })
  }
}
