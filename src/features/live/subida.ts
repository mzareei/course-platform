// La Subida — the two numbers the climb is drawn from, kept apart on purpose.
//
// HEIGHT is candy: correctness plus speed. SIZE is correct answers, cumulative,
// so nothing on this screen ever shrinks — a small animal beside a large one has
// answered less, it is not a student being pointed at, and that reading is the
// whole reason size is cumulative rather than a streak.
//
// Pure on purpose: tools/verify-quiz-race.mjs imports and executes every
// function here rather than grepping for it.
import type { RaceRacer } from "../../api/quiz";

/** The best one question can pay: correct, inside twenty seconds.
 *
 *  The source of truth is `CANDY_GOLDEN` in the backend's `_shared/rounds.ts`.
 *  The two repos deploy independently, so the verifier imports both and asserts
 *  they agree instead of trusting this comment. */
export const CANDY_PER_QUESTION = 2;

/** Only for a payload old enough to have no `question_count`.
 *
 *  The plan's brief asked for a flat `MAX_CANDY = 20`. Task 6 had just finished
 *  cleaning up exactly this drift — a frontend `defaultQuestionCount` of 12
 *  against a dealt 10 — and a constant 20 here would pin every racer at the top
 *  of the rope the day the professor changes the question quota. The ceiling is
 *  the server's own count; this number is the fallback, nothing more. */
export const FALLBACK_MAX_CANDY = 20;

/** Nobody grows past three times base — a bigger leader crowds the room out. */
export const MAX_SIZE = 3;

/** One breath of the idle bob. */
export const BOB_MS = 3200;

/** The most candy this instance can hand out, from the server's own count. */
export function ceilingFor(questionCount?: number | null): number {
  const count = Math.floor(Number(questionCount) || 0);
  if (count <= 0) return FALLBACK_MAX_CANDY;
  return count * CANDY_PER_QUESTION;
}

/** Multiplier on the base emoji size. Cumulative: it never goes down. */
export function sizeFor(correctCount: number): number {
  const correct = Math.max(0, Math.floor(Number(correctCount) || 0));
  return Math.min(MAX_SIZE, 1 + 0.2 * correct);
}

/** Percent of the way up the rope. */
export function heightFor(candy: number, questionCount?: number | null): number {
  const value = Math.max(0, Math.floor(Number(candy) || 0));
  return Math.max(0, Math.min(100, (value / ceilingFor(questionCount)) * 100));
}

/** Where a lane sits across the field, as a percentage of its width.
 *
 *  Derived from the roster rather than a fixed step: the 3.78% step that fits
 *  the twenty-six racers of 2026-08-21 runs off the right-hand edge at thirty,
 *  and a group larger than the one that broke the old track is precisely the
 *  case this screen has to survive. Rope, animal and ground label all call
 *  this, so the three cannot drift into different lanes. */
export function lanePercent(index: number, total: number): number {
  const lanes = Math.max(1, Math.floor(Number(total) || 0));
  const lane = Math.min(lanes - 1, Math.max(0, Math.floor(Number(index) || 0)));
  return ((lane + 0.5) / lanes) * 100;
}

/** The field, in the order the lanes are drawn — fixed for the whole quiz.
 *
 *  NOT the payload's own order. `course-class-quiz` selects the attempts with
 *  no ORDER BY, and `settleRoom` rewrites those same rows at every round
 *  boundary, so Postgres can legitimately hand back a different row order on
 *  the next poll. Trusting it would reshuffle all twenty-six lanes mid-climb —
 *  the room would lose track of the animal it was following. `racer_name` is
 *  assigned once and never changes, so sorting on it gives the same field every
 *  poll. Returns a copy: sorting the caller's array in place is the same bug
 *  wearing a different hat. */
export function laneOrder(racers: RaceRacer[]): RaceRacer[] {
  return [...racers].sort((a, b) => a.racer_name.localeCompare(b.racer_name));
}

/** The permanent right rail.
 *
 *  Returns a copy for the same reason `laneOrder` does: `race.racers.sort()`
 *  here would reorder every lane on the field as a side effect of ranking three
 *  of them. Candy first (that is the climb), then correct answers, then the
 *  name so two identical racers never swap places between polls. */
export function topThree(racers: RaceRacer[]): RaceRacer[] {
  return [...racers]
    .sort((a, b) =>
      (b.candy - a.candy)
      || (b.correct_count - a.correct_count)
      || a.racer_name.localeCompare(b.racer_name))
    .slice(0, 3);
}

/** A per-racer phase offset for the idle bob, as a negative animation-delay.
 *
 *  The 2026-08-21 class complaint was that between one racer's occasional slide
 *  and a commentary line every four to eight seconds, nothing on this screen
 *  moved. The bob is the fix — but twenty-six animals rising and falling in
 *  unison read as one object breathing, so each lane starts somewhere else in
 *  the cycle. 617 is coprime with BOB_MS, so a full class gets a full class of
 *  distinct offsets. */
export function bobDelayMs(index: number): number {
  const lane = Math.max(0, Math.floor(Number(index) || 0));
  return -((lane * 617) % BOB_MS);
}
