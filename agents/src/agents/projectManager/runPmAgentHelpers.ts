/**
 * Helper functions extracted from runPmAgent to improve maintainability.
 */

/**
 * Tool call record type for fallback reply generation.
 */
export interface ToolCallRecord {
  name: string
  input: unknown
  output: unknown
}

/**
 * Determines if an error is an abort error (from AbortSignal or AbortError).
 */
export function isAbortError(err: unknown, abortSignal?: AbortSignal): boolean {
  return (
    abortSignal?.aborted === true ||
    (typeof (err as any)?.name === 'string' && String((err as any).name).toLowerCase() === 'aborterror') ||
    (err instanceof Error && /aborted|abort/i.test(err.message))
  )
}

/**
 * Options for halFetchJson requests.
 */
export interface HalFetchOptions {
  timeoutMs?: number
  progressMessage?: string
}

/**
 * Result from halFetchJson.
 */
export interface HalFetchResult {
  ok: boolean
  json: any
}

/**
 * Makes a POST request to a HAL API endpoint with timeout and abort signal support.
 */
export async function halFetchJson(
  halBaseUrl: string,
  path: string,
  body: unknown,
  opts: HalFetchOptions & { abortSignal?: AbortSignal; onProgress?: (message: string) => void | Promise<void> }
): Promise<HalFetchResult> {
  const timeoutMs = Math.max(1_000, Math.floor(opts?.timeoutMs ?? 20_000))
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(new Error('HAL request timeout')), timeoutMs)
  const onAbort = () => controller.abort(opts.abortSignal?.reason ?? new Error('Aborted'))
  try {
    const progress = String(opts?.progressMessage ?? '').trim()
    if (progress) await opts.onProgress?.(progress)
    if (opts.abortSignal) opts.abortSignal.addEventListener('abort', onAbort, { once: true })
    const res = await fetch(`${halBaseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    })
    const text = await res.text()
    let json: any = {}
    if (text) {
      try {
        json = JSON.parse(text)
      } catch (e) {
        const contentType = res.headers.get('content-type') || 'unknown'
        const prefix = text.slice(0, 200)
        json = {
          success: false,
          error: `Non-JSON response from ${path} (HTTP ${res.status}, content-type: ${contentType}): ${prefix}`,
        }
      }
    }
    return { ok: res.ok, json }
  } finally {
    clearTimeout(t)
    try {
      if (opts.abortSignal) opts.abortSignal.removeEventListener('abort', onAbort)
    } catch {
      // ignore
    }
  }
}

/**
 * Generates a fallback reply message when the LLM returns no text but tool calls succeeded.
 * This handles cases where tool execution succeeded but the model didn't generate a response.
 */
export function generateFallbackReply(toolCalls: ToolCallRecord[]): string {
  // Check for placeholder validation failures first (0066)
  const createTicketRejected = toolCalls.find(
    (c) =>
      c.name === 'create_ticket' &&
      typeof c.output === 'object' &&
      c.output !== null &&
      (c.output as { success?: boolean }).success === false &&
      (c.output as { detectedPlaceholders?: string[] }).detectedPlaceholders
  )
  if (createTicketRejected) {
    const out = createTicketRejected.output as {
      error: string
      detectedPlaceholders?: string[]
    }
    let reply = `**Ticket creation rejected:** ${out.error}`
    if (out.detectedPlaceholders && out.detectedPlaceholders.length > 0) {
      reply += `\n\n**Detected placeholders:** ${out.detectedPlaceholders.join(', ')}`
    }
    reply += `\n\nPlease replace all angle-bracket placeholders with concrete content and try again. Check Diagnostics for details.`
    return reply
  }

  const updateTicketRejected = toolCalls.find(
    (c) =>
      c.name === 'update_ticket_body' &&
      typeof c.output === 'object' &&
      c.output !== null &&
      (c.output as { success?: boolean }).success === false &&
      (c.output as { detectedPlaceholders?: string[] }).detectedPlaceholders
  )
  if (updateTicketRejected) {
    const out = updateTicketRejected.output as {
      error: string
      detectedPlaceholders?: string[]
    }
    let reply = `**Ticket update rejected:** ${out.error}`
    if (out.detectedPlaceholders && out.detectedPlaceholders.length > 0) {
      reply += `\n\n**Detected placeholders:** ${out.detectedPlaceholders.join(', ')}`
    }
    reply += `\n\nPlease replace all angle-bracket placeholders with concrete content and try again. Check Diagnostics for details.`
    return reply
  }

  const createTicketCall = toolCalls.find(
    (c) =>
      c.name === 'create_ticket' &&
      typeof c.output === 'object' &&
      c.output !== null &&
      (c.output as { success?: boolean }).success === true
  )
  if (createTicketCall) {
    const out = createTicketCall.output as {
      id: string
      filename: string
      filePath: string
      ready?: boolean
      missingItems?: string[]
    }
    let reply = `I created ticket **${out.id}** at \`${out.filePath}\`. It should appear in the Kanban board under Unassigned (sync may run automatically).`
    if (out.ready === false && out.missingItems?.length) {
      reply += ` The ticket is not yet ready for To Do: ${out.missingItems.join('; ')}. Update the ticket or ask me to move it once it passes the Ready-to-start checklist.`
    }
    return reply
  }

  const moveCall = toolCalls.find(
    (c) =>
      c.name === 'kanban_move_ticket_to_todo' &&
      typeof c.output === 'object' &&
      c.output !== null &&
      (c.output as { success?: boolean }).success === true
  )
  if (moveCall) {
    const out = moveCall.output as { ticketId: string; fromColumn: string; toColumn: string }
    return `I moved ticket **${out.ticketId}** from ${out.fromColumn} to **${out.toColumn}**. It should now appear under To Do on the Kanban board.`
  }

  const updateBodyCall = toolCalls.find(
    (c) =>
      c.name === 'update_ticket_body' &&
      typeof c.output === 'object' &&
      c.output !== null &&
      (c.output as { success?: boolean }).success === true
  )
  if (updateBodyCall) {
    const out = updateBodyCall.output as {
      ticketId: string
      ready?: boolean
      missingItems?: string[]
    }
    let reply = `I updated the body of ticket **${out.ticketId}** via the HAL API. The Kanban UI will reflect the change within ~10 seconds.`
    if (out.ready === false && out.missingItems?.length) {
      reply += ` Note: the ticket may still not pass readiness: ${out.missingItems.join('; ')}.`
    }
    return reply
  }

  const syncTicketsCall = toolCalls.find(
    (c) =>
      c.name === 'sync_tickets' &&
      typeof c.output === 'object' &&
      c.output !== null &&
      (c.output as { success?: boolean }).success === true
  )
  if (syncTicketsCall) {
    return 'I ran sync-tickets. docs/tickets/*.md now match Supabase (Supabase is the source of truth).'
  }

  const listTicketsCall = toolCalls.find(
    (c) =>
      c.name === 'list_tickets_by_column' &&
      typeof c.output === 'object' &&
      c.output !== null &&
      (c.output as { success?: boolean }).success === true
  )
  if (listTicketsCall) {
    const out = listTicketsCall.output as {
      column_id: string
      tickets: Array<{ id: string; title: string; column: string }>
      count: number
    }
    if (out.count === 0) {
      return `No tickets found in column **${out.column_id}**.`
    }
    const ticketList = out.tickets.map((t) => `- **${t.id}** — ${t.title}`).join('\n')
    return `Tickets in **${out.column_id}** (${out.count}):\n\n${ticketList}`
  }

  const listReposCall = toolCalls.find(
    (c) =>
      c.name === 'list_available_repos' &&
      typeof c.output === 'object' &&
      c.output !== null &&
      (c.output as { success?: boolean }).success === true
  )
  if (listReposCall) {
    const out = listReposCall.output as {
      repos: Array<{ repo_full_name: string }>
      count: number
    }
    if (out.count === 0) {
      return `No repositories found in the database.`
    }
    const repoList = out.repos.map((r) => `- **${r.repo_full_name}**`).join('\n')
    return `Available repositories (${out.count}):\n\n${repoList}`
  }

  const moveToOtherRepoCall = toolCalls.find(
    (c) =>
      c.name === 'kanban_move_ticket_to_other_repo_todo' &&
      typeof c.output === 'object' &&
      c.output !== null &&
      (c.output as { success?: boolean }).success === true
  )
  if (moveToOtherRepoCall) {
    const out = moveToOtherRepoCall.output as {
      ticketId: string
      display_id?: string
      fromRepo: string
      toRepo: string
      fromColumn: string
      toColumn: string
    }
    return `I moved ticket **${out.display_id ?? out.ticketId}** from **${out.fromRepo}** (${out.fromColumn}) to **${out.toRepo}** (${out.toColumn}). The ticket is now in the To Do column of the target repository.`
  }

  return ''
}

/**
 * Image configuration for prompt building.
 */
export interface ImageConfig {
  filename?: string
  mimeType?: string
  dataUrl: string
}

/**
 * Result of building a prompt for the LLM.
 */
export interface PromptBuildResult {
  prompt: string | Array<{ type: 'text' | 'image'; text?: string; image?: string }>
  fullPromptText: string
}

/**
 * Builds the prompt for the LLM, handling both text-only and vision models with images.
 */
export function buildPrompt(
  contextPack: string,
  systemInstructions: string,
  images?: ImageConfig[],
  openaiModel?: string
): PromptBuildResult {
  const promptBase = `${contextPack}\n\n---\n\nRespond to the user message above using the tools as needed.`

  const hasImages = images && images.length > 0
  const isVisionModel = openaiModel ? (openaiModel.includes('vision') || openaiModel.includes('gpt-4o')) : false
  let imageInfo = ''
  if (hasImages) {
    const imageList = images!.map((img, idx) => `  ${idx + 1}. ${img.filename || `Image ${idx + 1}`} (${img.mimeType || 'image'})`).join('\n')
    if (isVisionModel) {
      imageInfo = `\n\n## Images (included in prompt)\n\n${imageList}\n\n(Note: Images are sent as base64-encoded data URLs in the prompt array, but are not shown in this text representation.)`
    } else {
      imageInfo = `\n\n## Images (provided but ignored)\n\n${imageList}\n\n(Note: Images were provided but the model (${openaiModel}) does not support vision. Images are ignored.)`
    }
  }
  const fullPromptText = `## System Instructions\n\n${systemInstructions}\n\n---\n\n## User Prompt\n\n${promptBase}${imageInfo}`

  // Build prompt with images if present
  // For vision models, prompt must be an array of content parts
  // For non-vision models, prompt is a string (images are ignored)
  let prompt: string | Array<{ type: 'text' | 'image'; text?: string; image?: string }>
  if (hasImages && isVisionModel) {
    // Vision model: use array format with text and images
    prompt = [
      { type: 'text' as const, text: promptBase },
      ...images!.map((img) => ({ type: 'image' as const, image: img.dataUrl })),
    ]
  } else {
    // Non-vision model or no images: use string format
    prompt = promptBase
    if (hasImages && !isVisionModel) {
      // Log warning but don't fail - user can still send text
      console.warn('[PM Agent] Images provided but model does not support vision. Images will be ignored.')
    }
  }

  return { prompt, fullPromptText }
}
