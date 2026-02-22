/**
 * Vercel API client utilities for bootstrap workflow
 */

export interface VercelProject {
  id: string
  name: string
  accountId: string
  updatedAt: number
  createdAt: number
  targets?: {
    production?: {
      id: string
      url: string
    }
    preview?: {
      id: string
      url: string
    }
  }
}

export interface VercelDeployment {
  id: string
  url: string
  alias?: string[]
  target?: 'production' | 'staging' | null
  readyState: 'BUILDING' | 'ERROR' | 'INITIALIZING' | 'QUEUED' | 'READY' | 'CANCELED'
}

/**
 * Creates a Vercel project and links a GitHub repository
 */
export async function createVercelProject(
  vercelToken: string,
  projectName: string,
  gitRepository: { repo: string; type: 'github' },
  framework?: string
): Promise<{ success: true; project: VercelProject } | { success: false; error: string; errorDetails?: string }> {
  try {
    const response = await fetch('https://api.vercel.com/v11/projects', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vercelToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: projectName,
        gitRepository,
        framework: framework || 'other',
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`
      
      if (response.status === 401) {
        return {
          success: false,
          error: 'Invalid Vercel API token',
          errorDetails: errorMessage,
        }
      }
      
      if (response.status === 403) {
        return {
          success: false,
          error: 'Permission denied',
          errorDetails: errorMessage,
        }
      }

      return {
        success: false,
        error: 'Failed to create Vercel project',
        errorDetails: errorMessage,
      }
    }

    const project = await response.json() as VercelProject
    return { success: true, project }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    
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
}

/**
 * Sets environment variables for a Vercel project
 */
export async function setVercelEnvironmentVariables(
  vercelToken: string,
  projectId: string,
  environmentVariables: Array<{
    key: string
    value: string
    type?: 'system' | 'secret' | 'encrypted' | 'plain'
    target?: ('production' | 'preview' | 'development')[]
  }>
): Promise<{ success: true } | { success: false; error: string; errorDetails?: string }> {
  try {
    // Vercel API requires setting env vars one at a time
    // Set each variable individually
    for (const { key, value, type = 'plain', target = ['production', 'preview', 'development'] } of environmentVariables) {
      const response = await fetch(`https://api.vercel.com/v10/projects/${projectId}/env`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${vercelToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key,
          value,
          type,
          target,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`
        
        if (response.status === 401) {
          return {
            success: false,
            error: 'Invalid Vercel API token',
            errorDetails: errorMessage,
          }
        }
        
        if (response.status === 403) {
          return {
            success: false,
            error: 'Permission denied',
            errorDetails: errorMessage,
          }
        }

        return {
          success: false,
          error: `Failed to set environment variable ${key}`,
          errorDetails: errorMessage,
        }
      }
    }

    return { success: true }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    
    if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
      return {
        success: false,
        error: 'Network error',
        errorDetails: errorMessage,
      }
    }

    return {
      success: false,
      error: 'Failed to set environment variables',
      errorDetails: errorMessage,
    }
  }
}

/**
 * Creates a deployment for a Vercel project (triggers deploy)
 */
export async function createVercelDeployment(
  vercelToken: string,
  projectId: string,
  gitRepository: { repo: string; type: 'github'; ref?: string }
): Promise<{ success: true; deployment: VercelDeployment } | { success: false; error: string; errorDetails?: string }> {
  try {
    const response = await fetch('https://api.vercel.com/v13/deployments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vercelToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: projectId,
        gitSource: {
          type: 'github',
          repo: gitRepository.repo,
          ref: gitRepository.ref || 'main',
        },
        target: 'production',
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`
      
      if (response.status === 401) {
        return {
          success: false,
          error: 'Invalid Vercel API token',
          errorDetails: errorMessage,
        }
      }
      
      if (response.status === 403) {
        return {
          success: false,
          error: 'Permission denied',
          errorDetails: errorMessage,
        }
      }

      return {
        success: false,
        error: 'Failed to create deployment',
        errorDetails: errorMessage,
      }
    }

    const deployment = await response.json() as VercelDeployment
    return { success: true, deployment }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    
    if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
      return {
        success: false,
        error: 'Network error',
        errorDetails: errorMessage,
      }
    }

    return {
      success: false,
      error: 'Failed to create deployment',
      errorDetails: errorMessage,
    }
  }
}

/**
 * Gets the preview URL from a Vercel deployment
 */
export function getPreviewUrlFromDeployment(deployment: VercelDeployment): string | null {
  if (deployment.url) {
    return `https://${deployment.url}`
  }
  if (deployment.alias && deployment.alias.length > 0) {
    return `https://${deployment.alias[0]}`
  }
  return null
}
