import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QAInfoSection } from './QAInfoSection'

describe('QAInfoSection', () => {
  it('renders key headings/labels given minimal props', () => {
    render(<QAInfoSection bodyMd={null} />)
    
    expect(screen.getByText('QA Information')).toBeInTheDocument()
    expect(screen.getByText('Feature branch:')).toBeInTheDocument()
    expect(screen.getByText('Merged to main:')).toBeInTheDocument()
  })

  it('shows "Not specified" when no branch is found', () => {
    render(<QAInfoSection bodyMd="Some ticket content" />)
    
    expect(screen.getByText('Not specified')).toBeInTheDocument()
    expect(screen.getByText('❌ No')).toBeInTheDocument()
  })

  it('displays feature branch when present', () => {
    const bodyMd = '**Branch**: `feature/my-branch`'
    render(<QAInfoSection bodyMd={bodyMd} />)
    
    expect(screen.getByText('feature/my-branch')).toBeInTheDocument()
  })

  it('shows merged status when merged to main', () => {
    const bodyMd = '**Merged to main**: Yes'
    render(<QAInfoSection bodyMd={bodyMd} />)
    
    expect(screen.getByText(/✅ Yes/)).toBeInTheDocument()
  })

  it('shows warning when not merged', () => {
    render(<QAInfoSection bodyMd="Some content" />)
    
    expect(screen.getByText(/Warning:/)).toBeInTheDocument()
    expect(screen.getByText(/must be merged to main/)).toBeInTheDocument()
  })

  it('handles null bodyMd without errors', () => {
    const { container } = render(<QAInfoSection bodyMd={null} />)
    expect(container.firstChild).toBeInTheDocument()
    expect(screen.getByText('QA Information')).toBeInTheDocument()
  })
})
