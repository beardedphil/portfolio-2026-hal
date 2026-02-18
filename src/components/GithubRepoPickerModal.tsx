import type { GithubRepo } from '../types/app'

interface GithubRepoPickerModalProps {
  isOpen: boolean
  repos: GithubRepo[] | null
  query: string
  onQueryChange: (query: string) => void
  onSelectRepo: (repo: GithubRepo) => void
  onClose: () => void
}

export function GithubRepoPickerModal({
  isOpen,
  repos,
  query,
  onQueryChange,
  onSelectRepo,
  onClose,
}: GithubRepoPickerModalProps) {
  if (!isOpen) return null

  return (
    <div className="conversation-modal-overlay" onClick={onClose}>
      <div className="conversation-modal" onClick={(e) => e.stopPropagation()}>
        <div className="conversation-modal-header">
          <h3>Select GitHub repository</h3>
          <button
            type="button"
            className="conversation-modal-close btn-destructive"
            onClick={onClose}
            aria-label="Close repo picker"
          >
            ×
          </button>
        </div>
        <div className="conversation-modal-content">
          <div style={{ padding: '12px' }}>
            <input
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Filter repos (owner/name)"
              style={{ width: '100%', padding: '10px', marginBottom: '12px' }}
            />
            {!repos ? (
              <div>Loading repos…</div>
            ) : repos.length === 0 ? (
              <div>No repos found.</div>
            ) : (
              <div style={{ maxHeight: '50vh', overflow: 'auto' }}>
                {repos
                  .filter((r) => r.full_name.toLowerCase().includes(query.trim().toLowerCase()))
                  .slice(0, 200)
                  .map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => onSelectRepo(r)}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '10px',
                        marginBottom: '8px',
                        borderRadius: '8px',
                        border: '1px solid rgba(0,0,0,0.15)',
                        background: 'transparent',
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{r.full_name}</div>
                      <div style={{ fontSize: '0.9em', opacity: 0.8 }}>
                        {r.private ? 'Private' : 'Public'} • default: {r.default_branch}
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
