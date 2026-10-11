// Immutable payloads are written once; checkpoints and history hold references.
// A single storage.set commits new payloads and their record before any edit.
const fields = ['sourceBefore', 'targetBefore', 'removalBefore', 'items', 'desiredIds'];
export function packJob(job) {
  const refs = { ...job.payloadRefs }, writes = {}, record = { ...job };
  for (const field of fields) {
    if (job[field] != null && !refs[field]) {
      const key = `job-payload:${job.id}:${field}`;
      refs[field] = key; writes[key] = job[field];
    }
    delete record[field];
  }
  record.payloadRefs = refs;
  record.itemCount = job.items?.length ?? job.itemCount ?? 0;
  record.probeVideoId = job.items?.find(item => item.videoId)?.videoId || job.probeVideoId;
  for (const field of ['sourceBefore', 'targetBefore']) if (job[field]) record[field] = { playlistId: job[field].playlistId, title: job[field].title };
  return { record, writes, refs };
}
export async function hydrateJobs(storage, records, fieldsToLoad = fields) {
  const keys = [...new Set(records.flatMap(record => fieldsToLoad.map(field => record?.payloadRefs?.[field]).filter(Boolean)))];
  const payloads = keys.length ? await storage.get(keys) : {};
  return records.map(record => {
    if (!record) return record;
    const job = { ...record };
    for (const field of fieldsToLoad) {
      const key = record.payloadRefs?.[field];
      if (!key) continue; // Version 1.5 and earlier contain inline backups.
      if (!Object.hasOwn(payloads, key) || payloads[key] == null) throw new Error('A saved operation backup is missing. No changes were made.');
      job[field] = payloads[key];
    }
    return job;
  });
}
export async function saveJob(storage, job) {
  const { record, writes, refs } = packJob(job);
  await storage.set({ ...writes, activeJob: record });
  job.payloadRefs = refs;
}
export async function archiveJob(storage, job, clearCut) {
  const { history = [], queue } = await storage.get(['history', 'queue']);
  const { record, writes, refs } = packJob(job);
  const next = [record, ...history].slice(0, 10);
  await storage.set({ ...writes, history: next, historyCount: next.length, activeJob: null, ...(clearCut ? { queue: null } : {}) });
  job.payloadRefs = refs;
  const retained = new Set([...next, ...(!clearCut && queue ? [queue] : [])].flatMap(entry => Object.values(entry.payloadRefs || {})));
  const expired = [...new Set(history.flatMap(entry => Object.values(entry.payloadRefs || {})))].filter(key => !retained.has(key));
  // Cleanup is after the durable commit. A cleanup failure cannot undo success.
  if (expired.length && storage.remove) { try { await storage.remove(expired); } catch {} }
}
