# Auto Alignment Algorithm Refresh — Implementation Plan

## 1. Entry Point & Mode Selection
- Add a prompt whenever auto alignment runs (likely in `AutoAlignPrompt.tsx` or the caller) offering **Existing Algorithm** vs **New Algorithm**.
- Persist the user’s latest algorithm choice for the session so the prompt defaults appropriately on subsequent invocations.
- Guard the new logic behind a feature flag/config to simplify incremental rollout and testing.

## 2. Preprocessing & Node Metadata Reset
- Reset `depth` to `1` for all load nodes and top-level subsystem container nodes (subsystem internals excluded).
- Reset `if_placed` to `false` for all nodes before placement.
- Validate that depth/if_placed fields exist or extend the node model accordingly.

## 3. Depth Computation
- Treat loads and subsystem containers as sinks with depth `1`.
- Traverse upstream (reverse edges) to assign each other node a depth of `max(childDepth) + 1`, where `childDepth` is the depth of connected downstream handles.
- For subsystem nodes, rely on the container node only; ignore nested internal nodes when calculating depth.
- Handle branches, cycles (if any), and nodes without downstream connections gracefully by clamping orphaned upstream nodes to depth `1`.

## 4. Load & Subsystem Column Ordering
- Collect all load/subsystem container nodes in a single column.
- Sort using the three-tier criteria: (1) ascending depth of closest upstream nodes, (2) descending total input power, (3) ascending node name.
- Apply user-defined vertical spacing when positioning within the column.

## 5. Column Assignment for Upstream Nodes
- Create columns indexed by depth where depth `1` = load/subsystem column.
- Place nodes of depth `2` immediately to the left of column `1`, depth `3` to the left of column `2`, etc.
- Keep orphan nodes (no path to loads/subsystems) in the leftmost column by maintaining their depth at `1`.
- Respect user-defined horizontal spacing between columns.

## 6. In-Column Placement Workflow
- Iterate depths from `2` to `maxDepth`.
- For each depth `i`, process input handles belonging to nodes at depth `i-1` from top to bottom (using handle `y` positions to resolve ordering; be careful with multi-handle nodes and subsystem container vs internal order).
- For each handle, locate upstream nodes (depth `i`) with `if_placed == false`, align their output handles vertically with the corresponding downstream handle, adjust vertical spacing to maintain at least the configured minimum.
- Update `if_placed` to `true` once a node is positioned.

## 7. Edge Handling
- After node placement, compute edge midpoints between each upstream handle and its downstream counterpart.
- Run a post-pass to adjust horizontal midpoints to reduce overlap/crossing while preserving orthogonal routing conventions.

## 8. Data Structures & Utilities
- Identify where depth/if_placed fields live (likely in node metadata or layout cache) and extend helpers accordingly.
- Consider extracting shared layout utilities into `src/utils/autoLayout.ts` or a new module for clarity.

## 9. Testing & Validation
- Add unit tests covering depth assignment, sorting rules, and placement spacing.
- Add integration/e2e scenario verifying the prompt and end-to-end layout result (if feasible with existing test harness).
- Include regression tests ensuring legacy algorithm remains unchanged when selected.

## 10. Resolved Decisions
- Persist algorithm choice for the duration of the session.
- Place orphan nodes in the leftmost column by keeping their depth at `1`.
- No additional performance optimizations required for large graphs at this stage.
