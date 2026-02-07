/**
 * Version detection utility for HAL app.
 * Detects when a new deployment is available by checking the HTML file's version attribute.
 */

const VERSION_CHECK_INTERVAL = 60000 // Check every 60 seconds
const VERSION_STORAGE_KEY = 'hal-app-version'

/**
 * Get the current app version (timestamp when the page was loaded).
 */
export function getCurrentVersion(): string {
  return document.documentElement.getAttribute('data-app-version') || Date.now().toString()
}

/**
 * Check if a new version is available by fetching the HTML file and comparing version attributes.
 */
export async function checkForNewVersion(): Promise<boolean> {
  try {
    // Fetch the HTML file with cache-busting to get the latest version
    const response = await fetch(`${window.location.origin}${window.location.pathname}?v=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
    })
    
    if (!response.ok) {
      return false
    }

    const htmlText = await response.text()
    
    // Extract the version from the HTML's data-app-version attribute
    const versionMatch = htmlText.match(/data-app-version=["']([^"']+)["']/i)
    const serverVersion = versionMatch ? versionMatch[1] : null
    
    if (!serverVersion) {
      // Fallback: use last-modified header if available
      const lastModified = response.headers.get('last-modified')
      if (lastModified) {
        const serverVersionFromHeader = new Date(lastModified).getTime().toString()
        const storedVersion = localStorage.getItem(VERSION_STORAGE_KEY)
        const currentVersion = getCurrentVersion()
        
        if (!storedVersion) {
          localStorage.setItem(VERSION_STORAGE_KEY, currentVersion)
          return false
        }
        
        if (serverVersionFromHeader !== storedVersion && serverVersionFromHeader !== currentVersion) {
          return true
        }
      }
      return false
    }
    
    // Get the current version from the page
    const currentVersion = getCurrentVersion()
    
    // Store the server version for comparison
    const storedVersion = localStorage.getItem(VERSION_STORAGE_KEY)
    
    // If we haven't stored a version yet, store the current one and return false
    if (!storedVersion) {
      localStorage.setItem(VERSION_STORAGE_KEY, currentVersion)
      return false
    }
    
    // Compare versions - if server version is different from stored, new version is available
    if (serverVersion !== storedVersion && serverVersion !== currentVersion) {
      return true
    }
    
    return false
  } catch (error) {
    console.warn('[Version Check] Failed to check for new version:', error)
    return false
  }
}

/**
 * Initialize version tracking (call on app load).
 */
export function initializeVersion(): void {
  const currentVersion = getCurrentVersion()
  const storedVersion = localStorage.getItem(VERSION_STORAGE_KEY)
  if (!storedVersion) {
    localStorage.setItem(VERSION_STORAGE_KEY, currentVersion)
  }
}

/**
 * Mark the current version as seen (called after user refreshes).
 */
export function markVersionAsSeen(): void {
  const currentVersion = getCurrentVersion()
  localStorage.setItem(VERSION_STORAGE_KEY, currentVersion)
}

/**
 * Start periodic version checking.
 * Returns a cleanup function to stop checking.
 */
export function startVersionChecking(
  onNewVersionAvailable: () => void,
  interval: number = VERSION_CHECK_INTERVAL
): () => void {
  // Initial check after a short delay
  const initialTimeout = setTimeout(() => {
    checkForNewVersion().then((hasNewVersion) => {
      if (hasNewVersion) {
        onNewVersionAvailable()
      }
    })
  }, 5000) // Check after 5 seconds

  // Periodic checks
  const intervalId = setInterval(() => {
    checkForNewVersion().then((hasNewVersion) => {
      if (hasNewVersion) {
        onNewVersionAvailable()
      }
    })
  }, interval)

  // Cleanup function
  return () => {
    clearTimeout(initialTimeout)
    clearInterval(intervalId)
  }
}
