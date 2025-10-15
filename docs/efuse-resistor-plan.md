# Efuse/Resistor Node Enhancements

## Goals
- Track inline resistance on bus/net nodes and compute self-heating loss `P_loss = I^2 * R`.
- Surface the new resistance parameter across inspectors, bulk editors, and palette labels (renamed to Efuse/Resistor).
- Include Efuse/Resistor losses in upstream power accounting, converter summaries, and system power breakdowns.
- Extend test coverage to validate power/dissipation calculations and reporting updates.

## Model & Defaults
- Extend `BusNode` with optional `R_milliohm` (milliohm units, default 0).
- Update presets, quick-add templates, and default names to "Efuse/Resistor".

## Calculation Updates
- During `compute`, treat buses as zero-drop inline resistors:
  - Sum downstream `P_in` (plus edge losses) for `P_out`.
  - Derive `I_out` from downstream edge currents (fallback `P_out / V_bus`).
  - Compute `P_loss = I_out^2 * R` (ohms) and set `P_in = P_out + P_loss`.
  - Propagate `loss`, `I_in`, and `I_out` to upstream parents.
- Reconciliation loops reuse the same model after edge-current updates.
- Include Efuse/Resistor losses in deep aggregates and overall loss tallies.

## UI Exposure
- Palette and subsystem palette buttons relabeled "Efuse/Resistor".
- Inspector and subsystem inspector sections renamed; add numeric field for `R (mΩ)` with non-negative coercion and computed metrics (input/output power, dissipation).
- Bulk editor shows the new label and exposes `V_bus` plus `R_milliohm` with validation.

## Reporting
- Converter summary emits entries for Efuse/Resistor nodes with pin/pout/loss/current and downstream edge-loss totals.
- Report dialog and spreadsheet export formatting recognise the new node type and vocabulary.
- System power breakdown slices include Efuse/Resistor losses; label updated to "Copper traces, inline resistors, and power converters".

## Testing
- Add Vitest coverage to confirm loss math, converter summary inclusion, and power breakdown contributions.

## Migration Notes
- Projects without `R_milliohm` default to 0 mΩ; no data migration required.
- Existing custom node names are preserved; only defaults and labels change.

