import { useEffect, useRef } from 'react'

interface UseConversationLoadingParams {
  connectedProject: string | null
  loadConversationsForProject: (projectName: string) => Promise<void>
  restoredSelectedConvRef: React.MutableRefObject<string | null>
}

export function useConversationLoading({
  connectedProject,
  loadConversationsForProject,
  restoredSelectedConvRef,
}: UseConversationLoadingParams) {
  // Load conversations when connectedProject is restored on page refresh (0124: fix chat clearing on refresh)
  // CRITICAL: This must run immediately when connectedProject is set, regardless of Supabase credentials
  // We use a ref to track if we've already loaded for this project to avoid duplicate loads
  const loadedProjectRef = useRef<string | null>(null)
  useEffect(() => {
    if (connectedProject && loadedProjectRef.current !== connectedProject) {
      loadedProjectRef.current = connectedProject
      restoredSelectedConvRef.current = null // Reset restoration flag when project changes
      // Load conversations immediately - loadConversationsForProject handles localStorage first, then Supabase
      // This ensures conversations are visible immediately on page refresh, even before Supabase loads
      loadConversationsForProject(connectedProject).catch((err) => {
        console.error('[HAL] Error loading conversations on page refresh:', err)
      })
    } else if (!connectedProject) {
      // Reset ref when disconnected
      loadedProjectRef.current = null
      restoredSelectedConvRef.current = null
    }
  }, [connectedProject, loadConversationsForProject, restoredSelectedConvRef])
}
