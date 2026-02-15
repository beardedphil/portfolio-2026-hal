import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { SortableCard } from './SortableCard'

// Mock useSortable hook
vi.mock('@dnd-kit/sortable', async () => {
  const actual = await vi.importActual('@dnd-kit/sortable')
  return {
    ...actual,
    useSortable: vi.fn(() => ({
      attributes: {
        role: 'button',
        tabIndex: 0,
      },
      listeners: {
        onPointerDown: vi.fn(),
      },
      setNodeRef: vi.fn(),
      transform: null,
      transition: null,
      isDragging: false,
    })),
  }
})

describe('SortableCard', () => {
  const mockCard = {
    id: 'card-1',
    title: 'Test Ticket Title',
  }

  const mockOnOpenDetail = vi.fn()

  const renderSortableCard = (props = {}) => {
    return render(
      <DndContext>
        <SortableCard
          card={mockCard}
          columnId="col-todo"
          onOpenDetail={mockOnOpenDetail}
          activeWorkAgentType={null}
          isSaving={false}
          {...props}
        />
      </DndContext>
    )
  }

  it('renders drag handle with stable aria label', () => {
    renderSortableCard()

    const dragHandle = screen.getByLabelText('Drag to move')
    expect(dragHandle).toBeInTheDocument()
    expect(dragHandle).toHaveAttribute('aria-label', 'Drag to move')
    expect(dragHandle).toHaveAttribute('title', 'Drag to move')
  })

  it('renders clickable area with the title', () => {
    renderSortableCard()

    const clickableArea = screen.getByLabelText(`Open ticket ${mockCard.id}: ${mockCard.title}`)
    expect(clickableArea).toBeInTheDocument()
    expect(clickableArea).toHaveTextContent(mockCard.title)
  })

  it('calls onOpenDetail when clickable area is clicked', () => {
    renderSortableCard()

    const clickableArea = screen.getByLabelText(`Open ticket ${mockCard.id}: ${mockCard.title}`)
    fireEvent.click(clickableArea)

    expect(mockOnOpenDetail).toHaveBeenCalledTimes(1)
    expect(mockOnOpenDetail).toHaveBeenCalledWith(mockCard.id)
  })

  it('renders saving indicator when isSaving is true', () => {
    const { container } = renderSortableCard({ isSaving: true })

    const savingIndicator = screen.getByLabelText('Saving')
    expect(savingIndicator).toBeInTheDocument()
    expect(savingIndicator).toHaveAttribute('title', 'Saving...')
    
    const card = container.querySelector('[data-card-id="card-1"]')
    expect(card).toBeInTheDocument()
    expect(card).toHaveAttribute('aria-busy', 'true')
    expect(card).toHaveClass('ticket-card-saving')
  })

  it('does not render saving indicator when isSaving is false', () => {
    const { container } = renderSortableCard({ isSaving: false })

    const savingIndicator = screen.queryByLabelText('Saving')
    expect(savingIndicator).not.toBeInTheDocument()
    
    const card = container.querySelector('[data-card-id="card-1"]')
    expect(card).toBeInTheDocument()
    expect(card).toHaveAttribute('aria-busy', 'false')
    expect(card).not.toHaveClass('ticket-card-saving')
  })

  it('shows agent badge only when columnId is "col-doing"', () => {
    const { rerender } = renderSortableCard({ columnId: 'col-doing', activeWorkAgentType: 'Implementation' })

    let agentBadge = screen.queryByText('Implementation')
    expect(agentBadge).toBeInTheDocument()
    expect(agentBadge).toHaveAttribute('title', 'Working: Implementation Agent')

    rerender(
      <DndContext>
        <SortableCard
          card={mockCard}
          columnId="col-todo"
          onOpenDetail={mockOnOpenDetail}
          activeWorkAgentType="Implementation"
          isSaving={false}
        />
      </DndContext>
    )

    agentBadge = screen.queryByText('Implementation')
    expect(agentBadge).not.toBeInTheDocument()
  })

  it('shows "Unassigned" badge when columnId is "col-doing" and activeWorkAgentType is null', () => {
    renderSortableCard({ columnId: 'col-doing', activeWorkAgentType: null })

    const agentBadge = screen.getByText('Unassigned')
    expect(agentBadge).toBeInTheDocument()
    expect(agentBadge).toHaveAttribute('title', 'No agent currently working')
  })

  it('shows agent badge with QA agent type when columnId is "col-doing"', () => {
    renderSortableCard({ columnId: 'col-doing', activeWorkAgentType: 'QA' })

    const agentBadge = screen.getByText('QA')
    expect(agentBadge).toBeInTheDocument()
    expect(agentBadge).toHaveAttribute('title', 'Working: QA Agent')
  })

  it('disables clickable area when isSaving is true', () => {
    renderSortableCard({ isSaving: true })

    const clickableArea = screen.getByLabelText(`Open ticket ${mockCard.id}: ${mockCard.title}`)
    expect(clickableArea).toBeDisabled()
  })
})
