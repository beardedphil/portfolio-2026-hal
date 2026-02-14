import type { IncomingMessage, ServerResponse } from 'http'

type WorkingMemory = {
  summary: string
  goals: string
  requirements: string
  constraints: string
  decisions: string
  assumptions: string
  open_questions: string
  glossary_terms: string
  stakeholders: string
  last_updated: string
  through_sequence: number
}

type WorkingMemoryResponse = {
  success: boolean
  workingMemory?: WorkingMemory
  error?: string
}

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
  if (req.method === 'GET') {
    try {
      const url = new URL(req.url || '', 'http://localhost')
      const projectId = url.searchParams.get('projectId')
      const agent = url.searchParams.get('agent') || 'project-manager'

      if (!projectId) {
        json(res, 400, { success: false, error: 'projectId is required' } satisfies WorkingMemoryResponse)
        return
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim()
      const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim()

      if (!supabaseUrl || !supabaseAnonKey) {
        json(res, 503, {
          success: false,
          error: 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in env.',
        } satisfies WorkingMemoryResponse)
        return
      }

      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(supabaseUrl, supabaseAnonKey)

      const { data, error } = await supabase
        .from('hal_pm_working_memory')
        .select('*')
        .eq('project_id', projectId)
        .eq('agent', agent)
        .single()

      if (error && error.code !== 'PGRST116') {
        // PGRST116 is "not found" - that's OK, return empty working memory
        json(res, 500, { success: false, error: error.message } satisfies WorkingMemoryResponse)
        return
      }

      if (!data) {
        // Return empty working memory structure
        json(res, 200, {
          success: true,
          workingMemory: {
            summary: '',
            goals: '',
            requirements: '',
            constraints: '',
            decisions: '',
            assumptions: '',
            open_questions: '',
            glossary_terms: '',
            stakeholders: '',
            last_updated: new Date().toISOString(),
            through_sequence: 0,
          },
        } satisfies WorkingMemoryResponse)
        return
      }

      json(res, 200, {
        success: true,
        workingMemory: {
          summary: data.summary || '',
          goals: data.goals || '',
          requirements: data.requirements || '',
          constraints: data.constraints || '',
          decisions: data.decisions || '',
          assumptions: data.assumptions || '',
          open_questions: data.open_questions || '',
          glossary_terms: data.glossary_terms || '',
          stakeholders: data.stakeholders || '',
          last_updated: data.last_updated || new Date().toISOString(),
          through_sequence: data.through_sequence || 0,
        },
      } satisfies WorkingMemoryResponse)
    } catch (err) {
      json(res, 500, {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      } satisfies WorkingMemoryResponse)
    }
  } else if (req.method === 'POST') {
    try {
      const body = (await readJsonBody(req)) as {
        projectId?: string
        agent?: string
        workingMemory?: Partial<WorkingMemory>
        refresh?: boolean
      }

      const projectId = body.projectId?.trim()
      const agent = body.agent?.trim() || 'project-manager'
      const refresh = body.refresh === true

      if (!projectId) {
        json(res, 400, { success: false, error: 'projectId is required' } satisfies WorkingMemoryResponse)
        return
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim()
      const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim()

      if (!supabaseUrl || !supabaseAnonKey) {
        json(res, 503, {
          success: false,
          error: 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in env.',
        } satisfies WorkingMemoryResponse)
        return
      }

      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(supabaseUrl, supabaseAnonKey)

      if (refresh) {
        // Manual refresh: trigger working memory update from conversation
        // This will be handled by the PM agent's automatic summarization
        // For now, just return success - the actual update happens in /api/pm/respond
        json(res, 200, { success: true } satisfies WorkingMemoryResponse)
        return
      }

      // Update working memory with provided values
      if (body.workingMemory) {
        const updateData: Partial<WorkingMemory> & { last_updated?: string } = {
          ...body.workingMemory,
          last_updated: new Date().toISOString(),
        }

        const { data, error } = await supabase
          .from('hal_pm_working_memory')
          .upsert(
            {
              project_id: projectId,
              agent,
              ...updateData,
            },
            { onConflict: 'project_id,agent' }
          )
          .select()
          .single()

        if (error) {
          json(res, 500, { success: false, error: error.message } satisfies WorkingMemoryResponse)
          return
        }

        json(res, 200, {
          success: true,
          workingMemory: {
            summary: data.summary || '',
            goals: data.goals || '',
            requirements: data.requirements || '',
            constraints: data.constraints || '',
            decisions: data.decisions || '',
            assumptions: data.assumptions || '',
            open_questions: data.open_questions || '',
            glossary_terms: data.glossary_terms || '',
            stakeholders: data.stakeholders || '',
            last_updated: data.last_updated || new Date().toISOString(),
            through_sequence: data.through_sequence || 0,
          },
        } satisfies WorkingMemoryResponse)
      } else {
        json(res, 400, { success: false, error: 'workingMemory is required for POST' } satisfies WorkingMemoryResponse)
      }
    } catch (err) {
      json(res, 500, {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      } satisfies WorkingMemoryResponse)
    }
  } else {
    res.statusCode = 405
    res.end('Method Not Allowed')
  }
}
