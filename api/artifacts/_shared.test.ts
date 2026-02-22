import { describe, it, expect } from 'vitest'
import {
  REQUIRED_IMPLEMENTATION_ARTIFACT_TYPES,
  getMissingRequiredImplementationArtifacts,
  extractArtifactTypeFromTitle,
  hasMissingArtifactExplanation,
  normalizeTicketId,
  createCanonicalTitle,
} from './_shared.js'
import type { ArtifactRowForCheck } from './_shared.js'

describe('REQUIRED_IMPLEMENTATION_ARTIFACT_TYPES', () => {
  it('contains exactly 8 artifact types', () => {
    expect(REQUIRED_IMPLEMENTATION_ARTIFACT_TYPES).toHaveLength(8)
  })

  it('contains all required types', () => {
    const types = REQUIRED_IMPLEMENTATION_ARTIFACT_TYPES
    expect(types).toContain('plan')
    expect(types).toContain('worklog')
    expect(types).toContain('changed-files')
    expect(types).toContain('decisions')
    expect(types).toContain('verification')
    expect(types).toContain('pm-review')
    expect(types).toContain('git-diff')
    expect(types).toContain('instructions-used')
  })
})

describe('extractArtifactTypeFromTitle', () => {
  it('extracts plan type', () => {
    expect(extractArtifactTypeFromTitle('Plan for ticket 0121')).toBe('plan')
    expect(extractArtifactTypeFromTitle('Plan for ticket HAL-0121')).toBe('plan')
  })

  it('extracts worklog type', () => {
    expect(extractArtifactTypeFromTitle('Worklog for ticket 0121')).toBe('worklog')
  })

  it('extracts changed-files type', () => {
    expect(extractArtifactTypeFromTitle('Changed Files for ticket 0121')).toBe('changed-files')
  })

  it('extracts decisions type', () => {
    expect(extractArtifactTypeFromTitle('Decisions for ticket 0121')).toBe('decisions')
  })

  it('extracts verification type', () => {
    expect(extractArtifactTypeFromTitle('Verification for ticket 0121')).toBe('verification')
  })

  it('extracts pm-review type', () => {
    expect(extractArtifactTypeFromTitle('PM Review for ticket 0121')).toBe('pm-review')
  })

  it('extracts git-diff type', () => {
    expect(extractArtifactTypeFromTitle('Git diff for ticket 0121')).toBe('git-diff')
    expect(extractArtifactTypeFromTitle('Git-diff for ticket 0121')).toBe('git-diff')
  })

  it('extracts instructions-used type', () => {
    expect(extractArtifactTypeFromTitle('Instructions Used for ticket 0121')).toBe('instructions-used')
  })

  it('extracts qa-report type', () => {
    expect(extractArtifactTypeFromTitle('QA report for ticket 0121')).toBe('qa-report')
  })

  it('extracts implementation-agent-note type', () => {
    expect(extractArtifactTypeFromTitle('Implementation agent note for ticket 0121')).toBe('implementation-agent-note')
    expect(extractArtifactTypeFromTitle('Note for implementation agent: 0121')).toBe('implementation-agent-note')
  })

  it('extracts missing-artifact-explanation type', () => {
    expect(extractArtifactTypeFromTitle('Missing Artifact Explanation')).toBe('missing-artifact-explanation')
    expect(extractArtifactTypeFromTitle('Missing Artifact Explanation for ticket 0121')).toBe('missing-artifact-explanation')
  })

  it('returns null for unknown titles', () => {
    expect(extractArtifactTypeFromTitle('Unknown title')).toBeNull()
    expect(extractArtifactTypeFromTitle('')).toBeNull()
  })

  it('handles case-insensitive matching', () => {
    expect(extractArtifactTypeFromTitle('PLAN FOR TICKET 0121')).toBe('plan')
    expect(extractArtifactTypeFromTitle('plan for ticket 0121')).toBe('plan')
  })
})

describe('getMissingRequiredImplementationArtifacts', () => {
  it('returns all types when no artifacts provided', () => {
    const missing = getMissingRequiredImplementationArtifacts([])
    expect(missing).toHaveLength(8)
    expect(missing).toEqual(Array.from(REQUIRED_IMPLEMENTATION_ARTIFACT_TYPES))
  })

  it('returns empty array when all artifacts present', () => {
    const artifacts: ArtifactRowForCheck[] = REQUIRED_IMPLEMENTATION_ARTIFACT_TYPES.map((type) => {
      // Map artifact types to their canonical title formats
      const titleMap: Record<string, string> = {
        'plan': 'Plan for ticket 0121',
        'worklog': 'Worklog for ticket 0121',
        'changed-files': 'Changed Files for ticket 0121',
        'decisions': 'Decisions for ticket 0121',
        'verification': 'Verification for ticket 0121',
        'pm-review': 'PM Review for ticket 0121',
        'git-diff': 'Git diff for ticket 0121',
        'instructions-used': 'Instructions Used for ticket 0121',
      }
      return {
        agent_type: 'implementation',
        title: titleMap[type] || `${type} for ticket 0121`,
        body_md: 'x'.repeat(100), // Substantive content
      }
    })
    const missing = getMissingRequiredImplementationArtifacts(artifacts)
    expect(missing).toHaveLength(0)
  })

  it('filters out non-implementation artifacts', () => {
    const artifacts: ArtifactRowForCheck[] = [
      {
        agent_type: 'qa',
        title: 'Plan for ticket 0121',
        body_md: 'x'.repeat(100),
      },
    ]
    const missing = getMissingRequiredImplementationArtifacts(artifacts)
    expect(missing).toContain('plan')
  })

  it('filters out artifacts with non-substantive content', () => {
    const artifacts: ArtifactRowForCheck[] = [
      {
        agent_type: 'implementation',
        title: 'Plan for ticket 0121',
        body_md: 'x', // Too short
      },
    ]
    const missing = getMissingRequiredImplementationArtifacts(artifacts)
    expect(missing).toContain('plan')
  })

  it('filters out artifacts with placeholder content', () => {
    const artifacts: ArtifactRowForCheck[] = [
      {
        agent_type: 'implementation',
        title: 'Plan for ticket 0121',
        body_md: '(none)',
      },
    ]
    const missing = getMissingRequiredImplementationArtifacts(artifacts)
    expect(missing).toContain('plan')
  })
})

describe('normalizeTicketId', () => {
  it('normalizes display IDs by removing prefix and zero-padding', () => {
    expect(normalizeTicketId('HAL-0123')).toBe('0123')
    expect(normalizeTicketId('TICKET-1')).toBe('0001')
  })

  it('zero-pads numeric IDs to 4 digits', () => {
    expect(normalizeTicketId('123')).toBe('0123')
    expect(normalizeTicketId('1')).toBe('0001')
  })

  it('preserves zero-padded IDs', () => {
    expect(normalizeTicketId('0123')).toBe('0123')
    expect(normalizeTicketId('0001')).toBe('0001')
  })

  it('handles all zeros', () => {
    expect(normalizeTicketId('0000')).toBe('0000')
  })
})

describe('createCanonicalTitle', () => {
  it('creates canonical title with artifact type and normalized ticket ID', () => {
    expect(createCanonicalTitle('plan', '123')).toBe('Plan for ticket 0123') // Normalized to 4 digits
    expect(createCanonicalTitle('worklog', 'HAL-0123')).toBe('Worklog for ticket 0123') // Prefix removed
  })

  it('handles different artifact types', () => {
    expect(createCanonicalTitle('changed-files', '123')).toBe('Changed Files for ticket 0123')
    expect(createCanonicalTitle('pm-review', '123')).toBe('PM Review for ticket 0123')
  })

  it('handles missing-artifact-explanation special case', () => {
    expect(createCanonicalTitle('missing-artifact-explanation', '123')).toBe('Missing Artifact Explanation')
  })
})

describe('hasMissingArtifactExplanation', () => {
  it('returns true when explanation artifact exists', () => {
    const artifacts: ArtifactRowForCheck[] = [
      {
        agent_type: 'implementation',
        title: 'Missing Artifact Explanation',
        body_md: 'x'.repeat(100),
      },
    ]
    expect(hasMissingArtifactExplanation(artifacts)).toBe(true)
  })

  it('returns false when no explanation artifact', () => {
    const artifacts: ArtifactRowForCheck[] = [
      {
        agent_type: 'implementation',
        title: 'Plan for ticket 123',
        body_md: 'x'.repeat(100),
      },
    ]
    expect(hasMissingArtifactExplanation(artifacts)).toBe(false)
  })

  it('returns false for empty artifacts', () => {
    expect(hasMissingArtifactExplanation([])).toBe(false)
  })
})
