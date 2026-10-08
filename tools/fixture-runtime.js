const fixtureItems = [
  { setVideoId: 'one', videoId: 'abcdefghijk', title: 'Building useful tools', channel: 'Build Notes', index: 0, durationSeconds: 90 },
  { setVideoId: 'two', videoId: 'lmnopqrstuv', title: 'Learning every day', channel: 'Open Classroom', index: 1, durationSeconds: 120 }
];
const fixtureStorage = { history: [], queue: null };
const storageListeners = [];
window.chrome = {
  runtime: {
    getManifest: () => ({ version: '1.0.1' }),
    onMessage: { addListener: () => {} },
    sendMessage: async message => {
      if (message.type === 'READ') return { ok: true, complete: true, editable: true, canReorder: true, playlistId: message.playlistId, title: message.playlistId === 'WL' ? 'Watch later' : 'Research notes', fingerprint: 'demo', items: message.playlistId === 'WL' ? structuredClone(fixtureItems) : [], pages: 1, warnings: [], diagnostics: { empty: message.playlistId !== 'WL' } };
      if (message.type === 'STATUS') return { ok: true, ...structuredClone(fixtureStorage), busy: false };
      if (message.type === 'QUEUE' || message.type === 'QUEUE_LINKS') {
        fixtureStorage.queue = { id: crypto.randomUUID(), kind: message.kind, sourceId: 'WL', items: message.items || fixtureItems.filter(item => message.keys.includes(item.setVideoId)), savedAt: Date.now() };
        return { ok: true, queue: structuredClone(fixtureStorage.queue) };
      }
      if (message.type === 'PLAYLISTS') return { ok: true, playlists: [{ playlistId: 'PLdemo', title: 'Research notes' }] };
      return { ok: false, error: 'Live changes are disabled in this synthetic fixture.' };
    }
  }, storage: { onChanged: { addListener: fn => storageListeners.push(fn) } }
};
// Make this local fixture act like the YouTube playlist route for content code.
const url = new URL(location.href); url.searchParams.set('list', 'WL'); history.replaceState(null, '', url);
Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { document.getElementById('results').textContent = text; } } });
document.getElementById('rerender').addEventListener('click', () => {
  const rows = document.getElementById('rows'), copy = rows.cloneNode(true);
  copy.querySelectorAll('input').forEach(box => box.remove()); rows.replaceWith(copy);
});
