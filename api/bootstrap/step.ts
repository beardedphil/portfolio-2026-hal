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
import { encryptSecret, decryptSecret } from '../_lib/encryption.js'
import {
  createVercelProject,
  createVercelEnvironmentVariables,
  triggerVercelDeployment,
} from './_vercel-management.js'

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
    vercelAccessToken?: string
    vercelTeamId?: string
  }
): Promise<{ success: boolean; error?: string; errorDetails?: string; metadata?: Record<string, unknown> }> {
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
      try {
        // Validate required context
        if (!context?.vercelAccessToken) {
          return {
            success: false,
            error: 'Vercel access token is required',
            errorDetails: 'Please provide a valid Vercel access token to create a project.',
          }
        }

        // Validate projectId is a valid GitHub repo format (owner/repo)
        if (!projectId || !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(projectId.trim())) {
          return {
            success: false,
            error: 'Invalid GitHub repository format',
            errorDetails: `Project ID must be in format 'owner/repo'. Got: ${projectId}`,
          }
        }

        // Get Supabase project info to set environment variables
        const { data: supabaseProject, error: supabaseProjectError } = await supabase
          .from('supabase_projects')
          .select('project_url, encrypted_anon_key, encrypted_service_role_key')
          .eq('repo_full_name', projectId)
          .single()

        if (supabaseProjectError || !supabaseProject) {
          return {
            success: false,
            error: 'Supabase project not found',
            errorDetails: 'Please create a Supabase project first before creating a Vercel project.',
          }
        }

        // Decrypt Supabase keys for environment variables
        let supabaseAnonKey = ''
        let supabaseServiceRoleKey = ''
        try {
          supabaseAnonKey = decryptSecret(supabaseProject.encrypted_anon_key)
          supabaseServiceRoleKey = decryptSecret(supabaseProject.encrypted_service_role_key)
        } catch (decryptError) {
          return {
            success: false,
            error: 'Failed to decrypt Supabase credentials',
            errorDetails: `Encryption error: ${decryptError instanceof Error ? decryptError.message : String(decryptError)}`,
          }
        }

        // Generate project name from repo name (sanitize for Vercel)
        const repoName = projectId.split('/')[1] || projectId
        const projectName = repoName.toLowerCase().replace(/[^a-z0-9-]/g, '-')

        // Create Vercel project
        const vercelProject = await createVercelProject(
          context.vercelAccessToken,
          projectName,
          projectId, // GitHub repo in 'owner/repo' format
          context.vercelTeamId
        )

        // Set required environment variables
        const envVars = [
          {
            key: 'VITE_SUPABASE_URL',
            value: supabaseProject.project_url,
            type: 'plain' as const,
            target: ['production', 'preview', 'development'] as const,
          },
          {
            key: 'VITE_SUPABASE_ANON_KEY',
            value: supabaseAnonKey,
            type: 'encrypted' as const,
            target: ['production', 'preview', 'development'] as const,
          },
          {
            key: 'SUPABASE_URL',
            value: supabaseProject.project_url,
            type: 'plain' as const,
            target: ['production', 'preview', 'development'] as const,
          },
          {
            key: 'SUPABASE_ANON_KEY',
            value: supabaseAnonKey,
            type: 'encrypted' as const,
            target: ['production', 'preview', 'development'] as const,
          },
          {
            key: 'SUPABASE_SERVICE_ROLE_KEY',
            value: supabaseServiceRoleKey,
            type: 'encrypted' as const,
            target: ['production', 'preview', 'development'] as const,
          },
        ]

        await createVercelEnvironmentVariables(
          context.vercelAccessToken,
          vercelProject.id,
          envVars,
          context.vercelTeamId
        )

        // Trigger deployment (or get preview URL)
        const deployment = await triggerVercelDeployment(
          context.vercelAccessToken,
          vercelProject.id,
          context.vercelTeamId
        )

        // Store Vercel project metadata in database
        const { error: storeError } = await supabase
          .from('vercel_projects')
          .upsert(
            {
              repo_full_name: projectId,
              project_id: vercelProject.id,
              project_name: vercelProject.name,
              preview_url: deployment.url,
              status: 'created',
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'repo_full_name' }
          )

        if (storeError) {
          return {
            success: false,
            error: 'Failed to store Vercel project metadata',
            errorDetails: `Database error: ${storeError.message}`,
          }
        }

        // Success - return metadata with preview URL
        return {
          success: true,
          metadata: {
            projectId: vercelProject.id,
            projectName: vercelProject.name,
            previewUrl: deployment.url,
            deploymentState: deployment.state,
          },
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)

        // Determine error type for better user messaging
        if (errorMessage.includes('Invalid') || errorMessage.includes('token')) {
          return {
            success: false,
            error: 'Invalid Vercel access token',
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
          error: 'Failed to create Vercel project',
          errorDetails: errorMessage,
        }
      }

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
      vercelAccessToken?: string
      vercelTeamId?: string
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
      vercelAccessToken: typeof body.vercelAccessToken === 'string' ? body.vercelAccessToken.trim() : process.env.VERCEL_ACCESS_TOKEN?.trim(),
      vercelTeamId: typeof body.vercelTeamId === 'string' ? body.vercelTeamId.trim() : process.env.VERCEL_TEAM_ID?.trim(),
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
        metadata: stepResult.metadata || null,
      },
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
