import React from 'react'
import type { ChatTarget, WorkingMemory } from './types'

type PmWorkingMemoryPanelProps = {
  selectedChatTarget: ChatTarget
  workingMemory: WorkingMemory | null
  workingMemoryOpen: boolean
  setWorkingMemoryOpen: (open: boolean) => void
  workingMemoryLoading: boolean
  workingMemoryError: string | null
  onRefresh: () => void
  onFetch: () => void
}

export function PmWorkingMemoryPanel({
  selectedChatTarget,
  workingMemory,
  workingMemoryOpen,
  setWorkingMemoryOpen,
  workingMemoryLoading,
  workingMemoryError,
  onRefresh,
  onFetch,
}: PmWorkingMemoryPanelProps) {
  // Only render for PM chat target
  if (selectedChatTarget !== 'project-manager') {
    return null
  }

  return (
    <>
      <button
        type="button"
        className="diagnostics-toggle"
        onClick={() => {
          setWorkingMemoryOpen(!workingMemoryOpen)
          if (!workingMemoryOpen && !workingMemory && !workingMemoryLoading) {
            onFetch()
          }
        }}
        aria-expanded={workingMemoryOpen}
      >
        PM Working Memory {workingMemoryOpen ? '▼' : '▶'}
      </button>

      {workingMemoryOpen && (
        <div className="diagnostics-panel" role="region" aria-label="PM Working Memory">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>PM Working Memory</h3>
            <button
              type="button"
              onClick={onRefresh}
              disabled={workingMemoryLoading}
              style={{
                padding: '4px 12px',
                fontSize: '12px',
                cursor: workingMemoryLoading ? 'not-allowed' : 'pointer',
                opacity: workingMemoryLoading ? 0.6 : 1,
              }}
            >
              {workingMemoryLoading ? 'Refreshing...' : 'Refresh now'}
            </button>
          </div>

          {workingMemoryError && (
            <div style={{ color: '#d32f2f', marginBottom: '12px', fontSize: '12px' }}>
              Error: {workingMemoryError}
              <br />
              <span style={{ fontSize: '11px', fontStyle: 'italic' }}>
                PM agent will continue using recent messages only.
              </span>
            </div>
          )}

          {workingMemoryLoading && !workingMemory && (
            <div style={{ color: '#666', fontSize: '12px' }}>Loading working memory...</div>
          )}

          {!workingMemoryLoading && !workingMemory && !workingMemoryError && (
            <div style={{ color: '#666', fontSize: '12px' }}>
              No working memory available yet. Start a conversation to build working memory.
              <br />
              <span style={{ fontSize: '11px', fontStyle: 'italic' }}>
                PM agent will use recent messages only until working memory is generated.
              </span>
            </div>
          )}

          {workingMemory && (() => {
            const wm = workingMemory!
            return (
              <div style={{ fontSize: '12px' }}>
                <div style={{ marginBottom: '8px', color: '#666' }}>
                  Last updated: {new Date(wm.lastUpdatedAt).toLocaleString()}
                </div>

                {wm.summary && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Summary</div>
                    <div style={{ color: '#333', lineHeight: '1.5' }}>{wm.summary}</div>
                  </div>
                )}

                {wm.goals.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Goals</div>
                    <ul style={{ margin: 0, paddingLeft: '20px', color: '#333' }}>
                      {wm.goals.map((goal, idx) => (
                        <li key={idx} style={{ marginBottom: '4px' }}>{goal}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {wm.requirements.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Requirements</div>
                    <ul style={{ margin: 0, paddingLeft: '20px', color: '#333' }}>
                      {wm.requirements.map((req, idx) => (
                        <li key={idx} style={{ marginBottom: '4px' }}>{req}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {wm.constraints.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Constraints</div>
                    <ul style={{ margin: 0, paddingLeft: '20px', color: '#333' }}>
                      {wm.constraints.map((constraint, idx) => (
                        <li key={idx} style={{ marginBottom: '4px' }}>{constraint}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {wm.decisions.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Decisions</div>
                    <ul style={{ margin: 0, paddingLeft: '20px', color: '#333' }}>
                      {wm.decisions.map((decision, idx) => (
                        <li key={idx} style={{ marginBottom: '4px' }}>{decision}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {wm.assumptions.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Assumptions</div>
                    <ul style={{ margin: 0, paddingLeft: '20px', color: '#333' }}>
                      {wm.assumptions.map((assumption, idx) => (
                        <li key={idx} style={{ marginBottom: '4px' }}>{assumption}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {wm.openQuestions && wm.openQuestions.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Open Questions</div>
                    <ul style={{ margin: 0, paddingLeft: '20px', color: '#333' }}>
                      {wm.openQuestions.map((question, idx) => (
                        <li key={idx} style={{ marginBottom: '4px' }}>{question}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {Object.keys(wm.glossary).length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Glossary</div>
                    <ul style={{ margin: 0, paddingLeft: '20px', color: '#333' }}>
                      {Object.entries(wm.glossary).map(([term, def]) => (
                        <li key={term} style={{ marginBottom: '4px' }}>
                          <strong>{term}:</strong> {def}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {wm.stakeholders.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Stakeholders</div>
                    <ul style={{ margin: 0, paddingLeft: '20px', color: '#333' }}>
                      {wm.stakeholders.map((stakeholder, idx) => (
                        <li key={idx} style={{ marginBottom: '4px' }}>{stakeholder}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}
    </>
  )
}
