export function newTimings() { return { startedAt: Date.now(), elapsedMs: 0, stages: {} }; }
export async function measure(timings, stage, action) {
  if (!timings) return action();
  const start = performance.now();
  try { return await action(); }
  finally {
    const metric = timings.stages[stage] ||= { calls: 0, ms: 0 };
    metric.calls++; metric.ms = Math.round((metric.ms + performance.now() - start) * 100) / 100;
    timings.elapsedMs = Date.now() - timings.startedAt;
  }
}
