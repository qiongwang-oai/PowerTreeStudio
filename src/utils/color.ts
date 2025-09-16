export function voltageToEdgeColor(voltage?: number): string {
  if (typeof voltage !== 'number' || !isFinite(voltage)) return '#64748b'
  const hue = ((voltage * 60) % 360 + 360) % 360
  const saturation = 22
  const lightness = 56
  return `hsl(${hue.toFixed(1)}, ${saturation}%, ${lightness}%)`
}
