/** Calculate color gradient from red (0%) to green (100%) for QA metrics (0667) */
export function getMetricColor(percentage: number | null): string {
  if (percentage === null) {
    return '#888888' // Gray for N/A
  }
  // Red (0%) to Green (100%) gradient
  // Red: rgb(220, 53, 69) or #dc3545
  // Green: rgb(40, 167, 69) or #28a745
  const red = 220
  const green = 40
  const blueRed = 53
  const blueGreen = 167
  const greenRed = 69
  const greenGreen = 69
  const r = Math.round(red + (green - red) * (percentage / 100))
  const g = Math.round(blueRed + (blueGreen - blueRed) * (percentage / 100))
  const b = Math.round(greenRed + (greenGreen - greenRed) * (percentage / 100))
  return `rgb(${r}, ${g}, ${b})`
}
