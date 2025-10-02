# Multi-Node Align & Distribute Plan

## Goals
- Allow users to align or evenly distribute the currently selected nodes without switching tools.
- Surface the actions from the existing right-click context menu so they are discoverable and consistent with other node operations.
- Support both top-level canvas nodes and nodes inside expanded subsystem views by respecting nested subsystem paths.

## Current State & Constraints
- Right-click context menus are rendered inside `src/components/Canvas.tsx` and currently only expose Copy/Delete/Paste actions.
- Multi-selection state is tracked via `multiSelection` / `multiSelectionPreview` in `Canvas` and carries lists of node IDs, including nested IDs such as `subsystemId::nodeId`.
- Node position mutations ultimately flow through store helpers (`updateNodePos`, `nestedSubsystemUpdateNodePos`, `bulkUpdateNodes`) defined in `src/state/store.ts`.
- React Flow maintains transient node layout data; we must write positions back to the canonical project state to persist changes and feed downstream analytics/exports.

```1955:2331:src/components/Canvas.tsx
// ... existing code ...
  const onNodeContextMenu = useCallback((e: React.MouseEvent, n: RFNode)=>{
    e.preventDefault()
    setContextMenu({ type: 'node', x: e.clientX, y: e.clientY, targetId: n.id })
  }, [])
// ... existing code ...
      {contextMenu && (
        <div data-export-exclude="true" className="fixed z-50 bg-white border shadow-md rounded-md text-sm" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={e=>e.stopPropagation()}>
          {contextMenu.type==='node' ? (
            <div className="py-1">
              <button className="block w-full text-left px-3 py-1 hover:bg-slate-100" onClick={handleCopy}>Copy</button>
              <button
                className={`block w-full text-left px-3 py-1 ${canSaveQuickPresetFromContext ? 'hover:bg-slate-100' : 'text-slate-400 cursor-not-allowed'}`}
                onClick={canSaveQuickPresetFromContext ? handleSaveQuickPreset : undefined}
              >
                Save as quick preset…
              </button>
              <button className="block w-full text-left px-3 py-1 hover:bg-slate-100 text-red-600" onClick={handleDelete}>Delete</button>
            </div>
          ) : (
// ... existing code ...
```

- ## UX & Interaction Outline
- Context menu entries (shown when ≥2 nodes are part of the active selection):
  - `Align Horizontally` submenu (align X positions):
    - `Align Left`
    - `Align Center`
    - `Align Right`
  - `Align Vertically` submenu (align Y positions):
    - `Align Top`
    - `Align Middle`
    - `Align Bottom`
  - `Distribute Horizontally` (equal horizontal spacing by node centers).
  - `Distribute Vertically` (equal vertical spacing by node centers).
- When a user right-clicks any node that is part of the current multi-selection, show the extended menu. For single-node selections, keep the current menu.
- Disable actions when the selection contains <2 nodes (alignment) or <3 nodes (distribution) or when width/height metadata is missing.
- After execution, keep the selection active and dismiss the context menu.
- Show toast/inline feedback only for exceptional cases (e.g., selection includes subsystem containers that cannot be moved).

## Data & Geometry Requirements
- Obtain latest positions and size estimates for each selected node:
  - For top-level ids: read from `project.nodes` in the store.
  - For embedded ids (`subsystem::child`): fetch from the relevant `expandedLayouts` or subsystem project.
- Determine bounding boxes:
  - Use actual width/height if available on node model; fall back to heuristics already implemented in `estimateEmbeddedNodeSize`.
  - Perform calculations in canvas coordinates (same units as node `x`/`y`).
- Alignment logic:
  - Horizontal alignment options:
    - `Align Left`: set every node’s left edge (centerX - width/2) to selection reference left.
    - `Align Center`: set every node’s center X to reference center (average or anchor).
    - `Align Right`: set every node’s right edge (centerX + width/2) to reference right.
  - Vertical alignment options:
    - `Align Top`: set every node’s top edge (centerY - height/2) to reference top.
    - `Align Middle`: set every node’s center Y to reference middle.
    - `Align Bottom`: set every node’s bottom edge (centerY + height/2) to reference bottom.
- Distribution logic:
  - Sort nodes along target axis by current center.
  - Compute min/max centers, subtract intrinsic widths/heights if needed to keep bounding boxes inside.
  - Evenly space centers while preserving current ordering.
  - Handle degenerate cases (all nodes share same coordinate) by early exit.

## Store Integration Plan
1. **Normalization layer** inside `Canvas`:
   - Map selection node IDs to a unified structure containing:
     - `rfId`, `nodeId`, `subsystemPath` (empty for root), `width`, `height`, `centerX`, `centerY`.
   - Reuse `expandedLayouts` for nested nodes.
2. **Mutation batching**:
   - Build an array of `{ nodeId, patch: { x, y }, subsystemPath? }` covering both root-level and subsystem nodes.
   - Call `useStore.getState().bulkUpdateNodes` with the merged array so undo/redo works.
   - For subsystem container drag offsets, treat as non-supported (skip and warn) until requirements clarify.
- Always ensure both main canvas nodes and nodes inside expanded subsystem views can be aligned/distributed in a single operation when multi-selected together.
3. **React Flow sync**:
   - After store update succeeds, update local `nodes` state via `setNodes` to reflect the new positions immediately.

## UI Integration Steps
1. Expand `contextMenu` state to carry whether it was triggered from a multi-selection node.
2. Compute action availability (selection counts, moveable nodes) in render.
3. Insert new menu section above Delete divider; attach click handlers.
4. Ensure Escape/left-click closes the updated menu as today.

## Algorithm Sketch
1. `collectSelectedNodeGeometry(selectionIds)` → returns normalized nodes with coordinates & size.
2. `alignNodes(nodes, axis)`
   - Determine target coordinate (average center or first-selected center).
   - Return patches for nodes whose coordinate differs by >ε.
3. `distributeNodes(nodes, axis)`
   - Sort by axis center.
   - Derive spacing `(lastCenter - firstCenter) / (count - 1)`.
   - Apply incremental offsets.
4. Apply patches through store and update local `nodes` state.

## Edge Cases & Safeguards
- Skip nodes lacking positional data; if any are skipped, notify user.
- Respect locked or non-draggable nodes if such a property exists (currently none observed, but leave hook for future check).
- If selection spans multiple subsystem roots, allow operation by writing patches into the appropriate subsystem via `subsystemPath`.
- No-ops should still close menu without mutating undo history.

## Acceptance Criteria
- Right-clicking a multi-selected node reveals new align/distribute actions.
- Actions update the visual layout instantly and persist after reload/export.
- Undo reverts the alignment/distribution.
- Distribution maintains node ordering along the axis; alignment uses shared center lines.
- Nested subsystem nodes respond identically to top-level nodes when the parent subsystem is expanded.

