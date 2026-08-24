// La Subida, on the screen the room is looking at.
//
// A fullscreen opaque layer inside Run Class — the ClassroomPodiumLayer
// pattern, for the reasons in the 2026-08-14 spec: Run Class is the only
// teaching display. It opens when the professor starts the quiz, polls the
// race every two seconds, and FREEZES when the quiz closes: final climb,
// final percent, burst or ¡Casi!, and the button that hands over to the
// podium. Calm by construction: one commentary line, milestones are the only
// loud moments, and nothing on this screen ever names a student.
//
// The track is a climb because of what happened on 2026-08-21. The old layout
// was a column per question; with the room clock every student is on the same
// question at the same time, so all twenty-six racers stacked into one column
// and pushed the layer taller than the room's display. Height is the whole
// point of a climb, so the same bug cannot recur here. The other complaint
// that day was that nothing moved — hence the idle bob, which is not
// decoration but the reason the screen is worth looking at between rounds.
import { useEffect, useRef, useState } from "preact/hooks";
import { classQuizRace, type RaceRacer, type RaceStatus, type PodiumEntry } from "../../api/quiz";
import { clockText } from "../quiz/clock";
import { remainingMs } from "../quiz/rounds";
import { raceEvents, chantLine, BURST_LINE, type RaceSnap } from "../quiz/commentary";
import {
  BASE_EMOJI_PX, bobDelayMs, heightFor, laneCountFor, laneKeys, laneRoster,
  lanePercent, podiumOrder, racerPodium, roundCountIsSettled, sizeFor, topThree, topThreeKeys
} from "./subida";
import {
  CLIMB_HOLD_MS, JOLT_MS, PODIUM_AT_MS, RAIN_FALL_MS, RAIN_MS, RING_MS, RISE_MS,
  SPOTLIGHT_AT_MS, SPOTLIGHT_MS,
  finaleCandies, floatsFor, popDelayMs, ringingLanes, spotlightFor,
  type FloatInput, type FloatSpec, type LaneRacer, type Spotlight
} from "./floats";
import { t, lang } from "../../i18n";

const POLL_MS = 2000;
const LINE_MS = 4000;   // each event line holds at least this long
const CHANT_MS = 8000;  // idle time before a chant fills the silence
const QUEUE_CAP = 6;    // a mass finish must never build a multi-minute backlog
const MEDALS = ["🥇", "🥈", "🥉"];
/** How far a floating label clears the top of its own emoji. */
const FLOAT_GAP_PX = 9;
/** Rank 0, 1, 2 — the winner's step is the tall gold one. */
const STEP_CLASS = ["first", "second", "third"];
/** How far apart the steps rise, in the order they stand: second, first, third. */
const PODIUM_STEP_MS = 180;

/** The candy that falls, as pieces.
 *
 *  Array.from, never split(""): every one of these emoji is a surrogate pair,
 *  so split("") cuts each of them in half and the rain draws twenty broken
 *  glyphs instead of ten candies. That is what the burst has been doing.
 *
 *  Two rains. The burst's is one quick pass the moment the piñata goes. The
 *  finale's is denser and launched across the whole window, because a room
 *  watching the ending for four seconds reads a drizzle of ten as the screen
 *  giving up. The last piece goes out with exactly one fall left in the window,
 *  and the 37.3% step scatters consecutive pieces right across the screen so it
 *  reads as rain rather than as a wave crossing it. */
const BURST_CANDY = "🍬🍭🍬🍫🍬🍭🍬🍭🍫🍬";
const FINALE_CANDY = "🍬🍭🍬🍫🍭🍬🍫🍬🍭🍬🍫🍭🍬🍭🍫🍬🍭🍬🍫🍬🍭🍫🍬🍭";

function rainFor(kind: "burst" | "finale") {
  if (kind === "burst") {
    return Array.from(BURST_CANDY).map((candy, index) => ({
      candy, left: (index * 9.7) % 100, delayMs: (index % 5) * 120
    }));
  }
  const pieces = Array.from(FINALE_CANDY);
  const step = (RAIN_MS - RAIN_FALL_MS) / Math.max(1, pieces.length - 1);
  return pieces.map((candy, index) => ({
    candy, left: Math.round(((index * 37.3) % 100) * 10) / 10, delayMs: Math.round(index * step)
  }));
}

/** The payload read as LANES rather than as rows.
 *
 *  Every beat below goes through this. course-class-quiz selects the attempts
 *  with no ORDER BY while settleRoom rewrites those same rows every round, so
 *  row 3 is not the racer row 3 was two seconds ago — and a label resolved
 *  against row order lands on the wrong animal. */
function laneSnapshot(racers: RaceRacer[]): LaneRacer[] {
  return laneKeys(racers).map((laneKey, index) => ({ laneKey, racer: racers[index] }));
}

/** What the spotlight card says the standout just earned. The biggest badge
 *  wins: a streak, then a promotion, then a fast answer, then the candy. */
function spotlightEarned(spot: Spotlight): string {
  if (spot.streak) return t("subida.spotStreak", { n: spot.streak });
  if (spot.promoted) return t("subida.spotTop3");
  if (spot.fastest) return t("subida.spotFastest");
  return t("subida.spotCandy", { count: spot.gained });
}

function toSnap(race: RaceStatus): RaceSnap {
  return {
    percent: race.pinata.percent,
    burst: race.pinata.burst,
    closed_reason: race.closed_reason,
    state: race.state,
    racers: race.racers,
    cheers: race.cheers
  };
}

export function ClassroomPinataLayer({
  instanceId,
  podium,
  onShowPodium,
  onClose
}: {
  instanceId: string;
  podium: PodiumEntry[];
  onShowPodium: () => void;
  onClose: () => void;
}) {
  const layerRef = useRef<HTMLElement | null>(null);
  const [race, setRace] = useState<RaceStatus | null>(null);
  const [line, setLine] = useState<string>("");
  const [raining, setRaining] = useState<"burst" | "finale" | null>(null);
  // Which lane belongs to whom, for the life of this layer. Grown in the poll
  // so a late starter takes the next free lane instead of shoving the field.
  const [roster, setRoster] = useState<string[]>([]);
  const [now, setNow] = useState(Date.now());
  // The break's three beats: the flash (a green ring on everyone who got it
  // right), the climb (a transition-delay the whole field shares), and the
  // spotlight. Plus the text that rises out of each animal.
  const [floats, setFloats] = useState<FloatSpec[]>([]);
  const [hits, setHits] = useState<string[]>([]);
  const [climbing, setClimbing] = useState(false);
  const [jolt, setJolt] = useState(false);
  const [spotlight, setSpotlight] = useState<Spotlight | null>(null);
  // The finale, after the freeze: the pop that reaches every animal, then the
  // racer podium in the field's place.
  const [popping, setPopping] = useState(false);
  const [podiumUp, setPodiumUp] = useState(false);
  const prevSnap = useRef<RaceSnap | null>(null);
  // The roster the poll has handed out, mirrored out of state: the poll closure
  // is built once per instance, so reading the state variable would give it the
  // roster as it stood at mount.
  const rosterRef = useRef<string[]>([]);
  // What the field looked like when the LAST round's beat ran — not simply the
  // previous poll. Diffing whole rounds is what makes the flash show a round's
  // full gain however the polls happen to fall either side of the settle.
  const beatBaseline = useRef<{ lanes: LaneRacer[]; top3: string[]; round: number } | null>(null);
  const beatRound = useRef(-1);
  const queue = useRef<string[]>([]);
  const lastLineAt = useRef(0);
  const lastChantTarget = useRef<string | null>(null);
  const frozen = useRef(false);
  const reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    layerRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // The race poll. Stops for good on the first closed payload — the freeze.
  useEffect(() => {
    // A different instance is a different set of lanes. Carrying the old
    // roster over would leave the new quiz's racers starting at lane 27.
    setRoster([]);
    rosterRef.current = [];
    beatBaseline.current = null;
    beatRound.current = -1;
    setFloats([]);
    setHits([]);
    setSpotlight(null);
    setClimbing(false);
    setJolt(false);
    setPopping(false);
    setPodiumUp(false);
    let cancelled = false;
    let id: ReturnType<typeof setInterval> | undefined;
    const freeze = () => {
      frozen.current = true;
      if (id !== undefined) clearInterval(id);
    };

    const beatTimers: Array<ReturnType<typeof setTimeout>> = [];
    const later = (ms: number, run: () => void) => { beatTimers.push(setTimeout(run, ms)); };
    const stopBeats = () => {
      for (const timer of beatTimers) clearTimeout(timer);
      beatTimers.length = 0;
    };

    // Lanes are handed out once and kept; this grows the roster and hands the
    // caller the version this payload produced, which the beats need before the
    // next render.
    const growRoster = (racers: RaceRacer[]) => {
      const next = laneRoster(rosterRef.current, racers);
      rosterRef.current = next;
      setRoster(next);
      return next;
    };

    // The ten-second break, choreographed. Runs once per round.
    const runBeats = (res: RaceStatus, lanes: string[]) => {
      // The finale supersedes the last round's beat. When the payload that
      // settles round 10 is also the payload that closes the quiz, the room
      // should be watching the ending, not a "+2" the finale is about to wipe
      // off the screen a frame later.
      if (frozen.current) return;
      const round = res.round;
      const baseline = beatBaseline.current;
      if (!round || !baseline || round.index === beatRound.current) return;
      // NOT on the poll where the phase flips to break. closedRoundIndex keeps
      // reporting the PREVIOUS round until the answer grace shuts, so a beat
      // fired the instant the break opens would flash a round that has not been
      // settled yet — twenty-six animals ringing for nothing. Same gate the
      // round count already waits on, for the same reason.
      if (!roundCountIsSettled(round, Date.now())) return;
      beatRound.current = round.index;

      const next = laneSnapshot(res.racers);
      const top3 = topThreeKeys(res.racers);
      const input: FloatInput = {
        prev: baseline.lanes,
        next,
        prevTop3: baseline.top3,
        nextTop3: top3,
        roster: lanes,
        round: round.index,
        // Normally 1. More when polls failed right across a settled window and
        // a whole round went by unbeaten — two ordinary correct answers then sum
        // to a golden-looking two candy, so the module gives up the inferences
        // it can no longer make rather than inventing a fast answer.
        roundsCovered: Math.max(1, round.index - baseline.round)
      };
      beatBaseline.current = { lanes: next, top3, round: round.index };

      const specs = floatsFor(input);
      const ringing = ringingLanes(input.prev, input.next);
      const spot = spotlightFor(input);
      // This round supersedes the last one outright, so nothing from the
      // previous break can still be on screen behind this one.
      stopBeats();

      // Beat 1, now: everyone whose correct count rose rings green at once and
      // the piñata takes the round's whole damage in one jolt. Everyone else is
      // left UNTOUCHED — never dimmed, never marked. Marking the misses is a
      // callout, and this screen never points at a struggling student.
      setHits(ringing);
      setFloats(specs);
      setClimbing(true);
      if (!reducedMotion && !res.pinata.burst && ringing.length) setJolt(true);
      later(RING_MS, () => setHits([]));
      later(JOLT_MS, () => setJolt(false));

      // Beat 2 is the transition-delay `climbing` puts on the field: the racers
      // hold their old height while the ring reads, then all climb together.
      // Released only once that climb has finished, not when it starts.
      later(CLIMB_HOLD_MS, () => setClimbing(false));

      // Beat 3. No card for a round nobody won.
      if (spot) {
        later(SPOTLIGHT_AT_MS, () => setSpotlight(spot));
        later(SPOTLIGHT_AT_MS + SPOTLIGHT_MS, () => setSpotlight(null));
      }
      const lastLabel = specs.reduce((max, spec) => Math.max(max, spec.delayMs), 0);
      later(lastLabel + RISE_MS + 200, () => setFloats([]));
    };

    // The finale, once the quiz is closed. Everyone pops, candy falls for about
    // four seconds, and at PODIUM_AT_MS the field leaves and the racer podium
    // comes up in its place.
    //
    // Runs AFTER freeze() and never goes back to the network. Stopping the poll
    // on the first closed payload was bought by an earlier incident, and a
    // finale with a timer that polled would quietly undo it.
    let finaleDone = false;
    const runFinale = (lanes: string[]) => {
      // Once. Two polls can be in flight as the quiz closes — the immediate
      // tick and the interval's next one — and a finale restarted a second in
      // would drop the podium back to the field in front of the room.
      if (finaleDone) return;
      finaleDone = true;

      // Whatever the last round's beat still had in flight is superseded
      // outright. Its pending setFloats([]) would otherwise wipe the finale's
      // candy a second after it landed, and a card naming one racer is not what
      // the room should be reading while the whole room is popping.
      stopBeats();
      setHits([]);
      setSpotlight(null);
      setClimbing(false);
      setJolt(false);
      setFloats([]);

      if (!reducedMotion) {
        // Beats 1 and 2, together: the pop crosses the field as a wave while
        // the candy falls. Every racer pops, the ones on zero included —
        // finaleCandies is handed the roster and no candy counts at all, so
        // there is nothing else it could do.
        const candies = finaleCandies(lanes);
        setPopping(true);
        setFloats(candies);
        setRaining("finale");
        const lastCandy = candies.reduce((max, spec) => Math.max(max, spec.delayMs), 0);
        later(RAIN_MS, () => setRaining(null));
        // Back to the idle bob once the wave is through, which matters for the
        // room that ends with no podium: the field stays on screen there.
        later(PODIUM_AT_MS, () => setPopping(false));
        later(lastCandy + RISE_MS + 200, () => setFloats([]));
      }

      // The podium is the ending, not the animation: reduced motion loses the
      // wave and the rain above, never the three steps.
      later(PODIUM_AT_MS, () => setPodiumUp(true));
    };

    const tick = () => {
      if (frozen.current) return;
      classQuizRace(instanceId)
        .then((res) => {
          if (cancelled) return;
          const snap = toSnap(res);

          // The first payload after mount is a baseline, not an event: with
          // no prior snapshot to diff against, raceEvents would replay every
          // milestone the race already passed (25/50/75, even the burst) and
          // the rain would fire again on a race that already popped minutes
          // ago. Reopening after Escape hits this same path.
          if (prevSnap.current === null) {
            prevSnap.current = snap;
            const lanes = growRoster(res.racers);
            // The beats need a whole round to diff against and this payload is
            // the only thing there has ever been, so it becomes the baseline and
            // celebrates nothing — the same ruling as the announcer's above.
            beatBaseline.current = {
              lanes: laneSnapshot(res.racers),
              top3: topThreeKeys(res.racers),
              // Which round this payload's numbers already include. A round is
              // settled partway through its own break, so the baseline covers
              // round R only once that settle has landed.
              round: res.round
                ? (roundCountIsSettled(res.round, Date.now()) ? res.round.index : res.round.index - 1)
                : -1
            };
            setRace(res);
            if (res.state === "closed") freeze();
            // Reopening a quiz that already closed lands here, and it has to
            // land on the podium: the field alone, frozen, with no ending, is
            // the screen this whole task exists to prevent.
            if (frozen.current) runFinale(lanes);
            return;
          }

          const events = raceEvents(prevSnap.current, snap, lang.value === "es" ? "es" : "en");
          const burstIndex = events.indexOf(BURST_LINE);
          if (burstIndex !== -1) {
            // The burst is the loudest moment on this screen. It must not sit
            // behind a backlog of candy lines from the same mass-finish poll,
            // and the rain (below) already fires the instant it happens — so
            // the line jumps the queue too, dropping whatever was pending.
            queue.current = events.slice(burstIndex + 1);
            setLine(BURST_LINE);
            lastLineAt.current = Date.now();
          } else {
            queue.current.push(...events);
          }
          // A mass finish (everyone submits in the same poll) can enqueue
          // dozens of candy lines; draining one per LINE_MS would take
          // minutes. Keep only the freshest few.
          if (queue.current.length > QUEUE_CAP) {
            queue.current = queue.current.slice(-QUEUE_CAP);
          }

          if (!prevSnap.current?.burst && snap.burst && !reducedMotion) {
            setRaining("burst");
            // Only ever ends its OWN rain. This timer is not one of the beat
            // timers, so stopBeats() cannot cancel it — and the piñata can burst
            // on the same round the quiz closes on, which would leave a stray
            // three-second timeout to switch the finale's rain off one second
            // into it.
            setTimeout(() => setRaining((kind) => (kind === "burst" ? null : kind)), 3000);
          }
          prevSnap.current = snap;
          const lanes = growRoster(res.racers);
          // The field's own update goes in FIRST. runBeats sits inside the
          // swallow-everything catch below, which was bought for network
          // failures; a throw out of the beats must never take the frame with
          // it, or prevSnap has already advanced, the announcer silently loses
          // an event and the room's screen sits still for two seconds with no
          // signal that anything went wrong. Both setState calls are still in
          // one synchronous handler, so they still land in one render — which is
          // what the climb's transition-delay needs.
          setRace(res);
          if (res.state === "closed") freeze();
          runBeats(res, lanes);
          if (frozen.current) runFinale(lanes);
        })
        .catch(() => { /* one missed poll is invisible; the next one catches up */ });
    };
    tick();
    id = setInterval(tick, POLL_MS);
    return () => { cancelled = true; clearInterval(id); stopBeats(); };
  }, [instanceId]);

  // The one commentary line: queued events first, chants to fill silence.
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, []);
  useEffect(() => {
    const elapsed = now - lastLineAt.current;
    if (queue.current.length && elapsed >= LINE_MS) {
      setLine(queue.current.shift() as string);
      lastLineAt.current = now;
      return;
    }
    if (!frozen.current && prevSnap.current && elapsed >= CHANT_MS) {
      const chant = chantLine(prevSnap.current, lastChantTarget.current);
      if (chant) {
        setLine(chant.line);
        lastChantTarget.current = chant.target;
        lastLineAt.current = now;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  // The field, in lane order: one entry per lane that has been handed out, each
  // carrying the index the rope, the animal and the ground label all draw from,
  // so the three can never disagree. Lanes come from the roster rather than the
  // payload's row order, and the lane COUNT comes from the room rather than from
  // how many students have started — dividing by the live racer count would move
  // every lane the moment one more racer appears.
  const racers = race?.racers || [];
  const byKey = new Map(laneKeys(racers).map((key, index) => [key, racers[index]]));
  const field = roster.flatMap((key, index) => {
    const racer = byKey.get(key);
    return racer ? [{ key, index, racer }] : [];
  });
  const lanes = laneCountFor(roster.length, race?.present ?? 0);
  const hitSet = new Set(hits);
  const round = race?.round ?? null;
  const closed = race?.state === "closed";
  const percent = race?.pinata.percent ?? 0;
  const burst = race?.pinata.burst ?? false;
  const started = race?.started ?? 0;
  const blindfolded = Math.max(0, (race?.present ?? 0) - started);
  const candyInRoom = field.reduce((sum, entry) => sum + Math.max(0, entry.racer.candy || 0), 0);

  // The countdown follows whichever half of the round is running. Reading
  // answer_ends_at alone would park the clock at 0:00 for the whole ten-second
  // break — the room's screen would go still exactly when the room looks up.
  // With no round at all (an instance with no start anchor) it falls back to
  // the instance's own deadline rather than showing nothing.
  const deadline = round
    ? (round.phase === "break" ? round.break_ends_at : round.answer_ends_at)
    : race?.ends_at ?? null;

  // The racer podium: ranked by CANDY, under the secret names, and only the
  // racers who have some — a room that earned nothing crowns nobody, and its
  // ending is the field it can still see plus the piñata's own percent.
  //
  // Not the score podium. ClassroomPodiumLayer ranks by quiz score under the
  // real names of the students who opted to show them, it is still one button
  // away in the footer, and the two may well list different students.
  const steps = racerPodium(field.map((entry) => entry.racer));
  const podiumShowing = podiumUp && steps.length > 0;

  // The 🏆 line, off the same three the podium draws — one ranking on this
  // screen, never two that could name different racers. Clearing the queue is
  // what stops a leftover "¡Casi!" from the closing poll taking the line back
  // four seconds later; the chant is already frozen out.
  useEffect(() => {
    if (!podiumShowing) return;
    queue.current = [];
    setLine(t("subida.wonThePinata", { name: steps[0].racer_name }));
    lastLineAt.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podiumShowing]);

  return (
    <section ref={layerRef} class={`classroom-pinata-layer${podiumShowing ? " podium-up" : ""}`}
      data-testid="classroom-pinata-layer" aria-live="off" tabindex={-1}>
      <header class="subida-top">
        <div class="subida-hud">
          {/* The round and the clock, nothing else. How hard a question is
              never appears here: every student has a different question in the
              same round, so it is not a property the room shares. The verifier
              bans the word from this file outright. */}
          <p class="subida-eyebrow">
            {round
              ? (race?.question_count
                 ? t("subida.roundOf", { n: round.index + 1, total: race.question_count })
                 : t("subida.round", { n: round.index + 1 }))
              : ""}
          </p>
          <p class="subida-clock" role="timer">{closed ? "🏁" : clockText(remainingMs(deadline, now))}</p>
        </div>

        <div class="subida-pinata">
          <div class={`pinata-figure${burst ? " burst" : ""}${jolt ? " jolt" : ""}`} aria-hidden="true">🪅</div>
          <div class="pinata-bar"><i style={`width:${percent}%`} /></div>
          <p class="pinata-name">
            {burst
              ? t("pinata.burst")
              : race?.pinata.name
              ? t("pinata.layerTitle", { title: race.pinata.name })
              : t("pinata.layerTitleNoName")}
            {" · "}{percent}%
          </p>
          {closed && !burst ? <p class="pinata-casi">{t("pinata.casi", { percent })}</p> : null}
        </div>

        <div class="subida-counts">
          {/* Withheld until the count is certainly the round the eyebrow names.
              The server reports the PREVIOUS round's number while answering is
              open, so printing it here would put round 2's count under "RONDA 3"
              — and a flat "0 of 26 got it" through the whole of round 1, which a
              room reads as nobody getting it. The slot keeps its height so the
              two lines below never jump. */}
          <p><b>{roundCountIsSettled(round, now)
            ? t("subida.roundGotIt", { count: race?.round_correct ?? 0, total: started })
            : ""}</b></p>
          <p><b>{t("subida.candyInRoom", { count: candyInRoom })}</b></p>
          <p>
            {t("pinata.present", { count: race?.present ?? 0 })}
            {blindfolded > 0 ? <> · {t("pinata.blindfolded", { count: blindfolded })}</> : null}
          </p>
        </div>
      </header>

      {/* The sky is the reserve above the field: a racer's box grows upward
          from its height, so the leader at 100% draws entirely above the
          field's top edge and would otherwise land on the piñata's head. */}
      <div class="subida-sky">
        <div class={`subida-field${climbing ? " climbing" : ""}`}>
          {field.map(({ key, index }) => (
            <span class="subida-rope" key={`rope:${key}`} aria-hidden="true"
              style={`left:${lanePercent(index, lanes)}%`} />
          ))}
          {field.map(({ key, index, racer }) => (
            // Height is candy, size is correct answers, and size only ever
            // grows. Bigger racers sit in front so a leader is never hidden
            // behind a neighbour that has answered less.
            <span class={`subida-racer${hitSet.has(key) ? " hit" : ""}${popping ? " subida-pop" : ""}`} key={key} aria-hidden="true"
              style={
                `left:${lanePercent(index, lanes)}%;`
                + `bottom:${heightFor(racer.candy, race?.question_count)}%;`
                + `font-size:${Math.round(BASE_EMOJI_PX * sizeFor(racer.correct_count))}px;`
                + `z-index:${10 + Math.max(0, racer.correct_count || 0)};`
                // The pop replaces the bob outright, so the delay has to switch
                // with it: a lane's negative bob offset left on the pop would
                // start it already half over.
                + `animation-delay:${popping ? popDelayMs(index, roster.length) : bobDelayMs(index)}ms`
              }>
              {racer.racer_emoji}
            </span>
          ))}
          {/* The text that rises out of an animal, resolved by LANE KEY — a
              payload index would attach a "+2" to whichever racer happened to be
              row 0 on this poll. Anchored at the racer's height plus its own
              emoji size plus a gap, because size grows with correct answers and
              a fixed offset puts a leader's label behind its own animal. The
              height is the one it is climbing TO, so the climb can never
              overtake its label, and `liftPx` stacks a second label clear of the
              first rather than through it. The outer div carries the drift and
              the inner span carries the rotation, or the two transforms fight. */}
          <div class="subida-floats" aria-hidden="true">
            {floats.map((float) => {
              const racer = byKey.get(float.laneKey);
              const laneIndex = roster.indexOf(float.laneKey);
              if (!racer || laneIndex < 0) return null;
              return (
                <div class={`subida-float ${float.vertical ? "vertical" : "flat"}${float.big ? " big" : ""}`} key={float.key}
                  style={
                    `left:${lanePercent(laneIndex, lanes)}%;`
                    + `bottom:calc(${heightFor(racer.candy, race?.question_count)}%`
                    + ` + ${Math.round(BASE_EMOJI_PX * sizeFor(racer.correct_count))
                            + FLOAT_GAP_PX + float.liftPx}px);`
                    + `color:${float.color};`
                    + `--float-delay:${float.delayMs}ms`
                  }>
                  <span>{float.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* The name marks the LANE, not the racer's progress: it stays at the
          ground all quiz, set vertically because twenty-six of them side by
          side have no room to lie flat. Hidden from assistive tech on purpose —
          twenty-six names read out in lane order is noise, and the rail below
          names the three that matter in plain text. */}
      <div class="subida-lanes" aria-hidden="true">
        {field.map(({ key, index, racer }) => (
          <span class="subida-lane-name" key={key} style={`left:${lanePercent(index, lanes)}%`}>
            {racer.racer_name}
          </span>
        ))}
      </div>

      {/* The only place on this screen that sorts. The field keeps its lanes. */}
      <aside class="subida-rail">
        <p class="subida-rail-title">{t("subida.rail")}</p>
        {topThree(field.map((entry) => entry.racer)).map((racer, index) => (
          // Keyed by rank, not by name: the rail is a ranked list, and two
          // attempts still showing as "🎒 Mochila" would collide on a name.
          <div class="subida-rail-row" key={`rank:${index}`}>
            <span aria-hidden="true">{MEDALS[index]}</span>
            <span aria-hidden="true">{racer.racer_emoji}</span>
            <span class="subida-rail-name">{racer.racer_name}</span>
            <span class="subida-rail-candy">{racer.candy}</span>
          </div>
        ))}
      </aside>

      {/* Beat 3: one standout, over the rail. Only ever someone who earned
          something this round — a round nobody won gets no card. */}
      {spotlight ? (
        <aside class="subida-spot">
          <p class="subida-spot-title">{t("subida.spotlight")}</p>
          <div class="subida-spot-emoji" aria-hidden="true">{spotlight.racer.racer_emoji}</div>
          <p class="subida-spot-name">{spotlight.racer.racer_name}</p>
          <p class="subida-spot-earned">{spotlightEarned(spotlight)}</p>
        </aside>
      ) : null}

      {/* The ending. Second, first, third — the order they stand in and the
          order they rise, so the wave reads left to right. Each step shows what
          this screen has shown all quiz: an emoji, a secret name and a candy
          count. Nothing here maps a racer to a student. */}
      {podiumShowing ? (
        <div class="subida-podium">
          <p class="subida-podium-title">{t("subida.podiumTitle")}</p>
          <div class="subida-podium-steps">
            {podiumOrder(steps.length).map((rank, place) => (
              // Keyed by rank for the rail's reason: two attempts still showing
              // as "🎒 Mochila" would collide on a name.
              <div class={`subida-podium-step ${STEP_CLASS[rank]}`} key={`step:${rank}`}
                style={`animation-delay:${place * PODIUM_STEP_MS}ms`}>
                <span class="subida-podium-emoji" aria-hidden="true">{steps[rank].racer_emoji}</span>
                <p class="subida-podium-name">{steps[rank].racer_name}</p>
                <p class="subida-podium-candy">🍬 {steps[rank].candy}</p>
                <div class="subida-podium-block" aria-hidden="true">{MEDALS[rank]}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {raining ? (
        <div class="pinata-rain" aria-hidden="true">
          {rainFor(raining).map((piece, index) => (
            <span key={index} style={`left:${piece.left}%; animation-delay:${piece.delayMs}ms`}>{piece.candy}</span>
          ))}
        </div>
      ) : null}

      <p class="pinata-line">{line}</p>

      <footer class="pinata-actions">
        {closed ? (
          <button class="btn primary" type="button" disabled={!podium.length} onClick={onShowPodium}>
            {t("podium.showToClass")}
          </button>
        ) : null}
        <button class="btn" type="button" onClick={onClose}>{t("podium.backToClass")}</button>
      </footer>
    </section>
  );
}
