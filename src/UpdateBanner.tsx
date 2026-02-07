import { useEffect } from 'react'

interface UpdateBannerProps {
  onRefresh: () => void
  onDismiss?: () => void
}

/**
 * Banner component that appears when a new app version is available.
 * Shows a clear message and a refresh button.
 */
export function UpdateBanner({ onRefresh, onDismiss }: UpdateBannerProps) {
  useEffect(() => {
    // Prevent body scroll when banner is shown (optional, can be removed if not desired)
    // document.body.style.overflow = 'hidden'
    // return () => {
    //   document.body.style.overflow = ''
    // }
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10000,
        backgroundColor: 'var(--hal-surface, #ffffff)',
        borderBottom: '2px solid var(--hal-primary, var(--hal-purple-600))',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
      }}
    >
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span
          style={{
            fontSize: '18px',
            lineHeight: 1,
          }}
          aria-label="Update available"
        >
          🔄
        </span>
        <div>
          <div
            style={{
              fontWeight: 600,
              fontSize: '14px',
              marginBottom: '2px',
              color: 'var(--hal-text, #2d2640)',
            }}
          >
            Update available
          </div>
          <div
            style={{
              fontSize: '13px',
              color: 'var(--hal-text-muted, #6b5f7a)',
            }}
          >
            A new version of HAL is available. Refresh to load the latest changes.
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button
          onClick={onRefresh}
          style={{
            padding: '8px 16px',
            backgroundColor: 'var(--hal-primary, var(--hal-purple-600))',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500,
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--hal-primary-hover, var(--hal-purple-700))'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--hal-primary, var(--hal-purple-600))'
          }}
        >
          Refresh
        </button>
        {onDismiss && (
          <button
            onClick={onDismiss}
            style={{
              padding: '8px 12px',
              backgroundColor: 'transparent',
              color: 'var(--hal-text-muted, #6b5f7a)',
              border: '1px solid var(--hal-border, #e5e0f0)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--hal-bg, var(--hal-purple-25))'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  )
}
