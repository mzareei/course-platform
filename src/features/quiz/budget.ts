// The carry-over clock. Each question is worth what the server said (30s, or
// 45s for a long read), but saved seconds roll forward: the deadline for
// question k is T0 plus the SUM of the first k+1 durations, so answering Q1
// in 25 seconds visibly leaves 35 on Q2. Pure — the verifier executes it.

/** Cumulative deadlines in ms, one per question, measured from t0. */
export function deadlines(seconds: number[], t0: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (const s of seconds) {
    sum += Math.max(0, Number(s) || 0) * 1000;
    out.push(t0 + sum);
  }
  return out;
}

/**
 * Which question the clock says the student should be on. A phone that slept
 * through three deadlines lands on the first question whose deadline is still
 * ahead — in one call, not one advance per tick. Clamped to the last index;
 * the caller decides what "past the last deadline" means (submit).
 */
export function positionAt(dl: number[], now: number): number {
  let index = 0;
  while (index < dl.length - 1 && now >= dl[index]) index += 1;
  return index;
}
