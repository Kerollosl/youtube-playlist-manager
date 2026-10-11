# Integrated YouTube selection controls

## Direction and themes

YouTube remains the visual authority. Use Roboto, native neutral surfaces, 20px SVG icons, restrained selection highlights, and blue focus and insertion indicators. The shadow host lives inside `ytd-app` when available, inherits native theme variables, and mirrors the root dark attribute for fallbacks. No standalone application or separate brand surface.

## Layout

A 52px selection bar sits immediately below the masthead. Close, a mixed-state Select all checkbox, and the count sit at the start; Save, Copy links, and More sit at the end. A removable 52px spacer preserves the page’s content space. Masthead resize and viewport changes update the bar’s position.

Save opens a compact searchable playlist picker beneath the toolbar. More groups selection, organization, and recovery commands. Sorting has labeled title/channel/duration and direction controls. Move and delete retain compact reviews; deletion lists affected titles and explains the saved backup.

At 600px and below, Save and Copy links become labeled icon buttons and the count denominator hides. Below 340px, Copy links remains available in More. Controls retain 44px touch targets. Menus and panels fit the viewport and scroll within its remaining height.

Selected cards keep YouTube’s layout and use its ten-percent neutral layer. Leading checkboxes replace playlist index numbers while selection is active; grid checkboxes sit at the thumbnail’s upper start edge. Checkboxes have 20px artwork inside a 44px hit area. Switching selection off removes injected controls, restores native row attributes and indexes, and removes the spacer.

## Interaction and feedback

Full-card click and Shift-click range selection remain available. The master checkbox represents none, some, or all videos selected. More supports Arrow Up/Down, Home, End, and Escape. Dialogs trap keyboard focus and restore it on close; anchored panels use nonmodal region semantics. All controls retain visible focus states.

Operations show verified progress in the selection bar with a slim progress indicator. Checkpoint notifications update this inline status rather than producing repeated toasts. Reduced motion disables indicator animation. Completion notices are brief; errors retain a Details action and collapsed technical diagnostics.

Group dragging moves exact selected occurrences in their existing order, with a thin native blue insertion line. Numbered placement is the keyboard alternative. Only rendered rows on the active page participate in inline selection; a complete snapshot supplies the total count and mutation identities. Snapshot indexes avoid repeated full-playlist scans.

## Data boundaries

UI optimization does not weaken the worker’s account binding, completeness checks, exact occurrence IDs, durable mutation journal, or destination-before-removal checks. Routine status omits immutable snapshots and history records; detailed recovery explicitly loads complete backups. Sorting and group reordering use the minimum entry moves and verifies full order and membership after each bounded batch. Unknown mutation outcomes are never automatically replayed.
