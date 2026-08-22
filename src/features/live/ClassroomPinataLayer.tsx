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
  lanePercent, roundCountIsSettled, sizeFor, topThree, topThreeKeys
} from "./subida";
import {
  CLIMB_HOLD_MS, JOLT_MS, RING_MS, RISE_MS, SPOTLIGHT_AT_MS, SPOTLIGHT_MS,
  floatsFor, ringingLanes, spotlightFor,
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
  const [raining, setRaining] = useState(false);
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
  const prevSnap = useRef<RaceSnap | null>(null);
  // The roster the poll has handed out, mirrored out of state: the poll closure
  // is built once per instance, so reading the state variable would give it the
  // roster as it stood at mount.
  const rosterRef = useRef<string[]>([]);
  // What the field looked like when the LAST round's beat ran — not simply the
  // previous poll. Diffing whole rounds is what makes the flash show a round's
  // full gain however the polls happen to fall either side of the settle.
  const beatBaseline = useRef<{ lanes: LaneRacer[]; top3: string[] } | null>(null);
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
        round: round.index
      };
      beatBaseline.current = { lanes: next, top3 };

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
            growRoster(res.racers);
            // The beats need a whole round to diff against and this payload is
            // the only thing there has ever been, so it becomes the baseline and
            // celebrates nothing — the same ruling as the announcer's above.
            beatBaseline.current = { lanes: laneSnapshot(res.racers), top3: topThreeKeys(res.racers) };
            setRace(res);
            if (res.state === "closed") freeze();
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
            setRaining(true);
            setTimeout(() => setRaining(false), 3000);
          }
          prevSnap.current = snap;
          // The beats and the new state land in one render on purpose: the
          // climb's transition-delay has to be on the element in the same commit
          // that moves it, or the field jumps instead of holding.
          runBeats(res, growRoster(res.racers));
          setRace(res);
          if (res.state === "closed") freeze();
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

  return (
    <section ref={layerRef} class="classroom-pinata-layer" data-testid="classroom-pinata-layer" aria-live="off" tabindex={-1}>
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
            <span class={`subida-racer${hitSet.has(key) ? " hit" : ""}`} key={key} aria-hidden="true"
              style={
                `left:${lanePercent(index, lanes)}%;`
                + `bottom:${heightFor(racer.candy, race?.question_count)}%;`
                + `font-size:${Math.round(BASE_EMOJI_PX * sizeFor(racer.correct_count))}px;`
                + `z-index:${10 + Math.max(0, racer.correct_count || 0)};`
                + `animation-delay:${bobDelayMs(index)}ms`
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
                <div class={`subida-float ${float.vertical ? "vertical" : "flat"}`} key={float.key}
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

      {raining ? (
        <div class="pinata-rain" aria-hidden="true">
          {"🍬🍭🍬🍫🍬🍭🍬🍭🍫🍬".split("").map((candy, index) => (
            <span key={index} style={`left:${(index * 9.7) % 100}%; animation-delay:${(index % 5) * 120}ms`}>{candy}</span>
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
