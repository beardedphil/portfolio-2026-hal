/**
 * Supabase Management API client for creating and managing Supabase projects.
 * 
 * Documentation: https://supabase.com/docs/reference/api/create-a-project
 */

export interface SupabaseProject {
  id: string
  organization_id: string
  name: string
  region: string
  created_at: string
  database?: {
    host: string
    version: string
  }
  kps_enabled?: boolean
}

export interface CreateProjectRequest {
  name: string
  organization_id: string
  region?: string
  plan?: 'free' | 'pro'
  kps_enabled?: boolean
}

export interface CreateProjectResponse {
  id: string
  organization_id: string
  name: string
  region: string
  created_at: string
  database?: {
    host: string
    version: string
  }
  kps_enabled?: boolean
}

export interface ProjectApiKeys {
  anon_key: string
  service_role_key: string
}

/**
 * Fetches data from the Supabase Management API.
 */
async function supabaseManagementFetch<T>(
  accessToken: string,
  url: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let errorMessage = `Supabase Management API failed (${res.status})`
    
    // Try to parse error message from response
    try {
      const errorJson = JSON.parse(text)
      if (errorJson.message) {
        errorMessage = errorJson.message
      } else if (errorJson.error) {
        errorMessage = typeof errorJson.error === 'string' ? errorJson.error : errorJson.error.message || errorMessage
      }
    } catch {
      // If parsing fails, use first 300 chars of text
      if (text) {
        errorMessage = `${errorMessage}: ${text.slice(0, 300)}`
      }
    }

    // Handle specific error cases
    if (res.status === 401) {
      throw new Error('Invalid Supabase Management API token. Please check your access token.')
    }
    if (res.status === 403) {
      throw new Error('Permission denied. The access token does not have permission to create projects.')
    }
    if (res.status === 429) {
      throw new Error('Rate limit exceeded. Please wait a few minutes and try again.')
    }
    if (res.status >= 500) {
      throw new Error(`Supabase Management API server error: ${errorMessage}`)
    }

    throw new Error(errorMessage)
  }

  return (await res.json()) as T
}

/**
 * Creates a new Supabase project via the Management API.
 * 
 * @param accessToken - Supabase Management API access token (Personal Access Token or OAuth token)
 * @param request - Project creation request
 * @returns Created project details
 */
export async function createSupabaseProject(
  accessToken: string,
  request: CreateProjectRequest
): Promise<CreateProjectResponse> {
  return supabaseManagementFetch<CreateProjectResponse>(
    accessToken,
    'https://api.supabase.com/v1/projects',
    {
      method: 'POST',
      body: JSON.stringify(request),
    }
  )
}

/**
 * Gets project API keys (anon key and service role key).
 * 
 * @param accessToken - Supabase Management API access token
 * @param projectRef - Project reference ID
 * @returns Project API keys
 */
export async function getProjectApiKeys(
  accessToken: string,
  projectRef: string
): Promise<ProjectApiKeys> {
  return supabaseManagementFetch<ProjectApiKeys>(
    accessToken,
    `https://api.supabase.com/v1/projects/${projectRef}/api-keys`
  )
}

/**
 * Gets project details by reference ID.
 * 
 * @param accessToken - Supabase Management API access token
 * @param projectRef - Project reference ID
 * @returns Project details
 */
export async function getProject(
  accessToken: string,
  projectRef: string
): Promise<SupabaseProject> {
  return supabaseManagementFetch<SupabaseProject>(
    accessToken,
    `https://api.supabase.com/v1/projects/${projectRef}`
  )
}
