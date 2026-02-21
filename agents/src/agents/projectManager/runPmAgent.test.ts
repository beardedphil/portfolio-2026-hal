import { describe, it, expect } from 'vitest'
import { generateFallbackReply, buildPrompt, type ToolCallRecord } from './runPmAgentHelpers.js'

describe('generateFallbackReply', () => {
  it('generates reply for create_ticket rejection with placeholders', () => {
    const toolCalls: ToolCallRecord[] = [
      {
        name: 'create_ticket',
        input: { title: 'Test', body_md: 'Body' },
        output: {
          success: false,
          error: 'Placeholders detected',
          detectedPlaceholders: ['<placeholder1>', '<placeholder2>'],
        },
      },
    ]

    const reply = generateFallbackReply(toolCalls)

    expect(reply).toContain('**Ticket creation rejected:**')
    expect(reply).toContain('Placeholders detected')
    expect(reply).toContain('**Detected placeholders:**')
    expect(reply).toContain('<placeholder1>')
    expect(reply).toContain('<placeholder2>')
  })

  it('generates reply for update_ticket_body rejection with placeholders', () => {
    const toolCalls: ToolCallRecord[] = [
      {
        name: 'update_ticket_body',
        input: { ticket_id: 'HAL-001', body_md: 'Body' },
        output: {
          success: false,
          error: 'Placeholders detected',
          detectedPlaceholders: ['<placeholder>'],
        },
      },
    ]

    const reply = generateFallbackReply(toolCalls)

    expect(reply).toContain('**Ticket update rejected:**')
    expect(reply).toContain('Placeholders detected')
  })

  it('generates reply for successful create_ticket', () => {
    const toolCalls: ToolCallRecord[] = [
      {
        name: 'create_ticket',
        input: { title: 'Test Ticket', body_md: 'Body' },
        output: {
          success: true,
          id: '0001',
          filename: '0001-test-ticket.md',
          filePath: 'supabase:tickets/HAL-0001',
          ready: true,
        },
      },
    ]

    const reply = generateFallbackReply(toolCalls)

    expect(reply).toContain('I created ticket **0001**')
    expect(reply).toContain('supabase:tickets/HAL-0001')
  })

  it('generates reply for create_ticket with missing items', () => {
    const toolCalls: ToolCallRecord[] = [
      {
        name: 'create_ticket',
        input: { title: 'Test', body_md: 'Body' },
        output: {
          success: true,
          id: '0001',
          filename: '0001-test.md',
          filePath: 'supabase:tickets/HAL-0001',
          ready: false,
          missingItems: ['Goal section', 'Acceptance criteria'],
        },
      },
    ]

    const reply = generateFallbackReply(toolCalls)

    expect(reply).toContain('I created ticket **0001**')
    expect(reply).toContain('not yet ready for To Do')
    expect(reply).toContain('Goal section')
    expect(reply).toContain('Acceptance criteria')
  })

  it('generates reply for successful kanban_move_ticket_to_todo', () => {
    const toolCalls: ToolCallRecord[] = [
      {
        name: 'kanban_move_ticket_to_todo',
        input: { ticket_id: 'HAL-001', position: 'top' },
        output: {
          success: true,
          ticketId: 'HAL-001',
          fromColumn: 'col-unassigned',
          toColumn: 'col-todo',
        },
      },
    ]

    const reply = generateFallbackReply(toolCalls)

    expect(reply).toContain('I moved ticket **HAL-001**')
    expect(reply).toContain('col-unassigned')
    expect(reply).toContain('**col-todo**')
  })

  it('generates reply for successful update_ticket_body', () => {
    const toolCalls: ToolCallRecord[] = [
      {
        name: 'update_ticket_body',
        input: { ticket_id: 'HAL-001', body_md: 'Updated body' },
        output: {
          success: true,
          ticketId: 'HAL-001',
          ready: true,
        },
      },
    ]

    const reply = generateFallbackReply(toolCalls)

    expect(reply).toContain('I updated the body of ticket **HAL-001**')
    expect(reply).toContain('within ~10 seconds')
  })

  it('generates reply for update_ticket_body with missing items', () => {
    const toolCalls: ToolCallRecord[] = [
      {
        name: 'update_ticket_body',
        input: { ticket_id: 'HAL-001', body_md: 'Body' },
        output: {
          success: true,
          ticketId: 'HAL-001',
          ready: false,
          missingItems: ['Goal section'],
        },
      },
    ]

    const reply = generateFallbackReply(toolCalls)

    expect(reply).toContain('I updated the body of ticket **HAL-001**')
    expect(reply).toContain('may still not pass readiness')
    expect(reply).toContain('Goal section')
  })

  it('generates reply for successful sync_tickets', () => {
    const toolCalls: ToolCallRecord[] = [
      {
        name: 'sync_tickets',
        input: {},
        output: { success: true },
      },
    ]

    const reply = generateFallbackReply(toolCalls)

    expect(reply).toContain('I ran sync-tickets')
    expect(reply).toContain('Supabase is the source of truth')
  })

  it('generates reply for list_tickets_by_column with tickets', () => {
    const toolCalls: ToolCallRecord[] = [
      {
        name: 'list_tickets_by_column',
        input: { column_id: 'col-qa' },
        output: {
          success: true,
          column_id: 'col-qa',
          tickets: [
            { id: 'HAL-001', title: 'Ticket 1', column: 'col-qa' },
            { id: 'HAL-002', title: 'Ticket 2', column: 'col-qa' },
          ],
          count: 2,
        },
      },
    ]

    const reply = generateFallbackReply(toolCalls)

    expect(reply).toContain('Tickets in **col-qa** (2)')
    expect(reply).toContain('**HAL-001**')
    expect(reply).toContain('Ticket 1')
    expect(reply).toContain('**HAL-002**')
    expect(reply).toContain('Ticket 2')
  })

  it('generates reply for list_tickets_by_column with no tickets', () => {
    const toolCalls: ToolCallRecord[] = [
      {
        name: 'list_tickets_by_column',
        input: { column_id: 'col-qa' },
        output: {
          success: true,
          column_id: 'col-qa',
          tickets: [],
          count: 0,
        },
      },
    ]

    const reply = generateFallbackReply(toolCalls)

    expect(reply).toContain('No tickets found in column **col-qa**')
  })

  it('generates reply for list_available_repos with repos', () => {
    const toolCalls: ToolCallRecord[] = [
      {
        name: 'list_available_repos',
        input: {},
        output: {
          success: true,
          repos: [
            { repo_full_name: 'owner/repo1' },
            { repo_full_name: 'owner/repo2' },
          ],
          count: 2,
        },
      },
    ]

    const reply = generateFallbackReply(toolCalls)

    expect(reply).toContain('Available repositories (2)')
    expect(reply).toContain('**owner/repo1**')
    expect(reply).toContain('**owner/repo2**')
  })

  it('generates reply for list_available_repos with no repos', () => {
    const toolCalls: ToolCallRecord[] = [
      {
        name: 'list_available_repos',
        input: {},
        output: {
          success: true,
          repos: [],
          count: 0,
        },
      },
    ]

    const reply = generateFallbackReply(toolCalls)

    expect(reply).toContain('No repositories found in the database')
  })

  it('returns empty string when no matching tool calls', () => {
    const toolCalls: ToolCallRecord[] = [
      {
        name: 'read_file',
        input: { path: 'test.ts' },
        output: { content: 'test' },
      },
    ]

    const reply = generateFallbackReply(toolCalls)

    expect(reply).toBe('')
  })

  it('prioritizes create_ticket rejection over other tool calls', () => {
    const toolCalls: ToolCallRecord[] = [
      {
        name: 'create_ticket',
        input: { title: 'Test', body_md: 'Body' },
        output: {
          success: false,
          error: 'Placeholders detected',
          detectedPlaceholders: ['<placeholder>'],
        },
      },
      {
        name: 'create_ticket',
        input: { title: 'Test2', body_md: 'Body2' },
        output: {
          success: true,
          id: '0001',
          filename: '0001-test.md',
          filePath: 'supabase:tickets/HAL-0001',
        },
      },
    ]

    const reply = generateFallbackReply(toolCalls)

    expect(reply).toContain('**Ticket creation rejected:**')
    expect(reply).not.toContain('I created ticket')
  })
})

describe('buildPrompt', () => {
  const systemInstructions = 'You are a helpful assistant.'
  const contextPack = 'Context information here.'

  it('builds text-only prompt when no images provided', () => {
    const result = buildPrompt(contextPack, systemInstructions)

    expect(typeof result.prompt).toBe('string')
    expect(result.prompt).toContain(contextPack)
    expect(result.prompt).toContain('Respond to the user message')
    expect(result.fullPromptText).toContain('## System Instructions')
    expect(result.fullPromptText).toContain(systemInstructions)
    expect(result.fullPromptText).toContain(contextPack)
  })

  it('builds array prompt for vision models with images', () => {
    const images = [
      { dataUrl: 'data:image/png;base64,test1', filename: 'test1.png', mimeType: 'image/png' },
      { dataUrl: 'data:image/jpeg;base64,test2', filename: 'test2.jpg', mimeType: 'image/jpeg' },
    ]

    const result = buildPrompt(contextPack, systemInstructions, images, 'gpt-4o')

    expect(Array.isArray(result.prompt)).toBe(true)
    const promptArray = result.prompt as Array<{ type: 'text' | 'image'; text?: string; image?: string }>
    expect(promptArray[0].type).toBe('text')
    expect(promptArray[0].text).toContain(contextPack)
    expect(promptArray[1].type).toBe('image')
    expect(promptArray[1].image).toBe('data:image/png;base64,test1')
    expect(promptArray[2].type).toBe('image')
    expect(promptArray[2].image).toBe('data:image/jpeg;base64,test2')
    expect(result.fullPromptText).toContain('Images (included in prompt)')
  })

  it('builds text prompt for non-vision models even with images', () => {
    const images = [{ dataUrl: 'data:image/png;base64,test', filename: 'test.png', mimeType: 'image/png' }]

    const result = buildPrompt(contextPack, systemInstructions, images, 'gpt-4')

    expect(typeof result.prompt).toBe('string')
    expect(result.prompt).toContain(contextPack)
    expect(result.fullPromptText).toContain('Images (provided but ignored)')
    expect(result.fullPromptText).toContain('gpt-4')
  })

  it('includes image filenames in fullPromptText', () => {
    const images = [
      { dataUrl: 'data:image/png;base64,test1', filename: 'screenshot.png', mimeType: 'image/png' },
    ]

    const result = buildPrompt(contextPack, systemInstructions, images, 'gpt-4o')

    expect(result.fullPromptText).toContain('screenshot.png')
    expect(result.fullPromptText).toContain('image/png')
  })

  it('handles images without filenames', () => {
    const images = [{ dataUrl: 'data:image/png;base64,test', mimeType: 'image/png' }]

    const result = buildPrompt(contextPack, systemInstructions, images, 'gpt-4o')

    expect(result.fullPromptText).toContain('Image 1')
    expect(result.fullPromptText).toContain('image/png')
  })
})
