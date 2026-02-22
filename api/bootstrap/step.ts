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
import { createSupabaseProject, getProjectApiKeys } from '../_lib/supabase/managementApi.js'
import { encryptSecret } from '../_lib/encryption.js'

/**
 * Executes a bootstrap step.
 */
async function executeStep(
  stepId: BootstrapStepId,
  projectId: string,
  runId: string,
  context?: {
    supabaseManagementToken?: string
    organizationId?: string
    projectName?: string
    region?: string
    supabase?: ReturnType<typeof createClient>
  }
): Promise<{ success: boolean; error?: string; errorDetails?: string }> {
  switch (stepId) {
    case 'ensure_repo_initialized':
      // TODO (T2): Implement ensure_repo_initialized using GitHub Git Database API
      // For now, simulate success after a delay
      await new Promise((resolve) => setTimeout(resolve, 1000))
      return { success: true }

    case 'create_supabase_project': {
      // Validate required context
      if (!context?.supabaseManagementToken) {
        return {
          success: false,
          error: 'Supabase Management API token is required',
          errorDetails: 'Provide supabaseManagementToken in the request body to create a Supabase project.',
        }
      }

      if (!context.supabase) {
        return {
          success: false,
          error: 'Supabase client is required',
          errorDetails: 'Internal error: Supabase client not available.',
        }
      }

      try {
        // Check if project already exists
        const { data: existingProject } = await context.supabase
          .from('supabase_projects')
          .select('project_ref, api_url, status')
          .eq('status', 'created')
          .maybeSingle()

        if (existingProject) {
          // Project already exists, skip creation
          return {
            success: true,
          }
        }

        // Prepare project creation request
        const projectName = context.projectName || `hal-${projectId.slice(0, 8)}`
        const createRequest: any = {
          name: projectName,
          region: context.region || 'us-east-1',
          plan: 'free' as const,
        }

        // Only include organization_id if provided (some accounts may not require it)
        if (context.organizationId) {
          createRequest.organization_id = context.organizationId
        }

        // Create project via Supabase Management API
        const createdProject = await createSupabaseProject(
          context.supabaseManagementToken,
          createRequest
        )

        // Extract project ref from API URL (format: https://PROJECT_REF.supabase.co)
        const apiUrl = `https://${createdProject.id}.supabase.co`
        const projectRef = createdProject.id

        // Get API keys
        let anonKey: string
        let serviceRoleKey: string

        try {
          // Wait a moment for project to be fully provisioned
          await new Promise((resolve) => setTimeout(resolve, 2000))

          const apiKeys = await getProjectApiKeys(context.supabaseManagementToken, projectRef)
          anonKey = apiKeys.anon_key
          serviceRoleKey = apiKeys.service_role_key
        } catch (keyError) {
          // If getting keys fails, still store the project but mark keys as missing
          console.error('[bootstrap/step] Failed to get API keys:', keyError)
          return {
            success: false,
            error: 'Failed to retrieve project API keys',
            errorDetails: `Project was created but API keys could not be retrieved: ${keyError instanceof Error ? keyError.message : String(keyError)}. You may need to retrieve keys manually from the Supabase dashboard.`,
          }
        }

        // Encrypt the keys
        const anonKeyEncrypted = encryptSecret(anonKey)
        const serviceRoleKeyEncrypted = encryptSecret(serviceRoleKey)

        // Store project metadata and encrypted keys
        const { error: storeError } = await context.supabase
          .from('supabase_projects')
          .upsert(
            {
              project_ref: projectRef,
              project_name: createdProject.name,
              api_url: apiUrl,
              organization_id: createdProject.organization_id,
              region: createdProject.region,
              anon_key_encrypted: anonKeyEncrypted,
              service_role_key_encrypted: serviceRoleKeyEncrypted,
              status: 'created',
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'project_ref' }
          )

        if (storeError) {
          return {
            success: false,
            error: 'Failed to store project metadata',
            errorDetails: `Project was created but metadata storage failed: ${storeError.message}. Project ref: ${projectRef}`,
          }
        }

        return { success: true }
      } catch (err) {
        // Handle specific error types
        if (err instanceof Error) {
          // Check for common error patterns
          if (err.message.includes('Invalid') && err.message.includes('token')) {
            return {
              success: false,
              error: 'Invalid Supabase Management API token',
              errorDetails: 'The provided access token is invalid or expired. Please check your Supabase Management API token.',
            }
          }
          if (err.message.includes('Permission denied') || err.message.includes('403')) {
            return {
              success: false,
              error: 'Permission denied',
              errorDetails: 'The access token does not have permission to create projects. Please check your token permissions.',
            }
          }
          if (err.message.includes('Rate limit') || err.message.includes('429')) {
            return {
              success: false,
              error: 'Rate limit exceeded',
              errorDetails: 'Supabase Management API rate limit exceeded. Please wait a few minutes and try again.',
            }
          }
          if (err.message.includes('network') || err.message.includes('fetch')) {
            return {
              success: false,
              error: 'Network error',
              errorDetails: `Failed to connect to Supabase Management API: ${err.message}. Please check your network connection and try again.`,
            }
          }

          return {
            success: false,
            error: 'Failed to create Supabase project',
            errorDetails: err.message,
          }
        }

        return {
          success: false,
          error: 'Failed to create Supabase project',
          errorDetails: String(err),
        }
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
      organizationId?: string
      projectName?: string
      region?: string
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
      supabaseManagementToken:
        typeof body.supabaseManagementToken === 'string' ? body.supabaseManagementToken.trim() : undefined,
      organizationId: typeof body.organizationId === 'string' ? body.organizationId.trim() : undefined,
      projectName: typeof body.projectName === 'string' ? body.projectName.trim() : undefined,
      region: typeof body.region === 'string' ? body.region.trim() : undefined,
      supabase,
    }
    const stepResult = await executeStep(stepId, run.project_id, runId, stepContext)

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
