import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { AgentInstructionsViewer } from './AgentInstructionsViewer'
import { mockInstructionsResponse, mockIndexResponse, mockOnClose } from './AgentInstructionsViewer.test.setup'
import './AgentInstructionsViewer.test.setup'

describe('AgentInstructionsViewer - View state switching', () => {
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

  it('starts in agents view', async () => {
    render(
      <AgentInstructionsViewer
        isOpen={true}
        onClose={mockOnClose}
        supabaseUrl="https://test.supabase.co"
        supabaseAnonKey="test-key"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Select an agent to view instructions:')).toBeInTheDocument()
    })

    // Should show agent list
    expect(screen.getByText('All Agents')).toBeInTheDocument()
  })

  it('switches to agent-instructions view when agent is clicked', async () => {
    render(
      <AgentInstructionsViewer
        isOpen={true}
        onClose={mockOnClose}
        supabaseUrl="https://test.supabase.co"
        supabaseAnonKey="test-key"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Select an agent to view instructions:')).toBeInTheDocument()
    })

    // Click on Implementation Agent
    const implementationAgentButton = screen.getByText('Implementation Agent')
    fireEvent.click(implementationAgentButton)

    // Should switch to instruction list view
    await waitFor(() => {
      expect(screen.getByText('Implementation Agent Instructions')).toBeInTheDocument()
    })

    // Should show breadcrumbs (may appear multiple times, that's ok)
    expect(screen.getAllByText('All Agents').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Implementation Agent').length).toBeGreaterThan(0)
  })

  it('switches to instruction-detail view when instruction is clicked', async () => {
    render(
      <AgentInstructionsViewer
        isOpen={true}
        onClose={mockOnClose}
        supabaseUrl="https://test.supabase.co"
        supabaseAnonKey="test-key"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Select an agent to view instructions:')).toBeInTheDocument()
    })

    // Click on Implementation Agent
    const implementationAgentButton = screen.getByText('Implementation Agent')
    fireEvent.click(implementationAgentButton)

    await waitFor(() => {
      expect(screen.getByText('Implementation Agent Instructions')).toBeInTheDocument()
    })

    // Click on the instruction - find the button with class instruction-item
    const instructionButton = screen.getByRole('button', { name: /Test Instruction/i })
    fireEvent.click(instructionButton)

    // Should switch to detail view
    await waitFor(() => {
      // Check for the h4 heading in the detail view, not the breadcrumb
      const headings = screen.getAllByText('Test Instruction')
      const detailHeading = headings.find(el => el.tagName === 'H4')
      expect(detailHeading).toBeInTheDocument()
    })

    // Should show instruction content
    expect(screen.getByText('Test content')).toBeInTheDocument()
  })

  it('navigates back via breadcrumbs', async () => {
    render(
      <AgentInstructionsViewer
        isOpen={true}
        onClose={mockOnClose}
        supabaseUrl="https://test.supabase.co"
        supabaseAnonKey="test-key"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Select an agent to view instructions:')).toBeInTheDocument()
    })

    // Navigate to agent instructions
    const implementationAgentButton = screen.getByText('Implementation Agent')
    fireEvent.click(implementationAgentButton)

    await waitFor(() => {
      expect(screen.getByText('Implementation Agent Instructions')).toBeInTheDocument()
    })

    // Click breadcrumb to go back to agents view
    const breadcrumbs = screen.getAllByText('All Agents')
    fireEvent.click(breadcrumbs[0])

    // Should be back at agents view
    await waitFor(() => {
      expect(screen.getByText('Select an agent to view instructions:')).toBeInTheDocument()
    })
  })
})
