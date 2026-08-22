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
import { classQuizRace, type RaceStatus, type PodiumEntry } from "../../api/quiz";
import { clockText } from "../quiz/clock";
import { remainingMs } from "../quiz/rounds";
import { raceEvents, chantLine, BURST_LINE, type RaceSnap } from "../quiz/commentary";
import { bobDelayMs, heightFor, laneOrder, lanePercent, sizeFor, topThree } from "./subida";
import { t, lang } from "../../i18n";

const POLL_MS = 2000;
const LINE_MS = 4000;   // each event line holds at least this long
const CHANT_MS = 8000;  // idle time before a chant fills the silence
const QUEUE_CAP = 6;    // a mass finish must never build a multi-minute backlog
const BASE_EMOJI_PX = 16;
const MEDALS = ["🥇", "🥈", "🥉"];

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
  const [now, setNow] = useState(Date.now());
  const prevSnap = useRef<RaceSnap | null>(null);
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
    let cancelled = false;
    let id: ReturnType<typeof setInterval> | undefined;
    const freeze = () => {
      frozen.current = true;
      if (id !== undefined) clearInterval(id);
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
          setRace(res);
          if (res.state === "closed") freeze();
        })
        .catch(() => { /* one missed poll is invisible; the next one catches up */ });
    };
    tick();
    id = setInterval(tick, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
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

  // The field, in lane order. Read once and used for every layer of the climb
  // so the rope, the animal and the ground label can never disagree.
  const field = laneOrder(race?.racers || []);
  const lanes = field.length;
  const round = race?.round ?? null;
  const closed = race?.state === "closed";
  const percent = race?.pinata.percent ?? 0;
  const burst = race?.pinata.burst ?? false;
  const started = race?.started ?? 0;
  const blindfolded = Math.max(0, (race?.present ?? 0) - started);
  const candyInRoom = field.reduce((sum, racer) => sum + Math.max(0, racer.candy || 0), 0);

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
          <div class={`pinata-figure${burst ? " burst" : ""}`} aria-hidden="true">🪅</div>
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
          <p><b>{t("subida.roundGotIt", { count: race?.round_correct ?? 0, total: started })}</b></p>
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
        <div class="subida-field">
          {field.map((racer, index) => (
            <span class="subida-rope" key={`rope:${racer.racer_name}`} aria-hidden="true"
              style={`left:${lanePercent(index, lanes)}%`} />
          ))}
          {field.map((racer, index) => (
            // Height is candy, size is correct answers, and size only ever
            // grows. Bigger racers sit in front so a leader is never hidden
            // behind a neighbour that has answered less.
            <span class="subida-racer" key={racer.racer_name} aria-hidden="true"
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
          {/* Task 10 fills this with the text that rises out of an animal. */}
          <div class="subida-floats" aria-hidden="true" />
        </div>
      </div>

      {/* The name marks the LANE, not the racer's progress: it stays at the
          ground all quiz, set vertically because twenty-six of them side by
          side have no room to lie flat. Hidden from assistive tech on purpose —
          twenty-six names read out in lane order is noise, and the rail below
          names the three that matter in plain text. */}
      <div class="subida-lanes" aria-hidden="true">
        {field.map((racer, index) => (
          <span class="subida-lane-name" key={racer.racer_name} style={`left:${lanePercent(index, lanes)}%`}>
            {racer.racer_name}
          </span>
        ))}
      </div>

      {/* The only place on this screen that sorts. The field keeps its lanes. */}
      <aside class="subida-rail">
        <p class="subida-rail-title">{t("subida.rail")}</p>
        {topThree(field).map((racer, index) => (
          <div class="subida-rail-row" key={racer.racer_name}>
            <span aria-hidden="true">{MEDALS[index]}</span>
            <span aria-hidden="true">{racer.racer_emoji}</span>
            <span class="subida-rail-name">{racer.racer_name}</span>
            <span class="subida-rail-candy">{racer.candy}</span>
          </div>
        ))}
      </aside>

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
