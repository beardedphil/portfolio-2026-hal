import { useEffect } from 'react'

export interface AutoDismissMessageProps {
  onDismiss: () => void
  delay: number
}

export function AutoDismissMessage({ onDismiss, delay }: AutoDismissMessageProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, delay)
    return () => clearTimeout(timer)
  }, [onDismiss, delay])
  return null
}
