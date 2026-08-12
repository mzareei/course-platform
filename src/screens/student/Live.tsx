// In class — the student's live screen.
//
// A pure function of what the server says is happening, in the order a class
// actually runs: waiting → pulse question(s) → end-of-class quiz → reflection
// → done. Students never navigate during class; the screen changes when the
// professor's Run Class actions move things forward. Pulse options are
// shuffled per student (presentation only; the server grades by key), so
// "pick number 2" means nothing to the person next to them.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { context } from "../../state/session";
import { t, lang } from "../../i18n";
import { ApiError } from "../../api/client";
import { currentPulse, answerPulse, shuffleOptions, type StudentPulseView } from "../../api/pulse";
import { QuizPlayer } from "../../features/quiz/Player";
import { Reflection } from "../../features/reflection/Reflection";
import {
  clearJoinedClassSession,
  joinedClassSessionId
} from "../../api/session";
import {
  fallbackLiveSessionId,
  selectLiveSessionId
} from "../../features/join/sessionState";

const POLL_MS = 3000;

// Defined at module scope, not inside Live(), so its identity is stable across
// the 3s poll re-renders. A component defined inline inside another component
// gets a fresh function reference every render — Preact then treats each
// render as a different component type and unmounts/remounts everything
// inside it, which silently reset the quiz player before it ever finished
// loading (a real bug caught while testing this).
function LiveShell({ error, children }: { error: string | null; children: ComponentChildren }) {
  return (
    <div class="stack">
      <div class="row" style="justify-content: space-between;">
        <div>
          <p class="eyebrow">{t("live.eyebrow")}</p>
          <h1>{t("live.title")}</h1>
        </div>
        <a class="btn quiet" href="/">{t("live.backToToday")}</a>
      </div>
      {error ? <p class="error-text" role="alert">{error}</p> : null}
      {children}
    </div>
  );
}

export function Live() {
  const ctx = context.value;
  const studentSessions = ctx?.student_sessions ?? [];
  const [sessionId, setSessionId] = useState<string | null>(() =>
    selectLiveSessionId(studentSessions, joinedClassSessionId())
  );

  const [view, setView] = useState<StudentPulseView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [reflectionDone, setReflectionDone] = useState(false);
  const shownAt = useRef<number>(Date.now());
  const poll = useRef<number | undefined>(undefined);
  const clock = useRef<number | undefined>(undefined);

  async function refresh() {
    if (!sessionId) return;
    try {
      const next = await currentPulse(sessionId);
      setView((prev) => {
        if (next.round && next.round.round_id !== prev?.round?.round_id) {
          shownAt.current = Date.now(); // start the latency clock for this question
        }
        return next;
      });
    } catch (e) {
      const joinedSessionId = joinedClassSessionId();
      if (
        joinedSessionId === sessionId &&
        e instanceof ApiError &&
        [400, 403, 404].includes(e.status)
      ) {
        clearJoinedClassSession();
        setView(null);
        setError(null);
        setSessionId(fallbackLiveSessionId(studentSessions, sessionId));
        return;
      }
      // Keep the last known state on a network blip rather than blanking the screen.
      if (!view) setError(e instanceof Error ? e.message : null);
    }
  }

  useEffect(() => {
    if (!sessionId) {
      setSessionId(selectLiveSessionId(studentSessions, joinedClassSessionId()));
    }
  }, [sessionId, studentSessions]);

  useEffect(() => {
    void refresh();
    poll.current = setInterval(refresh, POLL_MS) as unknown as number;
    clock.current = setInterval(() => setNow(Date.now()), 1000) as unknown as number;
    return () => {
      clearInterval(poll.current);
      clearInterval(clock.current);
    };
  }, [sessionId]);

  const round = view?.round ?? null;
  const mine = view?.my_answer ?? null;
  const profileId = ctx?.profile?.id ?? "anon";
  const useSpanish = lang.value === "es";

  const displayOptions = useMemo(
    () => (round ? shuffleOptions(round.options, `${round.round_id}:${profileId}`) : []),
    [round?.round_id, profileId]
  );

  const remaining = round ? Math.max(0, Math.round((new Date(round.ends_at).getTime() - now) / 1000)) : 0;

  async function submit(optionKey: string) {
    if (!round) return;
    setBusy(true);
    setError(null);
    try {
      await answerPulse({
        round_id: round.round_id,
        option_key: optionKey,
        latency_ms: Date.now() - shownAt.current
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("live.answerFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (!sessionId) {
    return (
      <div class="stack">
        <div class="empty-state card">
          <h3>{t("live.noClass")}</h3>
          <p>{t("live.noClassBody")}</p>
          <a class="btn" href="/">{t("live.backToToday")}</a>
        </div>
      </div>
    );
  }

  // The gate, and it sits ahead of every branch below on purpose: the pulse
  // question, the quiz, and the reflection all hang off this screen, so gating
  // any one of them individually would leave the other two open.
  //
  // `checked_in` comes from the server, not from localStorage — a student on a
  // borrowed laptop or in private browsing has no stored join but does have an
  // attendance row, and only the server knows it. The matching refusals live in
  // course-pulse, course-activity-attempt and course-exit-ticket, so this is the
  // courteous message rather than the enforcement.
  if (view && !view.checked_in) {
    return (
      <LiveShell error={error}>
        <div class="empty-state card">
          <h3>{t("live.scanToJoin")}</h3>
          <p>{t("live.scanToJoinBody")}</p>
          <a class="btn" href="/">{t("live.backToToday")}</a>
        </div>
      </LiveShell>
    );
  }

  // Paused, not over. Ranked above every activity branch because while a class
  // is paused none of them can move: the server refuses a new question, and the
  // quiz and reflection belong to a class that has not finished. The poll keeps
  // running underneath, so the moment the professor resumes, the next question
  // lands here with nothing for the student to tap.
  if (view?.session_state === "paused") {
    return (
      <LiveShell error={error}>
        <div class="empty-state card">
          <h3>{t("live.pausedTitle")}</h3>
          <p>{t("live.pausedBody")}</p>
        </div>
      </LiveShell>
    );
  }

  // 1. A pulse question is on screen — highest priority, matches class rhythm.
  if (round) {
    return (
      <LiveShell error={error}>
        <div class="card">
          <div class="row" style="justify-content: space-between;">
            <p class="eyebrow">{t("live.answer")}</p>
            {round.state === "open" && !mine ? (
              <span class={`pill ${remaining > 0 ? "live" : "warn"}`}>
                {remaining > 0 ? t("run.timeLeft", { seconds: remaining }) : t("live.timeUp")}
              </span>
            ) : null}
          </div>

          <h2 style="font-size: 1.35rem;">
            {(useSpanish && round.text_es) || round.text}
          </h2>

          {round.state === "revealed" ? (
            <div class="stack">
              {mine ? (
                <p class={mine.is_correct ? "pulse-verdict good" : "pulse-verdict bad"}>
                  {mine.is_correct ? t("live.youWereRight") : t("live.youWereWrong")}
                  {typeof mine.points_awarded === "number"
                    ? ` · ${t("live.pointsEarned", { points: mine.points_awarded })}`
                    : ""}
                </p>
              ) : null}
              <p class="hint">{t("live.correctWas")}</p>
              {round.options
                .filter((option) => option.key === round.correct_key)
                .map((option) => (
                  <div class="pulse-choice correct">
                    {(useSpanish && option.text_es) || option.text}
                  </div>
                ))}
            </div>
          ) : mine ? (
            <div class="stack">
              <p class="pulse-verdict">{t("live.recorded")}</p>
              <p class="hint">{t("live.recordedBody")}</p>
            </div>
          ) : (
            <div class="stack">
              {displayOptions.map((option) => (
                <button
                  class="pulse-choice tappable"
                  type="button"
                  disabled={busy || remaining <= 0}
                  onClick={() => submit(option.key)}
                >
                  {(useSpanish && option.text_es) || option.text}
                </button>
              ))}
              {busy ? <p class="hint">{t("live.sending")}</p> : null}
              {remaining <= 0 ? <p class="hint">{t("live.timeUp")}</p> : null}
            </div>
          )}
        </div>
      </LiveShell>
    );
  }

  // 2. The end-of-class quiz is live — take it.
  if (view?.quiz.instance_id && view.quiz.state === "live") {
    return (
      <LiveShell error={error}>
        <div class="card">
          <QuizPlayer activityInstanceId={view.quiz.instance_id} />
        </div>
      </LiveShell>
    );
  }

  // 3. The quiz has closed and the reflection isn't in yet — write it.
  if (view?.quiz.instance_id && view.quiz.state === "closed" && view.reflection && !view.reflection.submitted && !reflectionDone) {
    return (
      <LiveShell error={error}>
        <div class="card">
          <Reflection
            classSessionId={sessionId}
            minWords={view.reflection.min_words}
            maxWords={view.reflection.max_words}
            onSubmitted={() => setReflectionDone(true)}
          />
        </div>
      </LiveShell>
    );
  }

  // 4. Reflection submitted, or nothing scheduled yet — done for this class.
  if (reflectionDone || view?.reflection?.submitted) {
    return (
      <LiveShell error={error}>
        <div class="empty-state card">
          <h3>{t("live.doneTitle")}</h3>
          <p>{t("live.doneBody")}</p>
          <a class="btn" href="/grades">{t("live.viewGrades")}</a>
        </div>
      </LiveShell>
    );
  }

  return (
    <LiveShell error={error}>
      <div class="empty-state card">
        <h3>{t("live.waitingTitle")}</h3>
        <p>{t("live.waitingBody")}</p>
      </div>
    </LiveShell>
  );
}
