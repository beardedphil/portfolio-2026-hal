import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TicketDetailModal } from './TicketDetailModal'
import type { SupabaseAgentArtifactRow, TicketAttachment } from './types'

describe('TicketDetailModal', () => {
  const mockArtifacts: SupabaseAgentArtifactRow[] = []
  const mockAttachments: TicketAttachment[] = []
  const mockOnOpenArtifact = () => {}
  const mockOnValidationPass = vi.fn(async () => {})
  const mockOnValidationFail = vi.fn(async () => {})
  const mockOnTicketUpdate = vi.fn(() => {})
  const mockOnClose = vi.fn(() => {})

  beforeEach(() => {
    vi.clearAllMocks()
    document.body.style.overflow = ''
  })

  afterEach(() => {
    document.body.style.overflow = ''
  })

  it('renders modal with title when open', () => {
    render(
      <TicketDetailModal
        open={true}
        onClose={mockOnClose}
        ticketId="HAL-0606"
        title="Test Ticket"
        body="Test body content"
        loading={false}
        error={null}
        artifacts={mockArtifacts}
        artifactsLoading={false}
        onOpenArtifact={mockOnOpenArtifact}
        columnId={null}
        onValidationPass={mockOnValidationPass}
        onValidationFail={mockOnValidationFail}
        supabaseUrl="https://test.supabase.co"
        supabaseKey="test-key"
        onTicketUpdate={mockOnTicketUpdate}
        attachments={mockAttachments}
        attachmentsLoading={false}
      />
    )

    expect(screen.getByText('Test Ticket')).toBeInTheDocument()
    expect(screen.getByText('ID: HAL-0606')).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    const { container } = render(
      <TicketDetailModal
        open={false}
        onClose={mockOnClose}
        ticketId="HAL-0606"
        title="Test Ticket"
        body="Test body content"
        loading={false}
        error={null}
        artifacts={mockArtifacts}
        artifactsLoading={false}
        onOpenArtifact={mockOnOpenArtifact}
        columnId={null}
        onValidationPass={mockOnValidationPass}
        onValidationFail={mockOnValidationFail}
        supabaseUrl="https://test.supabase.co"
        supabaseKey="test-key"
        onTicketUpdate={mockOnTicketUpdate}
        attachments={mockAttachments}
        attachmentsLoading={false}
      />
    )

    expect(container.firstChild).toBeNull()
  })

  it('renders loading state', () => {
    render(
      <TicketDetailModal
        open={true}
        onClose={mockOnClose}
        ticketId="HAL-0606"
        title="Test Ticket"
        body={null}
        loading={true}
        error={null}
        artifacts={mockArtifacts}
        artifactsLoading={false}
        onOpenArtifact={mockOnOpenArtifact}
        columnId={null}
        onValidationPass={mockOnValidationPass}
        onValidationFail={mockOnValidationFail}
        supabaseUrl="https://test.supabase.co"
        supabaseKey="test-key"
        onTicketUpdate={mockOnTicketUpdate}
        attachments={mockAttachments}
        attachmentsLoading={false}
      />
    )

    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('renders error state', () => {
    render(
      <TicketDetailModal
        open={true}
        onClose={mockOnClose}
        ticketId="HAL-0606"
        title="Test Ticket"
        body={null}
        loading={false}
        error="Test error message"
        artifacts={mockArtifacts}
        artifactsLoading={false}
        onOpenArtifact={mockOnOpenArtifact}
        columnId={null}
        onValidationPass={mockOnValidationPass}
        onValidationFail={mockOnValidationFail}
        supabaseUrl="https://test.supabase.co"
        supabaseKey="test-key"
        onTicketUpdate={mockOnTicketUpdate}
        attachments={mockAttachments}
        attachmentsLoading={false}
      />
    )

    expect(screen.getByText('Test error message')).toBeInTheDocument()
  })

  it('renders with minimal props without runtime errors', () => {
    expect(() => {
      render(
        <TicketDetailModal
          open={true}
          onClose={mockOnClose}
          ticketId="HAL-0606"
          title="Test Ticket"
          body={null}
          loading={false}
          error={null}
          artifacts={mockArtifacts}
          artifactsLoading={false}
          onOpenArtifact={mockOnOpenArtifact}
          columnId={null}
          onValidationPass={mockOnValidationPass}
          onValidationFail={mockOnValidationFail}
          supabaseUrl="https://test.supabase.co"
          supabaseKey="test-key"
          onTicketUpdate={mockOnTicketUpdate}
          attachments={mockAttachments}
          attachmentsLoading={false}
        />
      )
    }).not.toThrow()
  })

  describe('Validation handlers', () => {
    it('calls onValidationPass when pass button is clicked and shows success message', async () => {
      render(
        <TicketDetailModal
          open={true}
          onClose={mockOnClose}
          ticketId="HAL-0606"
          title="Test Ticket"
          body="Test body"
          loading={false}
          error={null}
          artifacts={mockArtifacts}
          artifactsLoading={false}
          onOpenArtifact={mockOnOpenArtifact}
          columnId="col-human-in-the-loop"
          onValidationPass={mockOnValidationPass}
          onValidationFail={mockOnValidationFail}
          supabaseUrl="https://test.supabase.co"
          supabaseKey="test-key"
          onTicketUpdate={mockOnTicketUpdate}
          attachments={mockAttachments}
          attachmentsLoading={false}
        />
      )

      const passButton = screen.getByRole('button', { name: /pass/i })
      fireEvent.click(passButton)

      await waitFor(() => {
        expect(mockOnValidationPass).toHaveBeenCalledWith('HAL-0606')
      })

      await waitFor(() => {
        expect(screen.getByText(/Ticket passed successfully/i)).toBeInTheDocument()
      })
    })

    it('shows error message when validation pass fails', async () => {
      const errorMessage = 'Network error'
      mockOnValidationPass.mockRejectedValueOnce(new Error(errorMessage))

      render(
        <TicketDetailModal
          open={true}
          onClose={mockOnClose}
          ticketId="HAL-0606"
          title="Test Ticket"
          body="Test body"
          loading={false}
          error={null}
          artifacts={mockArtifacts}
          artifactsLoading={false}
          onOpenArtifact={mockOnOpenArtifact}
          columnId="col-human-in-the-loop"
          onValidationPass={mockOnValidationPass}
          onValidationFail={mockOnValidationFail}
          supabaseUrl="https://test.supabase.co"
          supabaseKey="test-key"
          onTicketUpdate={mockOnTicketUpdate}
          attachments={mockAttachments}
          attachmentsLoading={false}
        />
      )

      const passButton = screen.getByRole('button', { name: /pass/i })
      fireEvent.click(passButton)

      await waitFor(() => {
        expect(screen.getByText(new RegExp(`Failed to pass ticket: ${errorMessage}`, 'i'))).toBeInTheDocument()
      })
    })

    it('requires explanation before failing ticket', async () => {
      render(
        <TicketDetailModal
          open={true}
          onClose={mockOnClose}
          ticketId="HAL-0606"
          title="Test Ticket"
          body="Test body"
          loading={false}
          error={null}
          artifacts={mockArtifacts}
          artifactsLoading={false}
          onOpenArtifact={mockOnOpenArtifact}
          columnId="col-human-in-the-loop"
          onValidationPass={mockOnValidationPass}
          onValidationFail={mockOnValidationFail}
          supabaseUrl="https://test.supabase.co"
          supabaseKey="test-key"
          onTicketUpdate={mockOnTicketUpdate}
          attachments={mockAttachments}
          attachmentsLoading={false}
        />
      )

      const failButton = screen.getByRole('button', { name: /fail/i })
      fireEvent.click(failButton)

      await waitFor(() => {
        expect(screen.getByText(/Please provide an explanation/i)).toBeInTheDocument()
      })

      expect(mockOnValidationFail).not.toHaveBeenCalled()
    })

    it('calls onValidationFail with steps and notes when provided', async () => {
      render(
        <TicketDetailModal
          open={true}
          onClose={mockOnClose}
          ticketId="HAL-0606"
          title="Test Ticket"
          body="Test body"
          loading={false}
          error={null}
          artifacts={mockArtifacts}
          artifactsLoading={false}
          onOpenArtifact={mockOnOpenArtifact}
          columnId="col-human-in-the-loop"
          onValidationPass={mockOnValidationPass}
          onValidationFail={mockOnValidationFail}
          supabaseUrl="https://test.supabase.co"
          supabaseKey="test-key"
          onTicketUpdate={mockOnTicketUpdate}
          attachments={mockAttachments}
          attachmentsLoading={false}
        />
      )

      const stepsInput = screen.getByText(/steps to validate/i).parentElement?.querySelector('textarea') as HTMLTextAreaElement
      const notesInput = screen.getByText(/^notes$/i).parentElement?.querySelector('textarea') as HTMLTextAreaElement
      
      fireEvent.change(stepsInput, { target: { value: 'Step 1: Check feature' } })
      fireEvent.change(notesInput, { target: { value: 'Feature is broken' } })

      const failButton = screen.getByRole('button', { name: /fail/i })
      fireEvent.click(failButton)

      await waitFor(() => {
        expect(mockOnValidationFail).toHaveBeenCalledWith('HAL-0606', 'Step 1: Check feature', 'Feature is broken')
      })
    })
  })

  describe('Keyboard handling and focus trap', () => {
    it('closes modal when Escape key is pressed', () => {
      render(
        <TicketDetailModal
          open={true}
          onClose={mockOnClose}
          ticketId="HAL-0606"
          title="Test Ticket"
          body="Test body"
          loading={false}
          error={null}
          artifacts={mockArtifacts}
          artifactsLoading={false}
          onOpenArtifact={mockOnOpenArtifact}
          columnId={null}
          onValidationPass={mockOnValidationPass}
          onValidationFail={mockOnValidationFail}
          supabaseUrl="https://test.supabase.co"
          supabaseKey="test-key"
          onTicketUpdate={mockOnTicketUpdate}
          attachments={mockAttachments}
          attachmentsLoading={false}
        />
      )

      const modal = screen.getByRole('dialog')
      fireEvent.keyDown(modal, { key: 'Escape' })

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('traps focus within modal when Tab is pressed', () => {
      render(
        <TicketDetailModal
          open={true}
          onClose={mockOnClose}
          ticketId="HAL-0606"
          title="Test Ticket"
          body="Test body"
          loading={false}
          error={null}
          artifacts={mockArtifacts}
          artifactsLoading={false}
          onOpenArtifact={mockOnOpenArtifact}
          columnId={null}
          onValidationPass={mockOnValidationPass}
          onValidationFail={mockOnValidationFail}
          supabaseUrl="https://test.supabase.co"
          supabaseKey="test-key"
          onTicketUpdate={mockOnTicketUpdate}
          attachments={mockAttachments}
          attachmentsLoading={false}
        />
      )

      const modal = screen.getByRole('dialog')
      const closeButton = screen.getByLabelText('Close')
      
      // Focus should start on close button
      expect(document.activeElement).toBe(closeButton)

      // Simulate Tab from last focusable element
      const lastFocusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      if (lastFocusable.length > 0) {
        const lastEl = lastFocusable[lastFocusable.length - 1] as HTMLElement
        lastEl.focus()
        
        fireEvent.keyDown(modal, { key: 'Tab' })
        
        // Focus should wrap to first element
        expect(document.activeElement).toBe(closeButton)
      }
    })
  })

  describe('Scroll lock behavior', () => {
    it('locks body scroll when modal opens', () => {
      const { rerender } = render(
        <TicketDetailModal
          open={false}
          onClose={mockOnClose}
          ticketId="HAL-0606"
          title="Test Ticket"
          body="Test body"
          loading={false}
          error={null}
          artifacts={mockArtifacts}
          artifactsLoading={false}
          onOpenArtifact={mockOnOpenArtifact}
          columnId={null}
          onValidationPass={mockOnValidationPass}
          onValidationFail={mockOnValidationFail}
          supabaseUrl="https://test.supabase.co"
          supabaseKey="test-key"
          onTicketUpdate={mockOnTicketUpdate}
          attachments={mockAttachments}
          attachmentsLoading={false}
        />
      )

      expect(document.body.style.overflow).toBe('')

      rerender(
        <TicketDetailModal
          open={true}
          onClose={mockOnClose}
          ticketId="HAL-0606"
          title="Test Ticket"
          body="Test body"
          loading={false}
          error={null}
          artifacts={mockArtifacts}
          artifactsLoading={false}
          onOpenArtifact={mockOnOpenArtifact}
          columnId={null}
          onValidationPass={mockOnValidationPass}
          onValidationFail={mockOnValidationFail}
          supabaseUrl="https://test.supabase.co"
          supabaseKey="test-key"
          onTicketUpdate={mockOnTicketUpdate}
          attachments={mockAttachments}
          attachmentsLoading={false}
        />
      )

      expect(document.body.style.overflow).toBe('hidden')
    })

    it('restores body scroll when modal closes', () => {
      const { rerender } = render(
        <TicketDetailModal
          open={true}
          onClose={mockOnClose}
          ticketId="HAL-0606"
          title="Test Ticket"
          body="Test body"
          loading={false}
          error={null}
          artifacts={mockArtifacts}
          artifactsLoading={false}
          onOpenArtifact={mockOnOpenArtifact}
          columnId={null}
          onValidationPass={mockOnValidationPass}
          onValidationFail={mockOnValidationFail}
          supabaseUrl="https://test.supabase.co"
          supabaseKey="test-key"
          onTicketUpdate={mockOnTicketUpdate}
          attachments={mockAttachments}
          attachmentsLoading={false}
        />
      )

      expect(document.body.style.overflow).toBe('hidden')

      rerender(
        <TicketDetailModal
          open={false}
          onClose={mockOnClose}
          ticketId="HAL-0606"
          title="Test Ticket"
          body="Test body"
          loading={false}
          error={null}
          artifacts={mockArtifacts}
          artifactsLoading={false}
          onOpenArtifact={mockOnOpenArtifact}
          columnId={null}
          onValidationPass={mockOnValidationPass}
          onValidationFail={mockOnValidationFail}
          supabaseUrl="https://test.supabase.co"
          supabaseKey="test-key"
          onTicketUpdate={mockOnTicketUpdate}
          attachments={mockAttachments}
          attachmentsLoading={false}
        />
      )

      expect(document.body.style.overflow).toBe('')
    })
  })
})
