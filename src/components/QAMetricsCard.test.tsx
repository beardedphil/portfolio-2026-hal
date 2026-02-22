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

  it('renders Test Coverage and Code Quality labels', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ coverage: 85, codeQuality: 90 })),
    })

    render(<QAMetricsCard />)

    // Wait for fetch to complete
    await waitFor(() => {
      expect(screen.getByText('Test Coverage')).toBeInTheDocument()
      expect(screen.getByText('Code Quality')).toBeInTheDocument()
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

  it('shows N/A when metrics.json returns empty string', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(''),
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
      text: () => Promise.resolve(JSON.stringify({ coverage: 85, codeQuality: 90 })),
    })

    render(<QAMetricsCard />)

    await waitFor(() => {
      expect(screen.getByText('85.0%')).toBeInTheDocument()
      expect(screen.getByText('90.0%')).toBeInTheDocument()
    })
  })

  it('shows hint when metrics are null', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(''),
    })

    render(<QAMetricsCard />)

    await waitFor(() => {
      expect(screen.getByText('Run test:coverage and report:code-quality to update')).toBeInTheDocument()
    })
  })

  it('handles fetch errors gracefully', async () => {
    ;(global.fetch as any).mockRejectedValue(new Error('Network error'))

    render(<QAMetricsCard />)

    await waitFor(() => {
      const naValues = screen.getAllByText('N/A')
      expect(naValues.length).toBeGreaterThanOrEqual(2)
      expect(screen.getByText('Run test:coverage and report:code-quality to update')).toBeInTheDocument()
    })
  })

  it('clamps coverage values to 0-100 range', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ coverage: 150, codeQuality: -10 })),
    })

    render(<QAMetricsCard />)

    await waitFor(() => {
      // Coverage should be clamped to 100
      expect(screen.getByText('100.0%')).toBeInTheDocument()
      // Code Quality should be clamped to 0
      expect(screen.getByText('0.0%')).toBeInTheDocument()
    })
  })

  it('handles partial metrics (one null value)', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ coverage: 85, codeQuality: null })),
    })

    render(<QAMetricsCard />)

    await waitFor(() => {
      expect(screen.getByText('85.0%')).toBeInTheDocument()
      // Code Quality should show N/A
      const naValues = screen.getAllByText('N/A')
      expect(naValues.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('handles invalid JSON gracefully with console warning', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('invalid json {'),
    })

    render(<QAMetricsCard />)

    await waitFor(() => {
      const naValues = screen.getAllByText('N/A')
      expect(naValues.length).toBeGreaterThanOrEqual(2)
    })

    // Verify console warning was logged for invalid JSON
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[HAL] Failed to parse metrics.json: invalid JSON'),
      expect.any(Error)
    )

    consoleWarnSpy.mockRestore()
  })

  it('handles empty file gracefully', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('   '), // whitespace only
    })

    render(<QAMetricsCard />)

    await waitFor(() => {
      const naValues = screen.getAllByText('N/A')
      expect(naValues.length).toBeGreaterThanOrEqual(2)
      expect(screen.getByText('Run test:coverage and report:code-quality to update')).toBeInTheDocument()
    })
  })
})
