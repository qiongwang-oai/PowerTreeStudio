export function voltageToEdgeColor(voltage?: number): string {
  if (typeof voltage !== 'number' || !isFinite(voltage)) return '#64748b'

  // Quantise at 0.1 V steps so each bucket produces a distinct colour.
  const quantised = Math.round(voltage * 10)

  // Use a large hue jump per bucket to ensure adjacent voltages differ clearly.
  const hue = ((quantised * 124.89) % 360 + 360) % 360

  const saturation = 46
  const lightnessPalette = [40, 46, 52, 58]
  const lightnessIndex = ((quantised % lightnessPalette.length) + lightnessPalette.length) % lightnessPalette.length
  const lightness = lightnessPalette[lightnessIndex]

  return `hsl(${hue.toFixed(1)}, ${saturation}%, ${lightness}%)`
}
