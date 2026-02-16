import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { DroppableActiveWorkRow } from './DroppableActiveWorkRow'

describe('DroppableActiveWorkRow', () => {
  it('renders "Active Work" heading and accessible label', () => {
    render(
      <DndContext>
        <DroppableActiveWorkRow
          doingTickets={[]}
          activeWorkAgentTypes={{}}
          agentRunsByTicketPk={{}}
          onOpenDetail={vi.fn()}
          pendingMoves={new Set()}
        />
      </DndContext>
    )

    expect(screen.getByRole('heading', { name: 'Active Work' })).toBeInTheDocument()
    expect(screen.getByLabelText('Active Work')).toBeInTheDocument()
  })
})

