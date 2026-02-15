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
  
  // Build prompt for working memory extraction
  const conversationText = messages
    .map((m) => `**${m.role}**: ${m.content}`)
    .join('\n\n')
  
  const existingMemoryText = existingMemory
    ? `\n\nExisting working memory (update/merge with new information):\n` +
      `Summary: ${existingMemory.summary}\n` +
      `Goals: ${existingMemory.goals}\n` +
      `Requirements: ${existingMemory.requirements}\n` +
      `Constraints: ${existingMemory.constraints}\n` +
      `Decisions: ${existingMemory.decisions}\n` +
      `Assumptions: ${existingMemory.assumptions}\n` +
      `Open Questions: ${existingMemory.open_questions}\n` +
      `Glossary: ${existingMemory.glossary_terms}\n` +
      `Stakeholders: ${existingMemory.stakeholders}\n`
    : ''
  
  const prompt = `You are analyzing a Project Manager conversation to extract and maintain working memory—key facts that should persist across long conversations.

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

  try {
    const result = await generateText({
      model: openai(openaiModel),
      prompt,
      temperature: 0.3, // Lower temperature for more consistent extraction
    })
    
    const text = result.text.trim()
    
    // Try to extract JSON from the response
    let jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      // If no JSON found, try to parse the whole response
      jsonMatch = [text]
    }
    
    const parsed = JSON.parse(jsonMatch[0]) as Partial<WorkingMemory>
    
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
      through_sequence: messages.length - 1, // Last message index
    }
  } catch (error) {
    console.error('[PM Working Memory] Failed to generate working memory:', error)
    // Return safe defaults on error
    return {
      summary: existingMemory?.summary || '',
      goals: existingMemory?.goals || '',
      requirements: existingMemory?.requirements || '',
      constraints: existingMemory?.constraints || '',
      decisions: existingMemory?.decisions || '',
      assumptions: existingMemory?.assumptions || '',
      open_questions: existingMemory?.open_questions || '',
      glossary_terms: existingMemory?.glossary_terms || '',
      stakeholders: existingMemory?.stakeholders || '',
      through_sequence: existingMemory?.through_sequence ?? messages.length - 1,
    }
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
        summary: memory.summary,
        goals: memory.goals,
        requirements: memory.requirements,
        constraints: memory.constraints,
        decisions: memory.decisions,
        assumptions: memory.assumptions,
        open_questions: memory.open_questions,
        glossary_terms: memory.glossary_terms,
        stakeholders: memory.stakeholders,
        through_sequence: memory.through_sequence,
        last_updated: new Date().toISOString(),
      },
      { onConflict: 'project_id,agent' }
    )
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
  
  // Check if update is needed
  const needsUpdate =
    forceUpdate ||
    !existingMemory ||
    existingMemory.through_sequence < lastSequence ||
    messages.length > (existingMemory.through_sequence + 1) * 1.5 // Update if conversation grew significantly
  
  if (!needsUpdate && existingMemory) {
    return existingMemory
  }
  
  // Generate new working memory
  const newMemory = await generateWorkingMemory(
    messages.map(m => ({ role: m.role, content: m.content })),
    openaiApiKey,
    openaiModel,
    existingMemory
  )
  
  // Update through_sequence to last message
  newMemory.through_sequence = lastSequence
  
  // Save to database
  await saveWorkingMemory(supabase, projectId, agent, newMemory)
  
  return newMemory
}

/**
 * Format working memory for inclusion in PM agent prompt
 */
export function formatWorkingMemoryForPrompt(memory: WorkingMemory | null): string {
  if (!memory) return ''
  
  let formatted = '## PM Working Memory\n\n'
  
  if (memory.summary) {
    formatted += `**Summary:** ${memory.summary}\n\n`
  }
  
  if (memory.goals) {
    formatted += `**Goals:**\n${memory.goals}\n\n`
  }
  
  if (memory.requirements) {
    formatted += `**Requirements:**\n${memory.requirements}\n\n`
  }
  
  if (memory.constraints) {
    formatted += `**Constraints:**\n${memory.constraints}\n\n`
  }
  
  if (memory.decisions) {
    formatted += `**Decisions:**\n${memory.decisions}\n\n`
  }
  
  if (memory.assumptions) {
    formatted += `**Assumptions:**\n${memory.assumptions}\n\n`
  }
  
  if (memory.open_questions) {
    formatted += `**Open Questions:**\n${memory.open_questions}\n\n`
  }
  
  if (memory.stakeholders) {
    formatted += `**Stakeholders:**\n${memory.stakeholders}\n\n`
  }
  
  if (memory.glossary_terms && memory.glossary_terms.trim() !== '') {
    // Try to parse as JSON array, otherwise treat as plain text
    try {
      const terms = JSON.parse(memory.glossary_terms) as Array<{ term: string; definition: string }>
      if (Array.isArray(terms) && terms.length > 0) {
        formatted += `**Glossary/Terms:**\n`
        for (const { term, definition } of terms) {
          formatted += `- **${term}**: ${definition}\n`
        }
        formatted += '\n'
      }
    } catch {
      // Not JSON, treat as plain text
      formatted += `**Glossary/Terms:**\n${memory.glossary_terms}\n\n`
    }
  }
  
  return formatted
}
