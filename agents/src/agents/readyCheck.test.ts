import { describe, it, expect } from 'vitest'
import { evaluateTicketReady, type ReadyCheckResult } from './readyCheck'

describe('evaluateTicketReady', () => {
  it('returns ready=true for ticket with substantial content and no placeholders', () => {
    const body = `## Goal (one sentence)

Add a comprehensive feature to the application that allows users to manage their preferences and settings in a centralized location. This feature will include multiple sections for different types of preferences, validation, and persistence.

## Human-verifiable deliverable (UI-only)

A non-technical user opens the app, navigates to Settings, sees a comprehensive preferences panel with multiple sections (Account, Privacy, Notifications, Appearance), can modify settings in each section, and observes that changes are saved and persist after page refresh.

## Acceptance criteria (UI-only)

- [ ] Settings page displays a "Preferences" panel with at least three sections: Account, Privacy, and Notifications
- [ ] Each section is clearly labeled and contains relevant preference controls (checkboxes, dropdowns, toggles)
- [ ] User can modify settings in any section and see immediate visual feedback
- [ ] Clicking "Save" button persists all changes to localStorage
- [ ] After page refresh, all saved preferences are restored and displayed correctly
- [ ] Settings panel is accessible via keyboard navigation (Tab key moves between controls)

## Constraints

- Must use existing design system components (no custom styling)
- Preferences must persist in localStorage (no backend required)
- Must work in Chrome, Firefox, Safari, and Edge
- Must be accessible (WCAG 2.1 AA compliant)

## Non-goals

- Backend API integration for preference storage
- Advanced theming or customization beyond basic appearance settings
- Per-component preference overrides (global preferences only)
- Preference import/export functionality`

    const result = evaluateTicketReady(body)
    expect(result.ready).toBe(true)
    expect(result.missingItems).toEqual([])
    expect(result.checklistResults.goal).toBe(true)
    expect(result.checklistResults.deliverable).toBe(true)
    expect(result.checklistResults.acceptanceCriteria).toBe(true)
    expect(result.checklistResults.constraintsNonGoals).toBe(true)
    expect(result.checklistResults.noPlaceholders).toBe(true)
  })

  it('returns ready=false for ticket that is too short', () => {
    const body = `## Goal (one sentence)

Short ticket.`

    const result = evaluateTicketReady(body)
    expect(result.ready).toBe(false)
    expect(result.missingItems).toContain('Ticket content is too short (needs more content beyond template)')
    expect(result.checklistResults.goal).toBe(false)
  })

  it('returns ready=false for ticket with mostly placeholders', () => {
    // Create content where placeholders are > 50% of total
    const placeholders = '<placeholder>'.repeat(200) // ~2800 chars
    const realContent = 'x'.repeat(1000) // 1000 chars
    const body = `## Goal (one sentence)

${placeholders}

## Human-verifiable deliverable (UI-only)

${realContent}

## Acceptance criteria (UI-only)

- [ ] <AC 1>
- [ ] <AC 2>
- [ ] <AC 3>`

    const result = evaluateTicketReady(body)
    expect(result.ready).toBe(false)
    expect(result.missingItems).toContain('Ticket contains too many unresolved placeholders')
    expect(result.checklistResults.noPlaceholders).toBe(false)
  })

  it('returns ready=true for ticket with some placeholders but mostly real content', () => {
    const body = `## Goal (one sentence)

Add a comprehensive feature to the application that allows users to manage their preferences and settings in a centralized location. This feature will include multiple sections for different types of preferences, validation, and persistence.

## Human-verifiable deliverable (UI-only)

A non-technical user opens the app, navigates to Settings, sees a comprehensive preferences panel with multiple sections (Account, Privacy, Notifications, Appearance), can modify settings in each section, and observes that changes are saved and persist after page refresh.

## Acceptance criteria (UI-only)

- [ ] Settings page displays a "Preferences" panel with at least three sections: Account, Privacy, and Notifications
- [ ] Each section is clearly labeled and contains relevant preference controls (checkboxes, dropdowns, toggles)
- [ ] User can modify settings in any section and see immediate visual feedback
- [ ] Clicking "Save" button persists all changes to localStorage
- [ ] After page refresh, all saved preferences are restored and displayed correctly
- [ ] Settings panel is accessible via keyboard navigation (Tab key moves between controls)

## Constraints

- Must use existing design system components (no custom styling)
- Preferences must persist in localStorage (no backend required)
- Must work in Chrome, Firefox, Safari, and Edge
- Must be accessible (WCAG 2.1 AA compliant)

## Non-goals

- Backend API integration for preference storage
- Advanced theming or customization beyond basic appearance settings
- Per-component preference overrides (global preferences only)
- Preference import/export functionality

<some placeholder that is less than 50% of content>`

    const result = evaluateTicketReady(body)
    expect(result.ready).toBe(true)
    expect(result.missingItems).toEqual([])
  })

  it('handles empty string', () => {
    const result = evaluateTicketReady('')
    expect(result.ready).toBe(false)
    expect(result.missingItems).toContain('Ticket content is too short (needs more content beyond template)')
  })

  it('handles whitespace-only string', () => {
    const result = evaluateTicketReady('   \n\n   ')
    expect(result.ready).toBe(false)
    expect(result.missingItems).toContain('Ticket content is too short (needs more content beyond template)')
  })

  it('trims leading and trailing whitespace', () => {
    // Create substantial content (over 1500 chars) with whitespace
    const content = 'x'.repeat(1600)
    const body = `   \n## Goal (one sentence)

${content}

## Human-verifiable deliverable (UI-only)

User sees feature.

## Acceptance criteria (UI-only)

- [ ] Item 1
- [ ] Item 2

## Constraints

None.

## Non-goals

None.   \n   `

    const result = evaluateTicketReady(body)
    // Should still be ready because content is substantial after trimming
    expect(result.ready).toBe(true)
  })

  it('detects placeholders with various formats', () => {
    const body = `<AC 1> and <task-id> and <what we want>`.repeat(100) // Make it long but all placeholders

    const result = evaluateTicketReady(body)
    expect(result.ready).toBe(false)
    expect(result.missingItems).toContain('Ticket contains too many unresolved placeholders')
  })

  it('handles edge case where content is exactly at baseline', () => {
    // Create content that's exactly 1500 characters (baseline)
    const shortContent = 'x'.repeat(1500)
    const result = evaluateTicketReady(shortContent)
    // Should be false because it needs to be > 1500
    expect(result.ready).toBe(false)
  })

  it('handles edge case where content is just above baseline', () => {
    // Create content that's 1501 characters (just above baseline)
    const content = 'x'.repeat(1501)
    const result = evaluateTicketReady(content)
    expect(result.ready).toBe(true)
  })

  it('handles placeholders that are exactly 50% of content', () => {
    // Create content where placeholders are exactly 50% (should pass the >50% check)
    // Need to ensure total is > 1500 chars and placeholders are exactly 50%
    const realContent = 'x'.repeat(1500)
    const placeholders = '<placeholder>'.repeat(107) // ~1500 chars (exactly 50% of 3000)
    const body = realContent + placeholders

    const result = evaluateTicketReady(body)
    // Should be ready because placeholders are not > 50% (exactly 50% should pass)
    expect(result.ready).toBe(true)
  })

  it('handles placeholders that are just over 50% of content', () => {
    // Create content where placeholders are just over 50%
    const realContent = 'x'.repeat(1000)
    const placeholders = '<placeholder>'.repeat(120) // ~1680 chars, > 50% of total
    const body = realContent + placeholders

    const result = evaluateTicketReady(body)
    expect(result.ready).toBe(false)
    expect(result.missingItems).toContain('Ticket contains too many unresolved placeholders')
  })
})
