// The piñata race, on the screen the room is looking at.
//
// A fullscreen opaque layer inside Run Class — the ClassroomPodiumLayer
// pattern, for the reasons in the 2026-08-14 spec: Run Class is the only
// teaching display. It opens when the professor starts the quiz, polls the
// race every two seconds, and FREEZES when the quiz closes: final track,
// final percent, burst or ¡Casi!, and the button that hands over to the
// podium. Calm by construction: one commentary line, milestones are the only
// loud moments, and nothing on this screen ever names a student.
import { useEffect, useRef, useState } from "preact/hooks";
import { classQuizRace, type RaceStatus, type PodiumEntry } from "../../api/quiz";
import { clockText } from "../quiz/clock";
import { raceEvents, chantLine, BURST_LINE, type RaceSnap } from "../quiz/commentary";
import { t, lang } from "../../i18n";

const POLL_MS = 2000;
const LINE_MS = 4000;   // each event line holds at least this long
const CHANT_MS = 8000;  // idle time before a chant fills the silence
const QUEUE_CAP = 6;    // a mass finish must never build a multi-minute backlog

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

  const questionCount = Math.max(1, Number(race?.question_count || 0) || 1);
  const columns: RaceStatus["racers"][] = Array.from({ length: questionCount + 1 }, () => []);
  for (const racer of race?.racers || []) {
    if (!racer.finished) columns[Math.min(questionCount, racer.position)].push(racer);
  }
  const porra = (race?.racers || [])
    .filter((racer) => racer.finished)
    .sort((a, b) => (a.finish_place ?? 99) - (b.finish_place ?? 99));
  const remainingMs = race?.ends_at ? new Date(race.ends_at).getTime() - now : 0;
  const blindfolded = Math.max(0, (race?.present ?? 0) - (race?.started ?? 0));
  const closed = race?.state === "closed";

  return (
    <section ref={layerRef} class="classroom-pinata-layer" data-testid="classroom-pinata-layer" aria-live="off" tabindex={-1}>
      <header class="pinata-top">
        <div>
          <p class="pinata-clock" role="timer">{closed ? "🏁" : clockText(Math.max(0, remainingMs))}</p>
          <p class="pinata-line">{line}</p>
        </div>
        <div class="pinata-counts">
          <p><b>{t("pinata.swinging", { count: Math.max(0, (race?.started ?? 0) - (race?.submitted ?? 0)) })}</b> · <b>{t("pinata.candies", { count: race?.submitted ?? 0 })}</b></p>
          <p>{t("pinata.present", { count: race?.present ?? 0 })}{blindfolded > 0 ? <> · {t("pinata.blindfolded", { count: blindfolded })}</> : null}</p>
        </div>
      </header>

      <div class="pinata-main">
        <div class="pinata-track" style={`grid-template-columns: repeat(${questionCount + 1}, 1fr);`}>
          {columns.map((group, index) => (
            <div class="pinata-col" key={index}>
              <span class="pinata-col-label">{index === 0 ? t("pinata.start") : index}</span>
              {group.map((racer) => (
                <span class="pinata-racer" key={racer.racer_name} title={racer.racer_name}>
                  <span aria-hidden="true">{racer.racer_emoji}</span>
                  <small>{racer.racer_name}</small>
                </span>
              ))}
            </div>
          ))}
        </div>

        <aside class="pinata-side">
          <div class={`pinata-figure${race?.pinata.burst ? " burst" : ""}`} aria-hidden="true">🪅</div>
          <div class="pinata-bar"><i style={`width:${race?.pinata.percent ?? 0}%`} /></div>
          <p class="pinata-name">
            {race?.pinata.burst
              ? t("pinata.burst")
              : race?.pinata.name
              ? t("pinata.layerTitle", { title: race.pinata.name })
              : t("pinata.layerTitleNoName")}
            {" · "}{race?.pinata.percent ?? 0}%
          </p>
          {closed && !race?.pinata.burst ? (
            <p class="pinata-casi">{t("pinata.casi", { percent: race?.pinata.percent ?? 0 })}</p>
          ) : null}
          <div class="pinata-porra">
            <p>{t("pinata.porra", { count: porra.length })}</p>
            <p class="pinata-porra-row">
              {porra.map((racer) => (
                <span key={racer.racer_name} title={racer.racer_name}>
                  {(racer.finish_place ?? 4) <= 3 ? "👑" : ""}{racer.racer_emoji}
                </span>
              ))}
            </p>
          </div>
        </aside>
      </div>

      {raining ? (
        <div class="pinata-rain" aria-hidden="true">
          {"🍬🍭🍬🍫🍬🍭🍬🍭🍫🍬".split("").map((candy, index) => (
            <span key={index} style={`left:${(index * 9.7) % 100}%; animation-delay:${(index % 5) * 120}ms`}>{candy}</span>
          ))}
        </div>
      ) : null}

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
