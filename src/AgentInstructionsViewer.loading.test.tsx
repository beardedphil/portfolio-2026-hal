import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { AgentInstructionsViewer } from './AgentInstructionsViewer'
import { mockInstructionsResponse, mockIndexResponse, mockOnClose } from './AgentInstructionsViewer.test.setup'
import './AgentInstructionsViewer.test.setup'

describe('AgentInstructionsViewer - Initial loading state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(global.fetch as any).mockReset()
  })

  it('shows loading state when fetching instructions', async () => {
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

    render(
      <AgentInstructionsViewer
        isOpen={true}
        onClose={mockOnClose}
        supabaseUrl="https://test.supabase.co"
        supabaseAnonKey="test-key"
      />
    )

    // Should show loading initially
    expect(screen.getByText('Loading instructions...')).toBeInTheDocument()

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByText('Loading instructions...')).not.toBeInTheDocument()
    })
  })

  it('falls back to bundled JSON when Supabase is not configured', async () => {
    const mockBundledJson = {
      instructions: [
        {
          path: 'bundled-instruction.mdc',
          name: 'Bundled Instruction',
          description: 'A bundled instruction',
          alwaysApply: true,
          content: 'Bundled content',
          agentTypes: ['all'],
          isBasic: true,
          isSituational: false,
        },
      ],
      index: {
        basic: ['bundled-instruction'],
        situational: {},
        topics: {},
      },
      basic: [
        {
          path: 'bundled-instruction.mdc',
          name: 'Bundled Instruction',
          description: 'A bundled instruction',
          alwaysApply: true,
          content: 'Bundled content',
          agentTypes: ['all'],
          isBasic: true,
          isSituational: false,
        },
      ],
      situational: [],
    }

    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url === '/agent-instructions.json') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBundledJson),
        })
      }
      return Promise.reject(new Error('Unexpected URL'))
    })

    render(
      <AgentInstructionsViewer
        isOpen={true}
        onClose={mockOnClose}
        supabaseUrl={null}
        supabaseAnonKey={null}
      />
    )

    // Wait for bundled JSON to load
    await waitFor(() => {
      expect(screen.queryByText('Loading instructions...')).not.toBeInTheDocument()
    })

    // Should show agent selection (not error)
    expect(screen.getByText('Select an agent to view instructions:')).toBeInTheDocument()
  })
})
