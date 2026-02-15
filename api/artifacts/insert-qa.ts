import type { IncomingMessage, ServerResponse } from 'http'
import { hasSubstantiveQAContent } from './_validation.js'
import { extractArtifactTypeFromTitle, createCanonicalTitle } from './_shared.js'
import {
  readJsonBody,
  json,
  setCorsHeaders,
  handleOptionsRequest,
} from './_http-utils.js'
import {
  parseRequestBody,
  getSupabaseCredentials,
  createSupabaseClient,
  validateBodyMd,
} from './_request-handling.js'
import { validateTicketId, lookupTicket } from './_ticket-lookup.js'
import { storeArtifact } from './_artifact-storage.js'
import { logStorageAttempt } from './_log-attempt.js'

const ENDPOINT_NAME = 'insert-qa'
const ENDPOINT_PATH = '/api/artifacts/insert-qa'

/**
 * Checks if QA report contains FAIL outcome and triggers escalation check if needed.
 * This is called asynchronously after successful artifact storage.
 */
async function checkFailureEscalationIfNeeded(
  supabase: any,
  ticketPk: string,
  body_md: string
): Promise<void> {
  const isFailOutcome = /QA RESULT:\s*FAIL\s*—/i.test(body_md)
  if (isFailOutcome) {
    // Trigger escalation check asynchronously (don't block the response)
    setTimeout(async () => {
      try {
        const { checkFailureEscalation } = await import('../tickets/_failure-escalation.js')
        await checkFailureEscalation(supabase, ticketPk, 'qa')
      } catch (err) {
        // Log but don't fail - escalation check is best effort
        console.warn(`[${ENDPOINT_NAME}] Escalation check error: ${err instanceof Error ? err.message : String(err)}`)
      }
    }, 100)
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  setCorsHeaders(res)

  if (req.method === 'OPTIONS') {
    handleOptionsRequest(res)
    return
  }

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    const rawBody = await readJsonBody(req, ENDPOINT_NAME)
    const body = parseRequestBody(rawBody)

    // Log artifact creation request for tracing
    console.log(`[${ENDPOINT_NAME}] Artifact creation request: ticketId=${body.ticketId}, title="${body.title}", body_md type=${typeof body.body_md}, body_md length=${body.body_md?.length ?? 'undefined'}`)

    // Validate required fields
    if (!body.ticketId || !body.title || !body.body_md) {
      json(res, 400, {
        success: false,
        error: 'ticketId, title, and body_md are required.',
      })
      return
    }

    // Validate body_md format
    const bodyMdValidation = validateBodyMd(body.body_md, ENDPOINT_NAME)
    if (!bodyMdValidation.valid) {
      json(res, 400, {
        success: false,
        error: bodyMdValidation.error,
        validation_failed: true,
      })
      return
    }

    // Get Supabase credentials
    const credentials = getSupabaseCredentials(body)
    if (!credentials) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
      return
    }

    const supabase = createSupabaseClient(credentials.url, credentials.anonKey)

    // Validate ticket ID format
    const ticketIdValidation = validateTicketId(body.ticketId)
    if (!ticketIdValidation.valid) {
      json(res, 400, {
        success: false,
        error: ticketIdValidation.error,
      })
      return
    }

    // Lookup ticket
    const { ticket, error: ticketError } = await lookupTicket(supabase, body.ticketId)
    if (ticketError || !ticket) {
      await logStorageAttempt(
        supabase,
        '',
        '',
        'qa-report',
        'qa',
        ENDPOINT_PATH,
        'request failed',
        ticketError || `Ticket ${body.ticketId} not found in Supabase.`
      )
      json(res, 200, {
        success: false,
        error: ticketError || `Ticket ${body.ticketId} not found in Supabase.`,
      })
      return
    }

    // Validate body_md content
    if (!body.body_md || typeof body.body_md !== 'string') {
      const errorMsg = 'body_md is required and must be a string'
      console.error(`[${ENDPOINT_NAME}] ${errorMsg}: body_md type=${typeof body.body_md}, value=${body.body_md?.substring(0, 100) ?? 'null/undefined'}`)
      // Detect artifact type from title for logging
      const detectedArtifactType = extractArtifactTypeFromTitle(body.title || '') || 'qa-report'
      await logStorageAttempt(
        supabase,
        ticket.pk,
        ticket.repo_full_name || '',
        detectedArtifactType,
        'qa',
        ENDPOINT_PATH,
        'rejected by validation',
        errorMsg,
        errorMsg
      )
      json(res, 400, {
        success: false,
        error: errorMsg,
        validation_failed: true,
      })
      return
    }

    const contentValidation = hasSubstantiveQAContent(body.body_md, body.title)
    console.log(`[${ENDPOINT_NAME}] Content validation: valid=${contentValidation.valid}, reason=${contentValidation.reason || 'none'}, body_md length=${body.body_md.length}`)
    if (!contentValidation.valid) {
      // Detect artifact type from title for logging
      const detectedArtifactType = extractArtifactTypeFromTitle(body.title || '') || 'qa-report'
      await logStorageAttempt(
        supabase,
        ticket.pk,
        ticket.repo_full_name || '',
        detectedArtifactType,
        'qa',
        ENDPOINT_PATH,
        'rejected by validation',
        contentValidation.reason || 'Artifact body must contain substantive QA report content',
        contentValidation.reason || undefined
      )
      json(res, 400, {
        success: false,
        error: contentValidation.reason || 'Artifact body must contain substantive QA report content, not just a title or placeholder text.',
        validation_failed: true,
        validation_reason: contentValidation.reason,
      })
      return
    }

    // Detect artifact type from title (implementation agent note vs qa report)
    const displayId = ticket.display_id || body.ticketId
    const detectedArtifactType = extractArtifactTypeFromTitle(body.title) || 'qa-report'
    const artifactType = detectedArtifactType === 'implementation-agent-note' ? 'implementation-agent-note' : 'qa-report'
    const canonicalTitle = createCanonicalTitle(artifactType, displayId)

    // Store artifact using shared storage logic
    const storageResult = await storeArtifact({
      supabase,
      ticketPk: ticket.pk,
      repoFullName: ticket.repo_full_name || '',
      artifactType,
      agentType: 'qa',
      canonicalTitle,
      body_md: body.body_md,
      endpointPath: ENDPOINT_PATH,
      isQAContent: true,
    })

    if (!storageResult.success) {
      json(res, 200, {
        success: false,
        error: storageResult.error || 'Failed to store artifact',
      })
      return
    }

    // Check if this is a FAIL outcome and trigger escalation check (0195)
    await checkFailureEscalationIfNeeded(supabase, ticket.pk, body.body_md)

    json(res, 200, {
      success: true,
      artifact_id: storageResult.artifact_id,
      action: storageResult.action,
      cleaned_up_duplicates: storageResult.cleaned_up_duplicates,
      race_condition_handled: storageResult.race_condition_handled,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
