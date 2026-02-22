import { useEffect, useRef } from 'react'

/**
 * Hook that triggers a reload callback when the app returns from an idle/background state.
 * 
 * This helps ensure users see the latest version of the app after it's been idle
 * in the background, without requiring a manual hard refresh.
 * 
 * @param onReload Callback function to execute when reload should occur
 * @param idleThresholdMs Minimum time (in milliseconds) the app must be idle before triggering reload on return (default: 5 minutes)
 */
export function useIdleReload(
  onReload: () => void,
  idleThresholdMs: number = 5 * 60 * 1000 // 5 minutes default
) {
  const idleStartTimeRef = useRef<number | null>(null)
  const visibilityTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // App went to background - record the time
        idleStartTimeRef.current = Date.now()
        // Clear any pending reload timeout
        if (visibilityTimeoutRef.current !== null) {
          clearTimeout(visibilityTimeoutRef.current)
          visibilityTimeoutRef.current = null
        }
      } else {
        // App returned to foreground
        const idleStartTime = idleStartTimeRef.current
        if (idleStartTime !== null) {
          const idleDuration = Date.now() - idleStartTime
          
          // Only trigger reload if app was idle for longer than threshold
          if (idleDuration >= idleThresholdMs) {
            // Small delay to ensure page is fully visible before reload
            visibilityTimeoutRef.current = window.setTimeout(() => {
              onReload()
              // Reset idle start time after reload
              idleStartTimeRef.current = null
            }, 500)
          } else {
            // Reset if idle duration was too short
            idleStartTimeRef.current = null
          }
        }
      }
    }

    const handleFocus = () => {
      // Similar logic for window focus events
      const idleStartTime = idleStartTimeRef.current
      if (idleStartTime !== null) {
        const idleDuration = Date.now() - idleStartTime
        
        if (idleDuration >= idleThresholdMs) {
          visibilityTimeoutRef.current = window.setTimeout(() => {
            onReload()
            idleStartTimeRef.current = null
          }, 500)
        } else {
          idleStartTimeRef.current = null
        }
      }
    }

    // Listen to visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    // Also listen to window focus events as a fallback
    window.addEventListener('focus', handleFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      if (visibilityTimeoutRef.current !== null) {
        clearTimeout(visibilityTimeoutRef.current)
      }
    }
  }, [onReload, idleThresholdMs])
}
