import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { readJsonBody, json, parseBootstrapCredentials, BOOTSTRAP_STEPS, getOrCreateStepRecord } from './_shared.js'

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
      projectId: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : undefined

    if (!projectId) {
      json(res, 400, {
        success: false,
        error: 'projectId is required',
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

    // Check for existing active run
    const { data: existingRuns, error: existingError } = await supabase
      .from('bootstrap_runs')
      .select('id, status, current_step')
      .eq('project_id', projectId)
      .in('status', ['pending', 'running'])
      .order('created_at', { ascending: false })
      .limit(1)

    if (existingError) {
      json(res, 500, {
        success: false,
        error: `Failed to check for existing runs: ${existingError.message}`,
      })
      return
    }

    // If there's an active run, return it
    if (existingRuns && existingRuns.length > 0) {
      const existingRun = existingRuns[0]
      const { data: fullRun, error: fetchError } = await supabase
        .from('bootstrap_runs')
        .select('*')
        .eq('id', existingRun.id)
        .single()

      if (fetchError) {
        json(res, 500, {
          success: false,
          error: `Failed to fetch existing run: ${fetchError.message}`,
        })
        return
      }

      json(res, 200, {
        success: true,
        run: fullRun,
        message: 'Using existing active bootstrap run',
      })
      return
    }

    // Create new bootstrap run with all steps initialized as pending
    const initialStepHistory = BOOTSTRAP_STEPS.map((stepId) =>
      getOrCreateStepRecord([], stepId)
    )

    const { data: newRun, error: insertError } = await supabase
      .from('bootstrap_runs')
      .insert({
        project_id: projectId,
        status: 'pending',
        current_step: BOOTSTRAP_STEPS[0] || null,
        step_history: initialStepHistory,
        logs: [
          {
            timestamp: new Date().toISOString(),
            level: 'info',
            message: `Bootstrap run started for project: ${projectId}`,
          },
        ],
      })
      .select()
      .single()

    if (insertError) {
      json(res, 500, {
        success: false,
        error: `Failed to create bootstrap run: ${insertError.message}`,
      })
      return
    }

    // Create audit log entry for bootstrap start
    await supabase.from('project_audit_log').insert({
      project_id: projectId,
      action_type: 'bootstrap_start',
      action_status: 'succeeded',
      summary: `Bootstrap workflow started for project: ${projectId}`,
      related_entity_id: newRun.id,
    })

    json(res, 200, {
      success: true,
      run: newRun,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
