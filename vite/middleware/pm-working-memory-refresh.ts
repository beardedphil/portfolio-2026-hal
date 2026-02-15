import type { Plugin } from 'vite'
import { readJsonBody } from '../helpers'

/** PM working memory refresh endpoint (with OpenAI LLM extraction) */
export function pmWorkingMemoryRefreshPlugin(): Plugin {
  return {
    name: 'pm-working-memory-refresh-endpoint',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/api/pm/working-memory/refresh' || req.method !== 'POST') {
          next()
          return
        }

        try {
          const body = (await readJsonBody(req)) as {
            projectId?: string
            conversationId?: string
            supabaseUrl?: string
            supabaseAnonKey?: string
          }
          const projectId = typeof body.projectId === 'string' ? body.projectId.trim() || undefined : undefined
          const conversationId = typeof body.conversationId === 'string' ? body.conversationId.trim() || undefined : undefined
          const supabaseUrl = typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() || undefined : undefined
          const supabaseAnonKey = typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey.trim() || undefined : undefined

          if (!projectId || !conversationId || !supabaseUrl || !supabaseAnonKey) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: 'projectId, conversationId, supabaseUrl, and supabaseAnonKey are required' }))
            return
          }

          const key = process.env.OPENAI_API_KEY
          const model = process.env.OPENAI_MODEL

          if (!key || !model) {
            res.statusCode = 503
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: 'OpenAI API is not configured. Set OPENAI_API_KEY and OPENAI_MODEL in .env.' }))
            return
          }

          const { createClient } = await import('@supabase/supabase-js')
          const supabase = createClient(supabaseUrl, supabaseAnonKey)

          // Get the latest message sequence
          const { data: latestMsg } = await supabase
            .from('hal_conversation_messages')
            .select('sequence')
            .eq('project_id', projectId)
            .eq('agent', conversationId)
            .order('sequence', { ascending: false })
            .limit(1)
            .single()

          const currentSequence = latestMsg?.sequence ?? 0

          // Fetch all messages for this conversation
          const { data: allMessages } = await supabase
            .from('hal_conversation_messages')
            .select('role, content, sequence')
            .eq('project_id', projectId)
            .eq('agent', conversationId)
            .order('sequence', { ascending: true })

          if (!allMessages || allMessages.length === 0) {
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: true, message: 'No messages to process' }))
            return
          }

          // Use LLM to extract working memory from conversation
          const messagesText = allMessages.map(m => `${m.role}: ${m.content}`).join('\n\n')
          const prompt = `Analyze the following PM agent conversation and extract structured working memory. Return a JSON object with these fields:
- summary: A concise 2-3 sentence summary of the conversation context
- goals: Array of project goals discussed (empty array if none)
- requirements: Array of requirements identified (empty array if none)
- constraints: Array of constraints mentioned (empty array if none)
- decisions: Array of decisions made (empty array if none)
- assumptions: Array of assumptions noted (empty array if none)
- open_questions: Array of open questions (empty array if none)
- glossary: Object mapping terms to definitions (empty object if none)
- stakeholders: Array of stakeholders mentioned (empty array if none)

Conversation:
${messagesText}

Return ONLY valid JSON, no markdown formatting, no explanation. Example format:
{"summary": "...", "goals": ["..."], "requirements": ["..."], "constraints": ["..."], "decisions": ["..."], "assumptions": ["..."], "open_questions": ["..."], "glossary": {"term": "definition"}, "stakeholders": ["..."]}`

          const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: 'You are a helpful assistant that extracts structured information from conversations. Return only valid JSON.' },
                { role: 'user', content: prompt },
              ],
              temperature: 0.3,
              max_tokens: 2000,
            }),
          })

          if (!openaiRes.ok) {
            const errorText = await openaiRes.text()
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: `OpenAI API error: ${errorText}` }))
            return
          }

          const openaiData = await openaiRes.json() as { choices?: Array<{ message?: { content?: string } }> }
          const content = openaiData.choices?.[0]?.message?.content?.trim()
          if (!content) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: 'No content in OpenAI response' }))
            return
          }

          // Parse JSON response (may be wrapped in markdown code blocks)
          let parsed: any
          try {
            const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || [null, content]
            parsed = JSON.parse(jsonMatch[1] || content)
          } catch {
            // Try parsing as-is
            parsed = JSON.parse(content)
          }

          // Validate and structure data
          const wmData = {
            project_id: projectId,
            conversation_id: conversationId,
            summary: typeof parsed.summary === 'string' ? parsed.summary : '',
            goals: Array.isArray(parsed.goals) ? parsed.goals.filter((g: any) => typeof g === 'string' && g.trim()) : [],
            requirements: Array.isArray(parsed.requirements) ? parsed.requirements.filter((r: any) => typeof r === 'string' && r.trim()) : [],
            constraints: Array.isArray(parsed.constraints) ? parsed.constraints.filter((c: any) => typeof c === 'string' && c.trim()) : [],
            decisions: Array.isArray(parsed.decisions) ? parsed.decisions.filter((d: any) => typeof d === 'string' && d.trim()) : [],
            assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions.filter((a: any) => typeof a === 'string' && a.trim()) : [],
            open_questions: Array.isArray(parsed.open_questions) ? parsed.open_questions.filter((q: any) => typeof q === 'string' && q.trim()) : [],
            glossary: typeof parsed.glossary === 'object' && parsed.glossary !== null ? parsed.glossary : {},
            stakeholders: Array.isArray(parsed.stakeholders) ? parsed.stakeholders.filter((s: any) => typeof s === 'string' && s.trim()) : [],
            last_updated_at: new Date().toISOString(),
            last_sequence: currentSequence,
          }

          const { error: upsertError } = await supabase.from('hal_pm_working_memory').upsert(wmData, {
            onConflict: 'project_id,conversation_id',
          })

          if (upsertError) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: false, error: `Database error: ${upsertError.message}` }))
            return
          }

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ success: true, data: wmData }))
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }))
        }
      })
    },
  }
}
