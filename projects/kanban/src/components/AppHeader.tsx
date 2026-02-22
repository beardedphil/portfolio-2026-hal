// FileSystemDirectoryHandle is a global type from vite-env.d.ts
import { useContext } from 'react'
import { HalKanbanContext } from '../HalKanbanContext'

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
  onOpenBootstrap?: () => void
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
  onOpenBootstrap,
}: AppHeaderProps) {
  const halCtx = useContext(HalKanbanContext)
  
  // Show sync status when embedded or in library mode (0703)
  const showSyncStatus = supabaseConnectionStatus === 'connected' && syncStatus
  
  // Hide full AppHeader when embedded (iframe) or when used as library in HAL (halCtx provided)
  // But still show sync status (0703)
  if (isEmbedded || halCtx != null) {
    return showSyncStatus ? (
      <div className="sync-status-embedded" aria-live="polite">
        <span className="sync-status-label">Live updates: {syncStatus === 'realtime' ? 'Realtime' : 'Polling'}</span>
        {lastSync && (
          <span className="sync-status-time">
            Last sync: {new Date(lastSync).toLocaleTimeString()}
          </span>
        )}
      </div>
    ) : null
  }

  return (
    <>
      <h1>Portfolio 2026</h1>
      <p className="subtitle">Project Zero: Kanban</p>

      <header className="app-header-bar" aria-label="Project connection">
        {!projectFolderHandle ? (
          <button
            type="button"
            className="connect-project-btn btn-standard"
            onClick={onConnectProjectFolder}
          >
            Connect Project Folder
          </button>
        ) : (
          <div className="project-info">
            <span className="project-name">{projectName}</span>
            <button
              type="button"
              className="btn-destructive"
              onClick={onDisconnect}
            >
              Disconnect
            </button>
          </div>
        )}
        <button
          type="button"
          className="new-hal-project-btn btn-standard"
          onClick={onOpenNewHalWizard}
        >
          New HAL project
        </button>
        {onOpenBootstrap && (
          <button
            type="button"
            className="bootstrap-btn btn-standard"
            onClick={onOpenBootstrap}
          >
            Bootstrap
          </button>
        )}
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
    </>
  )
}
