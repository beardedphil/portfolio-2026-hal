import type { IncomingMessage, ServerResponse } from 'http'
import path from 'path'
import { pathToFileURL } from 'url'
import { fetchFileContents, searchCode, listDirectoryContents } from '../_lib/github/githubApi.js'
import { getSession } from '../_lib/github/session.js'

type PmAgentResponse = {
  reply: string
  toolCalls: Array<{ name: string; input: unknown; output: unknown }>
  outboundRequest: object | null
  responseId?: string
  error?: string
  errorPhase?: 'context-pack' | 'openai' | 'tool' | 'not-implemented'
  ticketCreationResult?: {
    id: string
    filename: string
    filePath: string
    syncSuccess: boolean
    syncError?: string
    retried?: boolean
    attempts?: number
    /** True when ticket was automatically moved to To Do (0083). */
    movedToTodo?: boolean
    /** Error message if auto-move to To Do failed (0083). */
    moveError?: string
    /** True if ticket is ready to start (0083). */
    ready?: boolean
    /** Missing items if ticket is not ready (0083). */
    missingItems?: string[]
    /** True if ticket was auto-fixed (formatting issues resolved) (0095). */
    autoFixed?: boolean
  }
  createTicketAvailable?: boolean
  agentRunner?: string
  /** Full prompt text sent to the LLM (0202) */
  promptText?: string
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
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      message?: string
      conversationHistory?: Array<{ role: string; content: string }>
      previous_response_id?: string
      projectId?: string
      repoFullName?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
      images?: Array<{ dataUrl: string; filename: string; mimeType: string }>
    }

    const message = body.message ?? ''
    let conversationHistory = Array.isArray(body.conversationHistory)
      ? body.conversationHistory
      : undefined

    const previousResponseId =
      typeof body.previous_response_id === 'string'
        ? body.previous_response_id
        : undefined

    const projectId =
      typeof body.projectId === 'string' ? body.projectId.trim() || undefined : undefined
    const repoFullName =
      typeof body.repoFullName === 'string' ? body.repoFullName.trim() || undefined : undefined
    const supabaseUrl =
      typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() || undefined : undefined
    const supabaseAnonKey =
      typeof body.supabaseAnonKey === 'string'
        ? body.supabaseAnonKey.trim() || undefined
        : undefined

    // GitHub API for repo inspection: need token (from session) + repoFullName
    const session = await getSession(req, res)
    const githubToken = session.github?.accessToken
    // Debug logging (0119: fix PM agent repo selection) - use console.warn for visibility
    const hasCookie = !!req.headers.cookie
    const cookieHeader = req.headers.cookie ? 'present' : 'missing'
    console.warn(`[PM] Request received - repoFullName: ${repoFullName || 'NOT PROVIDED'}, hasToken: ${!!githubToken}, tokenLength: ${githubToken?.length || 0}, cookieHeader: ${cookieHeader}`)
    if (repoFullName && !githubToken) {
      console.warn(`[PM] ⚠️ repoFullName provided (${repoFullName}) but no GitHub token in session. Cookie header: ${cookieHeader}`)
      console.warn(`[PM] Session data:`, JSON.stringify({ hasGithub: !!session.github, githubKeys: session.github ? Object.keys(session.github) : [] }))
    }
    if (githubToken && !repoFullName) {
      console.warn(`[PM] GitHub token available but no repoFullName provided`)
    }
    const githubReadFile =
      githubToken && repoFullName
        ? (filePath: string, maxLines = 500) => {
            console.log(`[PM] Using GitHub API to read file: ${repoFullName}/${filePath}`)
            return fetchFileContents(githubToken, repoFullName, filePath, maxLines)
          }
        : undefined
    const githubSearchCode =
      githubToken && repoFullName
        ? (pattern: string, glob?: string) => {
            console.log(`[PM] Using GitHub API to search: ${repoFullName} pattern: ${pattern}`)
            return searchCode(githubToken, repoFullName, pattern, glob)
          }
        : undefined
    const githubListDirectory =
      githubToken && repoFullName
        ? (dirPath: string) => {
            console.log(`[PM] Using GitHub API to list directory: ${repoFullName}/${dirPath}`)
            return listDirectoryContents(githubToken, repoFullName, dirPath)
          }
        : undefined
    if (!githubReadFile && repoFullName) {
      console.warn(`[PM] githubReadFile is undefined even though repoFullName=${repoFullName} - token missing?`)
    }

    // Allow empty message if images are present
    const hasImages = Array.isArray(body.images) && body.images.length > 0
    if (!message.trim() && !hasImages) {
      json(res, 400, { error: 'Message is required (or attach an image)' })
      return
    }

    const key = process.env.OPENAI_API_KEY?.trim()
    const model = process.env.OPENAI_MODEL?.trim()

    if (!key || !model) {
      json(res, 503, {
        reply: '',
        toolCalls: [],
        outboundRequest: null,
        error: 'OpenAI API is not configured. Set OPENAI_API_KEY and OPENAI_MODEL in env.',
        errorPhase: 'openai',
      } satisfies PmAgentResponse)
      return
    }

    // Load hal-agents runner (prefer dist output).
    // On Vercel, repo root is process.cwd().
    const repoRoot = process.cwd()
    let runnerModule:
      | {
          getSharedRunner?: () => {
            label: string
            run: (msg: string, config: object) => Promise<any>
          }
          summarizeForContext?: (msgs: unknown[], key: string, model: string) => Promise<string>
          generateWorkingMemory?: (
            msgs: unknown[],
            existing: any,
            key: string,
            model: string
          ) => Promise<any>
        }
      | null = null

    try {
      const runnerDistPath = path.resolve(repoRoot, 'agents/dist/agents/runner.js')
      runnerModule = await import(pathToFileURL(runnerDistPath).href)
    } catch {
      // If dist isn't present, we'll fall through and return stub.
      runnerModule = null
    }

    // When project DB (Supabase) is provided, fetch full history and build bounded context pack (summary + recent by content size)
    const RECENT_MAX_CHARS = 12_000
    let conversationContextPack: string | undefined
    let recentImagesFromDb: Array<{ dataUrl: string; filename: string; mimeType: string }> = []
    if (projectId && supabaseUrl && supabaseAnonKey && runnerModule) {
      try {
        const { createClient } = await import('@supabase/supabase-js')
        const supabase = createClient(supabaseUrl, supabaseAnonKey)
        
        // Fetch working memory (0173: PM working memory)
        let workingMemory: {
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
        } | null = null
        
        try {
          const { data: wmData } = await supabase
            .from('hal_pm_working_memory')
            .select('*')
            .eq('project_id', projectId)
            .eq('agent', 'project-manager')
            .single()
          
          if (wmData) {
            workingMemory = {
              summary: wmData.summary || '',
              goals: wmData.goals || '',
              requirements: wmData.requirements || '',
              constraints: wmData.constraints || '',
              decisions: wmData.decisions || '',
              assumptions: wmData.assumptions || '',
              open_questions: wmData.open_questions || '',
              glossary_terms: wmData.glossary_terms || '',
              stakeholders: wmData.stakeholders || '',
              last_updated: wmData.last_updated || new Date().toISOString(),
              through_sequence: wmData.through_sequence || 0,
            }
          }
        } catch (wmErr) {
          // Working memory table might not exist yet - that's OK, continue without it
          // This is a safe failure mode: PM agent still responds using recent messages
          console.warn('[PM] Working memory fetch failed (table may not exist, non-fatal):', wmErr)
        }
        
        // Build working memory context section if available
        let workingMemoryContext: string | undefined
        if (workingMemory && (workingMemory.summary || workingMemory.goals || workingMemory.requirements || 
            workingMemory.constraints || workingMemory.decisions || workingMemory.assumptions || 
            workingMemory.open_questions || workingMemory.glossary_terms || workingMemory.stakeholders)) {
          const wmParts: string[] = []
          if (workingMemory.summary) wmParts.push(`**Summary:** ${workingMemory.summary}`)
          if (workingMemory.goals) wmParts.push(`**Goals:** ${workingMemory.goals}`)
          if (workingMemory.requirements) wmParts.push(`**Requirements:** ${workingMemory.requirements}`)
          if (workingMemory.constraints) wmParts.push(`**Constraints:** ${workingMemory.constraints}`)
          if (workingMemory.decisions) wmParts.push(`**Decisions:** ${workingMemory.decisions}`)
          if (workingMemory.assumptions) wmParts.push(`**Assumptions:** ${workingMemory.assumptions}`)
          if (workingMemory.open_questions) wmParts.push(`**Open Questions:** ${workingMemory.open_questions}`)
          if (workingMemory.glossary_terms) wmParts.push(`**Glossary/Terms:** ${workingMemory.glossary_terms}`)
          if (workingMemory.stakeholders) wmParts.push(`**Stakeholders:** ${workingMemory.stakeholders}`)
          
          if (wmParts.length > 0) {
            workingMemoryContext = `## PM Working Memory\n\n${wmParts.join('\n\n')}\n\n*Last updated: ${new Date(workingMemory.last_updated).toLocaleString()}*\n`
          }
        }
        
        const { data: rows } = await supabase
          .from('hal_conversation_messages')
          .select('role, content, sequence, images')
          .eq('project_id', projectId)
          .eq('agent', 'project-manager')
          .order('sequence', { ascending: true })

        const messages = (rows ?? []).map((r: any) => ({
          role: r.role as 'user' | 'assistant',
          content: r.content ?? '',
          images: r.images || null,
        }))

        const recentFromEnd: typeof messages = []
        let recentLen = 0
        for (let i = messages.length - 1; i >= 0; i--) {
          const t = messages[i]
          const lineLen = (t.role?.length ?? 0) + (t.content?.length ?? 0) + 12
          if (recentLen + lineLen > RECENT_MAX_CHARS && recentFromEnd.length > 0) break
          recentFromEnd.unshift(t)
          recentLen += lineLen
          // Collect images from recent messages (0157: persist images to DB)
          if (t.images && Array.isArray(t.images)) {
            for (const img of t.images) {
              if (img && typeof img === 'object' && img.dataUrl && img.filename && img.mimeType) {
                // Avoid duplicates by dataUrl
                if (!recentImagesFromDb.some(existing => existing.dataUrl === img.dataUrl)) {
                  recentImagesFromDb.push({
                    dataUrl: img.dataUrl,
                    filename: img.filename,
                    mimeType: img.mimeType,
                  })
                }
              }
            }
          }
        }

        const olderCount = messages.length - recentFromEnd.length
        if (olderCount > 0) {
          const older = messages.slice(0, olderCount)
          const { data: summaryRow } = await supabase
            .from('hal_conversation_summaries')
            .select('summary_text, through_sequence')
            .eq('project_id', projectId)
            .eq('agent', 'project-manager')
            .single()

          const needNewSummary =
            !summaryRow || (summaryRow.through_sequence ?? 0) < olderCount
          let summaryText: string

          if (needNewSummary && typeof runnerModule.summarizeForContext === 'function') {
            summaryText = await runnerModule.summarizeForContext(older, key, model)
            await supabase.from('hal_conversation_summaries').upsert(
              {
                project_id: projectId,
                agent: 'project-manager',
                summary_text: summaryText,
                through_sequence: olderCount,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'project_id,agent' }
            )
          } else if (summaryRow?.summary_text) {
            summaryText = summaryRow.summary_text
          } else {
            summaryText = `(${older.length} older messages)`
          }

          const contextParts: string[] = []
          if (workingMemoryContext) {
            contextParts.push(workingMemoryContext)
          }
          contextParts.push(`Summary of earlier conversation:\n\n${summaryText}\n\nRecent conversation (within ${RECENT_MAX_CHARS.toLocaleString()} characters):\n\n${recentFromEnd
            .map((t) => `**${t.role}**: ${t.content}`)
            .join('\n\n')}`)
          
          conversationContextPack = contextParts.join('\n\n')
        } else if (messages.length > 0) {
          const contextParts: string[] = []
          if (workingMemoryContext) {
            contextParts.push(workingMemoryContext)
          }
          contextParts.push(messages.map((t) => `**${t.role}**: ${t.content}`).join('\n\n'))
          conversationContextPack = contextParts.join('\n\n')
        } else if (workingMemoryContext) {
          conversationContextPack = workingMemoryContext
        }

        // Use DB-derived context pack instead of client-provided history
        conversationHistory = undefined
      } catch {
        // If DB context fails, fall back to client history.
      }
    }

    // Fetch and update working memory (0173)
    let workingMemory: any = null
    if (projectId && supabaseUrl && supabaseAnonKey && runnerModule) {
      try {
        const { createClient } = await import('@supabase/supabase-js')
        const supabase = createClient(supabaseUrl, supabaseAnonKey)
        
        // Fetch existing working memory
        const { data: existingMemoryRow } = await supabase
          .from('hal_conversation_working_memory')
          .select('*')
          .eq('project_id', projectId)
          .eq('agent', 'project-manager')
          .single()

        const existingMemory = existingMemoryRow
          ? {
              summary: existingMemoryRow.summary || '',
              goals: existingMemoryRow.goals || [],
              requirements: existingMemoryRow.requirements || [],
              constraints: existingMemoryRow.constraints || [],
              decisions: existingMemoryRow.decisions || [],
              assumptions: existingMemoryRow.assumptions || [],
              open_questions: existingMemoryRow.open_questions || [],
              glossary: existingMemoryRow.glossary || {},
              stakeholders: existingMemoryRow.stakeholders || [],
            }
          : null

        // Check if we need to update working memory
        // Update if: no memory exists, or if there are new messages since last update
        const { data: messageRows } = await supabase
          .from('hal_conversation_messages')
          .select('sequence')
          .eq('project_id', projectId)
          .eq('agent', 'project-manager')
          .order('sequence', { ascending: false })
          .limit(1)
          .single()

        const latestSequence = messageRows?.sequence ?? -1
        const needsUpdate = !existingMemoryRow || (existingMemoryRow.through_sequence ?? 0) < latestSequence

        if (needsUpdate && typeof runnerModule.generateWorkingMemory === 'function') {
          // Fetch all messages for working memory generation
          const { data: allMessageRows } = await supabase
            .from('hal_conversation_messages')
            .select('role, content, sequence')
            .eq('project_id', projectId)
            .eq('agent', 'project-manager')
            .order('sequence', { ascending: true })

          const allMessages = (allMessageRows ?? []).map((r: any) => ({
            role: r.role as 'user' | 'assistant',
            content: r.content ?? '',
          }))

          if (allMessages.length > 0) {
            try {
              workingMemory = await runnerModule.generateWorkingMemory(
                allMessages,
                existingMemory,
                key,
                model
              )

              // Save updated working memory
              await supabase.from('hal_conversation_working_memory').upsert(
                {
                  project_id: projectId,
                  agent: 'project-manager',
                  summary: workingMemory.summary || '',
                  goals: workingMemory.goals || [],
                  requirements: workingMemory.requirements || [],
                  constraints: workingMemory.constraints || [],
                  decisions: workingMemory.decisions || [],
                  assumptions: workingMemory.assumptions || [],
                  open_questions: workingMemory.open_questions || [],
                  glossary: workingMemory.glossary || {},
                  stakeholders: workingMemory.stakeholders || [],
                  through_sequence: latestSequence,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: 'project_id,agent' }
              )
            } catch (err) {
              console.error('[PM] Failed to generate working memory:', err)
              // Use existing memory if generation fails
              workingMemory = existingMemory
            }
          } else {
            workingMemory = existingMemory
          }
        } else {
          // Use existing memory
          workingMemory = existingMemory
        }
      } catch (err) {
        console.error('[PM] Failed to fetch/update working memory:', err)
        // Continue without working memory - failure mode is safe
      }
    }

    const runner = runnerModule?.getSharedRunner?.()
    if (!runner?.run) {
      const stubResponse: PmAgentResponse = {
        reply:
          '[PM Agent] The PM agent core is not yet available on this deployment (hal-agents runner not found).\n\nYour message was: "' +
          message +
          '"',
        toolCalls: [],
        outboundRequest: {
          _stub: true,
          _note: 'hal-agents runner dist not available',
          model,
          message,
        },
        error: 'PM agent runner not available (missing hal-agents dist)',
        errorPhase: 'not-implemented',
      }
      json(res, 200, stubResponse)
      return
    }

    const createTicketAvailable = !!(supabaseUrl && supabaseAnonKey)
    const currentRequestImages = Array.isArray(body.images) ? body.images : undefined
    
    // Merge current request images with images from recent messages (0157: persist images to DB)
    // Current request images take precedence (most recent), but we include images from recent messages too
    const allImages: Array<{ dataUrl: string; filename: string; mimeType: string }> = []
    
    // First add images from recent DB messages (older)
    if (recentImagesFromDb.length > 0) {
      allImages.push(...recentImagesFromDb)
    }
    
    // Then add current request images (newer), avoiding duplicates by dataUrl
    if (currentRequestImages && currentRequestImages.length > 0) {
      for (const img of currentRequestImages) {
        if (!allImages.some(existing => existing.dataUrl === img.dataUrl)) {
          allImages.push(img)
        }
      }
    }
    
    const images = allImages.length > 0 ? allImages : undefined

    const config = {
      repoRoot,
      openaiApiKey: key,
      openaiModel: model,
      conversationHistory,
      conversationContextPack,
      previousResponseId,
      ...(createTicketAvailable
        ? { supabaseUrl: supabaseUrl!, supabaseAnonKey: supabaseAnonKey! }
        : {}),
      ...(projectId ? { projectId } : {}),
      ...(repoFullName ? { repoFullName } : {}),
      ...(githubReadFile ? { githubReadFile } : {}),
      ...(githubSearchCode ? { githubSearchCode } : {}),
      ...(githubListDirectory ? { githubListDirectory } : {}),
      ...(images ? { images } : {}),
      ...(workingMemory ? { workingMemory } : {}),
    }
    // Debug: log what's being passed to PM agent (0119) - use console.warn for visibility
    console.warn(`[PM] Config passed to runner: repoFullName=${config.repoFullName || 'NOT SET'}, hasGithubReadFile=${typeof config.githubReadFile === 'function'}, hasGithubSearchCode=${typeof config.githubSearchCode === 'function'}, hasGithubListDirectory=${typeof config.githubListDirectory === 'function'}, hasImages=${!!config.images}, imageCount=${config.images?.length || 0}`)
    const result = (await runner.run(message, config)) as PmAgentResponse & {
      toolCalls: Array<{ name: string; input: unknown; output: unknown }>
    }

    // Update working memory automatically after PM agent responds (0173)
    if (projectId && supabaseUrl && supabaseAnonKey && runnerModule && typeof runnerModule.extractWorkingMemory === 'function') {
      try {
        const { createClient } = await import('@supabase/supabase-js')
        const supabase = createClient(supabaseUrl, supabaseAnonKey)
        
        // Fetch current working memory
        const { data: existingWm } = await supabase
          .from('hal_pm_working_memory')
          .select('*')
          .eq('project_id', projectId)
          .eq('agent', 'project-manager')
          .single()
        
        // Fetch all messages to extract working memory from
        const { data: allMessages } = await supabase
          .from('hal_conversation_messages')
          .select('role, content, sequence')
          .eq('project_id', projectId)
          .eq('agent', 'project-manager')
          .order('sequence', { ascending: true })
        
        if (allMessages && allMessages.length > 0) {
          const conversationTurns = allMessages.map((m: any) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content ?? '',
          }))
          
          const existingWmData = existingWm ? {
            summary: existingWm.summary || '',
            goals: existingWm.goals || '',
            requirements: existingWm.requirements || '',
            constraints: existingWm.constraints || '',
            decisions: existingWm.decisions || '',
            assumptions: existingWm.assumptions || '',
            open_questions: existingWm.open_questions || '',
            glossary_terms: existingWm.glossary_terms || '',
            stakeholders: existingWm.stakeholders || '',
          } : null
          
          // Extract working memory (only update if we have new messages beyond what's already processed)
          const lastSequence = existingWm?.through_sequence || 0
          const newMessages = conversationTurns.slice(lastSequence)
          
          if (newMessages.length > 0 || !existingWm) {
            const updatedWm = await runnerModule.extractWorkingMemory(
              conversationTurns,
              existingWmData,
              key,
              model
            )
            
            // Update working memory in database
            const maxSequence = Math.max(...allMessages.map((m: any) => m.sequence || 0), 0)
            await supabase
              .from('hal_pm_working_memory')
              .upsert(
                {
                  project_id: projectId,
                  agent: 'project-manager',
                  ...updatedWm,
                  through_sequence: maxSequence,
                  last_updated: new Date().toISOString(),
                },
                { onConflict: 'project_id,agent' }
              )
          }
        }
      } catch (wmErr) {
        // Working memory update failed - log but don't fail the request
        // This is a non-fatal error: PM agent can still respond using recent messages
        console.warn('[PM] Working memory update failed (non-fatal):', wmErr)
        // Note: We don't set an error flag here because working memory is optional
        // The PM agent will still work correctly using recent messages if working memory fails
      }
    }

    // Supabase-only (0065): no docs/tickets sync in serverless.
    // Still provide ticketCreationResult so UI can show a summary message.
    let ticketCreationResult: PmAgentResponse['ticketCreationResult']
    const createTicketCall = result.toolCalls?.find(
      (c) =>
        c.name === 'create_ticket' &&
        typeof c.output === 'object' &&
        c.output !== null &&
        (c.output as { success?: boolean }).success === true
    )
    if (createTicketCall) {
      const out = createTicketCall.output as any
      ticketCreationResult = {
        id: String(out.display_id ?? out.id ?? ''),
        filename: String(out.filename ?? ''),
        filePath: String(out.filePath ?? ''),
        syncSuccess: true,
        ...(out.retried && out.attempts != null && { retried: true, attempts: out.attempts }),
        ...(out.movedToTodo && { movedToTodo: true }),
        ...(out.moveError && { moveError: String(out.moveError) }),
        ...(typeof out.ready === 'boolean' && { ready: out.ready }),
        ...(Array.isArray(out.missingItems) && out.missingItems.length > 0 && { missingItems: out.missingItems }),
        ...(out.autoFixed && { autoFixed: true }),
      }
    }

    const response: PmAgentResponse = {
      reply: result.reply,
      toolCalls: result.toolCalls ?? [],
      outboundRequest: result.outboundRequest ?? null,
      ...(result.responseId != null && { responseId: result.responseId }),
      ...(result.error != null && { error: result.error }),
      ...(result.errorPhase != null && { errorPhase: result.errorPhase }),
      ...(ticketCreationResult != null && { ticketCreationResult }),
      createTicketAvailable,
      agentRunner: runner.label,
      ...(result.promptText != null && { promptText: result.promptText }),
    }

    // Debug: log what we're returning (0119) - include in response for frontend debugging
    const debugInfo = {
      repoFullName: repoFullName || 'NOT SET',
      hasGithubToken: !!githubToken,
      hasGithubReadFile: typeof githubReadFile === 'function',
      hasGithubSearchCode: typeof githubSearchCode === 'function',
      hasGithubListDirectory: typeof githubListDirectory === 'function',
      cookieHeaderPresent: !!req.headers.cookie,
      repoUsage: (result as any)._repoUsage || [], // Which repo was actually used for each tool call
    }
    console.warn(`[PM] Response - ${JSON.stringify(debugInfo)}`)
    
    // Include debug info in response for frontend (0119)
    const responseWithDebug = {
      ...response,
      _debug: debugInfo, // Frontend can check this in Network tab
    }

    json(res, 200, responseWithDebug)
  } catch (err) {
    json(res, 500, {
      reply: '',
      toolCalls: [],
      outboundRequest: null,
      error: err instanceof Error ? err.message : String(err),
      errorPhase: 'openai',
    } satisfies PmAgentResponse)
  }
}

