// The carry-over clock. Each question is worth what the server said (30s, or
// 45s for a long read), but saved seconds roll forward: the deadline for
// question k is T0 plus the SUM of the first k+1 durations, so answering Q1
// in 25 seconds visibly leaves 35 on Q2. One ceiling: however much a fast
// student has banked, no single question is ever worth more than 60 seconds —
// an early answer rebases the schedule through `rebase`, which owns the cap.
// Pure — the verifier executes it.

/** No question may show more than this, carried seconds included. */
export const MAX_QUESTION_SECONDS = 60;

const toMs = (s: number) => Math.max(0, Number(s) || 0) * 1000;

/** Cumulative deadlines in ms, one per question, measured from t0. */
export function deadlines(seconds: number[], t0: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (const s of seconds) {
    sum += toMs(s);
    out.push(t0 + sum);
  }
  return out;
}

/**
 * The student answered question `index` early, at `now`. The next question is
 * granted its own base seconds plus whatever was left on the clock — capped at
 * MAX_QUESTION_SECONDS — and the questions after it line up cumulatively
 * behind the new deadline. A timeout never calls this: nothing was saved, and
 * the standing schedule already gives every later question exactly its base.
 */
export function rebase(dl: number[], seconds: number[], index: number, now: number): number[] {
  const next = index + 1;
  if (next >= dl.length) return dl;
  const leftoverMs = Math.max(0, dl[index] - now);
  const grantMs = Math.min(toMs(seconds[next]) + leftoverMs, MAX_QUESTION_SECONDS * 1000);
  const out = dl.slice(0, next);
  let deadline = now + grantMs;
  out.push(deadline);
  for (let k = next + 1; k < seconds.length; k += 1) {
    deadline += toMs(seconds[k]);
    out.push(deadline);
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
