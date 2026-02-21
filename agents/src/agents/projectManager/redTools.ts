/**
 * RED (Requirement Expansion Document) tools extracted from projectManager.ts to improve maintainability.
 */

import { tool, jsonSchema } from 'ai'
import type { ToolCallRecord } from '../projectManager.js'
import type { HalFetchJson } from './halApiClient.js'

type CreateRedDocumentInput = {
  ticket_id: string
  red_json_content: string
}

export function createRedDocumentTool(
  toolCalls: ToolCallRecord[],
  halFetchJson: HalFetchJson
) {
  return tool({
    description:
      'Create a Requirement Expansion Document (RED) for a ticket via the HAL API. RED documents are required before a ticket can be moved to To Do.',
    parameters: jsonSchema<CreateRedDocumentInput>({
      type: 'object',
      additionalProperties: false,
      properties: {
        ticket_id: {
          type: 'string',
          description: 'Ticket id (e.g. "HAL-0012", "0012", or "12").',
        },
        red_json_content: {
          type: 'string',
          description:
            'RED document content as a JSON string. Should contain expanded requirements, use cases, edge cases, and other detailed information. Will be parsed as JSON.',
        },
      },
      required: ['ticket_id', 'red_json_content'],
    }),
    execute: async (input: CreateRedDocumentInput) => {
      type CreateRedResult =
        | {
            success: true
            red_document: {
              red_id: string
              version: number
              ticket_pk: string
              repo_full_name: string
            }
          }
        | { success: false; error: string }
      let out: CreateRedResult
      try {
        // Fetch ticket to get ticketPk and repoFullName
        const { json: fetched } = await halFetchJson(
          '/api/tickets/get',
          { ticketId: input.ticket_id },
          { timeoutMs: 20_000, progressMessage: `Fetching ticket ${input.ticket_id} for RED…` }
        )
        if (!fetched?.success || !fetched?.ticket) {
          out = { success: false, error: fetched?.error || `Ticket ${input.ticket_id} not found.` }
          toolCalls.push({ name: 'create_red_document_v2', input, output: out })
          return out
        }

        const ticket = fetched.ticket as any
        const ticketPk = typeof ticket.pk === 'string' ? ticket.pk : undefined
        const repoFullName = typeof ticket.repo_full_name === 'string' ? ticket.repo_full_name : undefined

        if (!ticketPk || !repoFullName) {
          out = {
            success: false,
            error: `Could not determine ticket_pk or repo_full_name for ticket ${input.ticket_id}.`,
          }
          toolCalls.push({ name: 'create_red_document_v2', input, output: out })
          return out
        }

        // Idempotency: if a RED already exists, reuse it instead of creating new versions.
        const { json: existing } = await halFetchJson(
          '/api/red/list',
          { ticketPk, repoFullName },
          { timeoutMs: 20_000, progressMessage: `Checking existing REDs for ${input.ticket_id}…` }
        )
        if (existing?.success && Array.isArray(existing.red_versions) && existing.red_versions.length > 0) {
          const latest = existing.red_versions[0] as any
          // Best-effort: ensure it's validated for "latest-valid" gates
          try {
            await halFetchJson(
              '/api/red/validate',
              {
                redId: latest.red_id,
                result: 'valid',
                createdBy: 'pm-agent',
                notes: 'Auto-validated existing RED for To Do gate.',
              },
              { timeoutMs: 20_000, progressMessage: `Validating existing RED for ${input.ticket_id}…` }
            )
          } catch {
            // Non-fatal
          }

          // Best-effort: create/update mirrored RED artifact for visibility in ticket Artifacts.
          try {
            const vNum = Number(latest.version ?? 0) || 0
            const { json: redGet } = await halFetchJson(
              '/api/red/get',
              { ticketPk, ticketId: input.ticket_id, repoFullName, version: vNum },
              { timeoutMs: 20_000, progressMessage: `Loading latest RED JSON for ${input.ticket_id}…` }
            )
            const redDoc = redGet?.success ? redGet.red_document : null
            const redJsonForArtifact = redDoc?.red_json ?? null
            if (redJsonForArtifact != null) {
              const createdAt = typeof redDoc?.created_at === 'string' ? redDoc.created_at : new Date().toISOString()
              const validationStatus =
                typeof redDoc?.validation_status === 'string' ? redDoc.validation_status : 'pending'
              const artifactTitle = `RED v${vNum || redDoc?.version || 0} — ${createdAt.split('T')[0]}`
              const artifactBody = `# RED Document Version ${vNum || redDoc?.version || 0}

RED ID: ${String(latest.red_id)}
Created: ${createdAt}
Validation Status: ${validationStatus}

## Canonical RED JSON

\`\`\`json
${JSON.stringify(redJsonForArtifact, null, 2)}
\`\`\`
`
              await halFetchJson(
                '/api/artifacts/insert-implementation',
                { ticketId: ticketPk, artifactType: 'red', title: artifactTitle, body_md: artifactBody },
                { timeoutMs: 25_000, progressMessage: `Saving RED artifact for ${input.ticket_id}…` }
              )
            }
          } catch {
            // Non-fatal
          }
          out = {
            success: true,
            red_document: {
              red_id: String(latest.red_id),
              version: Number(latest.version ?? 0) || 0,
              ticket_pk: ticketPk,
              repo_full_name: repoFullName,
            },
          }
          toolCalls.push({ name: 'create_red_document_v2', input, output: out })
          return out
        }

        let redJsonParsed: unknown
        try {
          redJsonParsed = JSON.parse(input.red_json_content)
        } catch (parseErr) {
          out = {
            success: false,
            error: `Invalid JSON in red_json_content: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
          }
          toolCalls.push({ name: 'create_red_document_v2', input, output: out })
          return out
        }

        // Create RED document via HAL API
        const { json: created } = await halFetchJson(
          '/api/red/insert',
          {
            ticketPk,
            repoFullName,
            redJson: redJsonParsed,
            validationStatus: 'pending',
            createdBy: 'pm-agent',
          },
          { timeoutMs: 25_000, progressMessage: `Creating RED for ${input.ticket_id}…` }
        )
        if (!created?.success || !created?.red_document) {
          out = { success: false, error: created?.error || 'Failed to create RED document' }
        } else {
          // Option A: validate via separate table (immutable RED rows)
          try {
            await halFetchJson(
              '/api/red/validate',
              {
                redId: created.red_document.red_id,
                result: 'valid',
                createdBy: 'pm-agent',
                notes: 'Auto-validated for To Do gate (PM-generated RED).',
              },
              { timeoutMs: 20_000, progressMessage: `Validating RED for ${input.ticket_id}…` }
            )
          } catch {
            // Non-fatal: RED exists but may not satisfy latest-valid gates until validated.
          }

          // Best-effort: create/update mirrored RED artifact for visibility in ticket Artifacts.
          try {
            const savedRED = created.red_document as any
            const version = Number(savedRED?.version ?? 0) || 0
            const createdAt = typeof savedRED?.created_at === 'string' ? savedRED.created_at : new Date().toISOString()
            const validationStatus =
              typeof savedRED?.validation_status === 'string' ? savedRED.validation_status : 'pending'
            const redJsonForArtifact = savedRED?.red_json ?? redJsonParsed
            const artifactTitle = `RED v${version} — ${createdAt.split('T')[0]}`
            const artifactBody = `# RED Document Version ${version}

RED ID: ${String(savedRED?.red_id ?? '')}
Created: ${createdAt}
Validation Status: ${validationStatus}

## Canonical RED JSON

\`\`\`json
${JSON.stringify(redJsonForArtifact, null, 2)}
\`\`\`
`
            await halFetchJson(
              '/api/artifacts/insert-implementation',
              { ticketId: ticketPk, artifactType: 'red', title: artifactTitle, body_md: artifactBody },
              { timeoutMs: 25_000, progressMessage: `Saving RED artifact for ${input.ticket_id}…` }
            )
          } catch {
            // Non-fatal
          }
          out = {
            success: true,
            red_document: {
              red_id: created.red_document.red_id,
              version: created.red_document.version,
              ticket_pk: ticketPk,
              repo_full_name: repoFullName,
            },
          }
        }
      } catch (err) {
        out = { success: false, error: err instanceof Error ? err.message : String(err) }
      }
      toolCalls.push({ name: 'create_red_document_v2', input, output: out })
      return out
    },
  })
}
