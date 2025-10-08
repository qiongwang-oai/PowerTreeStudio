# Converter Datasheet Buttons Plan

## Goals
- Allow converter and dual-output converter nodes to associate a controller and power stage datasheet reference (URL or local path).
- Provide inline inspector actions to capture or update those references and open the datasheet quickly.
- Maintain parity between the primary inspector and subsystem inspector, plus bulk editor defaults and presets.

## Current State & Constraints
- `controllerPartNumber` and `powerStagePartNumber` are plain text inputs with no related actions in either inspector surface.
- Node models do not store any datasheet metadata.
- No shared utility exists today for opening arbitrary URLs/paths from the inspector.

```10:39:src/models.ts
// ... existing code ...
export type ConverterNode = BaseNode & {
  type: 'Converter'
  topology?: 'buck'|'llc'|'ldo'|'other'
  Vin_min: number
  Vin_max: number
  Vout: number
  Iout_max?: number
  Pout_max?: number
  controllerPartNumber?: string
  powerStagePartNumber?: string
  phaseCount?: number
  efficiency: EfficiencyModel
}
// ... existing code ...
```

```442:456:src/components/Inspector.tsx
// ... existing code ...
if (node.type === 'Converter' || node.type === 'DualOutputConverter') {
  identityFields.push(
    <FormField key="controller" label="Controller Part Number">
      <input className="input" value={(node as any).controllerPartNumber || ''} onChange={e=>onChange('controllerPartNumber', e.target.value)} />
    </FormField>,
    <FormField key="powerStage" label="Power Stage Part Number">
      <input className="input" value={(node as any).powerStagePartNumber || ''} onChange={e=>onChange('powerStagePartNumber', e.target.value)} />
    </FormField>
  )
}
// ... existing code ...
```

```133:138:src/components/subsystem/SubsystemInspector.tsx
// ... existing code ...
if (node.type === 'Converter' || node.type === 'DualOutputConverter') {
  identityFields.push(
    <FormField key="controller" label="Controller Part Number">
      <input className="input" value={(node as any).controllerPartNumber || ''} onChange={e=>onChange('controllerPartNumber', e.target.value)} />
    </FormField>,
    <FormField key="powerStage" label="Power Stage Part Number">
      <input className="input" value={(node as any).powerStagePartNumber || ''} onChange={e=>onChange('powerStagePartNumber', e.target.value)} />
    </FormField>
  )
}
// ... existing code ...
```

## Proposed Data Model Updates
- Extend `ConverterNode` and `DualOutputConverterNode` with optional string fields:
  - `controllerDatasheetRef?: string`
  - `powerStageDatasheetRef?: string`
- Update factory defaults in `nodePresets` so new nodes initialize these refs to empty strings to keep tests deterministic.
- Ensure serialization/deserialization in project IO remains backward compatible by treating missing fields as undefined.

## UX & Interaction Changes
- Replace the single text input bodies with a flex row that keeps the input (full-width) and appends two icon buttons per field:
  - `Add datasheet link or path` → opens a lightweight dialog allowing the user to paste a URL or type a filesystem path; persists on submit.
  - `Open datasheet` → calls a shared helper that normalizes the stored reference to a URL (`http(s)://`, `https://`, `file://`, or `//`), warns if empty, and invokes `window.open` in a new tab.
- Tooltips: "Add datasheet link or path" and "Open datasheet" for clarity; aria-labels should mirror the tooltip text for accessibility.
- Buttons: use `variant="outline"` & `size="icon"` to match inspector styling, with Lucide icons (`LinkPlus` / `ExternalLink` or similar) sized to `h-4 w-4`.
- Disable the open button and surface a tooltip hint when no reference is stored.

## UI Components & Reuse Strategy
- Create a small reusable `DatasheetActions` component that receives `{ value, onChange, label }` and renders the input + buttons, so it can be reused in both inspector variants.
- For the "add" flow, leverage an existing dialog pattern if available; otherwise create a minimal controlled `AlertDialog`-style modal local to the inspector to avoid large new dependencies. Persist the entered string via `onChange`.
- Extract a helper in `utils` (e.g., `normalizeDatasheetHref`) to sanitize/prepare the string for `window.open`.

## Bulk Editor & Presets
- Add the new datasheet properties to `NodeBulkEditorModal` configuration so users can edit them alongside part numbers.
- Extend quick preset capture (`nodePresets`) to include the saved datasheet references.
- Update associated tests (`nodePresets.test.ts`, `dualOutputConverter.test.ts`, `NodeBulkEditorModal.test.tsx`) to assert the new fields are handled.

## Implementation Steps
1. **Type & default updates**: modify `models.ts`, `nodePresets`, and any node factory utilities; adjust tests accordingly.
2. **Inspector UI refactor**: introduce the shared component, integrate within `Inspector` and `SubsystemInspector` identity sections.
3. **Add datasheet dialog**: implement controlled dialog component; wire up state management, validation (trim input, simple URL/path checks), and persistence.
4. **Open behavior**: add helper function, hook button click to `window.open`, handle errors (e.g., catch blocked popups) with console warnings or future toast integration.
5. **NodeBulkEditorModal**: extend field descriptors, ensure save pipeline includes new keys.
6. **QA & polishing**: cross-browser sanity check, confirm undo/redo works, ensure keyboard accessibility for the dialog and buttons, and smoke-test exported/imported project JSON.

## Edge Cases & Follow-Ups
- Local filesystem paths may not open from the browser due to security restrictions; document this limitation and consider future integration with Electron/native shell if needed.
- Prevent accidental persistence of whitespace-only input by trimming during save.
- Future enhancement: allow attaching multiple datasheet references per part; current design stores a single string to stay scope-limited.

