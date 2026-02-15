import type { IncomingMessage, ServerResponse } from 'http'
import { getSession } from '../_lib/github/session.js'
import { readJsonBody, validateMethod, parseRequestBody, validateMessageOrImages } from './respond/request-parsing.js'
import { validateOpenAiConfig } from './respond/config-validation.js'
import { createGitHubFunctions } from './respond/github-gating.js'
import { loadRunnerModule, getRunner } from './respond/runner-loading.js'
import { buildContextPack } from './respond/context-pack.js'
import { extractTicketCreationResult } from './respond/ticket-result.js'
import { updateWorkingMemoryAfterResponse } from './respond/working-memory-update.js'
import { json, formatResponse } from './respond/response-formatting.js'
import type { PmAgentResponse } from './respond/types.js'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // Validate HTTP method
  if (!validateMethod(req.method)) {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    // Parse request body
    const rawBody = await readJsonBody(req)
    const body = parseRequestBody(rawBody)

    // Validate message or images
    const messageError = validateMessageOrImages(body.message ?? '', body.images)
    if (messageError) {
      json(res, 400, { error: messageError })
      return
    }

    // Validate OpenAI config
    const configResult = validateOpenAiConfig()
    if (!configResult.valid) {
      json(res, 503, configResult.errorResponse)
      return
    }
    const { key, model } = configResult

    // Get GitHub session and create GitHub functions
    const session = await getSession(req, res)
    const githubToken = session.github?.accessToken
    const cookieHeader = req.headers.cookie ? 'present' : 'missing'
    console.warn(
      `[PM] Request received - repoFullName: ${body.repoFullName || 'NOT PROVIDED'}, hasToken: ${!!githubToken}, tokenLength: ${githubToken?.length || 0}, cookieHeader: ${cookieHeader}`
    )
    if (body.repoFullName && !githubToken) {
      console.warn(
        `[PM] ⚠️ repoFullName provided (${body.repoFullName}) but no GitHub token in session. Cookie header: ${cookieHeader}`
      )
      console.warn(
        `[PM] Session data:`,
        JSON.stringify({
          hasGithub: !!session.github,
          githubKeys: session.github ? Object.keys(session.github) : [],
        })
      )
    }
    if (githubToken && !body.repoFullName) {
      console.warn(`[PM] GitHub token available but no repoFullName provided`)
    }

    const { githubReadFile, githubSearchCode, githubListDirectory } = createGitHubFunctions(
      session,
      body.repoFullName
    )

    // Load runner module
    const runnerModule = await loadRunnerModule()
    const runner = getRunner(runnerModule)

    // Build context pack if Supabase is available
    let conversationContextPack: string | undefined
    let workingMemoryText: string | undefined
    let recentImagesFromDb: Array<{ dataUrl: string; filename: string; mimeType: string }> = []
    let conversationHistory = body.conversationHistory

    if (body.projectId && body.supabaseUrl && body.supabaseAnonKey && runnerModule) {
      try {
        const { createClient } = await import('@supabase/supabase-js')
        const supabase = createClient(body.supabaseUrl, body.supabaseAnonKey)
        const contextResult = await buildContextPack(
          supabase,
          body.projectId,
          body.conversationId,
          runnerModule,
          key,
          model
        )
        conversationContextPack = contextResult.conversationContextPack
        workingMemoryText = contextResult.workingMemoryText
        recentImagesFromDb = contextResult.recentImagesFromDb
        conversationHistory = contextResult.conversationHistory
      } catch {
        // If DB context fails, fall back to client history.
      }
    }

    // Check if runner is available
    if (!runner?.run) {
      const stubResponse: PmAgentResponse = {
        reply:
          '[PM Agent] The PM agent core is not yet available on this deployment (hal-agents runner not found).\n\nYour message was: "' +
          (body.message ?? '') +
          '"',
        toolCalls: [],
        outboundRequest: {
          _stub: true,
          _note: 'hal-agents runner dist not available',
          model,
          message: body.message ?? '',
        },
        error: 'PM agent runner not available (missing hal-agents dist)',
        errorPhase: 'not-implemented',
      }
      json(res, 200, stubResponse)
      return
    }

    // Merge images from DB and current request
    const createTicketAvailable = !!(body.supabaseUrl && body.supabaseAnonKey)
    const currentRequestImages = body.images
    const allImages: Array<{ dataUrl: string; filename: string; mimeType: string }> = []

    if (recentImagesFromDb.length > 0) {
      allImages.push(...recentImagesFromDb)
    }

    if (currentRequestImages && currentRequestImages.length > 0) {
      for (const img of currentRequestImages) {
        if (!allImages.some((existing) => existing.dataUrl === img.dataUrl)) {
          allImages.push(img)
        }
      }
    }

    const images = allImages.length > 0 ? allImages : undefined

    // Prepare config for runner
    const repoRoot = process.cwd()
    const config = {
      repoRoot,
      openaiApiKey: key,
      openaiModel: model,
      conversationHistory,
      conversationContextPack,
      workingMemoryText,
      previousResponseId: body.previous_response_id,
      ...(createTicketAvailable
        ? { supabaseUrl: body.supabaseUrl!, supabaseAnonKey: body.supabaseAnonKey! }
        : {}),
      ...(body.projectId ? { projectId: body.projectId } : {}),
      ...(body.conversationId ? { conversationId: body.conversationId } : {}),
      ...(body.repoFullName ? { repoFullName: body.repoFullName } : {}),
      ...(githubReadFile ? { githubReadFile } : {}),
      ...(githubSearchCode ? { githubSearchCode } : {}),
      ...(githubListDirectory ? { githubListDirectory } : {}),
      ...(images ? { images } : {}),
    }

    console.warn(
      `[PM] Config passed to runner: repoFullName=${config.repoFullName || 'NOT SET'}, hasGithubReadFile=${typeof config.githubReadFile === 'function'}, hasGithubSearchCode=${typeof config.githubSearchCode === 'function'}, hasGithubListDirectory=${typeof config.githubListDirectory === 'function'}, hasImages=${!!config.images}, imageCount=${config.images?.length || 0}`
    )

    // Run the agent
    const result = (await runner.run(body.message ?? '', config)) as PmAgentResponse & {
      toolCalls: Array<{ name: string; input: unknown; output: unknown }>
    }

    // Update working memory after response (0173: PM working memory)
    if (
      body.projectId &&
      body.supabaseUrl &&
      body.supabaseAnonKey &&
      runnerModule &&
      !result.error
    ) {
      try {
        const { createClient } = await import('@supabase/supabase-js')
        const supabase = createClient(body.supabaseUrl, body.supabaseAnonKey)
        await updateWorkingMemoryAfterResponse(supabase, body.projectId, runnerModule, key, model)
      } catch (memoryUpdateErr) {
        console.warn('[PM] Failed to update working memory:', memoryUpdateErr)
      }
    }

    // Extract ticket creation result
    const ticketCreationResult = extractTicketCreationResult(result.toolCalls)

    // Format and send response
    const debugInfo = {
      repoFullName: body.repoFullName || 'NOT SET',
      hasGithubToken: !!githubToken,
      hasGithubReadFile: typeof githubReadFile === 'function',
      hasGithubSearchCode: typeof githubSearchCode === 'function',
      hasGithubListDirectory: typeof githubListDirectory === 'function',
      cookieHeaderPresent: !!req.headers.cookie,
      repoUsage: (result as any)._repoUsage || [],
    }
    console.warn(`[PM] Response - ${JSON.stringify(debugInfo)}`)

    const response = formatResponse(
      result,
      createTicketAvailable,
      runner.label,
      ticketCreationResult,
      debugInfo
    )

    json(res, 200, response)
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
