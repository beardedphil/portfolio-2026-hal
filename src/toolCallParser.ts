/**
 * Parse tool calls from agent messages and execute them via HAL's tool system.
 * 
 * Agents send tool calls in their messages as JSON blocks:
 * 
 * {
 *   "tool": "insert_qa_artifact",
 *   "params": {
 *     "ticketId": "0076",
 *     "title": "QA report for ticket 0076",
 *     "body_md": "..."
 *   }
 * }
 * 
 * HAL parses these, executes them, and can respond with results.
 */

export interface ToolCall {
  tool: string
  params: Record<string, unknown>
}

export interface ToolCallResult {
  success: boolean
  result?: unknown
  error?: string
}

/**
 * Extract tool calls from agent message content.
 * Looks for JSON blocks that match the tool call format.
 * Handles nested JSON objects in params.
 */
export function parseToolCalls(message: string): ToolCall[] {
  const toolCalls: ToolCall[] = []
  
  // Strategy: Find JSON objects that match the tool call pattern
  // Look for { "tool": "...", "params": { ... } }
  
  // First, try to find JSON in code blocks (```json ... ``` or ``` ... ```)
  const codeBlockRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/g
  let match
  while ((match = codeBlockRegex.exec(message)) !== null) {
    try {
      const parsed = JSON.parse(match[1]) as unknown
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'tool' in parsed &&
        'params' in parsed &&
        typeof (parsed as { tool: unknown }).tool === 'string' &&
        typeof (parsed as { params: unknown }).params === 'object' &&
        (parsed as { params: unknown }).params !== null
      ) {
        toolCalls.push({
          tool: (parsed as { tool: string }).tool,
          params: (parsed as { params: Record<string, unknown> }).params,
        })
      }
    } catch {
      // Invalid JSON, skip
    }
  }
  
  // Also try to find standalone JSON objects (not in code blocks)
  // Use a more robust approach: find balanced braces starting with { "tool"
  const text = message
  let i = 0
  while (i < text.length) {
    // Look for start of JSON object: { followed by "tool"
    const startMatch = text.slice(i).match(/^\s*\{\s*"tool"\s*:/)
    if (!startMatch) {
      i++
      continue
    }
    
    const startIdx = i + startMatch.index!
    let braceDepth = 0
    let inString = false
    let escapeNext = false
    let jsonEnd = -1
    
    // Find the matching closing brace
    for (let j = startIdx; j < text.length; j++) {
      const char = text[j]
      
      if (escapeNext) {
        escapeNext = false
        continue
      }
      
      if (char === '\\') {
        escapeNext = true
        continue
      }
      
      if (char === '"' && !escapeNext) {
        inString = !inString
        continue
      }
      
      if (inString) continue
      
      if (char === '{') {
        braceDepth++
      } else if (char === '}') {
        braceDepth--
        if (braceDepth === 0) {
          jsonEnd = j + 1
          break
        }
      }
    }
    
    if (jsonEnd > startIdx) {
      // Found a complete JSON object
      const jsonText = text.slice(startIdx, jsonEnd)
      try {
        const parsed = JSON.parse(jsonText) as unknown
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          'tool' in parsed &&
          'params' in parsed &&
          typeof (parsed as { tool: unknown }).tool === 'string' &&
          typeof (parsed as { params: unknown }).params === 'object' &&
          (parsed as { params: unknown }).params !== null
        ) {
          // Check if we already added this from a code block
          const alreadyAdded = toolCalls.some(
            (tc) => tc.tool === (parsed as { tool: string }).tool && JSON.stringify(tc.params) === JSON.stringify((parsed as { params: Record<string, unknown> }).params)
          )
          if (!alreadyAdded) {
            toolCalls.push({
              tool: (parsed as { tool: string }).tool,
              params: (parsed as { params: Record<string, unknown> }).params,
            })
          }
        }
      } catch {
        // Invalid JSON, skip
      }
      i = jsonEnd
    } else {
      i++
    }
  }
  
  return toolCalls
}

/**
 * Execute a tool call via HAL's API endpoint.
 */
export async function executeToolCall(toolCall: ToolCall, halApiUrl?: string): Promise<ToolCallResult> {
  const apiUrl = halApiUrl || 'http://localhost:5173'
  
  try {
    const response = await fetch(`${apiUrl}/api/agent-tools/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: toolCall.tool,
        params: toolCall.params,
      }),
    })
    
    const result = await response.json()
    
    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Tool execution failed',
      }
    }
    
    return {
      success: true,
      result: result,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Parse and execute all tool calls from an agent message.
 * Returns results for each tool call.
 */
export async function parseAndExecuteToolCalls(
  message: string,
  halApiUrl?: string
): Promise<Array<{ toolCall: ToolCall; result: ToolCallResult }>> {
  const toolCalls = parseToolCalls(message)
  const results: Array<{ toolCall: ToolCall; result: ToolCallResult }> = []
  
  for (const toolCall of toolCalls) {
    const result = await executeToolCall(toolCall, halApiUrl)
    results.push({ toolCall, result })
  }
  
  return results
}
