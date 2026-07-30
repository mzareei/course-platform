// The end-of-class step in Run Class: start the mixed-difficulty quiz drawn
// from the lecture's bank, watch submissions arrive, close it, then read every
// reflection in one place. No typing — the quiz question mix and count are
// server-decided; the instructor only starts and stops.
//
// Three things are tracked independently on purpose:
//   - the ACTIVE quiz (if one is running right now),
//   - the results of the last FINISHED quiz,
//   - the session's reflections.
// Folding "finished" into "active" is what previously made "Start the quiz"
// disappear permanently after the first quiz of a session was closed. Starting
// another quiz has to stay possible for the whole class.
import { useEffect, useRef, useState } from "preact/hooks";
import { t } from "../../i18n";
import {
  startClassQuiz, closeClassQuiz, classQuizStatus, currentClassQuiz,
  type QuizStatus
} from "../../api/quiz";
import { classReflections, type ClassReflection } from "../../api/reflection";

const POLL_MS = 4000;

export function EndOfClass({ sessionId, contentSlug }: { sessionId: string; contentSlug: string }) {
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [status, setStatus] = useState<QuizStatus | null>(null);
  const [lastResult, setLastResult] = useState<QuizStatus | null>(null);
  const [reflections, setReflections] = useState<ClassReflection[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const poll = useRef<number | undefined>(undefined);

  // Recover after a page reload: adopt a running quiz, and separately load the
  // score of the last closed one so the class average survives a refresh.
  useEffect(() => {
    let cancelled = false;
    currentClassQuiz({ class_session_id: sessionId, content_slug: contentSlug })
      .then(async (res) => {
        if (cancelled) return;
        if (res.instance_id) {
          setInstanceId(res.instance_id);
        } else if (res.last_closed_instance_id) {
          const done = await classQuizStatus(res.last_closed_instance_id).catch(() => null);
          if (done && !cancelled) setLastResult(done);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sessionId, contentSlug]);

  // Live counts while a quiz is running. When it turns out to be closed
  // (someone closed it elsewhere, or the poll catches the transition), retire
  // it into lastResult so the start control comes back.
  useEffect(() => {
    clearInterval(poll.current);
    if (!instanceId) return;
    const tick = () =>
      classQuizStatus(instanceId)
        .then((fresh) => {
          if (fresh.state === "closed") {
            setLastResult(fresh);
            setStatus(null);
            setInstanceId(null);
          } else {
            setStatus(fresh);
          }
        })
        .catch(() => {});
    tick();
    poll.current = setInterval(tick, POLL_MS) as unknown as number;
    return () => clearInterval(poll.current);
  }, [instanceId]);

  // Reflections belong to the class session, not to any one quiz, and keep
  // arriving during the post-class grace window — so poll them throughout
  // rather than only after a quiz closes.
  useEffect(() => {
    const tick = () => classReflections(sessionId).then((r) => setReflections(r.reflections)).catch(() => {});
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [sessionId]);

  async function onStart() {
    setBusy(true);
    setError(null);
    try {
      const { instance_id } = await startClassQuiz({ class_session_id: sessionId, content_slug: contentSlug });
      setLastResult(null);
      setStatus(null);
      setInstanceId(instance_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("endOfClass.startFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onClose() {
    if (!instanceId) return;
    setBusy(true);
    setError(null);
    try {
      await closeClassQuiz(instanceId);
      const fresh = await classQuizStatus(instanceId).catch(() => null);
      if (fresh) setLastResult(fresh);
      setStatus(null);
      setInstanceId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("endOfClass.closeFailed"));
    } finally {
      setBusy(false);
    }
  }

  const running = Boolean(instanceId);

  return (
    <section class="card checkpoint-final-quiz">
      <h2>{t("endOfClass.title")}</h2>
      <p class="hint">{t("endOfClass.body")}</p>
      {error ? <p class="error-text" role="alert">{error}</p> : null}

      {running ? (
        <div class="stack">
          <p class="big-number">
            {status?.submitted ?? 0}
            <span style="font-size:1rem;font-weight:600;color:var(--text-muted);"> / {status?.enrolled ?? "…"}</span>
          </p>
          <p class="hint">{t("endOfClass.submittedOf", { started: status?.started ?? 0 })}</p>
          <button class="btn" type="button" disabled={busy} onClick={onClose}>
            {busy ? t("endOfClass.closing") : t("endOfClass.close")}
          </button>
        </div>
      ) : (
        <div class="stack">
          {lastResult ? (
            <div class="row">
              <span class="pill hidden">{t("endOfClass.closed")}</span>
              {typeof lastResult.average_score === "number" ? (
                <span class="hint">{t("endOfClass.average", { score: lastResult.average_score })}</span>
              ) : null}
            </div>
          ) : null}
          <button class="btn primary" type="button" disabled={busy} onClick={onStart}>
            {busy
              ? t("endOfClass.starting")
              : lastResult
                ? t("endOfClass.startAnother")
                : t("endOfClass.start")}
          </button>
        </div>
      )}

      <h3>{t("endOfClass.reflections")}</h3>
      {reflections === null ? (
        <p class="hint">{t("endOfClass.loadingReflections")}</p>
      ) : reflections.length === 0 ? (
        <p class="hint">{t("endOfClass.noReflectionsYet")}</p>
      ) : (
        <div class="stack" style="gap: 0.6rem;">
          {reflections.map((r) => (
            <div class="card muted" style="padding: 0.7rem 0.85rem;">
              <p class="hint" style="font-weight: 650; color: var(--text);">{r.name}</p>
              <p>{r.one_thing}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
