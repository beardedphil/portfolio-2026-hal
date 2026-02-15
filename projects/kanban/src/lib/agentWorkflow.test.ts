import { describe, it, expect } from 'vitest'
import {
  getAgentWorkflowSteps,
  mapStatusToStepId,
  getStepStatus,
} from './agentWorkflow'

describe('getAgentWorkflowSteps', () => {
  it('returns QA workflow steps for qa agent type', () => {
    const steps = getAgentWorkflowSteps('qa')
    expect(steps).toEqual([
      { id: 'preparing', label: 'Preparing' },
      { id: 'fetching_ticket', label: 'Fetching ticket' },
      { id: 'fetching_branch', label: 'Finding branch' },
      { id: 'launching', label: 'Launching QA' },
      { id: 'polling', label: 'Reviewing' },
      { id: 'generating_report', label: 'Generating report' },
      { id: 'merging', label: 'Merging' },
      { id: 'moving_ticket', label: 'Moving ticket' },
      { id: 'completed', label: 'Completed' },
    ])
  })

  it('returns implementation workflow steps for implementation agent type', () => {
    const steps = getAgentWorkflowSteps('implementation')
    expect(steps).toEqual([
      { id: 'preparing', label: 'Preparing' },
      { id: 'fetching_ticket', label: 'Fetching ticket' },
      { id: 'resolving_repo', label: 'Resolving repo' },
      { id: 'launching', label: 'Launching agent' },
      { id: 'polling', label: 'Running' },
      { id: 'completed', label: 'Completed' },
    ])
  })

  it('returns empty array for null agent type', () => {
    const steps = getAgentWorkflowSteps(null)
    expect(steps).toEqual([])
  })
})

describe('mapStatusToStepId', () => {
  describe('for QA agent type', () => {
    it('maps "created" status to "fetching_ticket"', () => {
      expect(mapStatusToStepId('created', 'qa')).toBe('fetching_ticket')
    })

    it('maps "launching" status to "launching"', () => {
      expect(mapStatusToStepId('launching', 'qa')).toBe('launching')
    })

    it('maps "polling" status to "polling"', () => {
      expect(mapStatusToStepId('polling', 'qa')).toBe('polling')
    })

    it('maps "finished" status to "completed"', () => {
      expect(mapStatusToStepId('finished', 'qa')).toBe('completed')
    })

    it('maps "failed" status to "failed"', () => {
      expect(mapStatusToStepId('failed', 'qa')).toBe('failed')
    })

    it('maps unknown status to "preparing"', () => {
      expect(mapStatusToStepId('unknown', 'qa')).toBe('preparing')
    })
  })

  describe('for implementation agent type', () => {
    it('maps "created" status to "fetching_ticket"', () => {
      expect(mapStatusToStepId('created', 'implementation')).toBe('fetching_ticket')
    })

    it('maps "launching" status to "launching"', () => {
      expect(mapStatusToStepId('launching', 'implementation')).toBe('launching')
    })

    it('maps "polling" status to "polling"', () => {
      expect(mapStatusToStepId('polling', 'implementation')).toBe('polling')
    })

    it('maps "finished" status to "completed"', () => {
      expect(mapStatusToStepId('finished', 'implementation')).toBe('completed')
    })

    it('maps "failed" status to "failed"', () => {
      expect(mapStatusToStepId('failed', 'implementation')).toBe('failed')
    })

    it('maps unknown status to "preparing"', () => {
      expect(mapStatusToStepId('unknown', 'implementation')).toBe('preparing')
    })
  })

  describe('for null agent type', () => {
    it('maps any status to "preparing"', () => {
      expect(mapStatusToStepId('created', null)).toBe('preparing')
      expect(mapStatusToStepId('launching', null)).toBe('preparing')
      expect(mapStatusToStepId('polling', null)).toBe('preparing')
      expect(mapStatusToStepId('finished', null)).toBe('completed')
      expect(mapStatusToStepId('failed', null)).toBe('failed')
    })
  })
})

describe('getStepStatus', () => {
  const qaSteps = getAgentWorkflowSteps('qa')
  const implSteps = getAgentWorkflowSteps('implementation')

  describe('for normal workflow progression', () => {
    it('returns "pending" for steps after current step', () => {
      expect(getStepStatus('polling', 'launching', qaSteps)).toBe('pending')
      expect(getStepStatus('completed', 'polling', implSteps)).toBe('pending')
    })

    it('returns "active" for current step', () => {
      expect(getStepStatus('launching', 'launching', qaSteps)).toBe('active')
      expect(getStepStatus('polling', 'polling', implSteps)).toBe('active')
    })

    it('returns "done" for steps before current step', () => {
      expect(getStepStatus('preparing', 'launching', qaSteps)).toBe('done')
      expect(getStepStatus('fetching_ticket', 'polling', implSteps)).toBe('done')
    })
  })

  describe('for failed status', () => {
    it('returns "done" for all steps before completed step', () => {
      expect(getStepStatus('preparing', 'failed', qaSteps)).toBe('done')
      expect(getStepStatus('fetching_ticket', 'failed', qaSteps)).toBe('done')
      expect(getStepStatus('fetching_branch', 'failed', qaSteps)).toBe('done')
      expect(getStepStatus('launching', 'failed', qaSteps)).toBe('done')
      expect(getStepStatus('polling', 'failed', qaSteps)).toBe('done')
      expect(getStepStatus('generating_report', 'failed', qaSteps)).toBe('done')
      expect(getStepStatus('merging', 'failed', qaSteps)).toBe('done')
      expect(getStepStatus('moving_ticket', 'failed', qaSteps)).toBe('done')
    })

    it('returns "active" for completed step when failed', () => {
      expect(getStepStatus('completed', 'failed', qaSteps)).toBe('active')
      expect(getStepStatus('completed', 'failed', implSteps)).toBe('active')
    })

    it('returns "pending" for steps after completed step when failed', () => {
      // For QA, there are no steps after completed, but test the logic
      // For implementation, there are no steps after completed either
      // This test ensures the logic handles edge cases
      const stepsWithExtra = [
        ...qaSteps,
        { id: 'post_completed', label: 'Post Completed' },
      ]
      expect(getStepStatus('post_completed', 'failed', stepsWithExtra)).toBe('pending')
    })
  })

  describe('edge cases', () => {
    it('returns "pending" when current step is not found in workflow', () => {
      expect(getStepStatus('preparing', 'unknown_step', qaSteps)).toBe('pending')
    })

    it('returns "pending" when step is not found in workflow', () => {
      expect(getStepStatus('unknown_step', 'launching', qaSteps)).toBe('pending')
    })

    it('handles first step correctly', () => {
      expect(getStepStatus('preparing', 'preparing', qaSteps)).toBe('active')
      expect(getStepStatus('preparing', 'fetching_ticket', qaSteps)).toBe('done')
    })

    it('handles last step correctly', () => {
      expect(getStepStatus('completed', 'completed', qaSteps)).toBe('active')
      expect(getStepStatus('completed', 'moving_ticket', qaSteps)).toBe('pending')
    })
  })

  describe('for implementation workflow', () => {
    it('correctly maps status progression', () => {
      expect(getStepStatus('preparing', 'fetching_ticket', implSteps)).toBe('done')
      expect(getStepStatus('fetching_ticket', 'fetching_ticket', implSteps)).toBe('active')
      expect(getStepStatus('resolving_repo', 'resolving_repo', implSteps)).toBe('active')
      expect(getStepStatus('launching', 'launching', implSteps)).toBe('active')
      expect(getStepStatus('polling', 'polling', implSteps)).toBe('active')
      expect(getStepStatus('completed', 'completed', implSteps)).toBe('active')
    })
  })

  describe('for QA workflow', () => {
    it('correctly maps status progression', () => {
      expect(getStepStatus('preparing', 'fetching_ticket', qaSteps)).toBe('done')
      expect(getStepStatus('fetching_ticket', 'fetching_ticket', qaSteps)).toBe('active')
      expect(getStepStatus('fetching_branch', 'fetching_branch', qaSteps)).toBe('active')
      expect(getStepStatus('launching', 'launching', qaSteps)).toBe('active')
      expect(getStepStatus('polling', 'polling', qaSteps)).toBe('active')
      expect(getStepStatus('generating_report', 'generating_report', qaSteps)).toBe('active')
      expect(getStepStatus('merging', 'merging', qaSteps)).toBe('active')
      expect(getStepStatus('moving_ticket', 'moving_ticket', qaSteps)).toBe('active')
      expect(getStepStatus('completed', 'completed', qaSteps)).toBe('active')
    })
  })
})
