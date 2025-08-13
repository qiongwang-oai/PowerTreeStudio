![PowerTree Studio](public/powertree-banner.svg)

## PowerTree Studio

A visual editor and analyzer for DC power distribution trees ("power trees"). Model Sources, Converters, Loads, Buses, and interconnects, then get real‑time validation, losses, and efficiency.

### Features
- **Visual editor**: drag nodes, connect with edges.
- **Node types**:
  - Source (V_nom, limits)
  - Converter (Vin_min/max, Vout, I/P limits, efficiency: fixed or curve)
  - Load (Vreq, I_typ, I_max, Critical Load flag)
  - Bus, Note
  - Subsystem (embeds another project; single upstream input; imports JSON in Inspector)
  - Subsystem Input Port (used inside embedded projects; acts as the external input; treated as a Source at the subsystem's input voltage during compute)
- **Edge modeling**: editable resistance (mΩ). Labels show resistance and calculated current.
- **Computation**:
  - Scenario current for loads (Typical/Max/Idle)
  - Converter efficiency (fixed or interpolated curve)
  - Edge drop and ohmic loss
  - Bottom‑up recompute so upstream nodes track downstream changes
  - Source/Converter total power with edge losses included
  - Σ Loads (critical only), Σ Sources, overall efficiency
- **Inspector**:
  - Edit node/edge properties
  - Read‑only computed fields (converter: total input/output/dissipation; load: total input; edge: dissipation)
- **Quality of life**: autosave to localStorage, import/export JSON, Markdown report.

### Getting started
- Prereqs: Node.js 18+
- Install and run:
```bash
npm install
npm run dev
```
Open the printed local URL (Vite default is http://localhost:5173).

### Usage
- Add nodes from the left palette; drag to position.
- Connect nodes using handles:
  - Source: bottom output only (labeled "output")
  - Converter: top input ("input"), bottom output ("output")
  - Load: top input only ("input")
- Select nodes/edges to edit in the right Inspector.
  - Edge: edit resistance (mΩ); see dissipation.
  - Load: toggle "Critical Load" (included in Σ Loads when checked).
  - Converter/Source: see computed powers and dissipation.
- Bottom bar shows Σ Loads, Σ Sources, Overall η, Warnings.

### Data model (simplified)
- Source, Converter, Load, Bus, Note, Subsystem, SubsystemInput (see `src/models.ts`).
- Edge: `interconnect.R_milliohm` used for Vdrop and ohmic loss.
- Project scenarios: `Typical | Max | Idle`.

### Calculations (key points)
- Loads: `I` per scenario; `P_in = P_out = Vreq * I`.
- Converters:
  - `P_out = Σ(child P_in) + Σ(outgoing edge loss)`
  - `η` from fixed value or curve (interpolated by output load)
  - `P_in = P_out / η`, `loss = P_in − P_out`
- Sources:
  - `P_out = Σ(child P_in) + Σ(outgoing edge loss)` (and mirrored to `P_in`)
- Edges: `R_total = mΩ/1000`, `I = child I_in`, `Vdrop = I*R`, `Ploss = I²*R`.
- Totals:
  - **Σ Loads**: sum of total output power of loads where `critical !== false`
  - **Σ Sources**: sum of total input power of sources
  - **Overall η**: Σ Loads / Σ Sources

### Testing
```bash
npm test          # watch mode
npm run test:run  # one-off
```

### Tech stack
- React 18, TypeScript, Vite
- React Flow (canvas), Zustand (state), TailwindCSS (styling), Recharts (plots)
- Vitest + Testing Library

### Notes
- Autosave uses `localStorage` (clear it to reset).
- Import/Export and Report are available in the bottom bar.
