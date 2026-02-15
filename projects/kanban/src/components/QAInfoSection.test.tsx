import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QAInfoSection } from './QAInfoSection'

describe('QAInfoSection', () => {
  it('renders key headings with minimal props', () => {
    render(<QAInfoSection bodyMd={null} />)
    expect(screen.getByText('QA Information')).toBeInTheDocument()
    expect(screen.getByText('Feature branch:')).toBeInTheDocument()
    expect(screen.getByText('Merged to main:')).toBeInTheDocument()
  })

  it('handles null bodyMd gracefully', () => {
    render(<QAInfoSection bodyMd={null} />)
    expect(screen.getByText('Not specified')).toBeInTheDocument()
    expect(screen.getByText('❌ No')).toBeInTheDocument()
  })

  it('renders feature branch when present', () => {
    const bodyMd = '**Branch**: `feature/test-branch`'
    render(<QAInfoSection bodyMd={bodyMd} />)
    expect(screen.getByText('feature/test-branch')).toBeInTheDocument()
  })

  it('renders merged status when present', () => {
    const bodyMd = '**Merged to main**: Yes'
    render(<QAInfoSection bodyMd={bodyMd} />)
    expect(screen.getByText(/✅ Yes/)).toBeInTheDocument()
  })

  it('shows warning when not merged', () => {
    render(<QAInfoSection bodyMd={null} />)
    expect(screen.getByText(/Warning:/)).toBeInTheDocument()
    expect(screen.getByText(/must be merged to main/)).toBeInTheDocument()
  })
})
