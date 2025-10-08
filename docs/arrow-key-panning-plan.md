# Arrow Key Panning Plan

## Goals
- Let users pan both the main system canvas and any open subsystem canvas using the keyboard arrow keys for coarse navigation.
- Preserve existing keyboard nudging for selected nodes, edges, and markups without regressions.
- Provide consistent modifier behaviour (fine vs coarse increments) that matches current mouse + keyboard affordances.
- Keep the implementation shared across canvases to minimise divergence and simplify maintenance.

## Current Behaviour & Constraints
- `Canvas` already attaches a global `keydown` handler for copy/paste/delete and arrow-key nudging; it bails out when any subsystem editor is stacked to avoid conflicts.

```2776:2813:src/components/Canvas.tsx
const handleKeyDown = (e: KeyboardEvent) => {
  if (openSubsystemIds && openSubsystemIds.length > 0) return
  const activeElement = document.activeElement as HTMLElement | null
  const isInput = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable)
  if (isInput) return
  const key = e.key
  const isDelete = key === 'Delete' || key === 'Backspace'
  const isCopy = (key === 'c' || key === 'C') && (e.ctrlKey || e.metaKey)
  const isPaste = (key === 'v' || key === 'V') && (e.ctrlKey || e.metaKey)
  // ... existing code ...
  const nudgeDelta = getKeyboardNudgeDeltaForEvent(e)
  if (nudgeDelta) {
    // ... existing code ...
```

- `SubsystemCanvas` duplicates the handler with the same nudge-centric assumptions; it prevents React Flow panning when the multi-select marquee is active.

```2045:2050:src/components/subsystem/SubsystemCanvas.tsx
window.addEventListener('keydown', handleKeyDown)
return () => window.removeEventListener('keydown', handleKeyDown)
```

- React Flow exposes `reactFlowInstance.getViewport()` and `setViewport()` for programmatic panning, but neither canvas currently calls `setViewport`; panning is mouse-only.
- Arrow keys today nudge selected entities even if only a single node is focused, so any new behaviour must not strip that affordance for power users.
- Both canvases already rely on utility helpers (`getKeyboardNudgeDeltaForEvent`, `clampPointToBounds`) that assume arrow keys map to selection movement.

## UX Proposal
- Default arrow press with an active selection continues to nudge the selection exactly as today.
- When no nodes, edges, or markups are selected, arrow keys shift the viewport instead of becoming no-ops; the canvas moves opposite the arrow direction (pressing `ArrowRight` pans view to reveal content on the right).
- `Shift + Arrow` applies a smaller “fine” pan distance (e.g. 20px) mirroring nudge semantics; unmodified arrows use a coarse distance (e.g. 120px) to traverse faster.
- Introduce an optional `Space + Arrow` override that always pans, even if something is selected, to let users inspect surroundings without deselecting.
- Maintain browser default behaviour for text inputs and other focusable controls by continuing to bail out when an editable element owns focus.

## Technical Approach
- **Selection state gate**: Extend both `handleKeyDown` implementations to detect whether any move-target candidates exist (nodes, edges, markups). Only invoke nudge logic when the selection set is non-empty and the user is not holding the pan override modifier.
- **Shared pan helper**: Create a `useArrowKeyPanning` hook under `src/utils/` or `src/hooks/` that accepts a `ReactFlowInstance`, returns a memoised `panByArrow(event)` function, and centralises step calculations plus bounds clamping if needed.
- **Viewport updates**: Use `reactFlowInstance.getViewport()` to pull `{ x, y, zoom }`, then compute a delta scaled by `1 / zoom` so the perceived pan distance stays consistent regardless of zoom. Apply the new viewport via `setViewport({ x: nextX, y: nextY, zoom })`.
- **Subsystem integration**: Pass the subsystem path or bounds (if tighter limits are needed) into the hook to prevent panning beyond embedded project extents; otherwise, allow free panning like the main canvas for parity.
- **Modifier coordination**: Detect `event.metaKey`, `event.ctrlKey`, and `event.altKey` to stay compatible with existing shortcuts. Reserve `Alt + Arrow` for future features by ignoring it for panning today.
- **Prevent default**: Only call `event.preventDefault()` when a pan actually occurs; avoid blocking browser scroll when nothing changes.
- **Toast messaging**: Reuse the nudge toast infrastructure to surface bounds hits if we enforce limits; otherwise, skip additional messaging to avoid noise.

## Implementation Steps
- Refactor the shared keyboard handler logic into a composable helper (e.g. `determineSelectionForKeyboard()`), ensuring both canvases consume the same decision tree.
- Introduce constants for pan deltas (coarse/fine) adjacent to the existing nudge constants to keep tuning discoverable.
- Update `Canvas` handler to branch: `(hasSelection && !forcePan) ? handleNudge : handlePan`. Ensure `forcePan` flips on when the override modifier is pressed or when the selection lists are empty.
- Mirror the changes in `SubsystemCanvas`, but respect its `isTopmostEditor` guard so background editors do not intercept keys.
- Add unit tests around the pan helper (e.g. verifying zoom-aware deltas) in `src/__tests__`, and augment existing keyboard interaction tests if present.
- Validate Typescript types for the new helper by exporting a dedicated interface; update `tsconfig` paths if a new folder (e.g. `src/hooks`) is introduced.

## Risks & Mitigations
- **Conflict with future shortcuts**: Reserve modifier combinations explicitly and document them in the user manual; keep logic centralised so future changes remain straightforward.
- **Unexpected viewport jumps at extreme zoom**: Scale deltas by zoom and clamp to sensible min/max thresholds to prevent disorientation.
- **Accessibility conflicts**: Continue ignoring events when focused on inputs; ensure the pan override also respects focus rules.
- **Undo/redo noise**: Viewport changes should remain ephemeral UI state; avoid touching the project store to keep history clean.

## Testing & QA
- Manual: verify arrow-key panning in both canvases across zoom levels, with and without selections, and when subsystem overlays are open.
- Automated: add regression tests covering: selection-present arrow entries still mutate nodes; selection-empty arrows adjust viewport via mocked React Flow instance; `Shift` modifier yields smaller delta.
- Cross-browser smoke: confirm behaviour in Chrome, Edge, and Safari because macOS keyboard event handling can differ (especially with `Meta` modifiers).

## Open Questions
- Should we persist viewport positions between sessions (currently not requested)? Answer: no
- Do we need configurable pan step sizes or accessibility allowances for reduced motion? Answer: No
- Should the override modifier be customisable, or is `Space + Arrow` acceptable for all users? Answer: Yes

## Acceptance Criteria
- Arrow keys nudge selections exactly as today, including fine-step behaviour.
- When nothing is selected (or the override modifier is held), each arrow key pans the visible canvas the defined distance.
- Behaviour is identical in main and subsystem canvases, and undo history remains unaffected.
- Documentation (user manual / shortcuts cheat sheet) reflects the new navigation option.


