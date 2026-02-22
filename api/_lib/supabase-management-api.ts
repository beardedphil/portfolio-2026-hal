/**
 * Helper functions for interacting with the Supabase Management API.
 * Used for creating Supabase projects programmatically.
 */

export interface SupabaseProjectCreateRequest {
  name: string
  organization_id: string
  region?: string
  plan?: 'free' | 'pro' | 'team' | 'enterprise'
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
  // Project ref is typically in the API URL or returned separately
  ref?: string
}

export interface SupabaseProjectApiKeysResponse {
  anon_key: string
  service_role_key: string
}

/**
 * Creates a new Supabase project via the Management API.
 *
 * @param managementApiToken - Personal Access Token (PAT) for Supabase Management API
 * @param projectName - Name for the new project
 * @param organizationId - Organization ID where the project will be created
 * @param region - AWS region (optional, defaults to us-east-1)
 * @returns Project information including ref and API URL
 * @throws Error if creation fails
 */
export async function createSupabaseProject(
  managementApiToken: string,
  projectName: string,
  organizationId: string,
  region: string = 'us-east-1'
): Promise<{
  projectRef: string
  projectId: string
  apiUrl: string
  region: string
}> {
  const response = await fetch('https://api.supabase.com/v1/projects', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${managementApiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: projectName,
      organization_id: organizationId,
      region,
      plan: 'free', // Default to free plan
      kps_enabled: false,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    let errorMessage = `Failed to create Supabase project: ${response.status} ${response.statusText}`
    
    try {
      const errorJson = JSON.parse(errorText)
      if (errorJson.message) {
        errorMessage = errorJson.message
      } else if (errorJson.error) {
        errorMessage = errorJson.error
      }
    } catch {
      // If parsing fails, use the raw error text if available
      if (errorText) {
        errorMessage += ` - ${errorText}`
      }
    }

    // Provide more specific error messages for common cases
    if (response.status === 401) {
      errorMessage = 'Invalid Supabase Management API token. Please check your token and try again.'
    } else if (response.status === 403) {
      errorMessage = 'Permission denied. The token does not have permission to create projects in this organization.'
    } else if (response.status === 429) {
      errorMessage = 'Rate limit exceeded. Please wait a few minutes and try again.'
    } else if (response.status === 400) {
      errorMessage = `Invalid request: ${errorMessage}`
    }

    throw new Error(errorMessage)
  }

  const project: any = await response.json()

  // Extract project ref - it might be in different fields
  // Common patterns: project.ref, project.reference, or extracted from project.id
  let projectRef = project.ref || project.reference || project.project_ref
  
  // If ref is not directly available, try to fetch project details
  if (!projectRef && project.id) {
    try {
      const detailsResponse = await fetch(`https://api.supabase.com/v1/projects/${project.id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${managementApiToken}`,
          'Content-Type': 'application/json',
        },
      })
      
      if (detailsResponse.ok) {
        const details = await detailsResponse.json()
        projectRef = details.ref || details.reference || details.project_ref
      }
    } catch {
      // If fetching details fails, we'll try to construct from other available data
    }
    
    // Last resort: use project ID (though this may not be the actual ref)
    if (!projectRef) {
      // The project ref is typically a short alphanumeric string
      // If we can't get it, we'll need to handle this error case
      throw new Error('Could not determine project reference. Please check the project was created successfully.')
    }
  }

  if (!projectRef) {
    throw new Error('Project reference not found in API response')
  }

  // Construct API URL from project ref
  // Format: https://<project-ref>.supabase.co
  const apiUrl = `https://${projectRef}.supabase.co`

  return {
    projectRef: String(projectRef),
    projectId: project.id || project.project_id,
    apiUrl,
    region: project.region || region,
  }
}

/**
 * Fetches API keys for a Supabase project.
 * Note: This may require a separate API call or the keys may be returned during project creation.
 * Adjust based on actual Supabase Management API behavior.
 *
 * @param managementApiToken - Personal Access Token (PAT) for Supabase Management API
 * @param projectRef - Project reference identifier
 * @returns API keys (anon key and service role key)
 * @throws Error if fetching fails
 */
export async function fetchSupabaseProjectApiKeys(
  managementApiToken: string,
  projectRef: string
): Promise<SupabaseProjectApiKeysResponse> {
  // Try multiple possible endpoints for API keys
  const endpoints = [
    `https://api.supabase.com/v1/projects/${projectRef}/api-keys`,
    `https://api.supabase.com/v1/projects/${projectRef}/keys`,
    `https://api.supabase.com/v1/projects/${projectRef}`,
  ]

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${managementApiToken}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        continue // Try next endpoint
      }

      const data = await response.json()
      
      // Handle array response (list of API keys)
      if (Array.isArray(data)) {
        const anonKey = data.find((k: any) => 
          k.name === 'anon' || 
          k.name === 'anon_key' || 
          k.tags?.includes('anon') ||
          k.type === 'anon'
        )?.api_key || data.find((k: any) => k.name === 'anon' || k.name === 'anon_key')?.key
        
        const serviceRoleKey = data.find((k: any) => 
          k.name === 'service_role' || 
          k.name === 'service_role_key' || 
          k.tags?.includes('service_role') ||
          k.type === 'service_role'
        )?.api_key || data.find((k: any) => k.name === 'service_role' || k.name === 'service_role_key')?.key
        
        if (anonKey && serviceRoleKey) {
          return {
            anon_key: anonKey,
            service_role_key: serviceRoleKey,
          }
        }
      }

      // Handle object response with direct keys
      if (data.anon_key && data.service_role_key) {
        return {
          anon_key: data.anon_key,
          service_role_key: data.service_role_key,
        }
      }

      // Handle nested structure (e.g., data.api_keys.anon_key)
      if (data.api_keys) {
        if (data.api_keys.anon_key && data.api_keys.service_role_key) {
          return {
            anon_key: data.api_keys.anon_key,
            service_role_key: data.api_keys.service_role_key,
          }
        }
      }
    } catch {
      continue // Try next endpoint
    }
  }

  throw new Error('Could not fetch API keys from any known endpoint. Please check the project was created successfully and the API token has the necessary permissions.')
}
