import { describe, it, expect } from 'vitest'
import {
  evaluateTicketReady,
  respond,
  type ReadyCheckResult,
  type RespondInput,
} from './projectManager.js'

// Test helper functions that are not exported - we'll test them indirectly through exported functions
// or export them for testing

describe('evaluateTicketReady', () => {
  it('should return ready: true when all required sections are present and valid', () => {
    const bodyMd = `## Goal (one sentence)

Add a feature to the project.

## Human-verifiable deliverable (UI-only)

User sees a new button in the UI.

## Acceptance criteria (UI-only)

- [ ] Button is visible
- [ ] Button is clickable
- [ ] Clicking button shows a message

## Constraints

- Must work in all browsers
- No breaking changes

## Non-goals

- Mobile optimization
- Accessibility features
`

    const result = evaluateTicketReady(bodyMd)
    expect(result.ready).toBe(true)
    expect(result.missingItems).toEqual([])
    expect(result.checklistResults.goal).toBe(true)
    expect(result.checklistResults.deliverable).toBe(true)
    expect(result.checklistResults.acceptanceCriteria).toBe(true)
    expect(result.checklistResults.constraintsNonGoals).toBe(true)
    expect(result.checklistResults.noPlaceholders).toBe(true)
  })

  it('should return ready: false when Goal section is missing', () => {
    const bodyMd = `## Human-verifiable deliverable (UI-only)

User sees a new button.

## Acceptance criteria (UI-only)

- [ ] Button is visible

## Constraints

Must work in all browsers

## Non-goals

Mobile optimization
`

    const result = evaluateTicketReady(bodyMd)
    expect(result.ready).toBe(false)
    expect(result.missingItems).toContain('Goal (one sentence) missing or placeholder')
    expect(result.checklistResults.goal).toBe(false)
  })

  it('should return ready: false when Acceptance criteria has no checkboxes', () => {
    const bodyMd = `## Goal (one sentence)

Add a feature.

## Human-verifiable deliverable (UI-only)

User sees a new button.

## Acceptance criteria (UI-only)

- Button is visible
- Button is clickable

## Constraints

Must work in all browsers

## Non-goals

Mobile optimization
`

    const result = evaluateTicketReady(bodyMd)
    expect(result.ready).toBe(false)
    expect(result.missingItems).toContain('Acceptance criteria checkboxes missing')
    expect(result.checklistResults.acceptanceCriteria).toBe(false)
  })

  it('should return ready: false when placeholders are present', () => {
    const bodyMd = `## Goal (one sentence)

Add <feature-name> to the project.

## Human-verifiable deliverable (UI-only)

User sees <component-name> in the UI.

## Acceptance criteria (UI-only)

- [ ] <AC 1>
- [ ] <AC 2>

## Constraints

- Must work in all browsers

## Non-goals

- Mobile optimization
`

    const result = evaluateTicketReady(bodyMd)
    expect(result.ready).toBe(false)
    expect(result.missingItems.some(item => item.includes('Unresolved placeholders'))).toBe(true)
    expect(result.checklistResults.noPlaceholders).toBe(false)
  })

  it('should return ready: false when Constraints section is missing', () => {
    const bodyMd = `## Goal (one sentence)

Add a feature.

## Human-verifiable deliverable (UI-only)

User sees a new button.

## Acceptance criteria (UI-only)

- [ ] Button is visible

## Non-goals

Mobile optimization
`

    const result = evaluateTicketReady(bodyMd)
    expect(result.ready).toBe(false)
    expect(result.missingItems).toContain('Constraints section missing or empty')
    expect(result.checklistResults.constraintsNonGoals).toBe(false)
  })

  it('should return ready: false when Non-goals section is empty', () => {
    const bodyMd = `## Goal (one sentence)

Add a feature.

## Human-verifiable deliverable (UI-only)

User sees a new button.

## Acceptance criteria (UI-only)

- [ ] Button is visible

## Constraints

Must work in all browsers

## Non-goals

`

    const result = evaluateTicketReady(bodyMd)
    expect(result.ready).toBe(false)
    expect(result.missingItems).toContain('Non-goals section missing or empty')
    expect(result.checklistResults.constraintsNonGoals).toBe(false)
  })

  it('should handle empty body gracefully', () => {
    const result = evaluateTicketReady('')
    expect(result.ready).toBe(false)
    expect(result.missingItems.length).toBeGreaterThan(0)
  })

  it('should detect placeholders in Goal section', () => {
    const bodyMd = `## Goal (one sentence)

<what we want to achieve>

## Human-verifiable deliverable (UI-only)

User sees a new button.

## Acceptance criteria (UI-only)

- [ ] Button is visible

## Constraints

Must work in all browsers

## Non-goals

Mobile optimization
`

    const result = evaluateTicketReady(bodyMd)
    expect(result.ready).toBe(false)
    expect(result.checklistResults.goal).toBe(false)
    expect(result.missingItems.some(item => item.includes('Goal') && item.includes('placeholder'))).toBe(true)
  })
})

describe('respond', () => {
  it('should return standup response when message contains "standup"', () => {
    const input: RespondInput = { message: 'What is the standup status?' }
    const result = respond(input)
    
    expect(result.meta.case).toBe('standup')
    expect(result.meta.source).toBe('hal-agents')
    expect(result.replyText).toContain('[PM@hal-agents]')
    expect(result.replyText).toContain('Standup summary')
  })

  it('should return standup response when message contains "status"', () => {
    const input: RespondInput = { message: 'Show me the status' }
    const result = respond(input)
    
    expect(result.meta.case).toBe('standup')
    expect(result.replyText).toContain('Standup summary')
  })

  it('should return default response when message does not contain standup triggers', () => {
    const input: RespondInput = { message: 'Hello, how are you?' }
    const result = respond(input)
    
    expect(result.meta.case).toBe('default')
    expect(result.meta.source).toBe('hal-agents')
    expect(result.replyText).toContain('[PM@hal-agents]')
    expect(result.replyText).toContain('Message received')
    expect(result.replyText).toContain('checklist')
  })

  it('should handle case-insensitive standup detection', () => {
    const input: RespondInput = { message: 'STANDUP for today' }
    const result = respond(input)
    
    expect(result.meta.case).toBe('standup')
  })

  it('should handle messages with whitespace', () => {
    const input: RespondInput = { message: '  standup  ' }
    const result = respond(input)
    
    expect(result.meta.case).toBe('standup')
  })
})
