// FileSystemDirectoryHandle is a global type from vite-env.d.ts

interface AppHeaderProps {
  isEmbedded: boolean
  projectFolderHandle: FileSystemDirectoryHandle | null
  projectName: string | null
  supabaseConnectionStatus: 'disconnected' | 'connecting' | 'connected'
  syncStatus?: 'realtime' | 'polling'
  lastSync?: Date | null
  onConnectProjectFolder: () => void
  onDisconnect: () => void
  onOpenNewHalWizard: () => void
}

export function AppHeader({
  isEmbedded,
  projectFolderHandle,
  projectName,
  supabaseConnectionStatus,
  syncStatus,
  lastSync,
  onConnectProjectFolder,
  onDisconnect,
  onOpenNewHalWizard,
}: AppHeaderProps) {
  // Show sync status even in embedded mode (0703)
  const showSyncStatus = supabaseConnectionStatus === 'connected' && syncStatus && !isEmbedded

  return (
    <>
      <h1>Portfolio 2026</h1>
      <p className="subtitle">Project Zero: Kanban</p>

      <header className="app-header-bar" aria-label="Project connection">
        {!projectFolderHandle ? (
          <button
            type="button"
            className="connect-project-btn"
            onClick={onConnectProjectFolder}
          >
            Connect Project Folder
          </button>
        ) : (
          <div className="project-info">
            <span className="project-name">{projectName}</span>
            <button
              type="button"
              className="disconnect-btn"
              onClick={onDisconnect}
            >
              Disconnect
            </button>
          </div>
        )}
        <button
          type="button"
          className="new-hal-project-btn"
          onClick={onOpenNewHalWizard}
        >
          New HAL project
        </button>
        <p className="connection-status" data-status={supabaseConnectionStatus} aria-live="polite">
          {supabaseConnectionStatus === 'connecting'
            ? 'Connecting…'
            : supabaseConnectionStatus === 'connected'
              ? 'Connected'
              : 'Disconnected'}
        </p>
        {showSyncStatus && (
          <div className="sync-status" aria-live="polite">
            <span className="sync-status-label">Live updates: {syncStatus === 'realtime' ? 'Realtime' : 'Polling'}</span>
            {lastSync && (
              <span className="sync-status-time">
                Last sync: {new Date(lastSync).toLocaleTimeString()}
              </span>
            )}
          </div>
        )}
      </header>
      {isEmbedded && supabaseConnectionStatus === 'connected' && syncStatus && (
        <div className="sync-status-embedded" aria-live="polite">
          <span className="sync-status-label">Live updates: {syncStatus === 'realtime' ? 'Realtime' : 'Polling'}</span>
          {lastSync && (
            <span className="sync-status-time">
              Last sync: {new Date(lastSync).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}
    </>
  )
}
