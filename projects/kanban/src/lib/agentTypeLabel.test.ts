import { describe, it, expect } from 'vitest'
import { agentTypeToLabel } from './agentTypeLabel'

describe('agentTypeToLabel', () => {
  it('returns "Implementation" for implementation', () => {
    expect(agentTypeToLabel('implementation')).toBe('Implementation')
    expect(agentTypeToLabel('IMPLEMENTATION')).toBe('Implementation')
    expect(agentTypeToLabel('Implementation')).toBe('Implementation')
  })

  it('returns "QA" for qa', () => {
    expect(agentTypeToLabel('qa')).toBe('QA')
    expect(agentTypeToLabel('QA')).toBe('QA')
  })

  it('returns "Process Review" for process-review variants', () => {
    expect(agentTypeToLabel('process-review')).toBe('Process Review')
    expect(agentTypeToLabel('process_review')).toBe('Process Review')
    expect(agentTypeToLabel('process review')).toBe('Process Review')
  })

  it('returns "Project Manager" for project-manager variants', () => {
    expect(agentTypeToLabel('project-manager')).toBe('Project Manager')
    expect(agentTypeToLabel('project_manager')).toBe('Project Manager')
    expect(agentTypeToLabel('project manager')).toBe('Project Manager')
  })

  it('returns null for null', () => {
    expect(agentTypeToLabel(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(agentTypeToLabel(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(agentTypeToLabel('')).toBeNull()
  })

  it('returns null for unknown agent type', () => {
    expect(agentTypeToLabel('unknown')).toBeNull()
    expect(agentTypeToLabel('invalid')).toBeNull()
  })

  it('trims whitespace', () => {
    expect(agentTypeToLabel('  implementation  ')).toBe('Implementation')
  })
})
