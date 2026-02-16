import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { QAMetricsCard } from './QAMetricsCard'

// Mock fetch globally
global.fetch = vi.fn()

describe('QAMetricsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(global.fetch as any).mockReset()
  })

  it('renders Coverage and Simplicity labels', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ coverage: 85, simplicity: 90 }),
    })

    render(<QAMetricsCard />)

    // Wait for fetch to complete
    await waitFor(() => {
      expect(screen.getByText('Coverage')).toBeInTheDocument()
      expect(screen.getByText('Simplicity')).toBeInTheDocument()
    })
  })

  it('handles missing metrics gracefully by showing N/A', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: false,
    })

    render(<QAMetricsCard />)

    // Wait for fetch to complete
    await waitFor(() => {
      // Both metrics should show N/A
      const naValues = screen.getAllByText('N/A')
      expect(naValues.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('shows N/A when metrics.json returns null', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(null),
    })

    render(<QAMetricsCard />)

    await waitFor(() => {
      const naValues = screen.getAllByText('N/A')
      expect(naValues.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('displays metric values when available', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ coverage: 85, simplicity: 90 }),
    })

    render(<QAMetricsCard />)

    await waitFor(() => {
      expect(screen.getByText('85%')).toBeInTheDocument()
      expect(screen.getByText('90%')).toBeInTheDocument()
    })
  })

  it('shows hint when metrics are null', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(null),
    })

    render(<QAMetricsCard />)

    await waitFor(() => {
      expect(screen.getByText('Run test:coverage and report:simplicity to update')).toBeInTheDocument()
    })
  })

  it('handles fetch errors gracefully', async () => {
    ;(global.fetch as any).mockRejectedValue(new Error('Network error'))

    render(<QAMetricsCard />)

    await waitFor(() => {
      const naValues = screen.getAllByText('N/A')
      expect(naValues.length).toBeGreaterThanOrEqual(2)
      expect(screen.getByText('Run test:coverage and report:simplicity to update')).toBeInTheDocument()
    })
  })

  it('clamps coverage values to 0-100 range', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ coverage: 150, simplicity: -10 }),
    })

    render(<QAMetricsCard />)

    await waitFor(() => {
      // Coverage should be clamped to 100
      expect(screen.getByText('100%')).toBeInTheDocument()
      // Simplicity should be clamped to 0
      expect(screen.getByText('0%')).toBeInTheDocument()
    })
  })

  it('handles partial metrics (one null value)', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ coverage: 85, simplicity: null }),
    })

    render(<QAMetricsCard />)

    await waitFor(() => {
      expect(screen.getByText('85%')).toBeInTheDocument()
      // Simplicity should show N/A
      const naValues = screen.getAllByText('N/A')
      expect(naValues.length).toBeGreaterThanOrEqual(1)
    })
  })
})
