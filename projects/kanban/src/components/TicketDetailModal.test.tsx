import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TicketDetailModal } from './TicketDetailModal'
import type { SupabaseAgentArtifactRow, TicketAttachment } from './types'

describe('TicketDetailModal', () => {
  const mockArtifacts: SupabaseAgentArtifactRow[] = []
  const mockAttachments: TicketAttachment[] = []
  const mockOnOpenArtifact = vi.fn()
  const mockOnValidationPass = vi.fn()
  const mockOnValidationFail = vi.fn()
  const mockOnTicketUpdate = vi.fn()
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset body overflow style
    document.body.style.overflow = ''
  })

  afterEach(() => {
    // Clean up body overflow style
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

  describe('handlePass behavior', () => {
    it('calls onValidationPass and shows success message when pass button is clicked', async () => {
      mockOnValidationPass.mockResolvedValue(undefined)
      vi.useFakeTimers()

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

      const passButton = screen.getByText('Pass')
      fireEvent.click(passButton)

      await waitFor(() => {
        expect(mockOnValidationPass).toHaveBeenCalledWith('HAL-0606')
      })

      await waitFor(() => {
        expect(screen.getByText(/Ticket passed successfully/i)).toBeInTheDocument()
      })

      vi.useRealTimers()
    })

    it('shows error message when onValidationPass throws an error', async () => {
      const errorMessage = 'Validation failed'
      mockOnValidationPass.mockRejectedValue(new Error(errorMessage))

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

      const passButton = screen.getByText('Pass')
      fireEvent.click(passButton)

      await waitFor(() => {
        expect(screen.getByText(new RegExp(`Failed to pass ticket: ${errorMessage}`, 'i'))).toBeInTheDocument()
      })
    })

    it('calls onTicketUpdate after successful validation pass', async () => {
      mockOnValidationPass.mockResolvedValue(undefined)
      vi.useFakeTimers()

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

      const passButton = screen.getByText('Pass')
      fireEvent.click(passButton)

      await waitFor(() => {
        expect(mockOnValidationPass).toHaveBeenCalled()
      })

      // Advance timers to trigger setTimeout
      vi.advanceTimersByTime(500)

      await waitFor(() => {
        expect(mockOnTicketUpdate).toHaveBeenCalled()
      })

      vi.useRealTimers()
    })
  })

  describe('handleFail behavior', () => {
    it('requires validation steps or notes before failing ticket', async () => {
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

      const failButton = screen.getByText('Fail')
      fireEvent.click(failButton)

      await waitFor(() => {
        expect(screen.getByText(/Please provide an explanation/i)).toBeInTheDocument()
      })

      expect(mockOnValidationFail).not.toHaveBeenCalled()
    })

    it('calls onValidationFail and shows success message when fail button is clicked with validation steps', async () => {
      mockOnValidationFail.mockResolvedValue(undefined)
      vi.useFakeTimers()

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

      const stepsInput = screen.getByLabelText('Steps to validate')
      fireEvent.change(stepsInput, { target: { value: 'Step 1: Check X\nStep 2: Verify Y' } })

      const failButton = screen.getByText('Fail')
      fireEvent.click(failButton)

      await waitFor(() => {
        expect(mockOnValidationFail).toHaveBeenCalledWith('HAL-0606', 'Step 1: Check X\nStep 2: Verify Y', '')
      })

      await waitFor(() => {
        expect(screen.getByText(/Ticket failed.*QA artifact created/i)).toBeInTheDocument()
      })

      vi.useRealTimers()
    })

    it('shows error message when onValidationFail throws an error', async () => {
      const errorMessage = 'Failed to create artifact'
      mockOnValidationFail.mockRejectedValue(new Error(errorMessage))

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

      const notesInput = screen.getByLabelText('Notes')
      fireEvent.change(notesInput, { target: { value: 'Some notes' } })

      const failButton = screen.getByText('Fail')
      fireEvent.click(failButton)

      await waitFor(() => {
        expect(screen.getByText(new RegExp(`Failed to fail ticket: ${errorMessage}`, 'i'))).toBeInTheDocument()
      })
    })
  })

  describe('keyboard handling', () => {
    it('calls onClose when Escape key is pressed', () => {
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

      const dialog = screen.getByRole('dialog')
      fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' })

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('implements focus trap with Tab key', () => {
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

      const dialog = screen.getByRole('dialog')
      const closeButton = screen.getByLabelText('Close')
      
      // Focus the close button
      closeButton.focus()
      expect(document.activeElement).toBe(closeButton)

      // Find all focusable elements
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      // Tab from last element should wrap to first
      if (last) {
        last.focus()
        fireEvent.keyDown(dialog, { key: 'Tab', code: 'Tab' })
        // Focus should wrap to first element
        expect(document.activeElement).toBe(first)
      }
    })
  })

  describe('scroll lock behavior', () => {
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
