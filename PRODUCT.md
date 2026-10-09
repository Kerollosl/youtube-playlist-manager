# YouTube Multiselect (Custom)

A personal Chrome extension for selecting videos directly on YouTube and organizing them safely. Kerollos uses playlists as queues and copies selected video links into NotebookLM.

## Product constraints

The existing Multiselect for YouTube experience is the functional reference: a masthead toggle, clickable video cards with blue selection highlights and corner checkmarks, and a compact action bar. The extension has no standalone manager page. YouTube remains the visual and behavioral authority.

The toolbar shows Select all and Deselect all. The action menu contains Cut, Copy, Save to playlist, Copy links, and Delete selected. Copy links produces clean video URLs as plain text, one URL per line. Playlist saving and moving preserve a durable selection. Cut queues a move; it does not delete originals. Copy verification and a separate removal review must precede source removal. UI improvements preserve account fingerprints, exact playlist entry identity, destination checks, and recovery journals.

## Selection surface

Mode: Operate. Desktop Chrome on YouTube, including light and dark themes. A narrow viewport must retain access to the same actions without horizontal scrolling. Show counts from a complete playlist snapshot when available, otherwise from the active page's rendered rows. YouTube may retain hidden pages in its DOM; those rows are not selectable or counted.

Error messages stay compact while full technical details remain accessible. Reader diagnostics are a supporting troubleshooting tool, not the primary product flow.
