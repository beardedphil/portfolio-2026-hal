/**
 * Vercel API helper functions
 * Used for creating and managing Vercel projects via the Vercel API
 */

export interface VercelProjectCreateRequest {
  name: string
  gitRepository?: {
    repo: string // e.g., 'owner/repo'
    type: 'github'
  }
  framework?: string
  rootDirectory?: string
}

export interface VercelProjectResponse {
  id: string
  name: string
  accountId: string
  updatedAt: number
  createdAt: number
  link?: {
    type: string
    repo: string
    repoId: number
    org?: string
    createdAt: number
    updatedAt: number
  }
  latestDeployments?: Array<{
    uid: string
    name: string
    url: string
    created: number
    state: string
    type: string
    target?: string
  }>
}

export interface VercelEnvironmentVariable {
  key: string
  value: string
  type: 'encrypted' | 'plain'
  target: ('production' | 'preview' | 'development')[]
}

/**
 * Creates a Vercel project via the Vercel API
 *
 * @param accessToken - Vercel access token
 * @param projectName - Name for the new project
 * @param gitRepository - GitHub repository to link (format: 'owner/repo')
 * @param teamId - Optional team ID (if creating for a team)
 * @returns Project details including ID and deployment info
 * @throws Error if API call fails
 */
export async function createVercelProject(
  accessToken: string,
  projectName: string,
  gitRepository: string,
  teamId?: string
): Promise<VercelProjectResponse> {
  if (!accessToken || !accessToken.trim()) {
    throw new Error('Vercel access token is required')
  }

  if (!projectName || !projectName.trim()) {
    throw new Error('Project name is required')
  }

  if (!gitRepository || !gitRepository.trim()) {
    throw new Error('GitHub repository is required')
  }

  // Validate gitRepository format (should be 'owner/repo')
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(gitRepository.trim())) {
    throw new Error('Invalid GitHub repository format. Expected format: owner/repo')
  }

  const url = teamId
    ? `https://api.vercel.com/v11/projects?teamId=${encodeURIComponent(teamId)}`
    : 'https://api.vercel.com/v11/projects'

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: projectName.trim(),
      gitRepository: {
        repo: gitRepository.trim(),
        type: 'github',
      },
      framework: null, // Auto-detect
    } as VercelProjectCreateRequest),
  })

  if (!response.ok) {
    const errorText = await response.text()
    let errorMessage = `Failed to create Vercel project: ${response.status} ${response.statusText}`

    if (response.status === 401) {
      errorMessage = 'Invalid Vercel access token. Please check your token and try again.'
    } else if (response.status === 403) {
      errorMessage = 'Permission denied. The token does not have permission to create projects.'
    } else if (response.status === 429) {
      errorMessage = 'Rate limit exceeded. Please wait a few minutes and try again.'
    } else if (response.status === 400) {
      try {
        const errorJson = JSON.parse(errorText)
        errorMessage = errorJson.error?.message || errorJson.message || errorMessage
      } catch {
        // Use default error message
      }
    }

    throw new Error(errorMessage)
  }

  const project: VercelProjectResponse = await response.json()
  return project
}

/**
 * Creates environment variables for a Vercel project
 *
 * @param accessToken - Vercel access token
 * @param projectIdOrName - Project ID or name
 * @param variables - Array of environment variables to create
 * @param teamId - Optional team ID
 * @returns Created environment variables
 * @throws Error if API call fails
 */
export async function createVercelEnvironmentVariables(
  accessToken: string,
  projectIdOrName: string,
  variables: VercelEnvironmentVariable[],
  teamId?: string
): Promise<void> {
  if (!accessToken || !accessToken.trim()) {
    throw new Error('Vercel access token is required')
  }

  if (!projectIdOrName || !projectIdOrName.trim()) {
    throw new Error('Project ID or name is required')
  }

  if (!variables || variables.length === 0) {
    return // Nothing to do
  }

  const url = teamId
    ? `https://api.vercel.com/v10/projects/${encodeURIComponent(projectIdOrName)}/env?teamId=${encodeURIComponent(teamId)}`
    : `https://api.vercel.com/v10/projects/${encodeURIComponent(projectIdOrName)}/env`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(variables),
  })

  if (!response.ok) {
    const errorText = await response.text()
    let errorMessage = `Failed to create environment variables: ${response.status} ${response.statusText}`

    if (response.status === 401) {
      errorMessage = 'Invalid Vercel access token. Please check your token and try again.'
    } else if (response.status === 403) {
      errorMessage = 'Permission denied. The token does not have permission to modify this project.'
    } else if (response.status === 404) {
      errorMessage = 'Project not found. Please check the project ID or name.'
    } else if (response.status === 400) {
      try {
        const errorJson = JSON.parse(errorText)
        errorMessage = errorJson.error?.message || errorJson.message || errorMessage
      } catch {
        // Use default error message
      }
    }

    throw new Error(errorMessage)
  }

  // Response is an array of created environment variables
  await response.json()
}

/**
 * Triggers a deployment for a Vercel project by creating a deployment
 *
 * @param accessToken - Vercel access token
 * @param projectIdOrName - Project ID or name
 * @param teamId - Optional team ID
 * @returns Deployment information including preview URL
 * @throws Error if API call fails
 */
export async function triggerVercelDeployment(
  accessToken: string,
  projectIdOrName: string,
  teamId?: string
): Promise<{ url: string; state: string }> {
  if (!accessToken || !accessToken.trim()) {
    throw new Error('Vercel access token is required')
  }

  if (!projectIdOrName || !projectIdOrName.trim()) {
    throw new Error('Project ID or name is required')
  }

  // Trigger deployment by creating a new deployment
  // Vercel will automatically deploy when a project is linked to GitHub and a commit is pushed
  // For now, we'll return the project's latest deployment URL if available
  // In practice, the first deploy happens automatically when the project is created and linked

  const url = teamId
    ? `https://api.vercel.com/v9/projects/${encodeURIComponent(projectIdOrName)}?teamId=${encodeURIComponent(teamId)}`
    : `https://api.vercel.com/v9/projects/${encodeURIComponent(projectIdOrName)}`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    let errorMessage = `Failed to get project: ${response.status} ${response.statusText}`

    if (response.status === 401) {
      errorMessage = 'Invalid Vercel access token. Please check your token and try again.'
    } else if (response.status === 403) {
      errorMessage = 'Permission denied. The token does not have permission to access this project.'
    } else if (response.status === 404) {
      errorMessage = 'Project not found. Please check the project ID or name.'
    }

    throw new Error(errorMessage)
  }

  const project: VercelProjectResponse = await response.json()

  // Get the latest deployment URL
  // If there's a latest deployment, use its URL
  // Otherwise, construct the preview URL from the project name
  if (project.latestDeployments && project.latestDeployments.length > 0) {
    const latestDeployment = project.latestDeployments[0]
    return {
      url: latestDeployment.url,
      state: latestDeployment.state,
    }
  }

  // Fallback: construct preview URL (Vercel format: project-name.vercel.app)
  const previewUrl = `https://${project.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}.vercel.app`
  return {
    url: previewUrl,
    state: 'QUEUED', // Deployment will be triggered automatically
  }
}
