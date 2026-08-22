// The text that rises out of an animal, and who the round belongs to.
//
// Ten times a quiz the room's screen resolves twenty-six results at once. This
// module decides what that moment says. Two rules the verifier enforces:
//
// 1. Numbers read flat, phrases are rotated. Twenty-six lanes sit about
//    nineteen pixels apart, and a horizontal "🔥 3 seguidas" covers three or
//    four neighbouring ropes — the room would read it as belonging to the wrong
//    animal.
// 2. Nothing negative ever floats. No label for a wrong answer, a broken
//    streak, or a drop out of the top three. A racer who missed is silent, not
//    marked, because a mark on the misses is a callout and this screen never
//    points at a struggling student.
//
// A spec carries a LANE KEY, never an index into `race.racers`. Task 9 found
// out why: course-class-quiz selects the attempts with no ORDER BY while
// settleRoom rewrites those same rows every round, so the payload's row order
// changes between polls and a label resolved against it lands on whichever
// animal happened to be row 0. The caller hands lanes in, already resolved by
// `laneKeys`, so this module and the field can never disagree about who is who.
//
// Pure on purpose, and with no runtime import of its own: tools/verify-quiz-race
// imports and executes it in Node, where the app's i18n does not exist and where
// a relative specifier out of a .ts file does not resolve. The three phrases are
// deliberately Spanish in both languages for the same reason the chants in
// commentary.ts are, and they live here rather than in strings.ts for the same
// reason too — this module has to import cleanly with no i18n around it.
import type { RaceRacer } from "../../api/quiz";

/** Slow enough to read from the back of a room. A fast pop-up is noise by the
 *  time the eye arrives; a slow drift is still legible while it travels. */
export const RISE_MS = 2600;
/** How far the label travels in that time. */
export const RISE_PX = 60;
/** Fully opaque for this long, then gone over FADE_MS. The two must add up to
 *  RISE_MS or a label either freezes mid-air or vanishes still moving. */
export const HOLD_MS = 1500;
export const FADE_MS = 1100;

/** Roughly one lane's worth of stagger. Twenty-six numbers landing together
 *  read as a wall; staggered they read as a wave crossing the screen. */
export const STAGGER_MS = 45;
/** …but a full class at the full step would run the wave past the end of the
 *  break, so a big round compresses the step to fit this window instead of
 *  wrapping it (a modulo puts lane 14 on top of lane 1, which is worse). */
export const WAVE_MS = 540;
/** The gap between one racer's own phrases, when a single round earns two. */
export const PHRASE_STEP_MS = 260;

/** How high above its anchor a label starts, on top of the animal's own size.
 *
 *  A flat number and a vertical phrase in the same lane would otherwise be
 *  drawn straight through each other: the phrase is set vertically, so it is
 *  about eighty pixels TALL, while the number it shares the rope with has only
 *  drifted twenty by the time the phrase lands. The number takes the anchor
 *  itself; each phrase starts clear of the number, and each further phrase
 *  starts clear of the one below it. A racer that does three notable things in
 *  one round reads as a column of text climbing its own rope, not a pile. */
export const NUMBER_CLEAR_PX = 34;
export const PHRASE_SPAN_PX = 86;

/** The three beats of the ten-second break, measured from the poll that first
 *  sees the round settled. */
export const FLASH_AT_MS = 0;
export const CLIMB_AT_MS = 620;
export const SPOTLIGHT_AT_MS = 1500;
/** How long the field holds the climb's transition-delay. Must outlast
 *  CLIMB_AT_MS plus the CSS `--subida-slide` the racers tween on, or the delay
 *  is pulled out from under a climb that is still running. */
export const CLIMB_HOLD_MS = 1300;
/** The green ring on the flash beat, and the standout's card. */
export const RING_MS = 900;
export const SPOTLIGHT_MS = 5000;
/** The piñata's single jolt. It takes the round's whole damage at once. */
export const JOLT_MS = 600;

/** The candy an answer inside the round's golden window is worth. Mirrors
 *  CANDY_GOLDEN in the backend's _shared/rounds.ts; subida.ts holds the same
 *  number as CANDY_PER_QUESTION and the verifier asserts both against it. */
const GOLDEN_CANDY = 2;

const NUMBER_AT_MS = 40;
const PHRASE_AT_MS = 900;

const CANDY_COLOR = "#7ee7a6";
const GOLDEN_COLOR = "#ffd166";
const STREAK_COLOR = "#ff9d5c";
const FASTEST_COLOR = "#8fd6ff";
const TOP3_COLOR = "#c4a6ff";

/** One racer tied to the lane it is drawn in. The caller builds these with
 *  `laneKeys`, so a label and an animal cannot end up on different ropes. */
export interface LaneRacer {
  laneKey: string;
  racer: RaceRacer;
}

export interface FloatSpec {
  key: string;
  laneKey: string;
  text: string;
  color: string;
  vertical: boolean;
  delayMs: number;
  /** Pixels above the anchor (the racer's height plus its own emoji size) that
   *  this label starts from, so two labels on one rope never overlap. */
  liftPx: number;
}

export interface FloatInput {
  /** The lanes as they were when the previous round's beat ran — not simply the
   *  previous poll. Diffing whole rounds is what makes the flash show a round's
   *  full gain however the polls happen to fall around the settle. */
  prev: LaneRacer[];
  next: LaneRacer[];
  /** The rail's three, as lane keys, before and after. The rocket has to mean
   *  "entered the top three the room can see", so it reads the rail's own rule. */
  prevTop3: string[];
  nextTop3: string[];
  /** Lane keys in lane order. Only ever used to sweep the wave left to right. */
  roster: string[];
  /** The round that just closed. Only ever part of a key, so one round's labels
   *  can never be reused as DOM nodes by the next round's. */
  round: number;
}

interface Earner {
  laneKey: string;
  racer: RaceRacer;
  gained: number;
  /** The streak this round REACHED, or 0. Only ever a multiple of three. */
  streak: number;
  /** Position in the wave, left to right. */
  order: number;
}

const byLane = (lanes: LaneRacer[]) => new Map(lanes.map((entry) => [entry.laneKey, entry.racer]));

/** Everyone whose candy rose this round, in lane order.
 *
 *  A lane with no previous entry is skipped rather than credited with its whole
 *  score: a student who taps "Let's go" mid-quiz appears with candy already on
 *  it, and a "+6" over a racer who has just walked in is a lie. */
function earners(input: FloatInput): Earner[] {
  const before = byLane(input.prev);
  const lanePosition = (key: string) => {
    const at = input.roster.indexOf(key);
    return at < 0 ? input.roster.length : at;
  };

  const found = input.next.flatMap((entry) => {
    const was = before.get(entry.laneKey);
    if (!was) return [];
    const gained = (entry.racer.candy || 0) - (was.candy || 0);
    if (gained <= 0) return [];
    const correct = entry.racer.correct_count || 0;
    const rose = correct > (was.correct_count || 0);
    return [{
      laneKey: entry.laneKey,
      racer: entry.racer,
      gained,
      streak: rose && correct > 0 && correct % 3 === 0 ? correct : 0,
      order: 0
    }];
  });

  found.sort((a, b) =>
    (lanePosition(a.laneKey) - lanePosition(b.laneKey)) || a.laneKey.localeCompare(b.laneKey));
  return found.map((earner, order) => ({ ...earner, order }));
}

/** One racer a round, or none.
 *
 *  Who actually answered first is not knowable here: course-class-quiz sends
 *  candy and correct_count and nothing else, and the answer timestamps never
 *  leave the server. What the payload does carry is the golden gain — two candy
 *  means the answer landed inside the round's first twenty seconds. So the bolt
 *  goes to a golden answer, and among several it goes to the racer with the
 *  FEWEST correct answers so far: the rail and the size already celebrate the
 *  leader every second of the quiz, and stacking the round's loudest badge on
 *  the same animal ten times running is how a screen stops being looked at. */
function fastestLane(list: Earner[]): string | null {
  const golden = list.filter((earner) => earner.gained >= GOLDEN_CANDY);
  if (!golden.length) return null;
  return golden.reduce((best, earner) => {
    const mine = earner.racer.correct_count || 0;
    const theirs = best.racer.correct_count || 0;
    if (mine !== theirs) return mine < theirs ? earner : best;
    return earner.laneKey.localeCompare(best.laneKey) < 0 ? earner : best;
  }).laneKey;
}

/** How far apart two neighbouring numbers land. */
function waveStep(count: number): number {
  if (count <= 1) return STAGGER_MS;
  return Math.min(STAGGER_MS, WAVE_MS / (count - 1));
}

/** Every label this round earns, with the delay that staggers it into a wave. */
export function floatsFor(input: FloatInput): FloatSpec[] {
  const list = earners(input);
  const step = waveStep(list.length);
  const fastest = fastestLane(list);
  const wasTop = new Set(input.prevTop3);
  const promoted = new Set(input.nextTop3.filter((key) => !wasTop.has(key)));
  const specs: FloatSpec[] = [];

  for (const earner of list) {
    // The candy number: flat, on the flash beat, staggered across the lanes.
    specs.push({
      key: `candy:${input.round}:${earner.laneKey}`,
      laneKey: earner.laneKey,
      text: `+${earner.gained}`,
      color: earner.gained >= GOLDEN_CANDY ? GOLDEN_COLOR : CANDY_COLOR,
      vertical: false,
      delayMs: Math.round(NUMBER_AT_MS + earner.order * step),
      liftPx: 0
    });

    // The phrases: vertical, a beat later so they land after the climb — after
    // this racer's own number, never before it, and stacked above it.
    const phrases: Array<{ kind: string; text: string; color: string }> = [];
    if (earner.streak) {
      phrases.push({ kind: "streak", text: `🔥 ${earner.streak} seguidas`, color: STREAK_COLOR });
    }
    if (earner.laneKey === fastest) {
      phrases.push({ kind: "fastest", text: "⚡ el más rápido", color: FASTEST_COLOR });
    }
    if (promoted.delete(earner.laneKey)) {
      phrases.push({ kind: "top3", text: "🚀 al top 3", color: TOP3_COLOR });
    }
    phrases.forEach((phrase, nth) => specs.push({
      key: `${phrase.kind}:${input.round}:${earner.laneKey}`,
      laneKey: earner.laneKey,
      text: phrase.text,
      color: phrase.color,
      vertical: true,
      delayMs: Math.round(PHRASE_AT_MS + earner.order * step + nth * PHRASE_STEP_MS),
      liftPx: NUMBER_CLEAR_PX + nth * PHRASE_SPAN_PX
    }));
  }

  // A lane can reach the top three without gaining candy if another racer drops
  // out of the payload entirely. Rare, but the rail would show the promotion and
  // the field would say nothing, so the rocket is issued here too.
  for (const laneKey of promoted) {
    if (!input.next.some((entry) => entry.laneKey === laneKey)) continue;
    specs.push({
      key: `top3:${input.round}:${laneKey}`,
      laneKey,
      text: "🚀 al top 3",
      color: TOP3_COLOR,
      vertical: true,
      delayMs: PHRASE_AT_MS + WAVE_MS,
      // Nothing below it on this rope: this lane earned no candy, so it has no
      // number for the phrase to clear.
      liftPx: 0
    });
  }

  return specs;
}

/** The lanes that ring green on the flash beat: the ones whose correct-answer
 *  count rose this round.
 *
 *  Only ever this set. The complement — everyone who missed — is never computed
 *  and never touched, which is the one thing this whole beat must not do. */
export function ringingLanes(prev: LaneRacer[], next: LaneRacer[]): string[] {
  const before = byLane(prev);
  return next.flatMap((entry) => {
    const was = before.get(entry.laneKey);
    if (!was) return [];
    return (entry.racer.correct_count || 0) > (was.correct_count || 0) ? [entry.laneKey] : [];
  });
}

export interface Spotlight {
  laneKey: string;
  racer: RaceRacer;
  gained: number;
  streak: number;
  promoted: boolean;
  fastest: boolean;
}

/** The one racer the card names, or null when nobody earned anything.
 *
 *  Biggest gain first, then the better story: a streak milestone, then a
 *  promotion, then the bolt. The lane key breaks the last tie so a room where
 *  everyone had the same round still picks the same racer on every poll, and
 *  picks it independently of the order the payload arrived in. */
export function spotlightFor(input: FloatInput): Spotlight | null {
  const list = earners(input);
  if (!list.length) return null;

  const wasTop = new Set(input.prevTop3);
  const promoted = new Set(input.nextTop3.filter((key) => !wasTop.has(key)));
  const fastest = fastestLane(list);

  const scored = list.map((earner) => ({
    earner,
    promoted: promoted.has(earner.laneKey),
    fastest: earner.laneKey === fastest,
    score: earner.gained * 100
      + (earner.streak ? 40 : 0)
      + (promoted.has(earner.laneKey) ? 30 : 0)
      + (earner.laneKey === fastest ? 20 : 0)
      // A deeper climb edges a tie, but capped so it can never outweigh a
      // racer who simply had the bigger round.
      + Math.min(20, earner.racer.correct_count || 0)
  }));

  const best = scored.reduce((top, entry) =>
    (entry.score !== top.score
      ? (entry.score > top.score ? entry : top)
      : (entry.earner.laneKey.localeCompare(top.earner.laneKey) < 0 ? entry : top)));

  return {
    laneKey: best.earner.laneKey,
    racer: best.earner.racer,
    gained: best.earner.gained,
    streak: best.earner.streak,
    promoted: best.promoted,
    fastest: best.fastest
  };
}
