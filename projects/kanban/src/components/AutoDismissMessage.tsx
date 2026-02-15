import React, { useEffect } from 'react'

export function AutoDismissMessage({ onDismiss, delay }: { onDismiss: () => void; delay: number }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, delay)
    return () => clearTimeout(timer)
  }, [onDismiss, delay])
  return null
}
