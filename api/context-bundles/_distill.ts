/**
 * Core distillation logic for converting raw artifacts into distilled summaries.
 * Uses OpenAI to extract summary, hard_facts, and keywords from artifact content.
 */

import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'

export interface DistilledArtifact {
  summary: string
  hard_facts: string[]
  keywords: string[]
}

export interface DistillationResult {
  success: boolean
  distilled?: DistilledArtifact
  error?: string
}

/**
 * Distills a raw artifact into a structured summary with summary, hard_facts, and keywords.
 * 
 * @param artifactTitle - The title of the artifact
 * @param artifactBody - The markdown body content of the artifact
 * @param artifactId - The artifact ID for error tracking
 * @returns Distillation result with distilled content or error
 */
export async function distillArtifact(
  artifactTitle: string,
  artifactBody: string | null | undefined,
  artifactId: string
): Promise<DistillationResult> {
  const openaiApiKey = process.env.OPENAI_API_KEY?.trim()
  if (!openaiApiKey) {
    return {
      success: false,
      error: 'OpenAI API key not configured. Set OPENAI_API_KEY in environment variables.',
    }
  }

  // Handle empty or null artifact body
  const body = artifactBody || ''
  if (!body.trim()) {
    return {
      success: false,
      error: 'Artifact body is empty or missing',
    }
  }

  const openai = createOpenAI({ apiKey: openaiApiKey })
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini'

  try {
    // Truncate body if too long (to avoid token limits)
    const maxBodyLength = 50000 // ~12.5k tokens for gpt-4o-mini
    const truncatedBody = body.length > maxBodyLength 
      ? body.substring(0, maxBodyLength) + '\n\n[Content truncated due to length]'
      : body

    const prompt = `You are a technical documentation distiller. Your task is to extract structured information from an artifact.

Artifact Title: ${artifactTitle}
Artifact ID: ${artifactId}

Artifact Content:
${truncatedBody}

Extract the following information and return it as valid JSON:

1. **summary**: A concise 2-4 sentence summary of the artifact's main purpose and content. Focus on what the artifact describes or documents.

2. **hard_facts**: An array of specific, verifiable facts extracted from the artifact. Each fact should be:
   - Concrete and specific (not vague)
   - Verifiable (can be checked against the source)
   - Important (not trivial details)
   - Written as a complete sentence or short phrase
   Include 3-10 hard facts, depending on the artifact's content.

3. **keywords**: An array of 5-15 relevant keywords or key phrases that would help someone find this artifact. Include:
   - Technical terms
   - Feature names
   - Component names
   - Process names
   - Important concepts

Return ONLY valid JSON in this exact format (no markdown, no code fences, no explanation):
{
  "summary": "Brief summary here",
  "hard_facts": ["Fact 1", "Fact 2", "Fact 3"],
  "keywords": ["keyword1", "keyword2", "keyword3"]
}`

    const result = await generateText({
      model: openai(model),
      prompt,
      temperature: 0.3, // Lower temperature for more consistent extraction
      maxTokens: 2000,
    })

    const text = result.text.trim()

    // Try to extract JSON from the response
    let jsonText = text
    
    // Remove markdown code fences if present
    jsonText = jsonText.replace(/^```(?:json)?\s*/gm, '').replace(/\s*```$/gm, '').trim()
    
    // Try to find JSON object in the text
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      jsonText = jsonMatch[0]
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(jsonText)
    } catch (parseError) {
      // If JSON parsing fails, try to extract fields manually
      console.warn(`[distill] Failed to parse JSON for artifact ${artifactId}, attempting fallback extraction`)
      return extractFallbackDistillation(text, artifactTitle, artifactId)
    }

    // Validate and normalize the parsed result
    if (typeof parsed !== 'object' || parsed === null) {
      return {
        success: false,
        error: 'Invalid distillation result: expected object',
      }
    }

    const resultObj = parsed as Record<string, unknown>

    // Extract and validate fields
    const summary = typeof resultObj.summary === 'string' ? resultObj.summary.trim() : ''
    const hardFacts = Array.isArray(resultObj.hard_facts)
      ? resultObj.hard_facts
          .map((f) => (typeof f === 'string' ? f.trim() : String(f).trim()))
          .filter((f) => f.length > 0)
      : []
    const keywords = Array.isArray(resultObj.keywords)
      ? resultObj.keywords
          .map((k) => (typeof k === 'string' ? k.trim() : String(k).trim()))
          .filter((k) => k.length > 0)
      : []

    if (!summary) {
      return {
        success: false,
        error: 'Distillation failed: summary is missing or empty',
      }
    }

    return {
      success: true,
      distilled: {
        summary,
        hard_facts: hardFacts,
        keywords,
      },
    }
  } catch (error) {
    console.error(`[distill] Error distilling artifact ${artifactId}:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during distillation',
    }
  }
}

/**
 * Fallback extraction when JSON parsing fails.
 * Attempts to extract fields using regex patterns.
 */
function extractFallbackDistillation(
  text: string,
  artifactTitle: string,
  artifactId: string
): DistillationResult {
  // Try to extract summary (look for "summary" field or first paragraph)
  const summaryMatch = text.match(/"summary"\s*:\s*"([^"]+)"/i) || 
                       text.match(/summary[:\-]\s*([^\n]+)/i) ||
                       text.match(/^([^"}\n]+)/)
  const summary = summaryMatch ? summaryMatch[1].trim() : `Summary of ${artifactTitle}`

  // Try to extract hard_facts array
  const factsMatch = text.match(/"hard_facts"\s*:\s*\[([^\]]+)\]/is)
  let hardFacts: string[] = []
  if (factsMatch) {
    const factsText = factsMatch[1]
    hardFacts = factsText
      .split(',')
      .map((f) => f.trim().replace(/^["']|["']$/g, ''))
      .filter((f) => f.length > 0)
  }
  if (hardFacts.length === 0) {
    // Fallback: extract bullet points or numbered items
    const bulletMatches = text.match(/[-*•]\s*([^\n]+)/g)
    if (bulletMatches) {
      hardFacts = bulletMatches.map((m) => m.replace(/^[-*•]\s*/, '').trim()).slice(0, 5)
    }
  }

  // Try to extract keywords array
  const keywordsMatch = text.match(/"keywords"\s*:\s*\[([^\]]+)\]/is)
  let keywords: string[] = []
  if (keywordsMatch) {
    const keywordsText = keywordsMatch[1]
    keywords = keywordsText
      .split(',')
      .map((k) => k.trim().replace(/^["']|["']$/g, ''))
      .filter((k) => k.length > 0)
  }
  if (keywords.length === 0) {
    // Fallback: extract capitalized words or technical terms
    const wordMatches = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g)
    if (wordMatches) {
      keywords = [...new Set(wordMatches)].slice(0, 10)
    }
  }

  return {
    success: true,
    distilled: {
      summary,
      hard_facts: hardFacts.length > 0 ? hardFacts : [`Content from ${artifactTitle}`],
      keywords: keywords.length > 0 ? keywords : [artifactTitle.toLowerCase()],
    },
  }
}

/**
 * Distills multiple artifacts in parallel (with concurrency limit).
 * 
 * @param artifacts - Array of artifacts to distill
 * @param maxConcurrency - Maximum number of concurrent distillations (default: 3)
 * @returns Array of distillation results in the same order as input artifacts
 */
export async function distillArtifacts(
  artifacts: Array<{
    artifact_id: string
    title: string
    body_md?: string | null
  }>,
  maxConcurrency: number = 3
): Promise<Array<DistillationResult & { artifact_id: string }>> {
  const results: Array<DistillationResult & { artifact_id: string }> = []

  // Process artifacts in batches to limit concurrency
  for (let i = 0; i < artifacts.length; i += maxConcurrency) {
    const batch = artifacts.slice(i, i + maxConcurrency)
    const batchResults = await Promise.all(
      batch.map(async (artifact) => {
        const result = await distillArtifact(artifact.title, artifact.body_md, artifact.artifact_id)
        return {
          ...result,
          artifact_id: artifact.artifact_id,
        }
      })
    )
    results.push(...batchResults)
  }

  return results
}
