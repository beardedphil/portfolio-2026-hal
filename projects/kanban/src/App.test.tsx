import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'
import { HalKanbanContext } from './HalKanbanContext'

// Mock the HalKanbanContext provider
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

// Mock DndContext to avoid drag-and-drop setup in tests
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div data-testid="dnd-context">{children}</div>,
  DragOverlay: ({ children }: { children?: React.ReactNode }) => <div data-testid="drag-overlay">{children}</div>,
  closestCenter: vi.fn(),
  pointerWithin: vi.fn(),
  rectIntersection: vi.fn(),
  getFirstCollision: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(),
  useDraggable: vi.fn(),
  useDroppable: vi.fn(),
}))

// Mock SortableContext
vi.mock('@dnd-kit/sortable', () => ({
  arrayMove: vi.fn(),
  SortableContext: ({ children }: { children: React.ReactNode }) => <div data-testid="sortable-context">{children}</div>,
  sortableKeyboardCoordinates: vi.fn(),
  horizontalListSortingStrategy: {},
  useSortable: vi.fn(),
}))

// Mock Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
        limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
    })),
  })),
}))

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the main App component with primary UI elements', () => {
    render(
      <HalKanbanContext.Provider value={mockHalContext}>
        <App />
      </HalKanbanContext.Provider>
    )

    // Check that the DndContext is rendered (main container)
    expect(screen.getByTestId('dnd-context')).toBeInTheDocument()

    // Check that the columns section is rendered
    const columnsSection = screen.getByLabelText('Columns')
    expect(columnsSection).toBeInTheDocument()
  })

  it('renders debug toggle button when not embedded', () => {
    render(
      <HalKanbanContext.Provider value={mockHalContext}>
        <App />
      </HalKanbanContext.Provider>
    )

    // The debug toggle should be present (it's always rendered, just hidden when embedded)
    const debugToggle = screen.queryByRole('button', { name: /debug/i })
    // Note: The button text is "Debug OFF" or "Debug ON", so we check for button with "debug" in name
    expect(debugToggle).toBeInTheDocument()
  })
})
