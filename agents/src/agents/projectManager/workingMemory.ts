/**
 * Working memory generation for PM agent conversations.
 */

import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import type { ConversationTurn, WorkingMemory } from './types.js'

/**
 * Extract and update working memory from conversation messages (0173).
 * Uses LLM to extract key facts (goals, requirements, constraints, decisions, etc.)
 * from the conversation and update the working memory.
 */
export async function generateWorkingMemory(
  messages: ConversationTurn[],
  existingMemory: WorkingMemory | null,
  openaiApiKey: string,
  openaiModel: string
): Promise<WorkingMemory> {
  if (messages.length === 0) {
    return (
      existingMemory || {
        summary: '',
        goals: [],
        requirements: [],
        constraints: [],
        decisions: [],
        assumptions: [],
        open_questions: [],
        glossary: [],
        stakeholders: [],
      }
    )
  }

  const openai = createOpenAI({ apiKey: openaiApiKey })
  const model = openai.responses(openaiModel)
  const transcript = messages.map((t) => `${t.role}: ${t.content}`).join('\n\n')

  const existingMemoryText = existingMemory
    ? `\n\nExisting working memory:\n- Summary: ${existingMemory.summary}\n- Goals: ${existingMemory.goals.join(', ')}\n- Requirements: ${existingMemory.requirements.join(', ')}\n- Constraints: ${existingMemory.constraints.join(', ')}\n- Decisions: ${existingMemory.decisions.join(', ')}\n- Assumptions: ${existingMemory.assumptions.join(', ')}\n- Open questions: ${existingMemory.open_questions.join(', ')}\n- Glossary: ${existingMemory.glossary.join(', ')}\n- Stakeholders: ${existingMemory.stakeholders.join(', ')}`
    : ''

  const prompt = `You are maintaining a structured "working memory" for a Project Manager agent conversation. Extract and update key information from the conversation below.

${existingMemoryText ? 'Update the existing working memory with new information from the conversation.' : 'Create initial working memory from the conversation.'}

Return a JSON object with this exact structure:
{
  "summary": "A concise 2-3 sentence summary of the conversation and project context",
  "goals": ["array", "of", "project goals", "discussed"],
  "requirements": ["array", "of", "requirements", "identified"],
  "constraints": ["array", "of", "constraints", "or limitations"],
  "decisions": ["array", "of", "decisions", "made"],
  "assumptions": ["array", "of", "assumptions", "stated"],
  "open_questions": ["array", "of", "open questions", "or unresolved items"],
  "glossary": ["term1: definition1", "term2: definition2"],
  "stakeholders": ["array", "of", "stakeholders", "mentioned"]
}

Guidelines:
- Merge new information with existing memory (don't duplicate)
- Keep arrays concise (3-10 items each, most important first)
- For glossary, use format "term: definition" (one string per entry)
- Remove items that are no longer relevant or have been resolved
- Summary should be current and reflect the full conversation context

Conversation:
${transcript}

Return only valid JSON, no markdown formatting or code blocks.`

  try {
    const result = await generateText({ model, prompt })
    const text = (result.text ?? '').trim()
    // Remove markdown code blocks if present
    const jsonText = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    const parsed = JSON.parse(jsonText) as WorkingMemory

    // Validate and normalize
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      goals: Array.isArray(parsed.goals) ? parsed.goals.filter((g): g is string => typeof g === 'string') : [],
      requirements: Array.isArray(parsed.requirements)
        ? parsed.requirements.filter((r): r is string => typeof r === 'string')
        : [],
      constraints: Array.isArray(parsed.constraints)
        ? parsed.constraints.filter((c): c is string => typeof c === 'string')
        : [],
      decisions: Array.isArray(parsed.decisions)
        ? parsed.decisions.filter((d): d is string => typeof d === 'string')
        : [],
      assumptions: Array.isArray(parsed.assumptions)
        ? parsed.assumptions.filter((a): a is string => typeof a === 'string')
        : [],
      open_questions: Array.isArray(parsed.open_questions)
        ? parsed.open_questions.filter((q): q is string => typeof q === 'string')
        : [],
      glossary: Array.isArray(parsed.glossary)
        ? parsed.glossary.filter((g): g is string => typeof g === 'string')
        : [],
      stakeholders: Array.isArray(parsed.stakeholders)
        ? parsed.stakeholders.filter((s): s is string => typeof s === 'string')
        : [],
    }
  } catch (err) {
    // If generation fails, return existing memory or empty structure
    console.warn('[PM] Working memory generation failed:', err)
    return (
      existingMemory || {
        summary: '',
        goals: [],
        requirements: [],
        constraints: [],
        decisions: [],
        assumptions: [],
        open_questions: [],
        glossary: [],
        stakeholders: [],
      }
    )
  }
}

export type { WorkingMemory }
