import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { PmWorkingMemoryPanel } from './PmWorkingMemoryPanel'

describe('PmWorkingMemoryPanel', () => {
  const mockWorkingMemory = {
    summary: 'Test summary',
    goals: ['Goal 1', 'Goal 2'],
    requirements: ['Requirement 1'],
    constraints: ['Constraint 1'],
    decisions: ['Decision 1'],
    assumptions: ['Assumption 1'],
    openQuestions: ['Question 1'],
    glossary: { term1: 'Definition 1' },
    stakeholders: ['Stakeholder 1'],
    lastUpdatedAt: '2024-01-01T00:00:00Z',
  }

  const defaultProps = {
    workingMemoryOpen: false,
    onToggle: vi.fn(),
    onRefresh: vi.fn(),
    workingMemory: null,
    loading: false,
    error: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders PM Working Memory panel', () => {
    render(<PmWorkingMemoryPanel {...defaultProps} workingMemoryOpen={true} />)
    
    expect(screen.getByRole('region', { name: /pm working memory/i })).toBeInTheDocument()
    expect(screen.getByText(/pm working memory/i)).toBeInTheDocument()
  })

  it('renders error state when error is present', () => {
    render(
      <PmWorkingMemoryPanel
        {...defaultProps}
        workingMemoryOpen={true}
        error="Failed to load working memory"
      />
    )
    
    expect(screen.getByText(/error:/i)).toBeInTheDocument()
    expect(screen.getByText(/failed to load working memory/i)).toBeInTheDocument()
  })

  it('renders loading state when loading and no working memory', () => {
    render(
      <PmWorkingMemoryPanel
        {...defaultProps}
        workingMemoryOpen={true}
        loading={true}
        workingMemory={null}
      />
    )
    
    expect(screen.getByText(/loading working memory/i)).toBeInTheDocument()
  })

  it('renders empty state when not loading and no working memory and no error', () => {
    render(
      <PmWorkingMemoryPanel
        {...defaultProps}
        workingMemoryOpen={true}
        loading={false}
        workingMemory={null}
        error={null}
      />
    )
    
    expect(screen.getByText(/no working memory available yet/i)).toBeInTheDocument()
  })

  it('renders working memory content when available', () => {
    render(
      <PmWorkingMemoryPanel
        {...defaultProps}
        workingMemoryOpen={true}
        workingMemory={mockWorkingMemory}
      />
    )
    
    expect(screen.getByText(/test summary/i)).toBeInTheDocument()
    expect(screen.getByText(/goals/i)).toBeInTheDocument()
    expect(screen.getByText(/goal 1/i)).toBeInTheDocument()
    expect(screen.getByText(/goal 2/i)).toBeInTheDocument()
  })

  it('calls onRefresh when refresh button is clicked', () => {
    const onRefresh = vi.fn()
    render(
      <PmWorkingMemoryPanel
        {...defaultProps}
        workingMemoryOpen={true}
        onRefresh={onRefresh}
      />
    )
    
    const refreshButton = screen.getByRole('button', { name: /refresh/i })
    fireEvent.click(refreshButton)
    
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('disables refresh button when loading', () => {
    render(
      <PmWorkingMemoryPanel
        {...defaultProps}
        workingMemoryOpen={true}
        loading={true}
      />
    )
    
    const refreshButton = screen.getByRole('button', { name: /refresh/i })
    expect(refreshButton).toBeDisabled()
  })

  it('shows "Refreshing..." text when loading', () => {
    render(
      <PmWorkingMemoryPanel
        {...defaultProps}
        workingMemoryOpen={true}
        loading={true}
      />
    )
    
    expect(screen.getByText(/refreshing/i)).toBeInTheDocument()
  })
})
