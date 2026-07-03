# Tattslotto Ticket Grid Replay Design

Date: 2026-07-03
Status: Approved concept, awaiting implementation plan

## Purpose

Add a discovery-focused panel that replays real Windfall draw history on the same 9-column by 5-row ticket grid used by Tattslotto customers. The goal is to make spatial behaviour easier to see: row/column clustering, repeated cells, carry-over numbers, and adjacent-neighbour traces.

The panel is an observe-only visual diagnostic. It must not alter candidate generation, scoring, forced inclusions, forced exclusions, draw history, or saved presets in V1.

## Non-Goals

- Do not present ticket-grid patterns as predictions or probabilities.
- Do not generate candidates from this panel in V1.
- Do not implement the generated-candidate slot/carousel mode in V1.
- Do not add new fake, mock, or fallback draw data.
- Do not use simulated draws in the historical replay unless a later mode explicitly labels them as simulation.

## Panel Placement

Add a new collapsible panel under the DGA workflow:

`Tattslotto Ticket Grid Replay`

Recommended position:

1. Next Hot Blocks
2. Tattslotto Ticket Grid Replay
3. Diamond Grid Analysis

This keeps the new panel near DGA because it is another spatial view, but gives it its own identity instead of burying it inside the existing DGA grid.

## Grid Layout

The ticket grid is fixed at 9 columns by 5 rows:

- Row 1: 1-9
- Row 2: 10-18
- Row 3: 19-27
- Row 4: 28-36
- Row 5: 37-45

Each number is one circular cell. The grid must be responsive: compact but readable on desktop, and horizontally safe on small screens without text wrapping inside number cells.

## Data Source

Use `realFilteredHistory` from the active WFMQYH window.

Rules:

- Use only verified real draws.
- Respect the current WFMQYH selection.
- Preserve draw order internally so playback can move both forward and backward.
- Default playback order should be chronological, oldest to newest, because that best supports visual discovery over time.
- Show the current frame number, total frame count, draw date, mains, and supps.

If the active WFMQYH window contains no real draws, show a calm empty state:

`No real draws available in the active window. Adjust WFMQYH or reload draw history.`

## Draw Rendering

For the active frame:

- Main numbers: filled blue cells.
- Supplementary numbers: filled violet cells.
- Previous-frame repeats: optional carry-over marker.
- Previous-frame adjacent-neighbour hits: optional ±1/±2 trace marker.
- Overlay information must remain secondary to the drawn numbers.

Color must never be the only cue. Use labels, symbols, tooltips, or a visible legend.

## Playback Controls

Controls should be Apple HIG-inspired: compact, labelled, responsive, and with immediate pressed feedback.

Required controls:

- Step backward one draw.
- Play backward.
- Pause.
- Play forward.
- Step forward one draw.
- Speed selector.
- Stop / reset.

Recommended speed options:

- 0.25x
- 0.5x
- 1x
- 2x
- 4x

Stop/reset should return to the first frame for the current playback order. Pause should preserve the current frame.

Animation must use cleanup-safe timers so unmounting, changing WFMQYH, or collapsing the panel cannot leave an interval running.

## Overlay Toggles

V1 includes three observe-only overlay toggles.

### Spatial Density

Shows where the selected WFMQYH window has concentrated activity on the ticket grid.

Suggested implementation:

- Count appearances per row and column over the active WFMQYH window.
- Support a mains-only vs mains+supps selector.
- Normalize by the active window size so short and long windows remain readable.
- Highlight rows/columns with stronger observed concentration using outlines or subtle bands.

Label this as:

`Observed row/column density in the active WFMQYH window.`

Do not call this a hot-zone prediction.

### Carry-Over Markers

Marks numbers that repeat across adjacent frames in the replay.

Suggested implementation:

- For draw `t`, compare active draw numbers to draw `t - 1`.
- Show repeated numbers with a small repeat marker.
- Consider mains+supps as the default because all 8 balls are drawn from the same 45-number universe, while still preserving main/supp color differences.

Optional later extension:

- Add month-boundary carry-over markers, clearly labelled as month-boundary evidence.

### Adjacent Trace

Shows numbers in the active draw that are `-2`, `-1`, `+1`, or `+2` from a number in the previous draw.

Default: off.

Reason:

The adjacent-neighbour signal can be visually noisy. Keeping it off by default supports clarity while allowing inspection when the user wants it.

The tooltip/help text should say:

`Marks active-draw numbers that sit ±1 or ±2 from the previous draw. This is observed replay evidence, not a forecast.`

## Legends and Help

The panel must include a compact legend:

- Main
- Supp
- Carry-over
- Spatial density
- Adjacent trace

Help must be keyboard/touch accessible. Do not rely on hover-only title text for material explanations.

## State and Persistence

V1 panel state:

- open/collapsed state follows existing panel persistence behaviour.
- overlay toggles may persist through the existing preset/state mechanism if this is straightforward.
- playback frame index should not persist across refresh; it should reset when the active WFMQYH window changes.
- speed can persist locally if consistent with existing app patterns.

The panel must not modify:

- `userSelectedNumbers`
- `manualSimSelected`
- `simulatedDraw`
- candidate generation settings
- forced inclusion/exclusion lists

## Candidate Carousel Deferred to V2

The generated-candidate slot/carousel idea is valuable but intentionally deferred.

V2 design direction:

- Add a mode switch: `History Replay` / `Candidate Carousel`.
- Candidate Carousel reads generated candidates from the existing generated-candidate state.
- It loops candidates visually on the same 9x5 grid.
- User can pause and hold numbers.
- Held numbers are visible as held, not silently forced.
- Once 8 numbers are held, carousel playback disables.
- `Start Over` clears held numbers.
- Any generation influence must be opt-in and separately designed.

V2 must include stronger truthfulness wording because looping candidates can easily feel like a prediction engine. The first implementation should keep it as a selection aid, not a claim of likelihood.

## Architecture

Recommended components:

- `TattslottoTicketGridReplayPanel`
- `TattslottoTicketGrid`
- `TicketGridPlaybackControls`
- `TicketGridLegend`

Recommended pure helpers:

- `buildTicketGridCells()`
- `buildTicketGridReplayFrames(history, options)`
- `computeTicketGridDensity(frames, options)`
- `computeCarryOverMarkers(currentFrame, previousFrame, options)`
- `computeAdjacentTraceMarkers(currentFrame, previousFrame, options)`

Keep all draw calculations in pure helper functions so they can be tested without rendering React.

## Testing

Required unit tests:

- maps numbers 1-45 to the correct 9x5 grid row/column.
- builds replay frames from real filtered history in chronological order.
- excludes simulated draws from replay frames.
- computes mains and supps separately.
- computes carry-over markers from adjacent draw pairs.
- computes ±1/±2 adjacent trace markers correctly, including boundary cases for 1 and 45.
- resets frame index when the history window changes.

Required component tests:

- renders empty state when no real draws exist.
- renders current frame date and numbers.
- toggles overlays without changing generation state.
- playback controls expose accessible names.

Required app wiring tests:

- panel receives `realFilteredHistory`.
- panel does not call setters for user-selected numbers, manual simulation, candidate generation, or exclusions.

Manual/browser QA:

- load app with real history.
- open DGA workflow.
- open Tattslotto Ticket Grid Replay.
- verify grid is nonblank and aligned 9x5.
- step forward/backward.
- play/pause.
- toggle each overlay.
- check console for errors.
- check at one mobile-width viewport.

## Truthfulness Requirements

Panel copy must use language like:

- observed
- replay
- diagnostic
- active WFMQYH window
- historical frame

Avoid:

- predicts
- probability
- likely
- exploit as certainty
- hot zone unless explicitly labelled as observed density

Recommended panel note:

`This panel replays observed historical draws on the Tattslotto ticket grid. Overlays show visual diagnostics from the active WFMQYH window; they are not calibrated predictions.`

## Implementation Order

1. Add pure grid mapping and replay-frame helpers with tests.
2. Add static ticket grid component.
3. Add playback controls and timer-safe playback state.
4. Add spatial density overlay.
5. Add carry-over overlay.
6. Add adjacent trace overlay.
7. Wire panel under DGA.
8. Add manual/browser QA and user manual entry.

## Open Decisions

All V1 decisions are resolved:

- Use option B: Replay With Pattern Overlays.
- Scope V1 to real-history replay only.
- Defer candidate carousel to V2.
- Use WFMQYH as the replay window.
- Keep overlays observe-only and generation-neutral.
