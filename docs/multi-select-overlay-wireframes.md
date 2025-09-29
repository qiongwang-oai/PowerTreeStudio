# Multi-Select Overlay Wireframes

## Context

Goal: illustrate the rectangular marquee used when multi-select mode is enabled on the canvas. These wireframes focus on interaction states and key visual affordances; align styling with existing React Flow and markup layer treatments.

## Legends

- `[]` Node cards (react-flow nodes)
- `=====` Edge (orthogonal) segments
- `( )` Markups (text/line/rectangle anchors)
- `▢` Selection handles (light blue)
- Dashed boxes represent the marquee in-flight
- Solid cyan outline represents the committed selection halo

## State 1 — Idle (Multi-Select Enabled, No Drag)

```
┌─────────────────────────────────────────────────────────────────┐
│ Toolbar: [Select] [Multi-Select*] [Text] [Line] [Box]            │
│                                                                 │
│      [] Node A                                                   │
│                                                                 │
│                [] Node B    =====    [] Node C                  │
│                                                                 │
│   (Text markup)                                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

- Toggle shows `Multi-Select` as active (`*`).
- Canvas behaves normally until pointer drag starts.
- Status text (optional) can appear near toolbar: “Drag to select multiple items”.

## State 2 — Drag In Progress

```
┌─────────────────────────────────────────────────────────────────┐
│ Toolbar: [Select] [Multi-Select*] [Text] [Line] [Box]            │
│                                                                 │
│      [] Node A                                                  │
│            ┌───────────────────────────────┐                    │
│            │                               │                    │
│            │   [] Node B    =====    [] Node C                  │
│            │                               │                    │
│            │   (Text markup)               │                    │
│            │                               │                    │
│            └───────────────────────────────┘                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

- Dashed marquee follows pointer.
- Nodes/edges/markups under the rectangle highlight subtly (e.g., alpha lift) to preview capture.
- Tooltip near cursor: “Release to select 3 items”.

## State 3 — Selection Committed

```
┌─────────────────────────────────────────────────────────────────┐
│ Toolbar: [Select] [Multi-Select*] [Text] [Line] [Box]            │
│ Action Bar: Copy • Delete • Deselect (3 items)                  │
│                                                                 │
│      [] Node A                                                  │
│            ┌───────────────────────────────┐                    │
│            │▢                             ▢│                    │
│            │                               │                    │
│            │   [] Node B    =====    [] Node C                  │
│            │                               │                    │
│            │   (Text markup)               │                    │
│            │▢                             ▢│                    │
│            └───────────────────────────────┘                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

- Marquee transitions to a thin solid cyan outline with corner handles.
- Nodes/edges/markups inside show the existing “selected” styling (cyan corners, thicker stroke, etc.).
- Floating action bar appears near toolbar or bottom of viewport listing bulk actions.

## State 4 — Adjust Selection (Optional Follow-Up)

```
┌─────────────────────────────────────────────────────────────────┐
│ Toolbar: [Select] [Multi-Select*] [Text] [Line] [Box]            │
│ Action Bar: Copy • Delete • Group (4 items)                     │
│                                                                 │
│      [] Node A                                                  │
│            ┌───────────────────────────────┐                    │
│            │▢                             ▢│                    │
│            │    [] Node B ===== [] Node C  │                    │
│            │                               │                    │
│            │   (Text markup)               │                    │
│            │                               │                    │
│            └───────────────▢───────────────┘                    │
│                      [] Node D                                  │
└─────────────────────────────────────────────────────────────────┘
```

- Dragging a handle expands the selection bounds; live preview updates included items count.
- Clicking an already-selected node while holding `Shift` removes it; the outline adapts to new bounding box.

## State 5 — Mixed Canvas (Edge + Markup Highlighting Detail)

```
┌─────────────────────────────────────────────────────────────────┐
│ Toolbar: [Select] [Multi-Select*] [Text] [Line] [Box]            │
│ Action Bar: Copy • Delete • Paste (2 nodes, 1 edge, 1 markup)   │
│                                                                 │
│      [] Node A─────────────=====────────────[] Node B           │
│           ╲                                ╱                    │
│            ╲  Solid cyan overlay tracks   ╱                     │
│             ╲ the longest dimension      ╱                      │
│              (Rectangle markup)                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

- The edge receives a thicker cyan stroke to denote inclusion.
- Markup rectangles adopt a cyan border overlay; text markup gets cyan baseline.
- Action bar surfaces type breakdown for clarity.

## Annotations for Implementation

- **Overlay Layer**: Implement as React component rendered above React Flow but below context menus; use absolute positioning relative to canvas wrapper.
- **Measurements**: Use `screenToFlowPosition` for nodes/edges, and native DOM positions for markups.
- **Animations**: Fade-in/out on marquee, 120ms ease.
- **Accessibility**: Provide ARIA live region updates: “Selected 3 items”.
- **Exit**: Pressing `Esc` clears selection and hides overlay.


