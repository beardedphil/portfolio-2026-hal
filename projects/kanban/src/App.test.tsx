import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import App from './App'
import { HalKanbanContext } from './HalKanbanContext'

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
  const mockHalContext = {
    tickets: [],
    columns: [],
    agentRunsByTicketPk: {},
    repoFullName: null,
    theme: 'light' as const,
    onMoveTicket: vi.fn(),
    processReviewRunningForTicketPk: null,
    implementationAgentTicketId: null,
    qaAgentTicketId: null,
  }

  it('renders primary UI elements', () => {
    render(
      <HalKanbanContext.Provider value={mockHalContext}>
        <DndContext>
          <App />
        </DndContext>
      </HalKanbanContext.Provider>
    )

    // Check that the main app structure is rendered
    // The AppHeader component should render when not embedded
    const header = screen.queryByText('Portfolio 2026')
    expect(header).toBeInTheDocument()
  })

  it('renders columns section when board is active', () => {
    render(
      <HalKanbanContext.Provider value={mockHalContext}>
        <DndContext>
          <App />
        </DndContext>
      </HalKanbanContext.Provider>
    )

    // Check that columns section exists (even if empty)
    const columnsSection = screen.queryByLabelText('Columns')
    expect(columnsSection).toBeInTheDocument()
  })
})
