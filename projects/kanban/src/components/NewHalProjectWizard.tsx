// FileSystemDirectoryHandle is a global type from vite-env.d.ts

interface NewHalProjectWizardProps {
  open: boolean
  newHalProjectName: string
  newHalRepoUrl: string
  newHalChecklist: {
    createdRepo: boolean
    copiedScaffold: boolean
    setEnv: boolean
    addedToHalSuperProject: boolean
  }
  newHalReport: string | null
  newHalTemplateRoot: FileSystemDirectoryHandle | null
  newHalTargetRoot: FileSystemDirectoryHandle | null
  newHalBootstrapLog: string | null
  newHalBootstrapError: string | null
  onClose: () => void
  onProjectNameChange: (name: string) => void
  onRepoUrlChange: (url: string) => void
  onChecklistChange: (updates: Partial<NewHalProjectWizardProps['newHalChecklist']>) => void
  onGenerateReport: () => void
  onReset: () => void
  onSelectTemplateRoot: () => Promise<void>
  onSelectTargetRoot: () => Promise<void>
  onRunBootstrap: () => Promise<void>
}

export function NewHalProjectWizard({
  open,
  newHalProjectName,
  newHalRepoUrl,
  newHalChecklist,
  newHalReport,
  newHalTemplateRoot,
  newHalTargetRoot,
  newHalBootstrapLog,
  newHalBootstrapError,
  onClose,
  onProjectNameChange,
  onRepoUrlChange,
  onChecklistChange,
  onGenerateReport,
  onReset,
  onSelectTemplateRoot,
  onSelectTargetRoot,
  onRunBootstrap,
}: NewHalProjectWizardProps) {
  if (!open) {
    return null
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-label="New HAL project wizard">
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">New HAL project (wizard v0)</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="modal-subtitle">
          This is a checklist-only wizard. It helps you set up a new repo without losing the rules/docs/process we learned in Project 0.
        </p>

        <div className="modal-grid">
          <label className="field">
            <span className="field-label">Project name</span>
            <input
              className="field-input"
              value={newHalProjectName}
              onChange={(e) => onProjectNameChange(e.target.value)}
              placeholder="portfolio-2026-project-1"
            />
          </label>

          <label className="field">
            <span className="field-label">Repo URL (optional)</span>
            <input
              className="field-input"
              value={newHalRepoUrl}
              onChange={(e) => onRepoUrlChange(e.target.value)}
              placeholder="https://github.com/you/portfolio-2026-project-1"
            />
          </label>
        </div>

        <div className="checklist">
          <label className="check">
            <input
              type="checkbox"
              checked={newHalChecklist.createdRepo}
              onChange={(e) => onChecklistChange({ createdRepo: e.target.checked })}
            />
            <span>Repo created (local + remote)</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={newHalChecklist.copiedScaffold}
              onChange={(e) => onChecklistChange({ copiedScaffold: e.target.checked })}
            />
            <span>Copied scaffold (`.cursor/rules`, `docs/`, `scripts/sync-tickets.js`, `.env.example`)</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={newHalChecklist.setEnv}
              onChange={(e) => onChecklistChange({ setEnv: e.target.checked })}
            />
            <span>Configured `.env` (Supabase keys) and confirmed `.env` is ignored</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={newHalChecklist.addedToHalSuperProject}
              onChange={(e) => onChecklistChange({ addedToHalSuperProject: e.target.checked })}
            />
            <span>Added as submodule in HAL super-project</span>
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" className="primary" onClick={onGenerateReport}>
            Generate bootstrap report
          </button>
          <button type="button" onClick={onReset}>
            Reset
          </button>
        </div>

        <div className="wizard-v1">
          <p className="field-label">Wizard v1: copy scaffold (writes files)</p>
          <p className="wizard-help">
            Select the scaffold folder (recommended: this repo's <code>hal-template/</code>) and a destination folder for your new project, then copy.
          </p>
          <div className="wizard-actions">
            <button type="button" onClick={onSelectTemplateRoot}>
              Select scaffold folder
            </button>
            <button type="button" onClick={onSelectTargetRoot}>
              Select destination folder
            </button>
            <button type="button" className="primary" onClick={onRunBootstrap}>
              Copy scaffold
            </button>
          </div>

          <p className="wizard-status">
            Scaffold selected: {String(!!newHalTemplateRoot)} | Destination selected: {String(!!newHalTargetRoot)}
          </p>
          {newHalBootstrapError && (
            <p className="wizard-error" role="alert">
              {newHalBootstrapError}
            </p>
          )}
          {newHalBootstrapLog && <pre className="report-pre">{newHalBootstrapLog}</pre>}
        </div>

        {newHalReport && (
          <div className="report">
            <p className="field-label">Bootstrap report</p>
            <pre className="report-pre">{newHalReport}</pre>
          </div>
        )}
      </div>
    </div>
  )
}
