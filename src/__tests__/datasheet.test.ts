import { describe, expect, it, vi, afterEach } from 'vitest'
import { normalizeDatasheetHref, openDatasheetReference } from '../utils/datasheet'

const originalWindowOpen = typeof window !== 'undefined' ? window.open : undefined

afterEach(() => {
  if (typeof window !== 'undefined' && originalWindowOpen) {
    window.open = originalWindowOpen
  }
})

describe('normalizeDatasheetHref', () => {
  it('returns null for empty input', () => {
    expect(normalizeDatasheetHref(undefined)).toBeNull()
    expect(normalizeDatasheetHref('   ')).toBeNull()
  })

  it('normalizes protocol-relative URLs', () => {
    expect(normalizeDatasheetHref('//cdn.example.com/doc.pdf')).toBe('https://cdn.example.com/doc.pdf')
  })

  it('infers https for bare domains', () => {
    expect(normalizeDatasheetHref('example.com/datasheet.pdf')).toBe('https://example.com/datasheet.pdf')
  })

  it('converts Windows paths to file URIs', () => {
    expect(normalizeDatasheetHref('C:\\path\\datasheet.pdf')).toBe('file:///C:/path/datasheet.pdf')
  })

  it('converts UNC paths to file URIs', () => {
    expect(normalizeDatasheetHref('\\\\server\\share\\doc.pdf')).toBe('file://server/share/doc.pdf')
  })

  it('converts Unix paths to file URIs', () => {
    expect(normalizeDatasheetHref('/opt/docs/spec.pdf')).toBe('file:///opt/docs/spec.pdf')
  })
})

describe('openDatasheetReference', () => {
  it('returns false without a resolved href', () => {
    expect(openDatasheetReference('')).toBe(false)
  })

  it('invokes window.open when available', () => {
    if (typeof window === 'undefined') {
      expect(openDatasheetReference('https://example.com')).toBe(false)
      return
    }
    const openSpy = vi.fn(() => ({} as Window))
    window.open = openSpy as any
    expect(openDatasheetReference('https://example.com/doc.pdf')).toBe(true)
    expect(openSpy).toHaveBeenCalledWith('https://example.com/doc.pdf', '_blank', 'noopener,noreferrer')
  })

  it('returns false when popup blocked', () => {
    if (typeof window === 'undefined') {
      expect(openDatasheetReference('https://example.com')).toBe(false)
      return
    }
    const openSpy = vi.fn(() => null)
    window.open = openSpy as any
    expect(openDatasheetReference('https://example.com/doc.pdf')).toBe(false)
    expect(openSpy).toHaveBeenCalled()
  })
})

