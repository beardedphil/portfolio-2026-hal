import React, { useState, useRef, useEffect } from 'react'
import {
  getAgentWorkflowSteps,
  mapStatusToStepId,
  getStepStatus,
} from '../lib/agentWorkflow'
import type { SupabaseAgentRunRow } from '../App.types'

/** Multi-dot status indicator component with tooltip (0203) */
export function StatusIndicator({
  agentRun,
  agentName,
  failureInfo,
}: {
  agentRun?: SupabaseAgentRunRow
  agentName: string | null
  failureInfo?: { root_cause?: string | null; failure_type?: string; metadata?: Record<string, any> }
}) {
  const [isHovered, setIsHovered] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)

  // Determine agent type from agentRun or agentName
  const agentType: 'implementation' | 'qa' | 'process-review' | 'project-manager' | null =
    agentRun?.agent_type ||
    (agentName === 'QA'
      ? 'qa'
      : agentName === 'Implementation'
      ? 'implementation'
      : agentName === 'Process Review'
      ? 'process-review'
      : agentName === 'Project Manager'
      ? 'project-manager'
      : null)
  
  // Get workflow steps for this agent type
  const workflowSteps = getAgentWorkflowSteps(agentType)
  
  // Map current_stage to step ID (0690: use current_stage instead of status for detailed progression)
  const currentStepId = agentRun ? mapStatusToStepId(agentRun.current_stage || agentRun.status, agentType) : null
  
  const showTooltip = isHovered || isFocused

  // Position tooltip to avoid clipping - ensures full visibility in all scenarios
  useEffect(() => {
    if (showTooltip && tooltipRef.current && indicatorRef.current) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        if (!tooltipRef.current || !indicatorRef.current) return
        
        const tooltip = tooltipRef.current
        const indicator = indicatorRef.current
        const wrapper = indicator.closest('.active-work-status-indicator-wrapper') as HTMLElement
        if (!wrapper) return
        
        // Reset positioning to default (below, left-aligned) for accurate measurement
        tooltip.style.top = '100%'
        tooltip.style.bottom = 'auto'
        tooltip.style.left = '0'
        tooltip.style.right = 'auto'
        tooltip.style.marginTop = '4px'
        tooltip.style.marginBottom = '0'
        tooltip.style.transform = 'none'
        
        // Get bounding rects after reset (all in viewport coordinates)
        const indicatorRect = indicator.getBoundingClientRect()
        const tooltipRect = tooltip.getBoundingClientRect()
        const wrapperRect = wrapper.getBoundingClientRect()
        
        // Get viewport dimensions
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        
        // 0676: Use active-work-items container (not active-work-item) to allow tooltip to extend over neighboring cards
        // Find the parent container that holds all Active Work cards
        let container = indicator.closest('.active-work-items')
        let containerRect: DOMRect | null = null
        if (container) {
          containerRect = container.getBoundingClientRect()
        }
        
        // Use container boundaries if available, otherwise use viewport
        // This allows tooltip to extend over neighboring cards within the active-work-items container
        const maxRight = containerRect ? containerRect.right : viewportWidth
        const maxBottom = containerRect ? containerRect.bottom : viewportHeight
        const minLeft = containerRect ? containerRect.left : 0
        const minTop = containerRect ? containerRect.top : 0
        
        // Calculate tooltip position when positioned below (default)
        const spaceBelow = maxBottom - indicatorRect.bottom - 4
        const spaceAbove = indicatorRect.top - minTop - 4
        
        // Vertical positioning: prefer below, flip above if needed
        if (spaceBelow < tooltipRect.height && spaceAbove >= tooltipRect.height) {
          // Not enough space below, but enough above - position above
          tooltip.style.top = 'auto'
          tooltip.style.bottom = '100%'
          tooltip.style.marginBottom = '4px'
          tooltip.style.marginTop = '0'
        } else if (spaceBelow < tooltipRect.height && spaceAbove < tooltipRect.height) {
          // Not enough space in either direction - use the side with more space
          if (spaceAbove > spaceBelow) {
            tooltip.style.top = 'auto'
            tooltip.style.bottom = '100%'
            tooltip.style.marginBottom = '4px'
            tooltip.style.marginTop = '0'
          } else {
            tooltip.style.top = '100%'
            tooltip.style.bottom = 'auto'
            tooltip.style.marginTop = '4px'
            tooltip.style.marginBottom = '0'
          }
        } else {
          // Enough space below, use default
          tooltip.style.top = '100%'
          tooltip.style.bottom = 'auto'
          tooltip.style.marginTop = '4px'
          tooltip.style.marginBottom = '0'
        }
        
        // Re-measure after vertical positioning
        const finalTooltipRect = tooltip.getBoundingClientRect()
        const tooltipLeftX = finalTooltipRect.left
        const tooltipRightX = finalTooltipRect.right
        
        // Calculate horizontal offset relative to wrapper
        // tooltip.style.left is relative to wrapper, so we need to convert viewport coordinates
        const wrapperLeft = wrapperRect.left
        
        // Horizontal positioning: ensure tooltip doesn't clip on left or right
        if (tooltipRightX > maxRight) {
          // Tooltip extends beyond right edge - align to right of wrapper or adjust
          // Try aligning to right of wrapper
          tooltip.style.left = 'auto'
          tooltip.style.right = '0'
          // Re-measure
          const adjustedRect = tooltip.getBoundingClientRect()
          if (adjustedRect.left < minLeft) {
            // Still extends beyond left, position to fit within container
            // Calculate left offset: minLeft - wrapperLeft (convert viewport to wrapper-relative)
            const leftOffset = minLeft - wrapperLeft
            tooltip.style.left = `${leftOffset}px`
            tooltip.style.right = 'auto'
          }
        } else if (tooltipLeftX < minLeft) {
          // Tooltip extends beyond left edge - align to left of container
          // Calculate left offset: minLeft - wrapperLeft (convert viewport to wrapper-relative)
          const leftOffset = minLeft - wrapperLeft
          tooltip.style.left = `${leftOffset}px`
          tooltip.style.right = 'auto'
        } else {
          // Default: left-aligned with wrapper (which aligns with indicator)
          tooltip.style.left = '0'
          tooltip.style.right = 'auto'
        }
      })
    }
  }, [showTooltip])

  // If no agent run or no workflow steps, show placeholder: series of dots with first green (0203)
  if (!agentRun || workflowSteps.length === 0) {
    const placeholderSteps = getAgentWorkflowSteps('implementation')
    return (
      <div
        className={`active-work-status-indicator-wrapper ${showTooltip ? 'active-work-status-tooltip-visible' : ''}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          ref={indicatorRef}
          className="active-work-status-indicator"
          tabIndex={0}
          role="button"
          aria-label="Status: Unassigned"
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        >
          {placeholderSteps.map((step, index) => (
            <span
              key={step.id}
              className={`status-dot ${index === 0 ? 'status-dot-done' : 'status-dot-pending'}`}
              aria-label={index === 0 ? 'Started' : step.label}
            />
          ))}
        </div>
        {showTooltip && (
          <div
            ref={tooltipRef}
            className="active-work-status-tooltip"
            role="tooltip"
          >
            <div className="active-work-status-tooltip-header">
              <span className="active-work-status-tooltip-label">Status:</span>
              <span className="active-work-status-tooltip-value status-value-unassigned">
                Unassigned
              </span>
            </div>
            <div className="active-work-status-tooltip-description">
              No agent is currently working on this ticket.
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className={`active-work-status-indicator-wrapper ${showTooltip ? 'active-work-status-tooltip-visible' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        ref={indicatorRef}
        className="active-work-status-indicator"
        tabIndex={0}
        role="button"
        aria-label={`Status: ${workflowSteps.find(s => s.id === currentStepId)?.label || 'Unknown'}`}
        aria-describedby={showTooltip ? `status-tooltip-${agentRun.run_id}` : undefined}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      >
        {workflowSteps.map((step) => {
          const stepStatus = getStepStatus(step.id, currentStepId || 'preparing', workflowSteps)
          return (
            <span
              key={step.id}
              className={`status-dot status-dot-${stepStatus}`}
              aria-label={step.label}
            />
          )
        })}
      </div>
      {showTooltip && (
        <div
          ref={tooltipRef}
          id={`status-tooltip-${agentRun.run_id}`}
          className="active-work-status-tooltip active-work-status-timeline-tooltip"
          role="tooltip"
        >
          <div className="impl-agent-status-timeline" role="status">
            {workflowSteps.map((step, index) => {
              const stepStatus = getStepStatus(step.id, currentStepId || 'preparing', workflowSteps)
              const isLast = index === workflowSteps.length - 1
              const isFailed = currentStepId === 'failed' && step.id === 'completed'
              return (
                <React.Fragment key={step.id}>
                  <span
                    className={
                      isFailed
                        ? 'impl-status-failed'
                        : stepStatus === 'active'
                        ? 'impl-status-active'
                        : stepStatus === 'done'
                        ? 'impl-status-done'
                        : ''
                    }
                  >
                    {isFailed ? 'Failed' : step.label}
                  </span>
                  {!isLast && <span className="impl-status-arrow">→</span>}
                </React.Fragment>
              )
            })}
          </div>
          {currentStepId === 'failed' && failureInfo && (
            <div className="active-work-status-error-details" style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255, 255, 255, 0.2)' }}>
              {failureInfo.failure_type && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong style={{ fontSize: '0.85em', color: 'rgba(255, 255, 255, 0.9)' }}>Error Type:</strong>
                  <div style={{ fontSize: '0.85em', color: 'rgba(255, 255, 255, 0.8)', marginTop: '0.25rem' }}>
                    {failureInfo.failure_type}
                  </div>
                </div>
              )}
              {failureInfo.root_cause && (
                <div>
                  <strong style={{ fontSize: '0.85em', color: 'rgba(255, 255, 255, 0.9)' }}>Error Details:</strong>
                  <div 
                    style={{ 
                      fontSize: '0.85em', 
                      color: 'rgba(255, 255, 255, 0.8)', 
                      marginTop: '0.25rem',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxWidth: '400px',
                      maxHeight: '200px',
                      overflow: 'auto'
                    }}
                  >
                    {failureInfo.root_cause}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
