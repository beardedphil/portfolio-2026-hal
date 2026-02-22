/**
 * Supabase Management API helper functions
 * Used for creating and managing Supabase projects via the Management API
 */

export interface SupabaseProjectCreateRequest {
  name: string
  organization_id: string
  region?: string
  plan?: 'free' | 'pro'
  kps_enabled?: boolean
}

export interface SupabaseProjectResponse {
  id: string
  ref: string
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
}

/**
 * Creates a Supabase project via the Management API
 *
 * @param managementToken - Supabase Management API token (Personal Access Token)
 * @param projectName - Name for the new project
 * @param organizationId - Organization ID where the project will be created
 * @param region - AWS region (default: 'us-east-1')
 * @returns Project details including ref and URL
 * @throws Error if API call fails
 */
export async function createSupabaseProject(
  managementToken: string,
  projectName: string,
  organizationId: string,
  region: string = 'us-east-1'
): Promise<{ project: SupabaseProjectResponse; apiKeys: SupabaseProjectApiKeys }> {
  if (!managementToken || !managementToken.trim()) {
    throw new Error('Supabase Management API token is required')
  }

  if (!projectName || !projectName.trim()) {
    throw new Error('Project name is required')
  }

  if (!organizationId || !organizationId.trim()) {
    throw new Error('Organization ID is required')
  }

  // Create project
  const createResponse = await fetch('https://api.supabase.com/v1/projects', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${managementToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: projectName.trim(),
      organization_id: organizationId.trim(),
      region: region.trim(),
      plan: 'free',
    }),
  })

  if (!createResponse.ok) {
    const errorText = await createResponse.text()
    let errorMessage = `Failed to create Supabase project: ${createResponse.status} ${createResponse.statusText}`

    if (createResponse.status === 401) {
      errorMessage = 'Invalid Supabase Management API token. Please check your token and try again.'
    } else if (createResponse.status === 403) {
      errorMessage = 'Permission denied. The token does not have permission to create projects in this organization.'
    } else if (createResponse.status === 429) {
      errorMessage = 'Rate limit exceeded. Please wait a few minutes and try again.'
    } else if (createResponse.status === 400) {
      try {
        const errorJson = JSON.parse(errorText)
        errorMessage = errorJson.message || errorJson.error || errorMessage
      } catch {
        // Use default error message
      }
    }

    throw new Error(errorMessage)
  }

  const project: SupabaseProjectResponse = await createResponse.json()

  // Wait a moment for project to be ready, then fetch API keys
  // Note: Project creation is async, so we may need to poll for readiness
  await new Promise((resolve) => setTimeout(resolve, 2000))

  // Try to fetch API keys from the project's API keys endpoint
  let anonKey = ''
  let serviceRoleKey = ''

  try {
    const keysResponse = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/api-keys`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${managementToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (keysResponse.ok) {
      const keysData = await keysResponse.json()
      
      // Find anon and service_role keys from the response
      // The API returns an array of keys with different types/names
      if (Array.isArray(keysData)) {
        for (const key of keysData) {
          const keyName = (key.name || '').toLowerCase()
          const keyType = (key.type || '').toLowerCase()
          const apiKey = key.api_key || key.key || ''
          
          if (keyName === 'anon' || keyType === 'anon' || keyName.includes('anon')) {
            anonKey = apiKey
          } else if (keyName === 'service_role' || keyType === 'service_role' || keyName.includes('service')) {
            serviceRoleKey = apiKey
          }
        }
      } else if (keysData && typeof keysData === 'object') {
        // Handle object response format
        anonKey = keysData.anon_key || keysData.anon || keysData.public || ''
        serviceRoleKey = keysData.service_role_key || keysData.service_role || keysData.secret || ''
      }
    } else {
      // If keys endpoint fails, log a warning but continue
      // Keys can be retrieved later from the Supabase dashboard
      console.warn(`Failed to fetch API keys for project ${project.ref}: ${keysResponse.status}`)
    }
  } catch (keysError) {
    // If fetching keys fails, log but continue - project is created
    console.warn(`Error fetching API keys for project ${project.ref}:`, keysError)
  }

  return {
    project,
    apiKeys: {
      anon_key: anonKey,
      service_role_key: serviceRoleKey,
    },
  }
}
