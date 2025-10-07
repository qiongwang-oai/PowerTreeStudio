# PowerTree Studio User Manual

PowerTree Studio is a web-based visual editor and analyzer for DC power distribution networks. This manual explains the core workflows so you can sketch, validate, and report on power trees quickly.

---

## 1. Workspace Overview

- **Top toolbar**: open/import JSON or YAML projects, save/export the current project (YAML), export the canvas as PDF, undo/redo, run auto-alignment, launch reports, or clear the canvas. All commands participate in undo/redo and autosave.
- **Scenario banner**: pinned to the canvas. Switch between `Typical`, `Max`, and `Idle` scenarios; see live totals for critical and non-critical loads, copper and converter losses, overall efficiency, and the total warning count.
- **Palette (left)**: click or drag node presets (Source, Converter, Load, Bus, Note, Subsystem, Subsystem Input). The quick preset shelf below hosts reusable templates you capture or import.
- **Canvas (center)**: React Flow canvas with pan/zoom, minimap, and zoom controls. Edges are orthogonal, colored by upstream voltage, and sized by log current. Select an edge to reveal a draggable midpoint handle.
- **Inspector (right)**: context panel for editing nodes, edges, markups, and multi-selections. Tabs expose editable properties, computed telemetry, warning lists, and embedded subsystem controls.
- **Markup toolbar**: toggles between select/multi-select modes and adds annotation tools (text, line, rectangle) directly on the canvas.

---

## 2. Projects, Persistence, and Files

- **Autosave**: every change writes to browser `localStorage` (`powertree_autosave_v1`). Reloading restores your last state.
- **Open**: accepts `.json`, `.yaml`, or `.yml`. Imported quick presets can replace or merge with your local library.
- **Save**: downloads the active project as YAML. Uses the browser save picker when available; otherwise creates a file whose name matches the project.
- **Sample data**: bundled examples (`Sample_system.json`, `Server_subsystem.json`) live in `public/`.
- **Export PDF**: captures the current canvas (nodes, edges, markups) with generous padding and scales labels for legibility.

---

## 3. Building the Diagram

- **Add nodes**: drag from the palette or click to drop at the default position. Quick presets behave the same and can target subsystems.
- **Connect nodes**: drag from handles—sources/subsystem inputs expose outputs, converters/buses accept inputs and provide outputs, loads accept inputs only.
- **Edge labels**: show resistance (mΩ) and scenario current (`5.0 mΩ | 12.3 A`). Warnings append to the label when upstream voltage mismatches downstream requirements or exceeds converter ranges; mismatched edges render red.
- **Context menus**: right-click nodes to Copy, Save as quick preset…, or Delete. Right-click empty space to Paste at the pointer.
- **Multi-selection**: enable via the markup toolbar. Drag to marquee-select; a floating HUD shows counts and shortcut hints (`⌘/Ctrl+C`, `⌘/Ctrl+V`, `Delete`).

---

## 4. Editing Nodes, Edges, and Markups

### 4.1 Nodes

- **Sources**: set `Vout`, optional current/power limits, redundancy (`N+1`), and parallel count. Inspector reports total power and warns about overcurrent, overpower, or redundancy shortfall.
- **Converters**: configure `Vin_min`, `Vin_max`, `Vout`, current/power limits, phase count, and efficiency model. The efficiency editor supports fixed η or curve data, per-phase scaling, and plots the operating point.
- **Dual-output converters**: manage each branch’s voltage, limits, phase count, and efficiency. Branch metrics list per-handle power/current; warnings cite branch labels.
- **Loads**: define required voltage, typical/max/idle currents, utilization factors, and parallel devices. Toggle **Critical Load** to include/exclude from Σ Loads. Inspector flags voltage margin shortfalls.
- **Buses & Notes**: set `V_bus` for validation or edit note text (multi-line supported).
- **Subsystems**: set parallel count, import/export embedded projects, adjust container color, expand/collapse inline views, and reorder input handles from the inspector (with a one-click sync to the embedded layout). Inspector links to the subsystem editor.
- **Subsystem inputs**: specify handoff voltage to validate upstream connections.

### 4.2 Edges

- Adjust resistance (mΩ); inspector shows dissipation (W) for the current scenario. Select edges to drag midpoint handles and reroute bundles.

### 4.3 Markups

- Activate text, line, or rectangle tools via the markup toolbar. Click (text) or click-drag (line/box) on empty canvas. Inspector customizes copy, font size, colors, dashed outlines, fill opacity, z-order, and deletion. Markups respect undo/redo and copy/paste.

---

## 5. Quick Presets

- **Capture**: use `Save as preset` in the inspector or the node context menu. Choose name, description, and accent color; IDs and positions are stripped so presets rematerialize cleanly.
- **Apply**: click to drop near the cursor or drag for precise placement. Presets can target subsystem editors (Source presets are hidden there).
- **Manage**: the Quick Preset Manager (palette) supports renaming, reordering (↑/↓), duplication, “update from selection,” deletion, reset to defaults, and toggling default presets in exports.
- **Import/Export**: share presets as YAML collections (versioned). On import, choose merge or replace; presets persist in `localStorage` (`powertree_quick_presets_v1`).

---

## 6. Subsystems and Nested Editing

- **Subsystem nodes** embed another project; each consumes a single upstream input but may expose multiple internal ports.
- **Open editor**: double-click the subsystem node or use `Open Editor` in the inspector. The modal editor mirrors the main workspace with its own palette (no Sources), canvas, inspector, undo/redo, auto-alignment, quick presets, and clear button.
- **Embedded palette**: Sources are blocked; add `Subsystem Input Port` nodes to define expected voltages and connection points.
- **Expanded views**: show child nodes inline on the main canvas with adjustable container position and tint. Collapse via inspector or context menu.
- **Nested subsystems**: supported recursively; scenario selection at the root propagates into every open layer.

---

## 7. Analysis, Scenarios, and Warnings

- **Scenarios**: `Typical`, `Max`, and `Idle` recompute load currents; results cascade through converters and subsystems.
- **Warnings**: banner count combines validation errors (`rules.ts`) plus per-node physics warnings from `calc.ts`. Inspector tabs list warnings, with quick copy buttons and contextual metrics (P_in/out, I_in/out, η, voltage margins, edge drops).
- **Edge diagnostics**: edge labels append messages such as `Converter Vin Range Violation` or `Vin != Vout`; red edges highlight mismatches.
- **Voltage margin checks**: loads warn when upstream voltage is below allowed margin (derived from project `defaultMargins`).

---

## 8. Reporting and Exports

- **Report dialog**: launched from the toolbar. Choose **System power breakdown** or **Converter summary** views.
  - *System view*: expandable tables of subsystems and loads, sorted by critical power, with donut charts. Expanded subsystems render nested totals, efficiency, and charts for each branch.
  - *Converter view*: groups converters by location (path through subsystems) and lists Vin/Vout, currents, power, loss, per-phase metrics, and topology when provided.
- **Download spreadsheet report**: captures visible charts as high-resolution PNGs, builds a multi-sheet report with load breakdowns, losses, efficiency, and converter details.

---

## 9. Shortcuts and Tips

- **Navigation**: drag to pan, scroll to zoom; use minimap and zoom controls; `Fit View` recenters the graph.
- **Keyboard**: `⌘/Ctrl+Z` undo, `⇧⌘/Ctrl+Z` or `⌘/Ctrl+Y` redo, `⌫/Delete` remove selection, `⌘/Ctrl+C` / `⌘/Ctrl+V` copy/paste nodes/edges/markups, `Esc` clears selection or exits tools.
- **Inspector width**: drag its border between 220–640 px; subsystem editor provides a similar resizer.
- **Auto alignment**: defaults to 500 px columns, 100 px rows. Enter positive numbers to override; leaving fields blank reverts to defaults.
- **Edge midpoints**: appear when an edge is selected. Drag to avoid overlaps or align bundles; adjustments propagate to grouped edges that share a source handle.

---

## 10. Troubleshooting

| Symptom | Possible Cause & Fix |
| --- | --- |
| Unconnected node warnings | Connect or delete dangling nodes (Notes are ignored). |
| Voltage mismatch warnings | Check converter outputs, bus voltage, or load `Vreq`. Edge labels list actual values. |
| Overcurrent/overpower warnings | Increase limits, redistribute loads, or add parallel capacity. Warnings show actual vs limit. |
| Subsystem voltage errors | Ensure embedded projects include `Subsystem Input` nodes with defined voltages that match upstream edges. |
| Empty subsystem warning | Import or build the embedded project; an empty subsystem assumes zero loads. |
| Need fresh start | Use `Clear` (nodes/edges/markups only) or remove `powertree_autosave_v1` / `powertree_quick_presets_v1` from `localStorage`. |

---

## 11. Next Steps

- Run through the bundled samples to validate workflows.
- Share quick presets via YAML with teammates.
- Integrate the report export into review or compliance checklists.
