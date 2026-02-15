import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TicketDetailModal } from './TicketDetailModal'
import type { SupabaseAgentArtifactRow, TicketAttachment } from './types'

describe('TicketDetailModal', () => {
  const mockArtifacts: SupabaseAgentArtifactRow[] = []
  const mockAttachments: TicketAttachment[] = []
  const mockOnOpenArtifact = () => {}
  const mockOnValidationPass = async () => {}
  const mockOnValidationFail = async () => {}
  const mockOnTicketUpdate = () => {}
  const mockOnClose = () => {}

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
})
