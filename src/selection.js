/** Selection is scoped to one playlist and exact occurrences, never row indexes. */
export class Selection {
  constructor(playlistId) {
    if (!playlistId) throw new Error('A playlist is required.');
    this.playlistId = playlistId;
    this.items = new Map();
  }

  toggle(item) {
    if (!item?.key || !item.videoId) throw new Error('Cannot select an unidentified video.');
    if (this.items.has(item.key)) this.items.delete(item.key);
    else this.items.set(item.key, structuredClone(item));
  }

  snapshot() {
    return { playlistId: this.playlistId, items: structuredClone([...this.items.values()]) };
  }

  reconcile(playlistId, loadedItems) {
    if (playlistId !== this.playlistId) {
      this.playlistId = playlistId;
      this.items.clear();
      return;
    }
    // An unloaded row is not proof of deletion. Keep it selected across rerenders.
    for (const item of loadedItems) {
      if (this.items.has(item.key)) this.items.set(item.key, structuredClone(item));
    }
  }
}

export function duplicateOccurrences(items) {
  const seen = new Set();
  return items.filter(item => {
    if (!item.videoId) return false;
    if (seen.has(item.videoId)) return true;
    seen.add(item.videoId);
    return false;
  });
}

export function removalPlan(selection, freshPlaylist) {
  if (!selection.items.length) throw new Error('Select at least one video.');
  if (selection.playlistId !== freshPlaylist.playlistId) throw new Error('The playlist changed.');
  if (freshPlaylist.complete !== true) throw new Error('Load the complete playlist before removing videos.');
  const occurrenceIds = freshPlaylist.items.map(item => item.setVideoId);
  if (occurrenceIds.some(id => !id) || new Set(occurrenceIds).size !== occurrenceIds.length) {
    throw new Error('The playlist contains missing or ambiguous occurrence IDs.');
  }
  const fresh = new Map(freshPlaylist.items.map(item => [item.setVideoId, item]));
  const ids = new Set();
  const actions = selection.items.map(item => {
    if (!item.setVideoId || ids.has(item.setVideoId)) throw new Error('Each selected occurrence needs a unique playlist item ID.');
    ids.add(item.setVideoId);
    const current = fresh.get(item.setVideoId);
    if (!current || current.videoId !== item.videoId) throw new Error('A selected item changed. Review the selection again.');
    return { action: 'ACTION_REMOVE_VIDEO', setVideoId: item.setVideoId };
  });
  return {
    playlistId: selection.playlistId,
    count: actions.length,
    actions,
    backup: structuredClone(freshPlaylist)
  };
}
