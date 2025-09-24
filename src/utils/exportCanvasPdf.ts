import { toPng } from 'html-to-image'
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'
import type { Edge, Node } from 'reactflow'

type FlowViewport = {
  x: number
  y: number
  zoom: number
}

type ExportCanvasToPdfOptions = {
  wrapper: HTMLElement
  nodes: Node[]
  edges: Edge[]
  viewport: FlowViewport
  fileName: string
  padding?: number
}

type NodeLabelInfo = {
  id: string
  text: string
  left: number
  top: number
  width: number
  height: number
  fontSize: number
  lineHeight: number
  textAlign: CanvasTextAlign
  color: { r: number; g: number; b: number }
}

const PX_PER_INCH = 96
const PT_PER_INCH = 72
const DEFAULT_PADDING = 96
const FALLBACK_NODE_WIDTH = 200
const FALLBACK_NODE_HEIGHT = 120

const pxToPt = (px: number) => (px / PX_PER_INCH) * PT_PER_INCH

const sanitizeFileName = (name: string) => {
  const fallback = 'PowerTreeCanvas'
  const trimmed = (name || '').trim()
  const base = trimmed.length > 0 ? trimmed : fallback
  const safe = base.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_')
  return safe.endsWith('.pdf') ? safe : `${safe}.pdf`
}

const cssColorToRgb = (value: string): { r: number; g: number; b: number } => {
  if (!value) return { r: 0, g: 0, b: 0 }
  const rgbMatch = value.match(/rgba?\(([^)]+)\)/i)
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map(part => part.trim())
    const r = Number(parts[0]) / 255
    const g = Number(parts[1]) / 255
    const b = Number(parts[2]) / 255
    if ([r, g, b].every(n => Number.isFinite(n))) {
      return { r, g, b }
    }
  }
  const hexMatch = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hexMatch) {
    const hex = hexMatch[1]
    const expand = hex.length === 3 ? hex.split('').map(ch => ch + ch).join('') : hex
    const num = Number.parseInt(expand, 16)
    const r = ((num >> 16) & 255) / 255
    const g = ((num >> 8) & 255) / 255
    const b = (num & 255) / 255
    return { r, g, b }
  }
  return { r: 0, g: 0, b: 0 }
}

const collectLabelInfos = (
  wrapper: HTMLElement,
  nodes: Node[],
  viewport: FlowViewport
): NodeLabelInfo[] => {
  const labelElements = Array.from(wrapper.querySelectorAll<HTMLElement>('[data-node-label]'))
  if (labelElements.length === 0) return []
  const nodeById = new Map(nodes.map(node => [node.id, node]))
  const zoom = Number.isFinite(viewport.zoom) && viewport.zoom > 0 ? viewport.zoom : 1
  const infos: NodeLabelInfo[] = []

  for (const element of labelElements) {
    const nodeElement = element.closest<HTMLElement>('.react-flow__node')
    if (!nodeElement) continue
    const nodeId = nodeElement.getAttribute('data-id')
    if (!nodeId) continue
    const sourceNode = nodeById.get(nodeId)
    if (!sourceNode || sourceNode.hidden) continue
    const nodeRect = nodeElement.getBoundingClientRect()
    const labelRect = element.getBoundingClientRect()
    const basePosition = sourceNode.positionAbsolute ?? sourceNode.position ?? { x: 0, y: 0 }
    const baseX = typeof basePosition.x === 'number' ? basePosition.x : 0
    const baseY = typeof basePosition.y === 'number' ? basePosition.y : 0
    const offsetX = (labelRect.left - nodeRect.left) / zoom
    const offsetY = (labelRect.top - nodeRect.top) / zoom
    const width = labelRect.width / zoom
    const height = labelRect.height / zoom
    const computed = window.getComputedStyle(element)
    const fontSize = Number.parseFloat(computed.fontSize || '12') || 12
    const lineHeightRaw = computed.lineHeight
    const parsedLineHeight = Number.parseFloat(lineHeightRaw)
    const lineHeight = Number.isFinite(parsedLineHeight) && parsedLineHeight > 0
      ? parsedLineHeight
      : fontSize * 1.2
    const textAlign = (computed.textAlign as CanvasTextAlign) || 'center'
    const color = cssColorToRgb(computed.color || '#111827')
    const text = (element.textContent || '').trim()
    if (!text) continue
    infos.push({
      id: nodeId,
      text,
      left: baseX + offsetX,
      top: baseY + offsetY,
      width,
      height,
      fontSize,
      lineHeight,
      textAlign,
      color,
    })
  }

  return infos
}

const wrapText = (text: string, maxWidth: number, font: PDFFont, fontSize: number): string[] => {
  const normalized = text.trim()
  if (!normalized) return []
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) return [normalized]
  const words = normalized.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    const candidateWidth = font.widthOfTextAtSize(candidate, fontSize)
    if (candidateWidth <= maxWidth || !current) {
      current = candidate
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

const resolveNodeBounds = (nodes: Node[], edges: Edge[], padding: number) => {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const node of nodes) {
    if (node.hidden) continue
    const base = node.positionAbsolute ?? node.position ?? { x: 0, y: 0 }
    const widthCandidate = Number.parseFloat((node as any).style?.width ?? '')
    const heightCandidate = Number.parseFloat((node as any).style?.height ?? '')
    const width = typeof node.width === 'number' && Number.isFinite(node.width)
      ? node.width
      : Number.isFinite(widthCandidate)
        ? widthCandidate
        : FALLBACK_NODE_WIDTH
    const height = typeof node.height === 'number' && Number.isFinite(node.height)
      ? node.height
      : Number.isFinite(heightCandidate)
        ? heightCandidate
        : FALLBACK_NODE_HEIGHT
    const x = typeof base.x === 'number' ? base.x : 0
    const y = typeof base.y === 'number' ? base.y : 0
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + width)
    maxY = Math.max(maxY, y + height)
  }

  for (const edge of edges) {
    const points = [edge.sourceX, edge.sourceY, edge.targetX, edge.targetY]
    for (let i = 0; i < points.length; i += 2) {
      const px = points[i]
      const py = points[i + 1]
      if (Number.isFinite(px) && Number.isFinite(py)) {
        minX = Math.min(minX, px as number)
        minY = Math.min(minY, py as number)
        maxX = Math.max(maxX, px as number)
        maxY = Math.max(maxY, py as number)
      }
    }
    const data = edge.data as { midpointX?: number; midpointOffset?: number } | undefined
    if (data && Number.isFinite(data.midpointX)) {
      const midX = data.midpointX as number
      minX = Math.min(minX, midX)
      maxX = Math.max(maxX, midX)
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    throw new Error('Nothing to export from the canvas.')
  }

  minX -= padding
  minY -= padding
  maxX += padding
  maxY += padding

  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxY - minY)

  return { minX, minY, width, height }
}

const createCloneForExport = (wrapper: HTMLElement, width: number, height: number, minX: number, minY: number) => {
  const clone = wrapper.cloneNode(true) as HTMLElement
  clone.style.position = 'fixed'
  clone.style.pointerEvents = 'none'
  clone.style.top = '0'
  clone.style.left = '0'
  clone.style.width = `${width}px`
  clone.style.height = `${height}px`
  clone.style.overflow = 'visible'
  clone.style.backgroundColor = '#ffffff'
  clone.style.zIndex = '-1'

  const flowRoot = clone.querySelector<HTMLElement>('.react-flow')
  if (flowRoot) {
    flowRoot.style.width = `${width}px`
    flowRoot.style.height = `${height}px`
    flowRoot.style.background = '#ffffff'
  }

  clone.querySelectorAll('[data-export-exclude="true"]').forEach(el => el.remove())

  clone.querySelectorAll<HTMLElement>('[data-node-label]').forEach(label => {
    label.style.color = 'transparent'
    label.style.textShadow = 'none'
  })

  const viewportEl = clone.querySelector<HTMLElement>('.react-flow__viewport')
  if (viewportEl) {
    viewportEl.style.transformOrigin = '0 0'
    viewportEl.style.transform = `translate(${-minX}px, ${-minY}px) scale(1)`
  }

  const edgesSvg = clone.querySelector<SVGElement>('.react-flow__edges')
  if (edgesSvg) {
    edgesSvg.setAttribute('width', `${width}`)
    edgesSvg.setAttribute('height', `${height}`)
    edgesSvg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  }

  const connectionSvg = clone.querySelector<SVGElement>('.react-flow__connectionline')
  if (connectionSvg) {
    connectionSvg.setAttribute('width', `${width}`)
    connectionSvg.setAttribute('height', `${height}`)
    connectionSvg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  }

  document.body.appendChild(clone)
  return clone
}

export async function exportCanvasToPdf({
  wrapper,
  nodes,
  edges,
  viewport,
  fileName,
  padding = DEFAULT_PADDING,
}: ExportCanvasToPdfOptions): Promise<void> {
  if (!wrapper) throw new Error('Canvas element is not available for export.')
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error('Nothing to export from the canvas.')
  }

  const bounds = resolveNodeBounds(nodes, edges, padding)
  const width = Math.max(1, Math.ceil(bounds.width))
  const height = Math.max(1, Math.ceil(bounds.height))
  const labels = collectLabelInfos(wrapper, nodes, viewport)
  const clone = createCloneForExport(wrapper, width, height, bounds.minX, bounds.minY)

  try {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const pixelRatio = Math.min(2, Math.max(1, window.devicePixelRatio || 1))
    const dataUrl = await toPng(clone, {
      backgroundColor: '#ffffff',
      width,
      height,
      pixelRatio,
      filter: (node) => {
        if (!(node instanceof HTMLElement)) return true
        return node.dataset.exportExclude !== 'true'
      },
    })

    const response = await fetch(dataUrl)
    const pngBytes = await response.arrayBuffer()
    const pdfDoc = await PDFDocument.create()
    const pageWidthPt = pxToPt(width)
    const pageHeightPt = pxToPt(height)
    const page = pdfDoc.addPage([pageWidthPt, pageHeightPt])
    const pngImage = await pdfDoc.embedPng(pngBytes)
    page.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: pageWidthPt,
      height: pageHeightPt,
    })

    if (labels.length > 0) {
      const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
      for (const label of labels) {
        const fontSizePt = pxToPt(label.fontSize)
        const lineHeightPtRaw = pxToPt(label.lineHeight)
        const lineHeightPt = lineHeightPtRaw > 0 ? lineHeightPtRaw : fontSizePt * 1.2
        const maxWidthPt = Math.max(pxToPt(label.width), fontSizePt * 1.5)
        const lineTexts = wrapText(label.text, maxWidthPt, font, fontSizePt)
        if (lineTexts.length === 0) continue
        const topOffsetY = label.top - bounds.minY
        const topPdf = pageHeightPt - pxToPt(topOffsetY)
        let baseline = topPdf - Math.max(lineHeightPt - fontSizePt, 0) * 0.5 - pxToPt(label.height * 0.6)

        for (const line of lineTexts) {
          const textWidthPt = font.widthOfTextAtSize(line, fontSizePt)
          let xPt: number
          if (label.textAlign === 'left' || label.textAlign === 'start') {
            xPt = pxToPt(label.left - bounds.minX)
          } else if (label.textAlign === 'right' || label.textAlign === 'end') {
            xPt = pxToPt(label.left - bounds.minX + label.width) - textWidthPt
          } else {
            const centerXPt = pxToPt(label.left - bounds.minX + label.width / 2)
            xPt = centerXPt - textWidthPt / 2
          }
          const color = rgb(
            Math.min(1, Math.max(0, label.color.r)),
            Math.min(1, Math.max(0, label.color.g)),
            Math.min(1, Math.max(0, label.color.b))
          )
          page.drawText(line, {
            x: xPt,
            y: baseline,
            size: fontSizePt,
            font,
            color,
          })
          baseline -= lineHeightPt
        }
      }
    }

    const pdfBytes = await pdfDoc.save()
    const blob = new Blob([pdfBytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = sanitizeFileName(fileName)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } finally {
    clone.remove()
  }
}

