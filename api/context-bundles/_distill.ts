/**
 * Shared distillation logic for artifacts.
 * Extracts structured information (summary, hard_facts, keywords) from artifact body_md using OpenAI.
 */

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
 * Distills an artifact body into structured fields.
 */
export async function distillArtifact(
  artifactBodyMd: string,
  artifactTitle?: string
): Promise<DistillationResult> {
  const key = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'

  if (!key) {
    return {
      success: false,
      error: 'OpenAI API is not configured. Set OPENAI_API_KEY in environment.',
    }
  }

  try {
    // Use OpenAI to distill the artifact
    const prompt = `Analyze the following artifact content and extract structured information. Return a JSON object with exactly these three fields:
- summary: A concise 2-4 sentence summary of the artifact's main content and purpose
- hard_facts: An array of specific, verifiable facts extracted from the artifact (empty array if none). Each fact should be a standalone statement.
- keywords: An array of important keywords or key phrases from the artifact (empty array if none). Focus on technical terms, concepts, and important identifiers.

Artifact${artifactTitle ? ` (Title: ${artifactTitle})` : ''}:
${artifactBodyMd}

Return ONLY valid JSON, no markdown formatting, no explanation. Example format:
{"summary": "...", "hard_facts": ["...", "..."], "keywords": ["...", "..."]}`

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful assistant that extracts structured information from technical artifacts. Return only valid JSON with exactly three fields: summary (string), hard_facts (array of strings), and keywords (array of strings).',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      }),
    })

    if (!openaiRes.ok) {
      const errorText = await openaiRes.text()
      return {
        success: false,
        error: `OpenAI API error: ${errorText}`,
      }
    }

    const openaiData = (await openaiRes.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = openaiData.choices?.[0]?.message?.content?.trim()
    if (!content) {
      return {
        success: false,
        error: 'No content in OpenAI response',
      }
    }

    // Parse JSON response (may be wrapped in markdown code blocks)
    let parsed: {
      summary?: string
      hard_facts?: unknown
      keywords?: unknown
    }
    try {
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || [null, content]
      parsed = JSON.parse(jsonMatch[1] || content)
    } catch (parseError) {
      // Try parsing as-is
      try {
        parsed = JSON.parse(content)
      } catch {
        return {
          success: false,
          error: `Failed to parse OpenAI response as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
        }
      }
    }

    // Validate and structure data
    const distilled: DistilledArtifact = {
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
      hard_facts: Array.isArray(parsed.hard_facts)
        ? parsed.hard_facts.filter((f: unknown) => typeof f === 'string' && f.trim()).map((f: string) => f.trim())
        : [],
      keywords: Array.isArray(parsed.keywords)
        ? parsed.keywords.filter((k: unknown) => typeof k === 'string' && k.trim()).map((k: string) => k.trim())
        : [],
    }

    // Ensure summary is not empty (if OpenAI failed to generate it, provide a fallback)
    if (!distilled.summary) {
      distilled.summary = 'Summary extraction failed. Please review the original artifact.'
    }

    return {
      success: true,
      distilled,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error during distillation',
    }
  }
}
