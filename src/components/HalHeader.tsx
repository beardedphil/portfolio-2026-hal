import React from 'react'
import { CoverageBadge } from './CoverageBadge'
import { MaintainabilityBadge } from './MaintainabilityBadge'
import type { GithubAuthMe, ConnectedGithubRepo } from '../types/app'
import type { Theme } from '../types/hal'

interface HalHeaderProps {
  connectedProject: string | null
  connectedGithubRepo: ConnectedGithubRepo | null
  githubAuth: GithubAuthMe | null
  onGithubConnect: () => void
  onGithubDisconnect: () => void
  onDisconnectClick: () => void
  disconnectButtonRef: React.RefObject<HTMLButtonElement>
  onAgentInstructionsClick: () => void
  onCoverageReportClick: () => void
  onMaintainabilityReportClick: () => void
  onIntegrationManifestClick: () => void
  onContextBundleClick?: () => void
  onAgentRunBundleClick?: () => void
  theme: Theme
  onThemeChange: (theme: Theme) => void
}

export function HalHeader({
  connectedProject,
  connectedGithubRepo,
  githubAuth,
  onGithubConnect,
  onGithubDisconnect,
  onDisconnectClick,
  disconnectButtonRef,
  onAgentInstructionsClick,
  onCoverageReportClick,
  onMaintainabilityReportClick,
  onIntegrationManifestClick,
  onContextBundleClick,
  onAgentRunBundleClick,
  theme,
  onThemeChange,
}: HalHeaderProps) {
  return (
    <header className="hal-header">
      <div className="hal-header-left">
        <h1>HAL</h1>
        <span className="hal-subtitle">Agent Workspace</span>
      </div>
      <div className="hal-header-center">
        {!connectedProject ? (
          <button type="button" className="connect-project-btn btn-standard" onClick={onGithubConnect}>
            Connect GitHub Repo
          </button>
        ) : (
          <>
            {connectedGithubRepo && (
              <>
                {/* Coverage badge on the left (0699) */}
                <CoverageBadge onClick={onCoverageReportClick} />
                {/* Repo/Disconnect box in the middle (0708: GitHub row on top, both rows use same layout) */}
                <div className="project-info">
                  {/* GitHub connection row (0708: on top, same layout as repo row) */}
                  <div className="project-info-row">
                    <span className="project-name">
                      {githubAuth?.authenticated ? `GitHub: ${githubAuth.login ?? 'connected'}` : 'GitHub: Not signed in'}
                    </span>
                    <button
                      type="button"
                      className={`disconnect-btn ${githubAuth?.authenticated ? 'btn-destructive' : 'btn-standard'}`}
                      onClick={githubAuth?.authenticated ? onGithubDisconnect : onGithubConnect}
                      title={githubAuth?.authenticated ? 'Sign out of GitHub' : 'Sign in with GitHub'}
                    >
                      {githubAuth?.authenticated ? 'Sign out' : 'Sign in'}
                    </button>
                  </div>
                  {/* Repo connection row (0708: below GitHub row, functionally unchanged) */}
                  <div className="project-info-row">
                    <span className="project-name" title={connectedGithubRepo.fullName}>
                      Repo: {connectedGithubRepo.fullName.split('/').pop() || connectedGithubRepo.fullName}
                    </span>
                    <button
                      ref={disconnectButtonRef}
                      type="button"
                      className="disconnect-btn btn-destructive"
                      onClick={onDisconnectClick}
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
                {/* Maintainability badge on the right (0699) */}
                <MaintainabilityBadge onClick={onMaintainabilityReportClick} />
              </>
            )}
          </>
        )}
      </div>
      <div className="hal-header-actions">
        <div className="theme-selector">
          <label htmlFor="theme-select" className="theme-select-label">
            Theme:
          </label>
          <select
            id="theme-select"
            className="theme-select"
            value={theme}
            onChange={(e) => onThemeChange(e.target.value as Theme)}
            aria-label="Select theme"
          >
            <option value="dark">Dark</option>
            <option value="lcars">LCARS</option>
            <option value="arrested">Arrested</option>
            {/* There's always money in the banana stand. */}
          </select>
        </div>
        <button
          type="button"
          className="agent-instructions-btn btn-standard"
          onClick={onAgentInstructionsClick}
          aria-label="View agent instructions"
          title="View agent instructions"
        >
          Agent Instructions
        </button>
        {connectedProject && connectedGithubRepo && (
          <>
            <button
              type="button"
              className="integration-manifest-btn btn-standard"
              onClick={onIntegrationManifestClick}
              aria-label="Regenerate Integration Manifest"
              title="Regenerate Integration Manifest"
            >
              Regenerate Integration Manifest
            </button>
            {onContextBundleClick && (
              <button
                type="button"
                className="context-bundle-btn btn-standard"
                onClick={onContextBundleClick}
                aria-label="View Context Bundles"
                title="View Context Bundles"
              >
                Context Bundles
              </button>
            )}
            {onAgentRunBundleClick && (
              <button
                type="button"
                className="agent-run-bundle-btn btn-standard"
                onClick={onAgentRunBundleClick}
                aria-label="Build Context Bundle from Agent Run"
                title="Build Context Bundle from Agent Run"
              >
                Build Bundle from Run
              </button>
            )}
          </>
        )}
      </div>
    </header>
  )
}
