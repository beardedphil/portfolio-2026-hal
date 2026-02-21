/**
 * Relevance scoring algorithm for artifact selection in Context Bundles.
 * Implements deterministic scoring based on keyword/tag/path overlap, recency, and pinned boosts.
 */

import type { DistilledArtifact } from './_distill.js'

export interface ArtifactCandidate {
  artifact_id: string
  title: string
  agent_type: string
  created_at: string
  title_lower?: string
  body_md?: string
  distilled?: DistilledArtifact
  pinned?: boolean
}

export interface ScoredArtifact {
  artifact_id: string
  title: string
  agent_type: string
  created_at: string
  score: number
  reasons: string[]
  pinned: boolean
  selected: boolean
  exclusion_reason?: string
}

export interface ScoringOptions {
  query?: string // Search query (optional)
  role?: string // Agent role (e.g., 'implementation-agent')
  maxArtifacts?: number // Maximum number of artifacts to select (budget)
  pinnedBoost?: number // Score boost for pinned artifacts (default: 100)
  recencyDecayDays?: number // Days for recency decay (default: 30)
  keywordMatchWeight?: number // Weight for keyword matches (default: 10)
  tagMatchWeight?: number // Weight for tag matches (default: 15)
  pathMatchWeight?: number // Weight for path matches (default: 20)
}

/**
 * Calculate relevance score for an artifact candidate.
 * Score components:
 * 1. Keyword overlap (from distilled keywords or extracted from title/body)
 * 2. Tag overlap (from artifact metadata or extracted)
 * 3. Path overlap (if artifact references file paths)
 * 4. Recency boost (newer artifacts score higher)
 * 5. Pinned boost (pinned artifacts get a large boost)
 */
export function scoreArtifact(
  candidate: ArtifactCandidate,
  options: ScoringOptions = {}
): ScoredArtifact {
  const {
    query = '',
    role = '',
    pinnedBoost = 100,
    recencyDecayDays = 30,
    keywordMatchWeight = 10,
    tagMatchWeight = 15,
    pathMatchWeight = 20,
  } = options

  const reasons: string[] = []
  let score = 0

  // Base score from pinned status
  const isPinned = candidate.pinned === true
  if (isPinned) {
    score += pinnedBoost
    reasons.push(`Pinned (+${pinnedBoost})`)
  }

  // Extract searchable text
  const searchableText = [
    candidate.title || '',
    candidate.title_lower || candidate.title?.toLowerCase() || '',
    candidate.body_md || '',
    ...(candidate.distilled?.keywords || []),
    ...(candidate.distilled?.hard_facts || []),
    candidate.distilled?.summary || '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  const queryLower = query.toLowerCase()
  const roleLower = role.toLowerCase()

  // Keyword overlap scoring
  if (queryLower && searchableText) {
    const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2)
    let keywordMatches = 0

    for (const word of queryWords) {
      // Count occurrences in searchable text
      const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
      const matches = (searchableText.match(regex) || []).length
      keywordMatches += matches
    }

    if (keywordMatches > 0) {
      const keywordScore = Math.min(keywordMatches * keywordMatchWeight, 50) // Cap at 50
      score += keywordScore
      reasons.push(`Keyword overlap: ${keywordMatches} matches (+${keywordScore.toFixed(1)})`)
    }
  }

  // Tag overlap (check if artifact type or keywords match role/query)
  if (roleLower) {
    const agentTypeLower = candidate.agent_type?.toLowerCase() || ''
    if (agentTypeLower.includes(roleLower) || roleLower.includes(agentTypeLower)) {
      const tagScore = tagMatchWeight
      score += tagScore
      reasons.push(`Agent type match: ${candidate.agent_type} (+${tagScore})`)
    }
  }

  // Path overlap (check if artifact references file paths matching query)
  if (queryLower && searchableText) {
    // Look for file path patterns (e.g., "src/foo.ts", "./bar.js")
    const pathPattern = /(?:^|\s)(?:\.\/|\.\.\/)?[\w\-./]+\.(?:ts|tsx|js|jsx|mdc|md|json|sql|py|go|rs|java|rb|php|yml|yaml)(?:\s|$)/gi
    const paths = searchableText.match(pathPattern) || []
    
    if (paths.length > 0) {
      // Check if query matches any path
      const queryMatchesPath = paths.some((path) => path.toLowerCase().includes(queryLower))
      if (queryMatchesPath) {
        const pathScore = pathMatchWeight
        score += pathScore
        reasons.push(`Path match: found ${paths.length} path(s) (+${pathScore})`)
      }
    }
  }

  // Recency boost (newer artifacts score higher)
  if (candidate.created_at) {
    const createdDate = new Date(candidate.created_at)
    const now = new Date()
    const daysSinceCreation = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
    
    if (daysSinceCreation >= 0 && daysSinceCreation <= recencyDecayDays) {
      // Linear decay: newer = higher score
      const recencyScore = Math.max(0, (recencyDecayDays - daysSinceCreation) / recencyDecayDays * 20) // Max 20 points
      score += recencyScore
      if (recencyScore > 0) {
        reasons.push(`Recency: ${Math.round(daysSinceCreation)} days ago (+${recencyScore.toFixed(1)})`)
      }
    }
  }

  // Ensure score is non-negative
  score = Math.max(0, score)

  // If no reasons, add a base reason
  if (reasons.length === 0) {
    reasons.push('Base score')
  }

  return {
    artifact_id: candidate.artifact_id,
    title: candidate.title || 'Untitled',
    agent_type: candidate.agent_type || 'unknown',
    created_at: candidate.created_at || '',
    score: Math.round(score * 100) / 100, // Round to 2 decimal places for determinism
    reasons,
    pinned: isPinned,
    selected: false, // Will be set by selection logic
  }
}

/**
 * Score and rank all artifact candidates, then select top N based on budget.
 * Returns deterministic results: same inputs = same outputs.
 */
export function selectArtifacts(
  candidates: ArtifactCandidate[],
  options: ScoringOptions = {}
): ScoredArtifact[] {
  const { maxArtifacts = 10 } = options

  // Score all candidates
  const scored = candidates.map((candidate) => scoreArtifact(candidate, options))

  // Sort by score (descending), then by created_at (descending) for determinism
  scored.sort((a, b) => {
    if (Math.abs(a.score - b.score) > 0.01) {
      // Scores are different enough to matter
      return b.score - a.score
    }
    // Tie-breaker: newer artifacts first
    const aDate = new Date(a.created_at).getTime()
    const bDate = new Date(b.created_at).getTime()
    return bDate - aDate
  })

  // Select top N, but always include pinned artifacts
  const pinnedArtifacts = scored.filter((a) => a.pinned)
  const unpinnedArtifacts = scored.filter((a) => !a.pinned)

  // Always include all pinned artifacts
  const selected: ScoredArtifact[] = [...pinnedArtifacts]

  // Fill remaining slots with top unpinned artifacts
  const remainingSlots = Math.max(0, maxArtifacts - selected.length)
  selected.push(...unpinnedArtifacts.slice(0, remainingSlots))

  // Mark selected artifacts
  const selectedIds = new Set(selected.map((a) => a.artifact_id))
  scored.forEach((artifact) => {
    artifact.selected = selectedIds.has(artifact.artifact_id)
    if (!artifact.selected) {
      // Determine exclusion reason
      if (artifact.pinned) {
        artifact.exclusion_reason = 'Error: Pinned artifact not selected (should not happen)'
      } else if (artifact.score < 1) {
        artifact.exclusion_reason = 'Low score (< 1.0)'
      } else {
        artifact.exclusion_reason = `Budget pressure: Top ${maxArtifacts} selected`
      }
    }
  })

  return scored
}
