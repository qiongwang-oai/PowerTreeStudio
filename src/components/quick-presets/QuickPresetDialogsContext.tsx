import React from 'react'
import type { AnyNode } from '../../models'
import type { InspectorSelection } from '../../types/selection'
import { useStore } from '../../state/store'
import { resolveProjectAtPath } from '../../utils/subsystemPath'
import QuickPresetManager from './QuickPresetManager'
import QuickPresetCaptureDialog from './QuickPresetCaptureDialog'

type CaptureRequest =
  | { kind: 'node'; node: AnyNode; presetId?: string }
  | { kind: 'selection'; presetId?: string }

type QuickPresetDialogsContextValue = {
  openCaptureDialog: (request: CaptureRequest) => void
  openManager: (options?: { focusPresetId?: string }) => void
}

const QuickPresetDialogsContext = React.createContext<QuickPresetDialogsContextValue | null>(null)

type QuickPresetDialogsProviderProps = {
  children: React.ReactNode
  getCurrentSelection?: () => InspectorSelection | null
}

function cloneNode<T extends AnyNode>(node: T): T {
  return JSON.parse(JSON.stringify(node)) as T
}

function resolveNodeFromSelection(selection: InspectorSelection | null): AnyNode | null {
  if (!selection) return null
  const { project } = useStore.getState()
  if (selection.kind === 'node') {
    const node = project.nodes.find(n => n.id === selection.id)
    return node ? cloneNode(node) : null
  }
  if (selection.kind === 'nested-node') {
    const nestedProject = resolveProjectAtPath(project, selection.subsystemPath)
    if (!nestedProject) return null
    const node = nestedProject.nodes.find(n => n.id === selection.nodeId)
    return node ? cloneNode(node) : null
  }
  return null
}

export function QuickPresetDialogsProvider({ children, getCurrentSelection }: QuickPresetDialogsProviderProps) {
  const [managerOpen, setManagerOpen] = React.useState(false)
  const [managerFocusPresetId, setManagerFocusPresetId] = React.useState<string | null>(null)
  const [captureState, setCaptureState] = React.useState<{ node: AnyNode | null; presetId?: string } | null>(null)

  const closeManager = React.useCallback(() => {
    setManagerOpen(false)
    setManagerFocusPresetId(null)
  }, [])

  const closeCapture = React.useCallback(() => {
    setCaptureState(null)
  }, [])

  const openCaptureDialog = React.useCallback((request: CaptureRequest) => {
    if (request.kind === 'node') {
      setCaptureState({ node: cloneNode(request.node), presetId: request.presetId })
      return
    }
    if (!getCurrentSelection) {
      window.alert('Select a node first to create a quick preset.')
      return
    }
    const selection = getCurrentSelection()
    const node = resolveNodeFromSelection(selection)
    if (!node) {
      window.alert('Unable to capture the current selection as a quick preset.')
      return
    }
    setCaptureState({ node, presetId: request.presetId })
  }, [getCurrentSelection])

  const openManager = React.useCallback((options?: { focusPresetId?: string }) => {
    setManagerFocusPresetId(options?.focusPresetId ?? null)
    setManagerOpen(true)
  }, [])

  const contextValue = React.useMemo<QuickPresetDialogsContextValue>(() => ({
    openCaptureDialog,
    openManager,
  }), [openCaptureDialog, openManager])

  return (
    <QuickPresetDialogsContext.Provider value={contextValue}>
      {children}
      {managerOpen && (
        <QuickPresetManager
          isOpen
          focusPresetId={managerFocusPresetId}
          onClose={closeManager}
          onCaptureFromSelection={(presetId) => openCaptureDialog({ kind: 'selection', presetId })}
        />
      )}
      {captureState && captureState.node && (
        <QuickPresetCaptureDialog
          isOpen
          node={captureState.node}
          presetId={captureState.presetId}
          onClose={closeCapture}
        />
      )}
    </QuickPresetDialogsContext.Provider>
  )
}

export function useQuickPresetDialogs(): QuickPresetDialogsContextValue {
  const ctx = React.useContext(QuickPresetDialogsContext)
  if (!ctx) {
    throw new Error('useQuickPresetDialogs must be used within a QuickPresetDialogsProvider')
  }
  return ctx
}


