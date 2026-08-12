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

/**
 * How long `course-pulse` keeps serving a revealed round to students
 * (`revealDisplayMinutes = 3`). The cockpit has to use the same number: showing
 * a question the phones have already dropped is how the professor ended up
 * looking at last checkpoint's question with a Continue button under it.
 */
export const REVEAL_DISPLAY_MS = 3 * 60 * 1000;

export type AutoContinueReason = "displayWindowElapsed" | "movedOn";

/**
 * When the cockpit should let go of a revealed question by itself.
 *
 * Retiring used to have exactly one automatic trigger: the deck reporting that
 * it resumed past an authored checkpoint. Only a deck carrying the full engine
 * sends that, and every imported lecture carries just the slide reporter — so
 * on the decks the professor actually teaches from, nothing ever retired the
 * panel, and he met the last question the moment fullscreen dropped.
 *
 * Deliberately not keyed on the round's `checkpoint_after_slide`: `course-pulse`
 * treats `plan_checkpoint_id` and `checkpoint_after_slide` as mutually
 * exclusive, so a plan-driven round carries no slide at all — and plan-driven
 * rounds are exactly the ones this fixes.
 */
export function autoContinueReason(input: {
  state: "open" | "revealed" | "closed";
  /** Null when recovered after a reload and the server did not say. */
  revealedAtMs: number | null;
  nowMs: number;
  /** Slides advanced since the reveal, not since the question was asked. */
  advancesSinceRevealed: number;
}): AutoContinueReason | null {
  if (input.state !== "revealed") return null;
  if (input.advancesSinceRevealed >= ADVANCES_BEFORE_REVEAL) return "movedOn";
  if (input.revealedAtMs === null) return null;
  if (input.nowMs - input.revealedAtMs >= REVEAL_DISPLAY_MS) {
    return "displayWindowElapsed";
  }
  return null;
}
