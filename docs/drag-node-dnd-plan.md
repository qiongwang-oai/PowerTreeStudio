# Drag from Palette/Subsystem Palette to Canvas Plan

## Goals
- Allow dragging any palette entry or quick preset onto the main canvas so placement reflects the drop position.
- Mirror the same drag-and-drop (DnD) affordance inside subsystem editors and embedded subsystem views.
- Keep existing click-to-add shortcuts working as an alternative input mode.

## Current Behaviour Summary
- `Palette.tsx` / `SubsystemPalette.tsx` expose `Button` elements that call `addNode` or `nestedSubsystemAddNode` with preset payloads at hard-coded coordinates.
- `Canvas.tsx` and `SubsystemCanvas.tsx` rely on React Flow for layout but do not register DnD listeners; nodes only appear at preset coordinates or after copy/paste.
- The stores expose `addNode`, `nestedSubsystemAddNode`, etc. that accept fully formed node objects with absolute coordinates.

## High-Level Design
- Use native HTML5 drag events on palette/preset entries. Encode the node type + preset variant in `dataTransfer` under an app-specific MIME string (e.g. `application/powertree-node`).
- On the canvas components, wire `onDragOver` to call `event.preventDefault()` and set the visual drop effect, then handle `onDrop` to:
  1. Decode the dragged payload.
  2. Convert the screen position of the drop to React Flow coordinates via `screenToFlowPosition`.
  3. Construct the node instance by merging preset defaults with the computed position and storing subsystem context when applicable.
  4. Dispatch to the appropriate store action (`addNode`, `nestedSubsystemAddNode`).
- Maintain a shared preset factory (`createPresetNode(type, variant?)`) so drag and click flows both rely on a single source of truth.
- For embedded subsystem views that render inside the main canvas (`ExpandedSubsystemContainer`), use hit testing to determine whether the drop occurred within the embedded container bounds and, if so, translate coordinates into the embedded project space before calling `nestedSubsystemAddNode`.

## Work Breakdown
1. **Shared preset utilities**
   - Extract the duplicated `createPreset` logic into a new utility (e.g. `src/utils/nodePresets.ts`).
   - Support variant IDs so quick presets can reference the same factory without ad-hoc inline objects.
   - Update palette components to consume the helper for click events.

2. **Palette drag affordance**
   - Wrap each button with `draggable` and `onDragStart` handlers (consider accessible affordances and focus styles).
   - Place preset metadata in `dataTransfer` (JSON string) and set `effectAllowed = 'copy'`.
   - Add optional `aria-grabbed` / instructions if needed for keyboard users (non-blocking follow-up).

3. **Main canvas drop handling**
   - Add `onDragOver`/`onDrop` handlers to the top-level canvas div in `Canvas.tsx`.
   - Parse payload, call `screenToFlowPosition({ x: event.clientX, y: event.clientY })` to map coordinates.
   - Detect whether drop point lies inside an expanded subsystem container:
     * Reuse `expandedLayouts` metadata to check bounding boxes and content offsets.
     * If inside: convert to subsystem-local coordinates, call `nestedSubsystemAddNode` with `subsystemPath`.
     * Else: call `addNode` for the main project.
   - Ensure drop leaves context menus / selections unaffected unless a node was added.

4. **Subsystem editor drop handling**
   - Mirror the above logic inside `SubsystemCanvas.tsx`, using the known `subsystemPath` to route inserts.
   - Factor any shared math (e.g. `toLocalSubsystemCoords`) into helpers to avoid duplication between canvases.

5. **Quick preset variants**
   - Represent quick presets as named variants (e.g. `converter:default`, `converter:vrm0p9`).
   - Update the quick preset buttons to pass the correct variant to the preset utility for both click and drag paths.

6. **State updates & undo**
   - Confirm `addNode` / `nestedSubsystemAddNode` already capture undo snapshots (they do). No extra work expected, but ensure new flow calls these methods exactly once per drop.

7. **Testing & QA**
   - Manual: verify dragging each palette item to different regions, including zoomed canvas, expanded subsystem, and subsystem editor modal.
   - Regression: ensure click-to-add still creates nodes at reasonable default positions (consider reusing drop center logic or keep existing coordinates if acceptable).
   - Consider writing a Vitest unit around the preset factory to lock in default fields.

## Open Questions / Follow-Ups
- Should dropping onto invalid regions (e.g. outside React Flow viewport) be ignored or snap to nearest point? For v1 we will ignore by checking the payload and ensuring React Flow coordinates exist.
- Do we need a visual indicator while dragging over a container? Optional, could be incremental improvement (out of scope).
- Should we persist the last drop position for keyboard-initiated additions when no drop occurred? Probably keep current behavior until UX feedback.
