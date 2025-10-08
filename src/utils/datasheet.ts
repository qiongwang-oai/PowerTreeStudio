export function normalizeDatasheetHref(raw: string | undefined | null): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`
  }

  if (/^\\/.test(trimmed)) {
    const normalized = trimmed.replace(/\\/g, '/')
    const withoutPrefix = normalized.replace(/^\/+/, '')
    return `file://${encodeURI(withoutPrefix)}`
  }

  if (/^[a-zA-Z]:\\/.test(trimmed)) {
    const normalized = trimmed.replace(/\\/g, '/')
    return `file:///${encodeURI(normalized)}`
  }

  if (trimmed.startsWith('/')) {
    const normalized = trimmed.replace(/\\/g, '/')
    return `file://${encodeURI(normalized)}`
  }

  if (trimmed.startsWith('~')) {
    const normalized = trimmed.replace(/\\/g, '/')
    return `file://${encodeURI(normalized)}`
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return trimmed
  }

  if (/^[\w.-]+\.[A-Za-z]{2,}(:\d+)?(\/.*)?$/.test(trimmed)) {
    return `https://${trimmed}`
  }

  return trimmed
}

export function openDatasheetReference(reference: string | undefined | null): boolean {
  const href = normalizeDatasheetHref(reference)
  if (!href) return false
  if (typeof window === 'undefined' || typeof window.open !== 'function') return false
  const newWindow = window.open(href, '_blank', 'noopener,noreferrer')
  return Boolean(newWindow)
}

