// La Subida — the two numbers the climb is drawn from, kept apart on purpose.
//
// HEIGHT is candy: correctness plus speed. SIZE is correct answers, cumulative,
// so nothing on this screen ever shrinks — a small animal beside a large one has
// answered less, it is not a student being pointed at, and that reading is the
// whole reason size is cumulative rather than a streak.
//
// Pure on purpose: tools/verify-quiz-race.mjs imports and executes every
// function here rather than grepping for it.
import type { RaceRacer, RaceRound } from "../../api/quiz";

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

/** One breath of the idle bob. Must equal the CSS `subida-bob` duration, or the
 *  per-lane phase offsets stop covering exactly one cycle; the verifier reads
 *  the stylesheet and asserts it. */
export const BOB_MS = 3200;

/** Base emoji size in pixels, before `sizeFor`. `BASE_EMOJI_PX × MAX_SIZE` is
 *  the tallest a racer can draw, and `.subida-sky`'s reserve has to cover it or
 *  the leader clips the piñata. The verifier asserts that too. */
export const BASE_EMOJI_PX = 16;

/** More lanes than this and the ropes are threads. A roster larger than the cap
 *  still gets a lane each — a real racer is never squeezed out. */
export const MAX_LANES = 60;

/** How long after a round's countdown ends before `round_correct` is certainly
 *  that round's number.
 *
 *  The server keeps taking answers for `ANSWER_GRACE_MS` after the countdown
 *  ends — flight time, not thinking time — and `closedRoundIndex` deliberately
 *  keeps reporting the PREVIOUS round until that window shuts, because settled
 *  has to mean final. The room's screen waits out the same window rather than
 *  printing one round's count under another round's number. `answersCloseAt` is
 *  not in the payload (it is documented as invisible to the UI), so this mirrors
 *  the grace and the verifier imports the backend's constant to prove it covers
 *  it. */
export const SETTLE_MARGIN_MS = 2000;

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

/** A racer's lane key, unique inside one payload.
 *
 *  `racer_name` normally. `course-class-quiz` renders any attempt whose racer
 *  name has not been assigned yet as "🎒 Mochila", so two of them can arrive in
 *  the same payload; the occurrence suffix exists so those two get two lanes and
 *  two render keys instead of fighting over one. Two such rows are identical on
 *  screen anyway, so which of them takes which lane does not matter. */
export function laneKeys(racers: RaceRacer[]): string[] {
  const seen = new Map<string, number>();
  return racers.map((racer) => {
    const name = String(racer.racer_name || "");
    const nth = (seen.get(name) ?? 0) + 1;
    seen.set(name, nth);
    return nth === 1 ? name : `${name}#${nth}`;
  });
}

/** The lane roster: lane keys in the order the lanes were handed out.
 *
 *  A racer keeps its index for the whole quiz. That matters twice over. First,
 *  `course-class-quiz` selects the attempts with no ORDER BY while `settleRoom`
 *  rewrites those same rows every round, so Postgres may return a different row
 *  order on the next poll and the payload's own order cannot be trusted.
 *  Second — and this is what a plain alphabetical sort got wrong — a student who
 *  starts late adds a racer mid-quiz, and an alphabetical insert lands in the
 *  MIDDLE and shoves every lane after it sideways in one frame. Appending puts
 *  the newcomer in the next free lane and moves nobody.
 *
 *  Newcomers arriving in the same poll are sorted among themselves so the roster
 *  never depends on the payload's row order. Returns `previous` unchanged when
 *  there is nothing new, so the caller's state identity is stable. */
export function laneRoster(previous: string[], racers: RaceRacer[]): string[] {
  const known = new Set(previous);
  const fresh: string[] = [];
  for (const key of laneKeys(racers)) {
    if (!known.has(key)) {
      known.add(key);
      fresh.push(key);
    }
  }
  if (!fresh.length) return previous;
  fresh.sort((a, b) => a.localeCompare(b));
  return [...previous, ...fresh];
}

/** How many lanes the field is divided into.
 *
 *  Pinned to the ROOM, not to how many students have tapped "Let's go" yet:
 *  dividing by the live racer count moves every lane the moment one more racer
 *  appears. Attendance is taken before the quiz, so `present` holds the field
 *  open at its final width from the first poll and nothing shifts as the room
 *  fills. Never fewer lanes than there are racers standing in them, and never
 *  more than `MAX_LANES` on the strength of `present` alone. */
export function laneCountFor(racerCount: number, present: number): number {
  const racers = Math.max(0, Math.floor(Number(racerCount) || 0));
  const room = Math.max(0, Math.floor(Number(present) || 0));
  return Math.max(1, racers, Math.min(MAX_LANES, room));
}

/** The permanent right rail.
 *
 *  Never sorts the caller's array: `race.racers.sort()` here would reorder every
 *  lane on the field as a side effect of ranking three of them. Candy first
 *  (that is the climb), then correct answers, then the lane key — the key rather
 *  than the bare name so that two attempts both showing as "🎒 Mochila" still
 *  have a deterministic order instead of leaving it to the untrusted payload. */
export function topThree(racers: RaceRacer[]): RaceRacer[] {
  return ranked(racers).slice(0, 3).map((entry) => entry.racer);
}

/** The same three, as LANE KEYS.
 *
 *  Task 10 needs the rail's answer in the field's own currency: 🚀 al top 3 has to
 *  mean "entered the three the room can see", so both readings come out of one
 *  sort rather than two that could drift apart. */
export function topThreeKeys(racers: RaceRacer[]): string[] {
  return ranked(racers).slice(0, 3).map((entry) => entry.key);
}

/** The racer podium the finale ends on: the top three BY CANDY, and only the
 *  racers who actually have some.
 *
 *  The filter is the whole ruling. A room can close with nothing on the board —
 *  a class that never picked up its phones, or a quiz the professor closed
 *  early — and then all three steps are zero, all three are tied, and the gold
 *  falls to whoever is alphabetically first. "🏆 X se llevó la piñata!" printed
 *  over a candy count of 0 is a label the room can disprove by reading the
 *  number under it, and it names a student for nothing. That room's true ending
 *  is the field it can still see, the piñata's own percent and ¡Casi!.
 *
 *  The same filter is what keeps a racer who joined and never answered off a
 *  step: they are on zero, so they can never stand ahead of someone who did.
 *
 *  Ranks through `topThree`, so the podium and the rail cannot disagree, and
 *  the tiebreak runs all the way down to the lane key — a podium that ranked
 *  off the payload's row order could crown a different racer on the last poll
 *  before the freeze than on the one before it, in front of the whole class. */
export function racerPodium(racers: RaceRacer[]): RaceRacer[] {
  return topThree(racers).filter((racer) => Math.max(0, Math.floor(Number(racer.candy) || 0)) > 0);
}

/** Which rank stands where, left to right: second, first, third.
 *
 *  Filtered to the steps there are. Two phones is how this feature gets tested
 *  and a class of two is a real class, so the podium draws what it has rather
 *  than padding itself out to three. */
export function podiumOrder(count: number): number[] {
  const steps = Math.max(0, Math.floor(Number(count) || 0));
  return [1, 0, 2].filter((rank) => rank < steps);
}

/** The one sort behind both, so the rail and the field can never rank the room
 *  differently. Never touches the caller's array. */
function ranked(racers: RaceRacer[]): Array<{ racer: RaceRacer; key: string }> {
  const keys = laneKeys(racers);
  return racers
    .map((racer, index) => ({ racer, key: keys[index] }))
    .sort((a, b) =>
      (b.racer.candy - a.racer.candy)
      || (b.racer.correct_count - a.racer.correct_count)
      || a.key.localeCompare(b.key));
}

/** Does `round_correct` describe the round the HUD is naming?
 *
 *  It does not while the room is still answering. `closedRoundIndex` returns
 *  `round.index - 1` until the answering window has closed for good, so during
 *  the forty seconds of every round the count belongs to the round BEFORE the
 *  one the eyebrow prints — and in round 1 it is a flat zero, which a room reads
 *  as nobody getting it. It is not current for the first couple of seconds of
 *  the break either, because the grace is still open. Withhold the number until
 *  both are past; the break beat is when it means something anyway.
 *
 *  True through the `done` phase as well: the last round's answering window has
 *  long closed by then, so the final count keeps standing until the quiz shuts. */
export function roundCountIsSettled(round: RaceRound | null | undefined, now: number): boolean {
  if (!round || round.phase === "answering") return false;
  const answerEnded = Date.parse(String(round.answer_ends_at || ""));
  if (!Number.isFinite(answerEnded)) return false;
  return Number(now) - answerEnded >= SETTLE_MARGIN_MS;
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
