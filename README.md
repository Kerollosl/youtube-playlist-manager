# YouTube Multiselect (Custom)

A custom Chrome extension that works directly inside YouTube. The interface follows Multiselect for YouTube: a masthead toggle, checkboxes on video rows, and a compact bottom action bar.

## Features

- Select videos directly on YouTube, including loaded playlist, search, and home-page rows.
- **Copy selected links** as plain text: one clean YouTube URL per line, ready to paste into NotebookLM.
- Copy selections into a durable local clipboard; Cut queues a move without removing originals.
- Paste to another playlist using YouTube's signed-in session.
- Verify destination copies before offering a separate confirmation to remove originals.
- Filter selection by text, select duplicates, export links, and keep local operation backups.
- Use YouTube's light/dark colors. All controls and dialogs stay on the YouTube page.

## Install

1. In Chrome, open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked**.
3. Select the `youtube-playlist-manager` folder containing `manifest.json`.
4. Disable the original Multiselect for YouTube extension to avoid duplicate controls.
5. Refresh YouTube. Click the multiselect icon beside YouTube's header buttons, or click this extension's toolbar icon.

No build step, API key, or separate application is required.

## Copy links for NotebookLM

Turn multiselect on, tick the videos, and click **Copy links** in the action bar. Paste the result into NotebookLM's website source input.

```text
https://www.youtube.com/watch?v=abcdefghijk
https://www.youtube.com/watch?v=lmnopqrstuv
```

## Move videos

1. Select source videos and choose **Cut**. The originals stay in place; the selection is stored in this Chrome profile.
2. Choose **Paste** and select a destination playlist.
3. The extension adds copies and checks YouTube's returned playlist contents.
4. Only after the copies are verified does it offer to remove the exact original playlist entries. Review that list and confirm.

If a copy fails, an account changes, storage fails, or YouTube returns incomplete data, the operation stops. Pending operations never replay automatically. The recovery dialog provides the saved links and downloadable snapshots. A partial copy can leave some extra videos in the destination; it must not trigger source deletion.

## Recovery and limits

Operation checkpoints and the last 10 operation backups stay in local extension storage. Download important backups to keep them outside Chrome. Uninstalling the extension or clearing its storage removes those local records.

Backups preserve video links and the original playlist contents. Restoring videos from links does not restore unavailable videos or the original occurrence IDs, and may require reordering. There is no automatic undo that claims to recover everything.

YouTube's web playlist interfaces are undocumented and can change. Watch Later is unavailable through the supported YouTube Data API. This extension deliberately disables changes if it cannot identify exact playlist occurrences or complete a scan. Link copying works from loaded rows even when playlist editing is unavailable.

If a playlist cannot be read, open **More actions → Playlist reader details** and choose the source or destination. This read-only check shows completeness, video count, and a small structural report without cookies, authorization headers, or raw video data. After updating the source files, reload the custom extension in `chrome://extensions` and refresh YouTube.

## Privacy

The extension runs only on `https://www.youtube.com/`. It stores selections and backups locally and sends playlist operations directly to YouTube. It does not request cookie access through Chrome, send telemetry, or upload anything to NotebookLM automatically. Authorization stays inside the YouTube page.

## Development and validation

Node.js 22 or later. No third-party runtime dependencies.

```sh
npm test
npm run validate
```

Tests cover exact duplicate occurrences, scoped pagination, account changes, lost responses, durable Cut/Paste behavior, failed copies, and storage failure before writes. Browser fixtures verify the inline selection bar, link format, and rerender behavior. Live playlist mutations still require smoke testing after loading the extension, using a disposable playlist.

Sources: [Original interface](https://chromewebstore.google.com/detail/multiselect-for-youtube/gpgbiinpmelaihndlegbgfkmnpofgfei), [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [Watch Later API limitation](https://developers.google.com/youtube/v3/docs/playlistItems/list), [YouTube.js playlist action reference](https://github.com/LuanRT/YouTube.js/blob/main/src/core/managers/PlaylistManager.ts).
