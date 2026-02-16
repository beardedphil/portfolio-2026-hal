interface KanbanErrorBannerProps {
  error: string | null
  onDismiss: () => void
  connectedProject: string | null
}

export function KanbanErrorBanner({ error, onDismiss, connectedProject }: KanbanErrorBannerProps) {
  if (!error) return null

  return (
    <div
      style={{
        position: 'absolute',
        top: '8px',
        left: '8px',
        right: connectedProject ? '120px' : '8px',
        padding: '8px 12px',
        borderRadius: '4px',
        fontSize: '13px',
        fontWeight: '500',
        zIndex: 1001,
        backgroundColor: '#ef4444',
        color: 'white',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      <span>⚠️</span>
      <span>{error}</span>
      <button
        onClick={onDismiss}
        style={{
          marginLeft: 'auto',
          background: 'transparent',
          border: 'none',
          color: 'white',
          cursor: 'pointer',
          fontSize: '18px',
          lineHeight: '1',
          padding: '0',
          width: '20px',
          height: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-label="Dismiss error"
      >
        ×
      </button>
    </div>
  )
}
