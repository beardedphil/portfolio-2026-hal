import React from 'react'
import { CoverageBadge } from './CoverageBadge'
import { MaintainabilityBadge } from './MaintainabilityBadge'
import type { GithubAuthMe, ConnectedGithubRepo } from '../types/app'

interface HalHeaderProps {
  connectedProject: string | null
  connectedGithubRepo: ConnectedGithubRepo | null
  githubAuth: GithubAuthMe | null
  onGithubConnect: () => void
  onGithubDisconnect: () => void
  onDisconnectClick: () => void
  disconnectButtonRef: React.RefObject<HTMLButtonElement>
  onCoverageReportClick: () => void
  onMaintainabilityReportClick: () => void
  onColdStartContinuityClick: () => void
}

export function HalHeader({
  connectedProject,
  connectedGithubRepo,
  githubAuth,
  onGithubConnect,
  onGithubDisconnect,
  onDisconnectClick,
  disconnectButtonRef,
  onCoverageReportClick,
  onMaintainabilityReportClick,
  onColdStartContinuityClick,
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
                {/* Cold-start Continuity Check button (0774) */}
                <button
                  type="button"
                  className="btn-standard"
                  onClick={onColdStartContinuityClick}
                  style={{ marginLeft: '8px', padding: '6px 12px', fontSize: '14px' }}
                  title="Run Cold-start Continuity Check"
                >
                  Continuity Check
                </button>
              </>
            )}
          </>
        )}
      </div>
    </header>
  )
}
