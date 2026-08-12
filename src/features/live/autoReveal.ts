// When a live question should show its answer without the professor touching
// the cockpit.
//
// Revealing is what closes the loop for a student: until the round is revealed
// the phone shows "recorded" and never says whether they were right. The
// professor teaches from fullscreen, so if revealing needs a click, it does not
// happen — and the class never learns the answer.
//
// Note what this does NOT do: it never closes the round. `course-pulse` only
// serves students a round that is `open` or `revealed`, so closing immediately
// after revealing would snatch the answer off every phone in the same instant.
// A revealed round retires itself after the server's display window, and the
// next push closes whatever is left behind.

export type AutoRevealReason = "timeUp" | "everyoneAnswered" | "movedOn";

/**
 * A single answer arriving must not end the question. If one student is checked
 * in and taps immediately, "everyone answered" is technically true one second
 * in — and the rest of the room never sees the question at all.
 */
export const EVERYONE_ANSWERED_FLOOR_MS = 10_000;

/**
 * How many slides past the question the professor must travel before it counts
 * as having moved on. One press is an accident on a hand-held clicker; three
 * deliberate advances are not.
 */
export const ADVANCES_BEFORE_REVEAL = 3;

export function autoRevealReason(input: {
  /** Only an open round can be revealed. */
  state: "open" | "revealed" | "closed";
  /** Server deadline for the round. */
  endsAt: string | null;
  openedAtMs: number | null;
  nowMs: number;
  answered: number;
  /** Students who scanned in. The roster count is not a target. */
  present: number;
  /** Slides advanced beyond the one the question was asked on. */
  advancesSinceAsked: number;
}): AutoRevealReason | null {
  if (input.state !== "open") return null;

  const deadline = input.endsAt ? new Date(input.endsAt).getTime() : Number.NaN;
  if (Number.isFinite(deadline) && input.nowMs >= deadline) return "timeUp";

  if (input.advancesSinceAsked >= ADVANCES_BEFORE_REVEAL) return "movedOn";

  const openFor =
    input.openedAtMs === null ? Number.POSITIVE_INFINITY : input.nowMs - input.openedAtMs;
  if (
    input.present > 0
    && input.answered >= input.present
    && openFor >= EVERYONE_ANSWERED_FLOOR_MS
  ) {
    return "everyoneAnswered";
  }

  return null;
}

/**
 * Counts forward movement only. Paging back to re-explain a slide is part of
 * teaching the question, not leaving it, and must not push the professor toward
 * an accidental reveal.
 */
export function countAdvance(
  current: number,
  previousSlide: number | null,
  nextSlide: number | null
): number {
  if (previousSlide === null || nextSlide === null) return current;
  return nextSlide > previousSlide ? current + 1 : current;
}
