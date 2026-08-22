// Reading the room's clock.
//
// Until 2026-08-20 every phone ran its own countdown from the moment its
// student tapped "Let's go". No two students were ever on the same question,
// nobody had a spare second to look up, and the room's screen played to an
// audience of one. The instance now publishes one schedule for the whole room
// and every phone obeys it.
//
// The schedule itself belongs to the server — the two repos deploy
// independently, so a duration kept on both sides drifts the moment one of them
// ships without the other. This file holds no number at all; it only converts
// the absolute timestamps the server sent into what a countdown needs.
//
// Pure on purpose: the verifier imports and executes it.
import type { PulseQuizRound } from "../../api/pulse";

/** Milliseconds left on a server-sent deadline, never negative. A missing or
 *  unparseable timestamp reads as zero rather than NaN — a stale deployment
 *  that omits the field must show a spent clock, not a broken one. */
export function remainingMs(endsAtIso: string | null | undefined, now: number): number {
  if (!endsAtIso) return 0;
  const ends = new Date(endsAtIso).getTime();
  if (Number.isNaN(ends)) return 0;
  return Math.max(0, ends - now);
}

/** The room is between questions: phones reveal, eyes go to the screen. */
export function isBreak(round: PulseQuizRound | null | undefined): boolean {
  return Boolean(round && round.phase === "break");
}
