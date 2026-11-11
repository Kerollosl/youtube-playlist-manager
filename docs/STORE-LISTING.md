# Chrome Web Store listing: Multiselect Tools for Playlists

Placeholders the owner must replace: TODO_PRIVACY_URL, TODO_SUPPORT_URL.
manifest.json has `author` set and no `homepage_url` (Chrome rejects non-URLs): add `homepage_url` once the real support page exists.

## Name
Multiselect Tools for Playlists  (unofficial; avoids the YouTube trademark in the name)

## Short description (max 132 chars)
Multiselect, batch save, move and sort for YouTube playlists, plus sync new uploads from chosen playlists to Watch Later. (121 chars; manifest identical, 'Unofficial' goes in the long text.)

## Long description
Multiselect Tools for Playlists adds checkboxes to the video lists on YouTube so you can work on many videos at once.

- Click videos to select them; Shift-click selects a range; Ctrl/Cmd+A selects everything loaded.
- Save, copy or move selected videos to another playlist in batches, with each change verified afterwards.
- Reorder and sort playlists you own.
- Copy selected video links as plain text.
- Recover or stop an interrupted batch; completed changes are kept.
- Sync to Watch Later: use the Sync button beside Multiselect in YouTube’s header. Its adjacent settings button opens an in-page panel to choose playlists from your library or add one by URL. Your choices are saved for the next sync. The toolbar popup also offers Sync now. Sync is manual; the source list can be exported and imported as JSON.

Turn multiselect on with the select button in YouTube's header, or open the toolbar popup (pin it from the puzzle-piece menu) and press Toggle multiselect.

How it works, plainly: the extension uses YouTube's private web endpoints (the same ones youtube.com uses) and your signed-in YouTube session cookie to change playlists on your behalf. These endpoints are undocumented and YouTube can change or block them at any time. Nothing leaves your device except requests to youtube.com.

This extension is not affiliated with, endorsed by, or sponsored by YouTube or Google. YouTube is a trademark of Google LLC.

## Single purpose
Playlist tools for YouTube: select many videos and manage playlists in batches, and add new uploads from chosen playlists to Watch Later.

## Permission justifications
- `storage`: keeps the queue, operation history, one-time hints, the Watch Later sync playlist list, sync log and record of added videos on this device only.
- `scripting`: runs the extension's bundled code inside a YouTube tab to read and edit your playlists and Watch Later, and to list your saved playlists, with your session.
- `clipboardWrite`: copies selected video links as plain text when you press Copy links.
- Host `https://www.youtube.com/*`: the content script, the playlist requests and the public RSS feeds (youtube.com/feeds/videos.xml) used by Watch Later sync are all on youtube.com. No new permission was added for sync.
- Not requested: `tabs` (the popup and sync find YouTube tabs through the host permission), `downloads` (export uses a local file link), `cookies`. Only the embedded panel’s HTML entry point is web-accessible, restricted to youtube.com.

## Privacy answers
- Not sent to the developer or any third party. Stored locally: selection queue, job history (video IDs and titles), the chosen sync playlists (IDs and names) and the IDs of videos already added to Watch Later, flags that hints were shown, an opaque hash of the signed-in account to prevent changes to the wrong account.
- Authentication information: the YouTube session cookie is read in the page to sign requests to youtube.com; never stored, logged or sent elsewhere.
- Remote code: none. Sold/shared with third parties: no.

## Privacy policy text (host at TODO_PRIVACY_URL)
Multiselect Tools for Playlists does not collect, transmit or share personal data with the developer or any third party. A work queue, operation history, hint flags, your chosen sync playlists and the IDs of videos already synced are stored locally (chrome.storage.local) and are removed on uninstall. To edit your playlists and add videos to Watch Later it uses YouTube's private web endpoints and the session cookie of the account you are signed in to; requests go only to https://www.youtube.com and the cookie is never stored, logged or sent elsewhere. Contact: TODO_SUPPORT_URL (Kerollos Lowandy).

## Risk note
Private endpoints may conflict with YouTube's Terms of Service and Web Store review; disclosed plainly above. Submission risk is the owner's.

## Assets still to make
1280x800 screenshots (selection toolbar on a playlist, save dialog, reorder, the toolbar popup with the Watch Later sync list), 440x280 promo tile.
