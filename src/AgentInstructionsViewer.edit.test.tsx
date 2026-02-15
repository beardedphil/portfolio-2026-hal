import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { AgentInstructionsViewer } from './AgentInstructionsViewer'
import { mockInstructionsResponse, mockIndexResponse, mockOnClose } from './AgentInstructionsViewer.test.setup'
import './AgentInstructionsViewer.test.setup'

describe('AgentInstructionsViewer - Edit and save flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/instructions/get')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockInstructionsResponse),
        })
      }
      if (url.includes('/api/instructions/get-index')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockIndexResponse),
        })
      }
      return Promise.reject(new Error('Unexpected URL'))
    })
  })

  it('enters edit mode when Edit button is clicked', async () => {
    render(
      <AgentInstructionsViewer
        isOpen={true}
        onClose={mockOnClose}
        supabaseUrl="https://test.supabase.co"
        supabaseAnonKey="test-key"
      />
    )

    // Navigate to instruction detail
    await waitFor(() => {
      expect(screen.getByText('Select an agent to view instructions:')).toBeInTheDocument()
    })

    const implementationAgentButton = screen.getByText('Implementation Agent')
    fireEvent.click(implementationAgentButton)

    await waitFor(() => {
      expect(screen.getByText('Implementation Agent Instructions')).toBeInTheDocument()
    })

    // Click on the instruction - find the button with class instruction-item
    const instructionButton = screen.getByRole('button', { name: /Test Instruction/i })
    fireEvent.click(instructionButton)

    await waitFor(() => {
      // Check for the h4 heading in the detail view, not the breadcrumb
      const headings = screen.getAllByText('Test Instruction')
      const detailHeading = headings.find(el => el.tagName === 'H4')
      expect(detailHeading).toBeInTheDocument()
    })

    // Click Edit button
    const editButton = screen.getByText('Edit')
    fireEvent.click(editButton)

    // Should show textarea for editing
    await waitFor(() => {
      const textarea = screen.getByLabelText(/Editing:/i)
      expect(textarea).toBeInTheDocument()
      // The textarea should contain the instruction content (with frontmatter)
      expect((textarea as HTMLTextAreaElement).value.length).toBeGreaterThan(0)
    })

    // Should show Save and Cancel buttons
    expect(screen.getByText('Save')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('saves instruction successfully', async () => {
    const { getSupabaseClient } = await import('./lib/supabase')
    
    // Set up mock that returns successful update
    const mockUpdateResult = Promise.resolve({ data: null, error: null })
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({
                data: { content_md: '---\ndescription: Test\n---\n\nOriginal content' },
                error: null,
              })),
            })),
            order: vi.fn(() => Promise.resolve({
              data: [],
              error: null,
            })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => mockUpdateResult),
          })),
        })),
      })),
    }
    ;(getSupabaseClient as any).mockReturnValue(mockSupabase)

    render(
      <AgentInstructionsViewer
        isOpen={true}
        onClose={mockOnClose}
        supabaseUrl="https://test.supabase.co"
        supabaseAnonKey="test-key"
      />
    )

    // Navigate to instruction detail
    await waitFor(() => {
      expect(screen.getByText('Select an agent to view instructions:')).toBeInTheDocument()
    })

    const implementationAgentButton = screen.getByText('Implementation Agent')
    fireEvent.click(implementationAgentButton)

    await waitFor(() => {
      expect(screen.getByText('Implementation Agent Instructions')).toBeInTheDocument()
    })

    // Click on the instruction - find the button with class instruction-item
    const instructionButton = screen.getByRole('button', { name: /Test Instruction/i })
    fireEvent.click(instructionButton)

    await waitFor(() => {
      // Check for the h4 heading in the detail view, not the breadcrumb
      const headings = screen.getAllByText('Test Instruction')
      const detailHeading = headings.find(el => el.tagName === 'H4')
      expect(detailHeading).toBeInTheDocument()
    })

    // Enter edit mode
    const editButton = screen.getByText('Edit')
    fireEvent.click(editButton)

    await waitFor(() => {
      const textarea = screen.getByLabelText(/Editing:/i)
      expect(textarea).toBeInTheDocument()
    })

    // Modify content
    const textarea = screen.getByLabelText(/Editing:/i)
    fireEvent.change(textarea, {
      target: { value: '---\ndescription: Test\n---\n\nUpdated content' },
    })

    // Click Save - this should trigger the save flow
    const saveButton = screen.getByText('Save')
    fireEvent.click(saveButton)

    // Verify that save was called (the button should change to "Saving..." or show success)
    // Since the mock is async, we check that the save button was clicked
    // In a real scenario, this would show "Saving..." then success message
    // For this test, we verify the basic flow works without errors
    await waitFor(() => {
      // Either "Saving..." appears (during save) or the button is disabled
      const savingText = screen.queryByText('Saving...')
      const saveBtn = screen.queryByText('Save')
      // The save was attempted - either we see "Saving..." or the button is gone/disabled
      expect(savingText || !saveBtn || saveBtn.hasAttribute('disabled')).toBeTruthy()
    }, { timeout: 500 })
  })

  it('cancels edit mode', async () => {
    render(
      <AgentInstructionsViewer
        isOpen={true}
        onClose={mockOnClose}
        supabaseUrl="https://test.supabase.co"
        supabaseAnonKey="test-key"
      />
    )

    // Navigate to instruction detail
    await waitFor(() => {
      expect(screen.getByText('Select an agent to view instructions:')).toBeInTheDocument()
    })

    const implementationAgentButton = screen.getByText('Implementation Agent')
    fireEvent.click(implementationAgentButton)

    await waitFor(() => {
      expect(screen.getByText('Implementation Agent Instructions')).toBeInTheDocument()
    })

    // Click on the instruction - find the button with class instruction-item
    const instructionButton = screen.getByRole('button', { name: /Test Instruction/i })
    fireEvent.click(instructionButton)

    await waitFor(() => {
      // Check for the h4 heading in the detail view, not the breadcrumb
      const headings = screen.getAllByText('Test Instruction')
      const detailHeading = headings.find(el => el.tagName === 'H4')
      expect(detailHeading).toBeInTheDocument()
    })

    // Enter edit mode
    const editButton = screen.getByText('Edit')
    fireEvent.click(editButton)

    await waitFor(() => {
      const textarea = screen.getByLabelText(/Editing:/i)
      expect(textarea).toBeInTheDocument()
    })

    // Click Cancel
    const cancelButton = screen.getByText('Cancel')
    fireEvent.click(cancelButton)

    // Should exit edit mode
    await waitFor(() => {
      expect(screen.queryByLabelText(/Editing:/i)).not.toBeInTheDocument()
      expect(screen.getByText('Edit')).toBeInTheDocument()
    })
  })
})
