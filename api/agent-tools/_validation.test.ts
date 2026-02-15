import { describe, it, expect } from 'vitest'
import {
  validateImplementationArtifactContent,
  validateQaArtifactContent,
} from './_validation.js'

describe('validateImplementationArtifactContent', () => {
  it('should return valid for substantial content', () => {
    const body_md = 'This is a substantial artifact with enough content to pass validation. It contains real information and details.'
    const title = 'Plan for ticket 123'
    
    const result = validateImplementationArtifactContent(body_md, title)
    
    expect(result.valid).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('should return invalid with clear error for empty body', () => {
    const body_md = ''
    const title = 'Plan for ticket 123'
    
    const result = validateImplementationArtifactContent(body_md, title)
    
    expect(result.valid).toBe(false)
    expect(result.reason).toBeDefined()
    expect(result.reason).toContain('Artifact body')
  })

  it('should return invalid with clear error for placeholder content', () => {
    const body_md = '# Plan for ticket 123\n\nTODO'
    const title = 'Plan for ticket 123'
    
    const result = validateImplementationArtifactContent(body_md, title)
    
    expect(result.valid).toBe(false)
    expect(result.reason).toBeDefined()
    expect(result.reason).toContain('Artifact body')
  })

  it('should return invalid with clear error for title-only content', () => {
    const body_md = '# Plan for ticket 123'
    const title = 'Plan for ticket 123'
    
    const result = validateImplementationArtifactContent(body_md, title)
    
    expect(result.valid).toBe(false)
    expect(result.reason).toBeDefined()
  })
})

describe('validateQaArtifactContent', () => {
  it('should return valid for substantial QA report content', () => {
    const body_md = `# QA Report for ticket 123

## Code Review
- All tests pass
- Code follows style guidelines

## Build Verification
- Build succeeds without errors

## Verdict
PASS`
    const title = 'QA report for ticket 123'
    
    const result = validateQaArtifactContent(body_md, title)
    
    expect(result.valid).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('should return invalid with clear error for empty body', () => {
    const body_md = ''
    const title = 'QA report for ticket 123'
    
    const result = validateQaArtifactContent(body_md, title)
    
    expect(result.valid).toBe(false)
    expect(result.reason).toBeDefined()
    expect(result.reason).toContain('Artifact body')
  })

  it('should return invalid with clear error for placeholder content', () => {
    const body_md = '# QA Report\n\nTODO'
    const title = 'QA report for ticket 123'
    
    const result = validateQaArtifactContent(body_md, title)
    
    expect(result.valid).toBe(false)
    expect(result.reason).toBeDefined()
    expect(result.reason).toContain('Artifact body')
  })
})
