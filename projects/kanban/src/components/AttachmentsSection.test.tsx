import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AttachmentsSection } from './AttachmentsSection'
import type { TicketAttachment } from './types'

describe('AttachmentsSection', () => {
  it('renders loading state', () => {
    render(<AttachmentsSection attachments={[]} loading={true} />)
    expect(screen.getByText('Loading attachments…')).toBeInTheDocument()
    expect(screen.getByText('Attachments')).toBeInTheDocument()
  })

  it('renders nothing when empty and not loading', () => {
    const { container } = render(<AttachmentsSection attachments={[]} loading={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders attachments list with key headings', () => {
    const attachments: TicketAttachment[] = [
      {
        pk: '1',
        ticket_pk: 'ticket-1',
        ticket_id: 'ticket-1',
        filename: 'test.pdf',
        mime_type: 'application/pdf',
        data_url: 'data:application/pdf;base64,test',
        file_size: 1024,
        created_at: '2024-01-01T00:00:00Z',
      },
      {
        pk: '2',
        ticket_pk: 'ticket-1',
        ticket_id: 'ticket-1',
        filename: 'image.png',
        mime_type: 'image/png',
        data_url: 'data:image/png;base64,test',
        file_size: 2048,
        created_at: '2024-01-01T00:00:00Z',
      },
    ]

    render(<AttachmentsSection attachments={attachments} loading={false} />)
    
    expect(screen.getByText('Attachments')).toBeInTheDocument()
    expect(screen.getByText('test.pdf')).toBeInTheDocument()
    expect(screen.getByText('image.png')).toBeInTheDocument()
  })

  it('handles missing optional props gracefully', () => {
    const attachments: TicketAttachment[] = [
      {
        pk: '1',
        ticket_pk: 'ticket-1',
        ticket_id: 'ticket-1',
        filename: 'test.pdf',
        mime_type: 'application/pdf',
        data_url: 'data:application/pdf;base64,test',
        file_size: null,
        created_at: '2024-01-01T00:00:00Z',
      },
    ]

    render(<AttachmentsSection attachments={attachments} loading={false} />)
    expect(screen.getByText('test.pdf')).toBeInTheDocument()
  })
})
