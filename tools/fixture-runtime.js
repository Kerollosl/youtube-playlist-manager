const fixtureItems = [
  { setVideoId: 'one', videoId: 'abcdefghijk', title: 'Building useful tools', channel: 'Build Notes', index: 0, durationSeconds: 90 },
  { setVideoId: 'two', videoId: 'lmnopqrstuv', title: 'Learning every day', channel: 'Open Classroom', index: 1, durationSeconds: 120 },
  { setVideoId: 'three', videoId: '12345678901', title: 'Making room for ideas', channel: 'Build Notes', index: 2, durationSeconds: 150 },
  { setVideoId: 'four', videoId: '23456789012', title: 'A calmer workflow', channel: 'Open Classroom', index: 3, durationSeconds: 180 },
  { setVideoId: 'five', videoId: '34567890123', title: 'Small changes that help', channel: 'Build Notes', index: 4, durationSeconds: 210 }
];
const savedOrder = JSON.parse(sessionStorage.getItem('fixture-order') || 'null');
if (Array.isArray(savedOrder) && savedOrder.length === fixtureItems.length && new Set(savedOrder).size === fixtureItems.length && savedOrder.every(id => fixtureItems.some(item => item.setVideoId === id))) fixtureItems.sort((first, second) => savedOrder.indexOf(first.setVideoId) - savedOrder.indexOf(second.setVideoId));
const fixtureStorage = { history: [], queue: null };
const storageListeners = [];
window.chrome = {
  runtime: {
    getURL: path => new URL('../' + path, location.href).href,
    getManifest: () => ({ version: '1.5.0' }),
    onMessage: { addListener: () => {} },
    sendMessage: async message => {
      if (message.type === 'READ') return { ok: true, complete: true, editable: true, canReorder: true, playlistId: message.playlistId, title: message.playlistId === 'WL' ? 'Watch later' : 'Research notes', fingerprint: 'demo', items: message.playlistId === 'WL' ? structuredClone(fixtureItems) : [], pages: 1, warnings: [], diagnostics: { empty: message.playlistId !== 'WL' } };
      if (message.type === 'STATUS') return { ok: true, ...structuredClone(fixtureStorage), busy: false };
      if (message.type === 'QUEUE' || message.type === 'QUEUE_LINKS') {
        fixtureStorage.queue = { id: crypto.randomUUID(), kind: message.kind, sourceId: 'WL', items: message.items || fixtureItems.filter(item => message.keys.includes(item.setVideoId)), savedAt: Date.now() };
        return { ok: true, queue: structuredClone(fixtureStorage.queue) };
      }
      if (url.searchParams.get('scenario') === 'late-copy' && message.type === 'TRANSFER') {
        fixtureStorage.activeJob = { id: 'late-demo', kind: 'copy', phase: 'interrupted', sourceId: 'WL', targetId: message.targetId, items: fixtureItems.filter(item => message.keys.includes(item.setVideoId)) };
        return { ok: false, error: 'YouTube did not return a complete playlist.', jobId: 'late-demo' };
      }
      if (message.type === 'CHECK_OPERATION' && fixtureStorage.activeJob?.id === message.jobId) {
        const job = { ...fixtureStorage.activeJob, phase: 'completed' }; fixtureStorage.activeJob = null;
        document.getElementById('results').textContent = 'Read-only verification completed. No adds replayed.';
        return { ok: true, job };
      }
      if (message.type === 'PLAYLISTS') return { ok: true, playlists: [{ playlistId: 'PLdemo', title: 'Research notes' }] };
      if (message.type === 'SORT') {
        fixtureItems.sort((a, b) => (message.descending ? -1 : 1) * (message.sortBy === 'duration' ? a.durationSeconds - b.durationSeconds : a[message.sortBy].localeCompare(b[message.sortBy])));
        sessionStorage.setItem('fixture-order', JSON.stringify(fixtureItems.map(item => item.setVideoId)));
        return { ok: true, job: { kind: 'sort', phase: 'completed', sourceId: 'WL' } };
      }
      if (message.type === 'REORDER') {
        const selected = new Set(message.keys), moving = fixtureItems.filter(item => selected.has(item.setVideoId)), remaining = fixtureItems.filter(item => !selected.has(item.setVideoId));
        const index = message.position === 'top' ? 0 : message.position === 'bottom' ? remaining.length : remaining.findIndex(item => item.setVideoId === message.beforeId);
        if (index < 0) return { ok: false, error: 'Choose an unselected target.' };
        fixtureItems.splice(0, fixtureItems.length, ...remaining.slice(0, index), ...moving, ...remaining.slice(index));
        sessionStorage.setItem('fixture-order', JSON.stringify(fixtureItems.map(item => item.setVideoId)));
        return { ok: true, job: { kind: 'reorder', phase: 'completed', sourceId: 'WL' } };
      }
      return { ok: false, error: 'Live changes are disabled in this synthetic fixture.' };
    }
  }, storage: { onChanged: { addListener: fn => storageListeners.push(fn) } }
};
// Make this local fixture act like the YouTube playlist route for content code.
const url = new URL(location.href); url.searchParams.set('list', 'WL'); history.replaceState(null, '', url);
if (url.searchParams.has('trace')) for (const type of ['dragstart', 'dragenter', 'dragover', 'drop', 'dragend']) document.addEventListener(type, event => {
  const output = document.getElementById('results');
  const row = event.target.closest?.('ytd-playlist-video-renderer');
  output.textContent = `${output.textContent}\n${type}: ${row?.dataset.occurrence || event.target.tagName} (${event.clientX}, ${event.clientY})`.split('\n').slice(-20).join('\n');
}, true);
function renderRows() {
  const rows = document.getElementById('rows'); rows.replaceChildren();
  fixtureItems.forEach((item, index) => {
    item.index = index;
    const row = document.createElement('ytd-playlist-video-renderer'); row.draggable = true; row.dataset.occurrence = item.setVideoId;
    const number = document.createElement('span'); number.id = 'index'; number.textContent = String(index + 1);
    const thumb = document.createElement('div'); thumb.className = 'thumb'; thumb.textContent = '▶';
    const meta = document.createElement('div'); meta.className = 'meta';
    const title = document.createElement('a'); title.id = 'video-title'; title.href = `https://www.youtube.com/watch?v=${item.videoId}&list=WL&index=${index + 1}`; title.textContent = item.title;
    const channel = document.createElement('div'); channel.id = 'byline-container'; channel.textContent = item.channel;
    meta.append(title, channel); row.append(number, thumb, meta); rows.append(row);
    row.addEventListener('dragstart', event => { nativeDragged = item.setVideoId; event.dataTransfer.setData('text/plain', 'native fixture drag'); });
    for (const type of ['dragenter', 'dragover']) row.addEventListener(type, event => { if (nativeDragged) event.preventDefault(); });
    row.addEventListener('drop', event => {
      if (!nativeDragged || nativeDragged === item.setVideoId) return;
      event.preventDefault();
      const from = fixtureItems.findIndex(entry => entry.setVideoId === nativeDragged), [moved] = fixtureItems.splice(from, 1);
      fixtureItems.splice(fixtureItems.findIndex(entry => entry.setVideoId === item.setVideoId), 0, moved);
      nativeDragged = null; document.getElementById('results').textContent = 'Native single-video move completed.';
      renderRows();
    });
    row.addEventListener('dragend', () => { nativeDragged = null; });
  });
  document.querySelector('.summary p').textContent = `Demo playlist · ${fixtureItems.length} videos`;
}
let nativeDragged = null;
renderRows();
if (url.searchParams.get('theme') === 'light') { document.documentElement.removeAttribute('dark'); document.documentElement.dataset.fixtureTheme = 'light'; }
Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { document.getElementById('results').textContent = text; } } });
document.getElementById('rerender').addEventListener('click', () => {
  renderRows();
});
