import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

// Mock child components that have complex dependencies
vi.mock('./components/TicketDetailModal', () => ({
  TicketDetailModal: () => <div data-testid="ticket-detail-modal">Ticket Detail Modal</div>,
}))

vi.mock('./components/ArtifactReportViewer', () => ({
  ArtifactReportViewer: () => <div data-testid="artifact-report-viewer">Artifact Report Viewer</div>,
}))

vi.mock('./components/SortableColumn', () => ({
  SortableColumn: () => <div data-testid="sortable-column">Sortable Column</div>,
}))

vi.mock('./components/DroppableActiveWorkRow', () => ({
  DroppableActiveWorkRow: () => <div data-testid="droppable-active-work-row">Active Work Row</div>,
}))

describe('App', () => {
  it('renders primary UI elements', () => {
    render(<App />)

    // Check that the main app structure is rendered
    // The AppHeader component should render when not embedded
    const header = screen.queryByText('Portfolio 2026')
    expect(header).toBeInTheDocument()
  })

  it('renders columns section when board is active', () => {
    render(<App />)

    // Check that columns section exists (even if empty)
    const columnsSection = screen.queryByLabelText('Columns')
    expect(columnsSection).toBeInTheDocument()
  })
})
