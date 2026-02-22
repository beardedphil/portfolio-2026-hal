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
  supabase: ReturnType<typeof createClient>,
  context?: {
    supabaseManagementToken?: string
    supabaseOrganizationId?: string
    supabaseProjectName?: string
    supabaseRegion?: string
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

    case 'verify_preview':
      // TODO (T6): Implement verify_preview by polling /version.json
      await new Promise((resolve) => setTimeout(resolve, 1500))
      return { success: true }

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
      supabaseManagementToken?: string
      supabaseOrganizationId?: string
      supabaseProjectName?: string
      supabaseRegion?: string
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

    // Execute the step with context
    const stepContext = {
      supabaseManagementToken: typeof body.supabaseManagementToken === 'string' ? body.supabaseManagementToken.trim() : undefined,
      supabaseOrganizationId: typeof body.supabaseOrganizationId === 'string' ? body.supabaseOrganizationId.trim() : undefined,
      supabaseProjectName: typeof body.supabaseProjectName === 'string' ? body.supabaseProjectName.trim() : undefined,
      supabaseRegion: typeof body.supabaseRegion === 'string' ? body.supabaseRegion.trim() : undefined,
    }
    const stepResult = await executeStep(stepId, run.project_id, runId, supabase, stepContext)

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
