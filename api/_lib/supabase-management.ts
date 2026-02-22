/**
 * Supabase Management API client
 * 
 * Handles interactions with the Supabase Management API for creating and managing projects.
 * Documentation: https://supabase.com/docs/reference/api/create-a-project
 */

export interface SupabaseProjectCreateRequest {
  name: string
  organization_id?: string
  region?: string
  plan?: 'free' | 'pro'
  kps_enabled?: boolean
}

export interface SupabaseProjectResponse {
  id: string
  name: string
  organization_id: string
  region: string
  created_at: string
  database?: {
    host: string
    version: string
  }
  status?: string
}

export interface SupabaseProjectApiKeys {
  anon_key: string
  service_role_key: string
  database_password?: string
}

export interface SupabaseProjectInfo {
  project_ref: string
  project_name: string
  api_url: string
  anon_key: string
  service_role_key: string
  database_password?: string
}

/**
 * Creates a new Supabase project via the Management API
 * 
 * @param accessToken - Supabase Management API access token (Personal Access Token)
 * @param projectName - Name for the new project
 * @param options - Optional configuration (region, plan, etc.)
 * @returns Project information including API keys
 * @throws Error if creation fails (invalid token, rate limit, network error, etc.)
 */
export async function createSupabaseProject(
  accessToken: string,
  projectName: string,
  options: {
    organization_id?: string
    region?: string
    plan?: 'free' | 'pro'
  } = {}
): Promise<SupabaseProjectInfo> {
  if (!accessToken || typeof accessToken !== 'string' || accessToken.trim().length === 0) {
    throw new Error('Invalid Supabase Management API token: token is required and must be non-empty')
  }

  if (!projectName || typeof projectName !== 'string' || projectName.trim().length === 0) {
    throw new Error('Project name is required and must be non-empty')
  }

  const requestBody: SupabaseProjectCreateRequest = {
    name: projectName.trim(),
    ...options,
  }

  try {
    const response = await fetch('https://api.supabase.com/v1/projects', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || '60'
      throw new Error(
        `Supabase API rate limit exceeded. Please wait ${retryAfter} seconds and try again. ` +
        `Rate limit: 120 requests per minute per user.`
      )
    }

    // Handle authentication errors
    if (response.status === 401) {
      throw new Error('Invalid Supabase Management API token. Please check your token and try again.')
    }

    // Handle permission errors
    if (response.status === 403) {
      throw new Error(
        'Permission denied. Your Supabase Management API token does not have permission to create projects. ' +
        'Please check your token permissions and try again.'
      )
    }

    // Handle other errors
    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = `Failed to create Supabase project: ${response.status} ${response.statusText}`
      
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.message) {
          errorMessage = `Failed to create Supabase project: ${errorJson.message}`
        } else if (errorJson.error) {
          errorMessage = `Failed to create Supabase project: ${errorJson.error}`
        }
      } catch {
        // If parsing fails, use the raw error text if available
        if (errorText) {
          errorMessage = `Failed to create Supabase project: ${errorText}`
        }
      }

      throw new Error(errorMessage)
    }

    const projectData = (await response.json()) as SupabaseProjectResponse & {
      // The API response may include additional fields
      ref?: string
      api_keys?: Array<{ name: string; api_key: string }>
      [key: string]: unknown
    }

    // Extract project reference - it might be in 'ref' field or derived from ID
    // The project ref is a short identifier used in URLs (e.g., "abcdefghijklmnop")
    const projectRef = projectData.ref || projectData.id.split('-').pop() || projectData.id.substring(0, 20)
    
    // Construct API URL
    const apiUrl = `https://${projectRef}.supabase.co`

    // Try to get API keys from the response first
    let anonKey = ''
    let serviceRoleKey = ''
    let databasePassword: string | undefined

    // Check if keys are in the response
    if (projectData.api_keys && Array.isArray(projectData.api_keys)) {
      const anonKeyEntry = projectData.api_keys.find((k) => k.name === 'anon' || k.name === 'anon_key' || k.name === 'public')
      const serviceRoleKeyEntry = projectData.api_keys.find((k) => k.name === 'service_role' || k.name === 'service_role_key')

      if (anonKeyEntry) {
        anonKey = anonKeyEntry.api_key
      }
      if (serviceRoleKeyEntry) {
        serviceRoleKey = serviceRoleKeyEntry.api_key
      }
    }

    // If keys weren't in the response, try fetching them via the API keys endpoint
    if (!anonKey || !serviceRoleKey) {
      try {
        // Wait a moment for project to be fully provisioned
        await new Promise((resolve) => setTimeout(resolve, 2000))

        const keysResponse = await fetch(`https://api.supabase.com/v1/projects/${projectData.id}/api-keys`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken.trim()}`,
            'Content-Type': 'application/json',
          },
        })

        if (keysResponse.ok) {
          const keysData = (await keysResponse.json()) as { api_keys?: Array<{ name: string; api_key: string }> }
          
          if (keysData.api_keys && Array.isArray(keysData.api_keys)) {
            const anonKeyEntry = keysData.api_keys.find((k) => k.name === 'anon' || k.name === 'anon_key' || k.name === 'public')
            const serviceRoleKeyEntry = keysData.api_keys.find((k) => k.name === 'service_role' || k.name === 'service_role_key')

            if (anonKeyEntry && !anonKey) {
              anonKey = anonKeyEntry.api_key
            }
            if (serviceRoleKeyEntry && !serviceRoleKey) {
              serviceRoleKey = serviceRoleKeyEntry.api_key
            }
          }
        }
      } catch (keysError) {
        // If fetching keys fails, we'll still try to return project info
        // The keys might need to be retrieved manually from the dashboard
        console.warn(`Error fetching API keys: ${keysError instanceof Error ? keysError.message : String(keysError)}`)
      }
    }

    // If keys still aren't available, throw an error
    // This ensures we don't store incomplete project information
    if (!anonKey || !serviceRoleKey) {
      throw new Error(
        'Project created successfully, but API keys could not be retrieved automatically. ' +
        'The project may still be provisioning. Please wait a moment and retrieve your API keys ' +
        'from the Supabase dashboard (Settings > API) and configure them manually, or try again in a few moments.'
      )
    }

    return {
      project_ref: projectRef,
      project_name: projectData.name,
      api_url: apiUrl,
      anon_key: anonKey,
      service_role_key: serviceRoleKey,
      database_password: databasePassword,
    }
  } catch (err) {
    // Re-throw our custom errors
    if (err instanceof Error) {
      throw err
    }
    // Handle network errors and other unexpected errors
    throw new Error(
      `Network error while creating Supabase project: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}
