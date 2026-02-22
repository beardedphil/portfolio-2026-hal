import type { IncomingMessage, ServerResponse } from 'http'
import { getSession, type Session } from '../_lib/github/session.js'
import {
  ensureInitialCommit,
  getDefaultBranch,
  getBranchSha,
  listBranches,
} from '../_lib/github/repos.js'
import { createClient } from '@supabase/supabase-js'

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as unknown
}

function json(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS: Allow cross-origin requests
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
      repoFullName?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() : undefined

    if (!repoFullName) {
      json(res, 400, {
        success: false,
        error: 'repoFullName is required.',
      })
      return
    }

    const session: Session = await getSession(req, res)
    const token = session.github?.accessToken
    if (!token) {
      json(res, 401, {
        success: false,
        error: 'Not authenticated with GitHub.',
      })
      return
    }

    // Use credentials from request body if provided, otherwise fall back to server environment variables
    const supabaseUrl =
      (typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() : undefined) ||
      process.env.SUPABASE_URL?.trim() ||
      process.env.VITE_SUPABASE_URL?.trim() ||
      undefined
    const supabaseAnonKey =
      (typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey.trim() : undefined) ||
      process.env.SUPABASE_ANON_KEY?.trim() ||
      process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
      undefined

    if (!supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Check if repo is already initialized (has branches)
    const branchesResult = await listBranches(token, repoFullName)
    if ('error' in branchesResult) {
      json(res, 500, {
        success: false,
        error: `Failed to check repo status: ${branchesResult.error}`,
      })
      return
    }

    // Check if we already have metadata stored
    const { data: existingProject } = await supabase
      .from('projects')
      .select('default_branch, initial_commit_sha')
      .eq('repo_full_name', repoFullName)
      .maybeSingle()

    // If repo has branches and we have metadata, it's already initialized
    if (branchesResult.branches.length > 0 && existingProject?.initial_commit_sha) {
      // Verify the branch still exists and get current default branch
      const defaultBranchResult = await getDefaultBranch(token, repoFullName)
      if ('error' in defaultBranchResult) {
        json(res, 500, {
          success: false,
          error: `Failed to get default branch: ${defaultBranchResult.error}`,
        })
        return
      }

      json(res, 200, {
        success: true,
        alreadyInitialized: true,
        default_branch: defaultBranchResult.branch,
        initial_commit_sha: existingProject.initial_commit_sha,
      })
      return
    }

    // Get or determine default branch (usually 'main')
    let defaultBranch = 'main'
    const defaultBranchResult = await getDefaultBranch(token, repoFullName)
    if ('error' in defaultBranchResult) {
      // If repo is empty, defaultBranch might not exist yet, use 'main'
      if (branchesResult.branches.length === 0) {
        defaultBranch = 'main'
      } else {
        json(res, 500, {
          success: false,
          error: `Failed to get default branch: ${defaultBranchResult.error}`,
        })
        return
      }
    } else {
      defaultBranch = defaultBranchResult.branch
    }

    // If repo is empty, create initial commit
    let initialCommitSha: string
    if (branchesResult.branches.length === 0) {
      const initResult = await ensureInitialCommit(token, repoFullName, defaultBranch)
      if ('error' in initResult) {
        json(res, 500, {
          success: false,
          error: `Failed to create initial commit: ${initResult.error}`,
        })
        return
      }
      initialCommitSha = initResult.commitSha
    } else {
      // Get the commit SHA from the default branch (repo already has commits)
      const shaResult = await getBranchSha(token, repoFullName, defaultBranch)
      if ('error' in shaResult) {
        json(res, 500, {
          success: false,
          error: `Failed to get commit SHA: ${shaResult.error}`,
        })
        return
      }
      initialCommitSha = shaResult.sha
    }

    // Store or update project metadata
    const { error: upsertError } = await supabase
      .from('projects')
      .upsert(
        {
          repo_full_name: repoFullName,
          default_branch: defaultBranch,
          initial_commit_sha: initialCommitSha,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'repo_full_name' }
      )

    if (upsertError) {
      json(res, 500, {
        success: false,
        error: `Failed to store project metadata: ${upsertError.message}`,
      })
      return
    }

    json(res, 200, {
      success: true,
      alreadyInitialized: false,
      default_branch: defaultBranch,
      initial_commit_sha: initialCommitSha,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
