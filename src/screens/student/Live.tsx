// In class — the student's live screen.
//
// A pure function of what the server says is happening: waiting → question →
// recorded → revealed. Students never navigate during class; the screen changes
// when the professor acts. Options are shuffled per student, so "pick number 2"
// means nothing to the person next to them.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { context } from "../../state/session";
import { t } from "../../i18n";
import { currentPulse, answerPulse, shuffleOptions, type StudentPulseView } from "../../api/pulse";

const POLL_MS = 3000;

export function Live() {
  const ctx = context.value;
  // The live session comes from whatever release is currently live for them.
  const sessionId = (ctx?.releases ?? []).find(
    (r) => r.class_session_id && ["live", "paused"].includes(r.session_state || "")
  )?.class_session_id
    ?? (ctx?.releases ?? []).find((r) => r.class_session_id)?.class_session_id
    ?? null;

  const [view, setView] = useState<StudentPulseView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
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
      // Keep the last known state on a network blip rather than blanking the screen.
      if (!view) setError(e instanceof Error ? e.message : null);
    }
  }

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

      {!round ? (
        <div class="empty-state card">
          <h3>{t("live.waitingTitle")}</h3>
          <p>{t("live.waitingBody")}</p>
        </div>
      ) : (
        <div class="card">
          <div class="row" style="justify-content: space-between;">
            <p class="eyebrow">{t("live.answer")}</p>
            {round.state === "open" && !mine ? (
              <span class={`pill ${remaining > 0 ? "live" : "warn"}`}>
                {remaining > 0 ? t("run.timeLeft", { seconds: remaining }) : t("live.timeUp")}
              </span>
            ) : null}
          </div>

          <h2 style="font-size: 1.35rem;">{round.text}</h2>

          {/* Revealed: show whether they were right, then the correct option. */}
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
                  <div class="pulse-choice correct">{option.text}</div>
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
                  {option.text}
                </button>
              ))}
              {busy ? <p class="hint">{t("live.sending")}</p> : null}
              {remaining <= 0 ? <p class="hint">{t("live.timeUp")}</p> : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
