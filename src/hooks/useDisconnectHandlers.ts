import { useCallback, useEffect } from 'react'

interface UseDisconnectHandlersParams {
  disconnectConfirmOpen: boolean
  setDisconnectConfirmOpen: (open: boolean) => void
  handleDisconnect: () => void
  disconnectButtonRef: React.RefObject<HTMLButtonElement>
  disconnectConfirmButtonRef: React.RefObject<HTMLButtonElement>
}

export function useDisconnectHandlers({
  disconnectConfirmOpen,
  setDisconnectConfirmOpen,
  handleDisconnect,
  disconnectButtonRef,
  disconnectConfirmButtonRef,
}: UseDisconnectHandlersParams) {
  const handleDisconnectClick = useCallback(() => {
    setDisconnectConfirmOpen(true)
  }, [setDisconnectConfirmOpen])

  const handleDisconnectConfirm = useCallback(() => {
    setDisconnectConfirmOpen(false)
    handleDisconnect()
    // After disconnect, the Disconnect button will be replaced by Connect button, so no focus return needed
  }, [setDisconnectConfirmOpen, handleDisconnect])

  const handleDisconnectCancel = useCallback(() => {
    setDisconnectConfirmOpen(false)
    // Return focus to the Disconnect button
    setTimeout(() => {
      disconnectButtonRef.current?.focus()
    }, 0)
  }, [setDisconnectConfirmOpen, disconnectButtonRef])

  // Handle Esc key and focus management for disconnect confirmation modal (0142)
  useEffect(() => {
    if (!disconnectConfirmOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleDisconnectCancel()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    // Focus the confirm button when modal opens
    setTimeout(() => {
      disconnectConfirmButtonRef.current?.focus()
    }, 0)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [disconnectConfirmOpen, handleDisconnectCancel, disconnectConfirmButtonRef])

  return {
    handleDisconnectClick,
    handleDisconnectConfirm,
    handleDisconnectCancel,
  }
}
