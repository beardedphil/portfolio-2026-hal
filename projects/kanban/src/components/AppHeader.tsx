// FileSystemDirectoryHandle is a global type from vite-env.d.ts
import { useContext } from 'react'
import { HalKanbanContext } from '../HalKanbanContext'

interface AppHeaderProps {
  isEmbedded: boolean
  projectFolderHandle: FileSystemDirectoryHandle | null
  projectName: string | null
  supabaseConnectionStatus: 'disconnected' | 'connecting' | 'connected'
  onConnectProjectFolder: () => void
  onDisconnect: () => void
  onOpenNewHalWizard: () => void
}

export function AppHeader({
  isEmbedded,
  projectFolderHandle,
  projectName,
  supabaseConnectionStatus,
  onConnectProjectFolder,
  onDisconnect,
  onOpenNewHalWizard,
}: AppHeaderProps) {
  const halCtx = useContext(HalKanbanContext)
  
  // Hide AppHeader when embedded (iframe) or when used as library in HAL (halCtx provided)
  if (isEmbedded || halCtx != null) {
    return null
  }

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
      </header>
    </>
  )
}
