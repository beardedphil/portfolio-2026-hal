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
import { createSupabaseProject } from '../_lib/supabase-management.js'
import { encryptSecret } from '../_lib/encryption.js'

/**
 * Executes a bootstrap step.
 */
async function executeStep(
  stepId: BootstrapStepId,
  projectId: string,
  runId: string,
  supabase: ReturnType<typeof createClient>,
  options: {
    supabaseManagementToken?: string
    [key: string]: unknown
  } = {}
): Promise<{ success: boolean; error?: string; errorDetails?: string }> {
  switch (stepId) {
    case 'ensure_repo_initialized':
      // TODO (T2): Implement ensure_repo_initialized using GitHub Git Database API
      // For now, simulate success after a delay
      await new Promise((resolve) => setTimeout(resolve, 1000))
      return { success: true }

    case 'create_supabase_project': {
      // Validate that we have a Supabase Management API token
      const managementToken = options.supabaseManagementToken
      if (!managementToken || typeof managementToken !== 'string' || managementToken.trim().length === 0) {
        return {
          success: false,
          error: 'Supabase Management API token is required',
          errorDetails: 'Please provide a valid Supabase Management API token (Personal Access Token) to create a project.',
        }
      }

      try {
        // Generate a project name from the projectId
        // Use projectId as the base name, sanitizing it for Supabase requirements
        const projectName = projectId
          .replace(/[^a-zA-Z0-9-_]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
          .substring(0, 50) || `hal-project-${Date.now()}`

        // Create the Supabase project via Management API
        const projectInfo = await createSupabaseProject(managementToken, projectName)

        // Encrypt the credentials before storing
        const encryptedAnonKey = encryptSecret(projectInfo.anon_key)
        const encryptedServiceRoleKey = encryptSecret(projectInfo.service_role_key)
        const encryptedDatabasePassword = projectInfo.database_password
          ? encryptSecret(projectInfo.database_password)
          : null

        // Check if a project already exists for this project_id
        const { data: existingProject } = await supabase
          .from('supabase_projects')
          .select('id')
          .eq('project_id', projectId)
          .single()

        if (existingProject) {
          // Update existing project
          const { error: updateError } = await supabase
            .from('supabase_projects')
            .update({
              supabase_project_ref: projectInfo.project_ref,
              supabase_project_name: projectInfo.project_name,
              supabase_api_url: projectInfo.api_url,
              encrypted_anon_key: encryptedAnonKey,
              encrypted_service_role_key: encryptedServiceRoleKey,
              encrypted_database_password: encryptedDatabasePassword,
              status: 'created',
              updated_at: new Date().toISOString(),
            })
            .eq('project_id', projectId)

          if (updateError) {
            throw new Error(`Failed to update Supabase project record: ${updateError.message}`)
          }
        } else {
          // Insert new project
          const { error: insertError } = await supabase.from('supabase_projects').insert({
            project_id: projectId,
            supabase_project_ref: projectInfo.project_ref,
            supabase_project_name: projectInfo.project_name,
            supabase_api_url: projectInfo.api_url,
            encrypted_anon_key: encryptedAnonKey,
            encrypted_service_role_key: encryptedServiceRoleKey,
            encrypted_database_password: encryptedDatabasePassword,
            status: 'created',
          })

          if (insertError) {
            throw new Error(`Failed to store Supabase project record: ${insertError.message}`)
          }
        }

        return { success: true }
      } catch (err) {
        // Handle specific error types
        if (err instanceof Error) {
          // Check if it's a rate limit error
          if (err.message.includes('rate limit')) {
            return {
              success: false,
              error: 'Supabase API rate limit exceeded',
              errorDetails: err.message,
            }
          }
          // Check if it's an authentication error
          if (err.message.includes('Invalid') && err.message.includes('token')) {
            return {
              success: false,
              error: 'Invalid Supabase Management API token',
              errorDetails: err.message,
            }
          }
          // Check if it's a permission error
          if (err.message.includes('Permission denied') || err.message.includes('permission')) {
            return {
              success: false,
              error: 'Permission denied',
              errorDetails: err.message,
            }
          }
          // Network or other errors
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

    // Execute the step
    const stepResult = await executeStep(stepId, run.project_id, runId, supabase, {
      supabaseManagementToken: body.supabaseManagementToken,
    })

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
