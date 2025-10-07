import { describe, it, expect } from 'vitest'
import { orderSubsystemPorts, sanitizeSubsystemHandleOrder } from '../components/SubsystemNodeLayout'

describe('sanitizeSubsystemHandleOrder', () => {
  it('keeps stored order and appends new handles', () => {
    const portIds = ['portA', 'portB', 'portC']
    const stored = ['portC', 'portA']
    const sanitized = sanitizeSubsystemHandleOrder(portIds, stored)
    expect(sanitized).toEqual(['portC', 'portA', 'portB'])
  })

  it('removes duplicates and unknown handles', () => {
    const portIds = ['h1', 'h2']
    const stored = ['h2', 'missing', 'h1', 'h2']
    const sanitized = sanitizeSubsystemHandleOrder(portIds, stored)
    expect(sanitized).toEqual(['h2', 'h1'])
  })
})

describe('orderSubsystemPorts', () => {
  it('orders ports according to the provided handle order', () => {
    const ports = [
      { id: 'p1', label: 'One' },
      { id: 'p2', label: 'Two' },
      { id: 'p3', label: 'Three' },
    ]
    const ordered = orderSubsystemPorts(ports, ['p3', 'p1', 'p2'])
    expect(ordered.map(p => p.id)).toEqual(['p3', 'p1', 'p2'])
  })

  it('falls back to original order for handles not in the list', () => {
    const ports = [
      { id: 'p1' },
      { id: 'p2' },
      { id: 'p3' },
    ]
    const ordered = orderSubsystemPorts(ports, ['p2'])
    expect(ordered.map(p => p.id)).toEqual(['p2', 'p1', 'p3'])
  })
})

