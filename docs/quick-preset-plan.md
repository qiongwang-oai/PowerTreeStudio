# Quick Preset Management Feature Plan

## Goals
- Allow users to capture any existing node (main canvas or embedded subsystem) as a reusable quick preset.
- Provide UI to browse, reorder, rename, update, and delete quick presets directly inside the app.
- Enable exporting/importing quick presets as shareable files so teams can maintain curated libraries.
- Preserve current default presets for first-time users while layering on user-managed collections.

## Current State Summary
- `Palette.tsx` renders a hard-coded set of buttons under “Quick presets” that call `createNodePreset` with fixed descriptors.
- Presets are expressed as `NodePresetDescriptor` (type + optional variant) and expanded into full nodes by `createNodePreset` in `src/utils/nodePresets.ts`.
- The store (`src/state/store.ts`) has no awareness of quick presets; persistence is only for the project via `autosave()`.
- Canvas context menu offers copy/delete only; there is no affordance to save a node configuration for future reuse.

## Requirements & Non-Goals
- **Add existing node**: User can right-click a node and choose “Save as quick preset…”; optionally from Inspector for accessibility.
- **Editable metadata**: Users can set a preset name/description and optionally override the accent color shown in the palette tile.
- **Preset application**: Clicking/dragging a saved preset adds a node identical to the captured configuration (minus runtime-only fields like ids/coordinates).
- **Persistence**: Presets survive reloads via localStorage and can be reset to defaults.
- **Import/Export**: User can download `.powertree-presets.yaml` and import back (merging/overwriting options TBD).
- **Undo**: Adding a node via preset must still go through store actions so undo history works, but preset CRUD itself does not need undo for v1.
- **Out of scope**: Sharing quick presets through the project file; storing preset-specific thumbnails; syncing to cloud.

## UX Overview
- **Palette section**
  - Render quick presets from store rather than static list.
  - Display `name`, optional description tooltip, color token based on node type or user override.
  - Add buttons: `Add preset` (opens manager modal pre-populated from current selection if any), `Manage` (opens full manager modal).
- **Context menu** (`Canvas.tsx`)
  - New action when right-clicking a node: `Save as quick preset…` (disabled for embedded container nodes, allowed for nested nodes when accessible).
- **Inspector shortcut**
  - Above the Delete button add `Save as preset` for convenience (mirrors context menu action).
- **Quick Preset Manager modal** (`components/quick-presets/QuickPresetManager.tsx`)
  - List view with drag handle for reordering.
  - Inline rename, edit description, edit accent color.
  - Action buttons: `Update from selected node`, `Duplicate`, `Delete`.
  - Footer buttons: `Import`, `Export`, `Reset to defaults`, `Close`.
- **Import flow**
  - Prompts file picker, validates YAML payload against schema, shows merge/replace choice if existing presets.
- **Export flow**
  - Serializes current custom + default (optional toggle) into YAML, downloads via `download()` helper.

## Data Model & Persistence
- Introduce `QuickPreset` type in `src/utils/nodePresets.ts` (or new module):
  ```ts
  type QuickPreset = {
    id: string
    name: string
    description?: string
    node: SanitizedNodeSnapshot
    createdAt: string
    updatedAt: string
    source?: { type: 'user' | 'default'; variantId?: string }
    accentColor?: string
    nodeType: NodeType
  }
  ```
- `SanitizedNodeSnapshot` strips volatile fields (`id`, `x`, `y`, `warnings`, React Flow metadata) while preserving domain attributes.
- Add helper `sanitizeNodeForPreset(node: AnyNode): SanitizedNodeSnapshot` with tests covering each node type.
- Extend `createNodePreset` (or add new `materializeQuickPreset`) to rebuild `AnyNode` from stored snapshot and inject fresh id/position.
- Persist quick presets under new localStorage key (`powertree_quick_presets_v1`).
- Keep constant `DEFAULT_QUICK_PRESETS: QuickPreset[]` generated from current hard-coded presets so reset/import fallback is deterministic.

## Store & Actions
- Update `src/state/store.ts` Zustand state with:
  - `quickPresets: QuickPreset[]`
  - CRUD actions (`addQuickPreset`, `updateQuickPreset`, `removeQuickPreset`, `reorderQuickPresets`).
  - `applyQuickPreset(id, position)` returning new node via materializer.
  - `loadQuickPresets()` / `persistQuickPresets()` invoked at store init and within each CRUD action.
- Ensure preset mutations do **not** mutate `project` state to keep undo stack unaffected; persistence can happen independently.
- Expose selectors via `useStore(s => s.quickPresets)` for palette rendering.

## Component Changes
- **`Palette.tsx`**
  - Replace hard-coded buttons with mapped `quickPresets` from store.
  - Show fallback message if none exist and offer `Reset defaults` button.
  - Use `materializeQuickPreset` for click/drag flows; maintain existing `NODE_PRESET_MIME` dataTransfer behavior by embedding node snapshot payload.
- **`Canvas.tsx`**
  - Extend context menu to include `Save as quick preset…` (calls new hook `useQuickPresetCapture`).
  - When capturing nested nodes, resolve actual node data from subsystem path via existing utilities (re-use `parseNestedNodeId`).
- **`Inspector.tsx`**
  - Add small `Save as preset` button near delete.
  - Hook into same capture logic for consistency.
- **New components**
  - `src/components/quick-presets/QuickPresetManager.tsx`
  - `src/components/quick-presets/QuickPresetTile.tsx` for palette rendering (optional but improves readability).

## Capture Flow Details
- Capture should:
  1. Read node from store (including nested path resolution).
  2. Strip transient fields (`id`, `x`, `y`, `project.id` etc.).
  3. Prompt for preset name (prefill with node name) and optional description.
  4. Create `QuickPreset` entry with `source.type = 'user'`.
  5. Persist and close modal.
- If a preset is created while a manager modal is open, ensure state updates propagate (consider colocating modal state in store or using context).
- Editing existing preset “Update from selected node” should re-run sanitization on currently selected node and replace stored snapshot (guard if selection type mismatches).

-## Import / Export Format
- YAML structure:
  ```yaml
  version: 1
  presets:
    - # QuickPreset entries
  ```
- Export: include both user-created and default presets by default, but offer checkbox to include defaults. Always sanitize before writing.
- Import: parse YAML, validate version, de-duplicate by name or id, prompt user for merge behavior:
  - **Merge**: keep existing + new (rename collisions by appending counter).
  - **Replace**: overwrite entire list with imported presets (after validation).
- Show summary/toast of how many presets imported/merged/skipped.

## Testing Strategy
- **Unit**
  - `sanitizeNodeForPreset` across node types, ensuring excluded fields removed.
  - `materializeQuickPreset` regenerates ids and respects node type.
  - Store actions persist to localStorage (mocked) and maintain ordering.
  - Import/export parsers validate version and handle bad payloads.
- **Component**
  - Palette renders custom presets, triggers `applyQuickPreset` on click.
  - Manager modal interactions (potentially via React Testing Library) to ensure rename/update flows.
- **Integration / Manual**
  - Verify capture from main and nested subsystem nodes.
  - Drag & drop quick preset onto canvas and subsystem editors.
  - Import/export roundtrip.

## Risks & Mitigations
- **Corrupt preset data**: validate snapshot before materializing; fall back to defaults and show toast if validation fails.
- **Breaking autosave**: keep preset persistence separate from project autosave to avoid collisions.
- **Nested subsystem capture**: ensure embedded projects don’t accidentally embed full project graphs (sanitize recursion depth, maybe disallow subsystem nodes v1 or only capture shallow copy).
- **Large preset exports**: file size low, but warn if exceeding threshold when importing.

## Rollout Steps
1. Implement sanitization + materialization utilities and add unit tests.
2. Extend store with quick preset state, persistence, and selectors.
3. Update `Palette.tsx` to consume store-based presets and align drag/drop payloads.
4. Add capture affordances in Canvas context menu and Inspector.
5. Build Quick Preset Manager modal (CRUD, reorder, import/export/reset).
6. Wire import/export routines with validation and toasts.
7. QA across browsers; verify localStorage survival and undo/redo unaffected.
8. Update docs (`README.md`) to describe preset management and sharing.

## Open Questions
- Should subsystem nodes be capturable? If yes, do we embed entire `project` tree or prompt user to confirm size?

Yes, and we embed the entire 'project' tree

- Do we allow editing underlying node fields directly inside manager vs redirecting to Inspector first?

Redirecting to inspector

- Should presets be project-scoped (saved inside project file) in addition to global scope for multi-user handoff?

Yes, the presets should also be saved inside project file, in addition to be able to save separately

- What is the expected behavior when a preset references a node type that later evolves (schema changes)? Need versioning/migration hooks.

Should be blocked from using while being displayed in the preset. 


