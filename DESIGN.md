# Integrated YouTube selection controls

## Direction and themes

YouTube remains the visual authority. Use Roboto, native neutral surfaces, 20px SVG icons, restrained selection highlights, and blue focus and insertion indicators. The shadow host lives inside `ytd-app` when available, inherits native theme variables, and mirrors the root dark attribute for fallbacks. No standalone application or separate brand surface.

## Layout

A 52px selection bar sits immediately below the masthead. Close, a mixed-state Select all checkbox, and the count sit at the start; Save, Copy links, and More sit at the end. A removable 52px spacer preserves the page’s content space. Masthead resize and viewport changes update the bar’s position.

Save opens a compact searchable playlist picker beneath the toolbar. More groups selection, organization, and recovery commands. Sorting has labeled title/channel/duration and direction controls. Move and delete retain compact reviews; deletion lists affected titles and explains the saved backup.

At 600px and below, Save and Copy links become labeled icon buttons and the count denominator hides. Below 340px, Copy links remains available in More. Controls retain 44px touch targets. Menus and panels fit the viewport and scroll within its remaining height.

Selected cards keep YouTube’s layout and use its ten-percent neutral layer. Leading checkboxes replace playlist index numbers while selection is active; grid checkboxes sit at the thumbnail’s upper start edge. Checkboxes have 20px artwork inside a 44px hit area. Switching selection off removes injected controls, restores native row attributes and indexes, and removes the spacer.

## Interaction and feedback

A native-style split control sits immediately to the left of the masthead’s Multiselect button. Sync runs the saved Watch Later sources; the adjacent gear opens playlist configuration inside a compact modal in the same tab. Both actions remain available with selection off. At narrow widths, Sync’s text hides while both labeled icon buttons retain 44px targets. Running sync disables its action and shows Syncing; configuration stays accessible for progress and activity. Masthead rerenders restore one copy in the same position.

The embedded panel follows YouTube’s theme, supports Escape and focus restoration, and shows playlist configuration when opened from the gear. The extension action popup puts Sync now before configuration; Playlists is collapsed once sources exist. First use opens the picker. The header’s Sync side never opens configuration: when no sources are saved, it shows a notice directing the user to Settings. At desktop widths of 1200px and below, the header control uses two 44px icon buttons. The masthead’s end section reserves its full content width so search and microphone controls do not overlap it.

Full-card click and Shift-click range selection remain available. The master checkbox represents none, some, or all videos selected. More supports Arrow Up/Down, Home, End, and Escape. Dialogs trap keyboard focus and restore it on close; anchored panels use nonmodal region semantics. All controls retain visible focus states.

Operations show verified progress in the selection bar with a slim progress indicator. Checkpoint notifications update this inline status rather than producing repeated toasts. Reduced motion disables indicator animation. Completion notices are brief; errors retain a Details action and collapsed technical diagnostics.

Group dragging moves exact selected occurrences in their existing order, with a thin native blue insertion line. Numbered placement is the keyboard alternative. Only rendered rows on the active page participate in inline selection; a complete snapshot supplies the total count and mutation identities. Snapshot indexes avoid repeated full-playlist scans.

## Data boundaries

UI optimization does not weaken the worker’s account binding, completeness checks, exact occurrence IDs, durable mutation journal, or destination-before-removal checks. Routine status omits immutable snapshots and history records; detailed recovery explicitly loads complete backups. Sorting and group reordering use the minimum entry moves and verifies full order and membership after each bounded batch. Unknown mutation outcomes are never automatically replayed.

## Checkpoints, stopping, and page updates

Immutable operation payloads live under separate storage keys. Active and archived records contain references; checkpoints carry progress and intent. Recovery explicitly reconstructs complete backups. Legacy inline records remain supported.

During a batch, secondary toolbar actions give way to Stop. It requests a stop at the next verified boundary, then becomes Stopping while the current batch finishes. Unknown outcomes retain the recovery journal and are not labeled successful stops.

After a verified change, the worker reads the current playlist and attempts to update YouTube's native renderer model. Known models preserve the page, scroll position, and surviving selected occurrence IDs. Unrecognized or incomplete models leave a persistent Refresh action and disable stale editing instead of automatically reloading. New destination rows require this fallback because their native renderers are unavailable.

Performance is a supporting More-menu dialog. It shows recent elapsed and per-stage times with a downloadable JSON report. Logs are bounded to twenty entries and contain only timing and operation metadata.
