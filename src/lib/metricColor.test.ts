import { describe, it, expect } from 'vitest'
import { getMetricColor } from './metricColor'

describe('getMetricColor', () => {
  it('should return gray (#888888) for null', () => {
    expect(getMetricColor(null)).toBe('#888888')
  })

  it('should return red color for 0%', () => {
    const color = getMetricColor(0)
    expect(color).toBe('rgb(220, 53, 69)') // Red: rgb(220, 53, 69)
  })

  it('should return green color for 100%', () => {
    const color = getMetricColor(100)
    expect(color).toBe('rgb(40, 167, 69)') // Green: rgb(40, 167, 69)
  })

  it('should return intermediate color for 50%', () => {
    const color = getMetricColor(50)
    // At 50%, we should be halfway between red and green
    // Red: rgb(220, 53, 69)
    // Green: rgb(40, 167, 69)
    // Midpoint: rgb(130, 110, 69)
    expect(color).toBe('rgb(130, 110, 69)')
  })

  it('should handle out-of-range values (negative)', () => {
    // For negative values, the calculation will still work but produce a color
    // beyond red (more red than red). Let's verify it doesn't crash.
    const color = getMetricColor(-10)
    expect(color).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
    // Should be even more red than 0%
    const r = parseInt(color.match(/\d+/)?.[0] || '0')
    expect(r).toBeGreaterThan(220) // More red than the red endpoint
  })

  it('should handle out-of-range values (over 100)', () => {
    // For values over 100, the calculation will produce a color beyond green
    // This can result in negative RGB values, which is fine - the function doesn't clamp
    const color = getMetricColor(150)
    // Match RGB format, including negative numbers
    expect(color).toMatch(/^rgb\(-?\d+, -?\d+, -?\d+\)$/)
    // Should be even more green than 100% (less red)
    const rMatch = color.match(/-?\d+/)?.[0]
    const r = parseInt(rMatch || '0')
    expect(r).toBeLessThan(40) // Less red than the green endpoint
  })
})
