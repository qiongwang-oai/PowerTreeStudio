## Goal
- Rework `autoLayoutProject` so load and subsystem nodes anchor the rightmost column while upstream nodes cascade left by depth, respecting user-defined spacing.
- Ensure edge routing updates minimize mid-edge overlaps after node repositioning.

## Context Summary
- Current flow in `src/utils/autoLayout.ts` derives depths via topological propagation and arranges columns left-to-right by depth.
- Loads/subsystems currently share general column logic with other nodes; they are not forced to depth 1.
- Edge midpoint logic only adjusts `midpointOffset`, not full polyline shaping to avoid overlap.
- Row/column spacing defaults exist but need to be applied explicitly per requirement sequence.

## High-Level Approach
- **Depth reset:** Before propagation, set depth of all `Load` and `Subsystem` nodes to 1; treat subsystem ports as part of the parent subsystem only.
- **Depth recompute:** For all other nodes, compute depth as `1 + max distance to any downstream load/subsystem` using graph traversal (reverse BFS/DFS), accommodating cycles via guard.
- **Column mapping:** Map depth `1` nodes (loads/subsystems) to the rightmost column; assign shallower nodes to successive columns to the left (`depth 2` immediately left of `depth 1`, etc.).
- **Column ordering:** For loads/subsystems, sort by: (1) minimal upstream depth ascending, (2) total input power descending, (3) node name ascending.
- **Row placement loop:** Implement the provided placement pseudo-code ensuring handles align vertically when unplaced upstream nodes connect.
- **Edge adjustment:** After node placement, adjust edge midpoints (and potential control points if available) to reduce crossings; explore routing heuristics (e.g., shifting midpoint X based on sibling spacing, snapping to column midlines).

## Detailed Tasks
1. **Graph Preparation**
   - Build adjacency (incoming/outgoing) maps if not already available; reuse `buildMaps` where possible.
   - Identify load/subsystem nodes and reset their depth metadata.

2. **Depth Computation**
   - Compute farthest distance to downstream load/subsystem for every node:
     - Reverse traverse from load/subsystem nodes, tracking maximum hop count.
     - For nodes without path to loads/subsystems, fall back to existing depth logic to avoid `Infinity`.
   - Ensure depth values remain integers ≥1; assign loads/subsystems depth 1 explicitly.

3. **Column Assignment**
   - Determine maximum depth; allocate columns so depth 1 is rightmost, depth `d` positioned at column index `maxDepth - d`.
   - Preserve component separation logic or refactor to support new column ordering.

4. **Load/Subsystem Ordering**
   - For each load/subsystem node gather:
     - Closest upstream depth (minimum depth among incoming neighbours).
     - Total input power (`powerByNode` from compute results, fallback to 0).
   - Sort per requirements before applying row spacing.

5. **Placement Loop Implementation**
   - Initialize `placed` flags for all nodes.
   - Iterate `depth` from 2 → `maxDepth`, applying nested loop over input handles:
     - For each handle, find upstream node not yet placed; align outputs vertically with downstream handle (respecting vertical spacing).
     - Update node `y` positions incrementally while honoring row spacing.
   - Ensure loop terminates; add safeguards against infinite iterations.

6. **Spacing Enforcement**
   - Apply user-defined vertical spacing for loads/subsystems column first, then enforce same spacing when positioning upstream nodes.
   - Apply horizontal spacing between adjacent columns per `columnSpacing` option.

7. **Edge Midpoint Adjustment**
   - After nodes positioned, recompute edge midpoints by shifting `midpointX` toward column mid-point of the downstream node (with padding) to avoid crossovers.
   - Stay within existing midpoint-based routing; no additional bend points required.

8. **Testing & Validation**
   - Create representative project fixtures: linear chain, branching tree, multiple loads, cyclic references.
   - Run existing layout tests (if any) or add new ones to cover sorting and spacing rules.
   - Manual QA in UI to confirm columns order and edge clarity.

## Risks & Mitigations
- **Cycle handling:** Depth calculation could loop; add visited set with guard depth cap.
- **Performance:** Repeated handle alignment may be expensive; limit iteration counts and reuse computed spans.
- **Edge data schema:** Need confirmation whether additional edge control points are supported before implementing complex routing.
- **Legacy features:** Existing component-based vertical centering may conflict; plan to refactor carefully or retain behaviour where compatible.

## Open Questions
- Are subsystem ports treated as separate nodes needing depth adjustment, or do we only reposition parent subsystem nodes? Only reposition parent subsystem nodes
- Should edge routing support multi-bend paths, or is midpoint adjustment sufficient in current rendering? Midpoint adjustment is sufficient
- Do we need to preserve manual overrides (existing x/y) when user opts out of auto-alignment for specific nodes? No


