import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import {
  readJsonBody,
  json,
  parseBootstrapCredentials,
  updateStepRecord,
  addLogEntry,
  getNextStep,
  allStepsCompleted,
  type BootstrapStepId,
} from './_shared.js'
import { createSupabaseProject } from './_supabase-management.js'
import { encryptSecret } from '../_lib/encryption.js'

/**
 * Executes a bootstrap step.
 */
async function executeStep(
  stepId: BootstrapStepId,
  projectId: string,
  runId: string,
  supabase: any,
  stepParams?: {
    supabaseManagementApiToken?: string
    organizationId?: string
    projectName?: string
    region?: string
    previewUrl?: string
  }
): Promise<{ success: boolean; error?: string; errorDetails?: string }> {
  switch (stepId) {
    case 'ensure_repo_initialized':
      // TODO (T2): Implement ensure_repo_initialized using GitHub Git Database API
      // For now, simulate success after a delay
      await new Promise((resolve) => setTimeout(resolve, 1000))
      return { success: true }

    case 'create_supabase_project':
      try {
        // Validate required context
        if (!context?.supabaseManagementToken) {
          return {
            success: false,
            error: 'Supabase Management API token is required',
            errorDetails: 'Please provide a valid Supabase Management API token to create a project.',
          }
        }

        if (!context?.supabaseOrganizationId) {
          return {
            success: false,
            error: 'Organization ID is required',
            errorDetails: 'Please provide a Supabase organization ID to create a project.',
          }
        }

        // Generate project name if not provided
        const projectName = context.supabaseProjectName || `${projectId}-${Date.now()}`
        const region = context.supabaseRegion || 'us-east-1'

        // Create Supabase project via Management API
        const { project, apiKeys } = await createSupabaseProject(
          context.supabaseManagementToken,
          projectName,
          context.supabaseOrganizationId,
          region
        )

        // Construct project URL
        const projectUrl = `https://${project.ref}.supabase.co`

        // Encrypt sensitive credentials
        const encryptedAnonKey = encryptSecret(apiKeys.anon_key)
        const encryptedServiceRoleKey = encryptSecret(apiKeys.service_role_key)

        // Store project metadata in database
        const { error: storeError } = await supabase
          .from('supabase_projects')
          .upsert(
            {
              repo_full_name: projectId,
              project_ref: project.ref,
              project_url: projectUrl,
              encrypted_anon_key: encryptedAnonKey,
              encrypted_service_role_key: encryptedServiceRoleKey,
              status: 'created',
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'repo_full_name' }
          )

        if (storeError) {
          return {
            success: false,
            error: 'Failed to store project metadata',
            errorDetails: `Database error: ${storeError.message}`,
          }
        }

        // Success - project created and stored
        return { success: true }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        
        // Determine error type for better user messaging
        if (errorMessage.includes('Invalid') || errorMessage.includes('token')) {
          return {
            success: false,
            error: 'Invalid Supabase Management API token',
            errorDetails: errorMessage,
          }
        }
        
        if (errorMessage.includes('Permission denied') || errorMessage.includes('403')) {
          return {
            success: false,
            error: 'Permission denied',
            errorDetails: errorMessage,
          }
        }
        
        if (errorMessage.includes('Rate limit') || errorMessage.includes('429')) {
          return {
            success: false,
            error: 'Rate limit exceeded',
            errorDetails: errorMessage,
          }
        }
        
        if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
          return {
            success: false,
            error: 'Network error',
            errorDetails: errorMessage,
          }
        }

        return {
          success: false,
          error: 'Failed to create Supabase project',
          errorDetails: errorMessage,
        }
      }

    case 'create_vercel_project':
      // TODO (T5): Implement create_vercel_project via Vercel API
      await new Promise((resolve) => setTimeout(resolve, 2000))
      return { success: true }

    case 'verify_preview': {
<<<<<<< HEAD
      // Get preview URL from context or environment
      // For now, we'll try to get it from context or construct it from project info
      // Get preview URL from step parameters or bootstrap run metadata
      const previewUrl = stepParams?.previewUrl as string | undefined

      if (!previewUrl) {
        return {
          success: false,
          error: 'Preview URL is required',
          errorDetails: 'Please provide a preview URL to verify. The preview URL should be available after the Vercel project is created.',
        }
      }

      // Normalize URL (ensure it has protocol, remove trailing slash)
      const normalizedUrl = previewUrl.trim().startsWith('http') ? previewUrl.trim() : `https://${previewUrl.trim()}`
      const versionJsonUrl = `${normalizedUrl.replace(/\/$/, '')}/version.json`

      // Poll /version.json with retries
      const maxAttempts = 30 // 30 attempts
      const pollIntervalMs = 2000 // 2 seconds between attempts
      let lastError: string | null = null
      let lastStatusCode: number | null = null

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const response = await fetch(versionJsonUrl, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
            },
            // Add timeout to prevent hanging
            signal: AbortSignal.timeout(8000), // 8 second timeout per request
          })

          if (response.ok) {
            // Verify it's valid JSON
            const data = await response.json()
            
            // Basic validation: check if it looks like a version.json payload
            if (typeof data === 'object' && data !== null) {
              // Success! Preview is live and /version.json is accessible
              return { success: true }
            } else {
              lastError = 'Invalid JSON response from /version.json'
              lastStatusCode = response.status
            }
          } else {
            lastError = `HTTP ${response.status}: ${response.statusText}`
            lastStatusCode = response.status
          }
        } catch (err) {
          if (err instanceof Error) {
            // Handle timeout or network errors
            if (err.name === 'TimeoutError' || err.name === 'AbortError' || err.message.includes('timeout')) {
              lastError = 'Request timeout'
            } else if (err.message.includes('fetch failed') || err.message.includes('ECONNREFUSED') || err.message.includes('ENOTFOUND')) {
              lastError = 'Network error: Preview not reachable'
            } else {
              lastError = `Network error: ${err.message}`
            }
          } else {
            lastError = 'Unknown error occurred'
          }
        }

        // If not the last attempt, wait before retrying
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
        }
      }

      // All attempts failed
      const errorMessage = lastStatusCode
        ? `Preview verification failed after ${maxAttempts} attempts. Last error: ${lastError} (Status: ${lastStatusCode})`
        : `Preview verification failed after ${maxAttempts} attempts. Last error: ${lastError || 'Unknown error'}`

      return {
        success: false,
        error: errorMessage,
        errorDetails: `Unable to reach ${versionJsonUrl} after ${maxAttempts} attempts (${maxAttempts * pollIntervalMs / 1000} seconds). The preview deployment may still be building, or the URL may be incorrect.`,
      }
    }

    default:
      return {
        success: false,
        error: `Unknown step: ${stepId}`,
        errorDetails: `Step ${stepId} is not recognized.`,
      }
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS
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
      runId: string
      stepId?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
      supabaseManagementApiToken?: string
      organizationId?: string
      projectName?: string
      region?: string
      previewUrl?: string
    }

    const runId = typeof body.runId === 'string' ? body.runId.trim() : undefined

    if (!runId) {
      json(res, 400, {
        success: false,
        error: 'runId is required',
      })
      return
    }

    const { supabaseUrl, supabaseKey } = parseBootstrapCredentials(body)

    if (!supabaseUrl || !supabaseKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Fetch the run
    const { data: run, error: fetchError } = await supabase
      .from('bootstrap_runs')
      .select('*')
      .eq('id', runId)
      .single()

    if (fetchError || !run) {
      json(res, 404, {
        success: false,
        error: `Bootstrap run not found: ${fetchError?.message || 'Run not found'}`,
      })
      return
    }

    // Determine which step to execute
    const stepId = (body.stepId || run.current_step) as BootstrapStepId | undefined

    if (!stepId) {
      json(res, 400, {
        success: false,
        error: 'No step to execute. Either provide stepId or ensure run has a current_step.',
      })
      return
    }

    // Find the step in history
    const stepHistory = (run.step_history || []) as any[]
    const stepRecord = stepHistory.find((s) => s.step === stepId)

    if (!stepRecord) {
      json(res, 400, {
        success: false,
        error: `Step ${stepId} not found in step history`,
      })
      return
    }

    // Only execute pending or failed steps
    if (stepRecord.status !== 'pending' && stepRecord.status !== 'failed') {
      json(res, 400, {
        success: false,
        error: `Step ${stepId} is not in a runnable state (current: ${stepRecord.status}). Only pending or failed steps can be executed.`,
      })
      return
    }

    // Mark step as running
    const runningStepHistory = updateStepRecord(stepHistory, stepId, {
      status: 'running',
      started_at: new Date().toISOString(),
    })

    const runningLogs = addLogEntry(run.logs || [], 'info', `Executing step: ${stepId}`)

    // Update run to running state
    await supabase
      .from('bootstrap_runs')
      .update({
        status: 'running',
        current_step: stepId,
        step_history: runningStepHistory,
        logs: runningLogs,
      })
      .eq('id', runId)

    // Execute the step with step-specific parameters
    const stepParams = {
      supabaseManagementApiToken: typeof body.supabaseManagementApiToken === 'string' ? body.supabaseManagementApiToken.trim() : undefined,
      organizationId: typeof body.organizationId === 'string' ? body.organizationId.trim() : undefined,
      projectName: typeof body.projectName === 'string' ? body.projectName.trim() : undefined,
      region: typeof body.region === 'string' ? body.region.trim() : undefined,
      previewUrl: typeof body.previewUrl === 'string' ? body.previewUrl.trim() : undefined,
    }
    const stepResult = await executeStep(stepId, run.project_id, runId, supabase, stepParams)

    // Update step with result
    const completedStepHistory = updateStepRecord(runningStepHistory, stepId, {
      status: stepResult.success ? 'succeeded' : 'failed',
      completed_at: new Date().toISOString(),
      error_summary: stepResult.error || null,
      error_details: stepResult.errorDetails || null,
    })

    const completedLogs = addLogEntry(
      runningLogs,
      stepResult.success ? 'info' : 'error',
      stepResult.success
        ? `Step ${stepId} completed successfully`
        : `Step ${stepId} failed: ${stepResult.error || 'Unknown error'}`
    )

    // Determine next step and overall status
    const nextStep = getNextStep(completedStepHistory)
    const allCompleted = allStepsCompleted(completedStepHistory)

    const finalStatus = allCompleted ? 'succeeded' : stepResult.success ? 'running' : 'failed'
    const finalCurrentStep = allCompleted ? null : nextStep

    // Update run with final state
    const { data: updatedRun, error: updateError } = await supabase
      .from('bootstrap_runs')
      .update({
        status: finalStatus,
        current_step: finalCurrentStep,
        step_history: completedStepHistory,
        logs: completedLogs,
        completed_at: allCompleted ? new Date().toISOString() : null,
      })
      .eq('id', runId)
      .select()
      .single()

    if (updateError) {
      json(res, 500, {
        success: false,
        error: `Failed to update bootstrap run: ${updateError.message}`,
      })
      return
    }

    // Log audit event for step completion
    const { logAuditEvent } = await import('./_shared.js')
    await logAuditEvent(
      supabase,
      run.project_id,
      'bootstrap_step',
      stepResult.success ? 'succeeded' : 'failed',
      stepResult.success
        ? `Bootstrap step ${stepId} completed successfully`
        : `Bootstrap step ${stepId} failed: ${stepResult.error || 'Unknown error'}`,
      {
        run_id: runId,
        step_id: stepId,
        error: stepResult.error || null,
        error_details: stepResult.errorDetails || null,
      }
    )

    // Log audit event if bootstrap run completed
    if (allCompleted) {
      await logAuditEvent(
        supabase,
        run.project_id,
        'bootstrap_complete',
        'succeeded',
        `Bootstrap run completed successfully for project: ${run.project_id}`,
        { run_id: runId }
      )
    }

    json(res, 200, {
      success: true,
      run: updatedRun,
      stepResult: {
        stepId,
        success: stepResult.success,
        error: stepResult.error || null,
        errorDetails: stepResult.errorDetails || null,
      },
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
