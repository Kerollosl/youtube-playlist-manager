# YouTube Multiselect (Custom)

A custom Chrome extension that works directly inside YouTube. The interface follows Multiselect for YouTube: a masthead toggle, clickable video cards, and a compact bottom action bar.

## Features

- Toggle selection mode, then click anywhere on a video card to select or deselect it. Selected cards turn blue and show a corner checkmark.
- Select all or deselect all from the action bar.
- **Copy selected links** as plain text: one clean YouTube URL per line, ready to paste into NotebookLM.
- Copy selections into a durable local queue; Cut stages a move without removing originals.
- Paste to another playlist using YouTube's signed-in session.
- Verify destination copies before offering a separate confirmation to remove originals.
- A grouped action menu clearly separates link copying, reusable playlist selections, saving, recovery, and deletion.
- Save, move, and delete up to 50 videos per mutation batch instead of rereading the full playlist around every video.
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
```

Tests cover exact duplicate occurrences, scoped pagination, modern empty playlist identity and ownership, account changes, lost responses, durable Cut/Save behavior, failed copies, storage failure before writes, and top/bottom/custom ordering across multiple batches. Browser fixtures verify full-card selection, the compact action menu, saved Cut selections, themes, narrow layouts, link format, group dragging, and native moves after deactivation. Live playlist mutations still require smoke testing after loading the extension, using a disposable playlist.

Sources: [Original interface](https://chromewebstore.google.com/detail/multiselect-for-youtube/gpgbiinpmelaihndlegbgfkmnpofgfei), [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [Watch Later API limitation](https://developers.google.com/youtube/v3/docs/playlistItems/list), [YouTube.js playlist action reference](https://github.com/LuanRT/YouTube.js/blob/main/src/core/managers/PlaylistManager.ts).

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
