import { describe, it, expect } from 'vitest'
import {
  BOOTSTRAP_STEPS,
  STEP_DEFINITIONS,
  getNextStep,
  allStepsCompleted,
  addLogEntry,
  getOrCreateStepRecord,
  updateStepRecord,
} from './_shared.js'
import type { BootstrapStepRecord, BootstrapLogEntry, BootstrapRun } from './_shared.js'

describe('BOOTSTRAP_STEPS', () => {
  it('contains all required steps', () => {
    expect(BOOTSTRAP_STEPS).toContain('ensure_repo_initialized')
    expect(BOOTSTRAP_STEPS).toContain('create_supabase_project')
    expect(BOOTSTRAP_STEPS).toContain('create_vercel_project')
    expect(BOOTSTRAP_STEPS).toContain('verify_preview')
  })

  it('has exactly 4 steps', () => {
    expect(BOOTSTRAP_STEPS).toHaveLength(4)
  })
})

describe('STEP_DEFINITIONS', () => {
  it('has definitions for all steps', () => {
    for (const step of BOOTSTRAP_STEPS) {
      expect(STEP_DEFINITIONS[step]).toBeDefined()
      expect(STEP_DEFINITIONS[step].id).toBe(step)
      expect(STEP_DEFINITIONS[step].name).toBeDefined()
      expect(STEP_DEFINITIONS[step].description).toBeDefined()
    }
  })
})

describe('getNextStep', () => {
  it('returns first step when history is empty', () => {
    const next = getNextStep([])
    expect(next).toBe('ensure_repo_initialized')
  })

  it('returns next step after completed step', () => {
    const history: BootstrapStepRecord[] = [
      {
        step: 'ensure_repo_initialized',
        status: 'succeeded',
        started_at: '2024-01-01T00:00:00Z',
        completed_at: '2024-01-01T00:01:00Z',
        error_summary: null,
        error_details: null,
      },
    ]
    const next = getNextStep(history)
    expect(next).toBe('create_supabase_project')
  })

  it('returns null when all steps completed', () => {
    const history: BootstrapStepRecord[] = BOOTSTRAP_STEPS.map((step) => ({
      step,
      status: 'succeeded',
      started_at: '2024-01-01T00:00:00Z',
      completed_at: '2024-01-01T00:01:00Z',
      error_summary: null,
      error_details: null,
    }))
    const next = getNextStep(history)
    expect(next).toBeNull()
  })

  it('returns failed step for retry', () => {
    const history: BootstrapStepRecord[] = [
      {
        step: 'ensure_repo_initialized',
        status: 'failed',
        started_at: '2024-01-01T00:00:00Z',
        completed_at: '2024-01-01T00:01:00Z',
        error_summary: 'Error',
        error_details: null,
      },
    ]
    const next = getNextStep(history)
    expect(next).toBe('ensure_repo_initialized') // Returns failed step for retry
  })
})

describe('allStepsCompleted', () => {
  it('returns false when no steps completed', () => {
    expect(allStepsCompleted([])).toBe(false)
  })

  it('returns false when some steps completed', () => {
    const history: BootstrapStepRecord[] = [
      {
        step: 'ensure_repo_initialized',
        status: 'succeeded',
        started_at: '2024-01-01T00:00:00Z',
        completed_at: '2024-01-01T00:01:00Z',
        error_summary: null,
        error_details: null,
      },
    ]
    expect(allStepsCompleted(history)).toBe(false)
  })

  it('returns true when all steps completed', () => {
    const history: BootstrapStepRecord[] = BOOTSTRAP_STEPS.map((step) => ({
      step,
      status: 'succeeded',
      started_at: '2024-01-01T00:00:00Z',
      completed_at: '2024-01-01T00:01:00Z',
      error_summary: null,
      error_details: null,
    }))
    expect(allStepsCompleted(history)).toBe(true)
  })

  it('returns false when a step failed', () => {
    const history: BootstrapStepRecord[] = [
      {
        step: 'ensure_repo_initialized',
        status: 'failed',
        started_at: '2024-01-01T00:00:00Z',
        completed_at: '2024-01-01T00:01:00Z',
        error_summary: 'Error',
        error_details: null,
      },
      ...BOOTSTRAP_STEPS.slice(1).map((step) => ({
        step,
        status: 'succeeded' as const,
        started_at: '2024-01-01T00:00:00Z',
        completed_at: '2024-01-01T00:01:00Z',
        error_summary: null,
        error_details: null,
      })),
    ]
    expect(allStepsCompleted(history)).toBe(false)
  })
})

describe('addLogEntry', () => {
  it('adds log entry to logs array', () => {
    const logs: BootstrapLogEntry[] = []
    const updated = addLogEntry(logs, 'info', 'Test message')
    expect(updated).toHaveLength(1)
    expect(updated[0].level).toBe('info')
    expect(updated[0].message).toBe('Test message')
    expect(updated[0].timestamp).toBeDefined()
  })

  it('adds multiple log entries', () => {
    let logs: BootstrapLogEntry[] = []
    logs = addLogEntry(logs, 'info', 'Message 1')
    logs = addLogEntry(logs, 'error', 'Message 2')
    expect(logs).toHaveLength(2)
    expect(logs[0].level).toBe('info')
    expect(logs[1].level).toBe('error')
  })

  it('preserves existing logs', () => {
    const logs: BootstrapLogEntry[] = [
      {
        timestamp: '2024-01-01T00:00:00Z',
        level: 'info',
        message: 'Existing',
      },
    ]
    const updated = addLogEntry(logs, 'error', 'New')
    expect(updated).toHaveLength(2)
    expect(updated[0].message).toBe('Existing')
    expect(updated[1].message).toBe('New')
  })
})

describe('getOrCreateStepRecord', () => {
  it('creates new step record when not found', () => {
    const history: BootstrapStepRecord[] = []
    const record = getOrCreateStepRecord(history, 'ensure_repo_initialized')
    expect(record.step).toBe('ensure_repo_initialized')
    expect(record.status).toBe('pending')
  })

  it('returns existing step record when found', () => {
    const history: BootstrapStepRecord[] = [
      {
        step: 'ensure_repo_initialized',
        status: 'running',
        started_at: '2024-01-01T00:00:00Z',
        completed_at: null,
        error_summary: null,
        error_details: null,
      },
    ]
    const record = getOrCreateStepRecord(history, 'ensure_repo_initialized')
    expect(record.status).toBe('running')
    expect(record.started_at).toBe('2024-01-01T00:00:00Z')
  })
})

describe('updateStepRecord', () => {
  it('updates existing step record', () => {
    const history: BootstrapStepRecord[] = [
      {
        step: 'ensure_repo_initialized',
        status: 'pending',
        started_at: null,
        completed_at: null,
        error_summary: null,
        error_details: null,
      },
    ]
    const updated = updateStepRecord(history, 'ensure_repo_initialized', {
      status: 'succeeded',
      completed_at: '2024-01-01T00:01:00Z',
    })
    expect(updated[0].status).toBe('succeeded')
    expect(updated[0].completed_at).toBe('2024-01-01T00:01:00Z')
  })

  it('creates new record when step not found', () => {
    const history: BootstrapStepRecord[] = []
    const updated = updateStepRecord(history, 'ensure_repo_initialized', {
      status: 'running',
      started_at: '2024-01-01T00:00:00Z',
    })
    expect(updated).toHaveLength(1)
    expect(updated[0].step).toBe('ensure_repo_initialized')
    expect(updated[0].status).toBe('running')
  })
})
