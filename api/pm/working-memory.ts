/**
 * PM Working Memory utilities
 * Generates and updates working memory for PM conversations
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface WorkingMemory {
  summary: string
  goals: string
  requirements: string
  constraints: string
  decisions: string
  assumptions: string
  open_questions: string
  glossary_terms: string // JSON array or plain text
  stakeholders: string
  through_sequence: number
}

function createEmptyWorkingMemory(throughSequence: number = 0): WorkingMemory {
  return {
    summary: '',
    goals: '',
    requirements: '',
    constraints: '',
    decisions: '',
    assumptions: '',
    open_questions: '',
    glossary_terms: '',
    stakeholders: '',
    through_sequence: throughSequence,
  }
}

function normalizeWorkingMemoryFromDb(data: any): WorkingMemory {
  return {
    summary: data.summary || '',
    goals: data.goals || '',
    requirements: data.requirements || '',
    constraints: data.constraints || '',
    decisions: data.decisions || '',
    assumptions: data.assumptions || '',
    open_questions: data.open_questions || '',
    glossary_terms: data.glossary_terms || '',
    stakeholders: data.stakeholders || '',
    through_sequence: data.through_sequence || 0,
  }
}

function formatExistingMemoryText(memory: WorkingMemory): string {
  return `\n\nExisting working memory (update/merge with new information):\n` +
    `Summary: ${memory.summary}\n` +
    `Goals: ${memory.goals}\n` +
    `Requirements: ${memory.requirements}\n` +
    `Constraints: ${memory.constraints}\n` +
    `Decisions: ${memory.decisions}\n` +
    `Assumptions: ${memory.assumptions}\n` +
    `Open Questions: ${memory.open_questions}\n` +
    `Glossary: ${memory.glossary_terms}\n` +
    `Stakeholders: ${memory.stakeholders}\n`
}

function formatConversationText(messages: Array<{ role: string; content: string }>): string {
  return messages.map((m) => `**${m.role}**: ${m.content}`).join('\n\n')
}

function buildWorkingMemoryPrompt(
  conversationText: string,
  existingMemoryText: string
): string {
  return `You are analyzing a Project Manager conversation to extract and maintain working memory—key facts that should persist across long conversations.

Extract and organize the following information from the conversation:

1. **Summary**: A concise 2-3 sentence summary of the conversation and project context
2. **Goals**: Project goals and objectives discussed (bullet points)
3. **Requirements**: Requirements and specifications mentioned (bullet points)
4. **Constraints**: Technical or business constraints identified (bullet points)
5. **Decisions**: Key decisions made during the conversation (bullet points)
6. **Assumptions**: Assumptions and premises established (bullet points)
7. **Open Questions**: Open questions or unresolved items (bullet points)
8. **Glossary/Terms**: Important terminology and definitions (plain text or JSON array format)
9. **Stakeholders**: Stakeholders mentioned or involved (bullet points)

${existingMemoryText}

Conversation:
${conversationText}

Provide the working memory in the following JSON format:
{
  "summary": "...",
  "goals": "...",
  "requirements": "...",
  "constraints": "...",
  "decisions": "...",
  "assumptions": "...",
  "open_questions": "...",
  "glossary_terms": "...",
  "stakeholders": "..."
}

Only include information that is explicitly mentioned or clearly implied. If a field has no relevant information, use an empty string.`
}

function extractJsonFromText(text: string): string {
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  return jsonMatch ? jsonMatch[0] : text
}

function parseWorkingMemoryResponse(
  text: string,
  messagesLength: number
): WorkingMemory {
  const jsonText = extractJsonFromText(text)
  const parsed = JSON.parse(jsonText) as Partial<WorkingMemory>
  
  return {
    summary: parsed.summary || '',
    goals: parsed.goals || '',
    requirements: parsed.requirements || '',
    constraints: parsed.constraints || '',
    decisions: parsed.decisions || '',
    assumptions: parsed.assumptions || '',
    open_questions: parsed.open_questions || '',
    glossary_terms: parsed.glossary_terms || '',
    stakeholders: parsed.stakeholders || '',
    through_sequence: messagesLength - 1,
  }
}

function formatGlossaryTerms(glossaryTerms: string): string {
  if (!glossaryTerms || glossaryTerms.trim() === '') {
    return ''
  }

  try {
    const terms = JSON.parse(glossaryTerms) as Array<{ term: string; definition: string }>
    if (Array.isArray(terms) && terms.length > 0) {
      return terms
        .map(({ term, definition }) => `- **${term}**: ${definition}`)
        .join('\n') + '\n'
    }
  } catch {
    // Not JSON, treat as plain text
  }

  return glossaryTerms
}

/**
 * Generate working memory from conversation messages using LLM
 */
export async function generateWorkingMemory(
  messages: Array<{ role: string; content: string }>,
  openaiApiKey: string,
  openaiModel: string,
  existingMemory: WorkingMemory | null
): Promise<WorkingMemory> {
  const { generateText } = await import('ai')
  const { createOpenAI } = await import('@ai-sdk/openai')
  
  const openai = createOpenAI({ apiKey: openaiApiKey })
  const conversationText = formatConversationText(messages)
  const existingMemoryText = existingMemory ? formatExistingMemoryText(existingMemory) : ''
  const prompt = buildWorkingMemoryPrompt(conversationText, existingMemoryText)

  try {
    const result = await generateText({
      model: openai(openaiModel),
      prompt,
      temperature: 0.3,
    })
    
    return parseWorkingMemoryResponse(result.text.trim(), messages.length)
  } catch (error) {
    console.error('[PM Working Memory] Failed to generate working memory:', error)
    return existingMemory 
      ? { ...existingMemory, through_sequence: existingMemory.through_sequence ?? messages.length - 1 }
      : createEmptyWorkingMemory(messages.length - 1)
  }
}

/**
 * Get working memory from database
 * Uses 'agent' field (which stores conversation ID like "project-manager-1")
 */
export async function getWorkingMemory(
  supabase: SupabaseClient,
  projectId: string,
  agent: string // conversation ID like "project-manager-1"
): Promise<WorkingMemory | null> {
  const { data, error } = await supabase
    .from('hal_pm_working_memory')
    .select('*')
    .eq('project_id', projectId)
    .eq('agent', agent)
    .maybeSingle()

  if (error || !data) return null
  
  return normalizeWorkingMemoryFromDb(data)
}

/**
 * Save working memory to database
 * Uses 'agent' field (which stores conversation ID like "project-manager-1")
 */
export async function saveWorkingMemory(
  supabase: SupabaseClient,
  projectId: string,
  agent: string, // conversation ID like "project-manager-1"
  memory: WorkingMemory
): Promise<void> {
  await supabase
    .from('hal_pm_working_memory')
    .upsert(
      {
        project_id: projectId,
        agent: agent,
        ...memory,
        last_updated: new Date().toISOString(),
      },
      { onConflict: 'project_id,agent' }
    )
}

function shouldUpdateMemory(
  existingMemory: WorkingMemory | null,
  lastSequence: number,
  messagesLength: number,
  forceUpdate: boolean
): boolean {
  if (forceUpdate || !existingMemory) return true
  if (existingMemory.through_sequence < lastSequence) return true
  return messagesLength > (existingMemory.through_sequence + 1) * 1.5
}

/**
 * Update working memory if needed (when new messages arrive)
 * Uses 'agent' field (which stores conversation ID like "project-manager-1")
 */
export async function updateWorkingMemoryIfNeeded(
  supabase: SupabaseClient,
  projectId: string,
  agent: string, // conversation ID like "project-manager-1"
  messages: Array<{ role: string; content: string; sequence: number }>,
  openaiApiKey: string,
  openaiModel: string,
  forceUpdate: boolean = false
): Promise<WorkingMemory | null> {
  if (messages.length === 0) return null
  
  const existingMemory = await getWorkingMemory(supabase, projectId, agent)
  const lastSequence = Math.max(...messages.map(m => m.sequence))
  
  if (!shouldUpdateMemory(existingMemory, lastSequence, messages.length, forceUpdate)) {
    return existingMemory
  }
  
  const newMemory = await generateWorkingMemory(
    messages.map(m => ({ role: m.role, content: m.content })),
    openaiApiKey,
    openaiModel,
    existingMemory
  )
  
  newMemory.through_sequence = lastSequence
  await saveWorkingMemory(supabase, projectId, agent, newMemory)
  
  return newMemory
}

function formatField(fieldName: string, value: string): string {
  return value ? `**${fieldName}:**\n${value}\n\n` : ''
}

function formatGlossarySection(glossaryTerms: string): string {
  if (!glossaryTerms || glossaryTerms.trim() === '') {
    return ''
  }

  const formattedTerms = formatGlossaryTerms(glossaryTerms)
  return formattedTerms ? `**Glossary/Terms:**\n${formattedTerms}\n\n` : ''
}

/**
 * Format working memory for inclusion in PM agent prompt
 */
export function formatWorkingMemoryForPrompt(memory: WorkingMemory | null): string {
  if (!memory) return ''
  
  let formatted = '## PM Working Memory\n\n'
  formatted += memory.summary ? `**Summary:** ${memory.summary}\n\n` : ''
  formatted += formatField('Goals', memory.goals)
  formatted += formatField('Requirements', memory.requirements)
  formatted += formatField('Constraints', memory.constraints)
  formatted += formatField('Decisions', memory.decisions)
  formatted += formatField('Assumptions', memory.assumptions)
  formatted += formatField('Open Questions', memory.open_questions)
  formatted += formatField('Stakeholders', memory.stakeholders)
  formatted += formatGlossarySection(memory.glossary_terms)
  
  return formatted
}
