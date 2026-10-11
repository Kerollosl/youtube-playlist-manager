# YouTube Multiselect

A custom Chrome extension that works directly inside YouTube. Selection controls float at the bottom center, using YouTube’s colors and typography. Save and Copy links are one click away.

## Features

- Toggle selection mode, then click anywhere on a video card to select or deselect it. Selected cards use a subtle blue tint. No visible checkbox covers YouTube’s buttons; keyboard and screen-reader selection remain available.
- Use the toolbar’s checkbox to select all, show a partial selection, or deselect all.
- **Copy selected links** as plain text: one clean YouTube URL per line, ready to paste into NotebookLM.
- Copy selections into a durable local queue; Cut stages a move without removing originals.
- Paste to another playlist using YouTube's signed-in session.
- Verify destination copies before offering a separate confirmation to remove originals.
- An upward-opening grouped action menu clearly separates link copying, reusable playlist selections, saving, recovery, and deletion.
- Save, move, delete, and sort with up to 50 actions per verified mutation batch.
- Move selections to the top or bottom of their current playlist, drag them between videos, or choose a video number to place them before. Selected videos keep their existing playlist order.
- Use YouTube's light/dark colors. All controls and dialogs stay on the YouTube page.

## Install

1. In Chrome, open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked**.
3. Select the `youtube-playlist-manager` folder containing `manifest.json`.
4. Disable the original Multiselect for YouTube extension to avoid duplicate controls.
5. Refresh YouTube. Click the multiselect icon beside YouTube's header buttons, or click this extension's toolbar icon.

No build step, API key, or separate application is required.

## Copy links for NotebookLM

Turn multiselect on, click the video cards, and click **Copy links** in the action bar. Paste the result into NotebookLM's website source input.

```text
https://www.youtube.com/watch?v=abcdefghijk
https://www.youtube.com/watch?v=lmnopqrstuv
```

## Move videos

1. Select source videos and choose **Cut**. The originals stay in place; the selection is stored in this Chrome profile.
2. Choose **Save to playlist** and select a destination. It uses your saved Cut selection, including after navigation or a reload.
3. The extension adds copies and checks YouTube's returned playlist contents.
4. Only after the copies are verified does it offer to remove the exact original playlist entries. Review that list and confirm.

Each batch is journaled before the request, sent once, and checked with read-only retries. An unknown result is never replayed. If a batch cannot be verified, an account changes, storage fails, or YouTube returns incomplete data, the operation stops. Pending operations never replay automatically. The recovery dialog provides the saved links, downloadable snapshots, operation time, and verification details. **Keep originals and close operation** archives a stopped job so a new operation can start; it does not remove playlist videos. A partial copy can leave some extra videos in the destination; it must not trigger source deletion.

## Recovery and limits

Operation checkpoints and the last 10 operation backups stay in local extension storage. Download important backups to keep them outside Chrome. Uninstalling the extension or clearing its storage removes those local records.

Backups preserve video links and the original playlist contents. Restoring videos from links does not restore unavailable videos or the original occurrence IDs, and may require reordering. There is no automatic undo that claims to recover everything.

YouTube's web playlist interfaces are undocumented and can change. Watch Later is unavailable through the supported YouTube Data API. This extension deliberately disables changes if it cannot identify exact playlist occurrences or complete a scan. Link copying works from loaded rows even when playlist editing is unavailable.

If a playlist cannot be read, open the error’s **Details → Check playlist reader** and choose the source or destination. This read-only check shows completeness, video count, and a small structural report without cookies, authorization headers, or raw video data. After updating the source files, reload the custom extension in `chrome://extensions` and refresh YouTube.

## Privacy

The extension runs only on `https://www.youtube.com/`. It stores selections and backups locally and sends playlist operations directly to YouTube. It does not request cookie access through Chrome, send telemetry, or upload anything to NotebookLM automatically. Authorization stays inside the YouTube page.

## Reorder the current playlist

Enable selection and choose videos, then open **More → Move in this playlist…** for **Move to top**, **Move to bottom**, and a numbered placement option. You can also drag any selected video above or below an unselected video; the blue insertion line shows where the entire group will land. Drag near the viewport edges to scroll. These controls require a complete, editable playlist that YouTube allows to be reordered.

Reordering uses exact playlist occurrences, journals each batch, and verifies the complete resulting order. It never removes videos or retries an uncertain move request. Switching selection off removes injected row controls and restores native draggable attributes, so YouTube's ordinary single-video moves remain available.

## Development and validation

Node.js 22 or later. No third-party runtime dependencies.

```sh
npm test
npm run validate
npm run benchmark
```

Tests cover exact duplicate occurrences, scoped pagination, modern empty playlist identity and ownership, account changes, lost responses, durable Cut/Save behavior, failed copies, storage failure before writes, and top/bottom/custom ordering across multiple batches. Browser fixtures verify full-card selection, the compact action menu, saved Cut selections, themes, narrow layouts, link format, group dragging, and native moves after deactivation. Live playlist mutations still require smoke testing after loading the extension, using a disposable playlist.

Sources: [Original interface](https://chromewebstore.google.com/detail/multiselect-for-youtube/gpgbiinpmelaihndlegbgfkmnpofgfei), [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [Watch Later API limitation](https://developers.google.com/youtube/v3/docs/playlistItems/list), [YouTube.js playlist action reference](https://github.com/LuanRT/YouTube.js/blob/main/src/core/managers/PlaylistManager.ts).

### Version 1.6.1

- Restored a compact bottom-center toolbar. Menus and destination pickers open above it and stay inside narrow screens; notices appear above the toolbar.
- Click video cards to toggle a subtle blue selection tint. Removed visible row checkboxes and restored native playlist indices. Tab and Space still provide keyboard selection with a visible focus outline.
- Fixed selections made before an unindexed playlist finishes loading, including Shift-click range anchors. A successful current-playlist reader check now restores editing controls, while playlists requiring a page refresh remain protected.
- Keep menu buttons stable through unrelated page rerenders so clicks are not lost. Empty selections show guidance, and unavailable editing actions explain their prerequisites.

### Version 1.6.0

- Immutable playlist backups, selected entries, and planned orders are stored once. Checkpoints and the last ten history records hold references and progress; obsolete referenced payloads are removed after history commits. Older inline backups remain readable and migrate on the next checkpoint.
- **Stop** appears while a batch operation is running. The current batch is verified before another starts; completed changes remain saved. A failed verification remains interrupted, with its pending intent intact. Stopped operations require review and never resume automatically.
- Supported native playlist models update after sorting, group placement, or removal without reloading the page. Scroll and surviving selections are preserved. This requires a fully loaded, recognized renderer model and matching account, occurrence IDs, and navigation indices. Count changes additionally require a recognized native header. Unsupported models, newly added rows, and partial lists offer a **Refresh** action and disable stale playlist editing.
- **More → Performance** shows the last twenty local timing records, with loading, edits, verification, verification waiting, checkpoint storage, request spacing, and page-update stages. JSON export includes timing metadata, not video titles, URLs, account identities, or credentials. Overlapping reads can make stage totals exceed wall time.

In the synthetic 1,000-entry checkpoint benchmark, the first payload write is **212,854 bytes** and the following checkpoint is **351 bytes** (99.84% smaller). These are serialized storage payload sizes, not promised live speedups. In-place reconciliation adds a fresh playlist read before touching YouTube’s model; it never sends playlist edits.

Validation includes legacy migration, worker restart, missing payloads, quota failures, history cleanup, stopping before and during batches, interrupted verification, native model rollback, duplicate occurrences, and browser checks for scroll/selection preservation, deletion, refresh fallback, Stop, and the timings panel. Live signed-in playlist changes were not exercised.

### Version 1.5.0

- Replaced the floating bottom toolbar and saturated card highlights with a 52px masthead selection bar, native surfaces, leading checkboxes, and direct Save access.
- Added stable natural sorting by title or channel, plus duration sorting in either direction. Equal values keep their original order; duplicate video occurrences stay distinct.
- Sorting and group reordering keep a longest ordered subsequence and move only the remaining entries. Each batch is journaled and its full order and membership are verified, with no uncertain writes replayed.
- Indexed playlist entries once per snapshot instead of searching the full playlist for every visible row. Progress updates use storage notifications directly; routine status replies exclude immutable backups and history contents. Full recovery downloads remain available.
- Read the source and destination concurrently when finishing a verified move, retaining both account and destination checks before deletion.
- Split page and shadow UI styles into separate files, exposed only the UI stylesheet to YouTube, and retained zero runtime dependencies.

`npm run benchmark` reports a deterministic request budget, not live YouTube timings. For a reverse sort of 100 entries, the normal path now needs **2 mutation batches and 3 logical playlist reads**, versus **99 mutations and 200 logical reads** before. Each logical read can require multiple pagination requests. An unchanged playlist needs one initial read and no writes. Verification retries and YouTube latency can increase actual work.

Browser tests exercise both themes at 1280, 390, 320, and 280px, rerendered selection, keyboard navigation and focus, direct Save, range selection, plain links, navigation cleanup, sorting, late-copy recovery, and progress notifications. A signed-in live playlist was not changed during validation; reload the extension and refresh YouTube to try the release.

### Version 1.4.0

- Added top, bottom, and numbered placement controls for the selected group within its current playlist.
- Added group dragging with insertion markers and edge scrolling, preserving the selection's playlist order.
- Added journaled reorder batches with exact occurrence and order verification.
- Removed inactive row positioning and controls that could interfere with YouTube's native dragging.

### Version 1.3.0

- Replaced per-video full-playlist scans with journaled batches of up to 50 adds or removals.
- Preserved exact occurrence checks, account binding, read-only verification, and no-replay recovery.
- Made queued and stopped operations visible in the selection count and More menu.
- Clarified Copy selection versus Copy video links; `Cmd/Ctrl+C` now copies links.
- Added richer delete and move reviews, first-use guidance, operation progress, and a compact grouped menu.
- Replaced the extension artwork with a clean, legible playlist-selection logo.

### Version 1.2.0

- Compact searchable destination picker; Cut stores the selection immediately.
- Delete selected uses a small count confirmation and saves a source backup.
- A reviewed delete archives an interrupted copy without discarding its saved links; unfinished moves remain protected.
- Incomplete browse results and unchanged post-delete results receive bounded read-only retries. Writes are never replayed automatically.
- Late copy results are reconciled against the exact failed job and exact destination counts.
- Verified deletion refreshes YouTube to show the current playlist.

Validation: 75 automated tests and manifest/syntax validation passed. The browser fixture verified compact delete confirmation and late-copy success reporting. Real playlist deletion was not executed during this validation. Reload the extension and then YouTube to activate this release.
