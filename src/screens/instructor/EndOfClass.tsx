// The end-of-class step in Run Class: start the mixed-difficulty quiz drawn
// from the lecture's bank, watch submissions arrive, close it, then read every
// reflection in one place. No typing — the quiz question mix and count are
// server-decided; the instructor only starts and stops.
import { useEffect, useRef, useState } from "preact/hooks";
import { t } from "../../i18n";
import {
  startClassQuiz, closeClassQuiz, classQuizStatus,
  type QuizStatus
} from "../../api/quiz";
import { classReflections, type ClassReflection } from "../../api/reflection";

const POLL_MS = 4000;

export function EndOfClass({ sessionId, contentSlug }: { sessionId: string; contentSlug: string }) {
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [status, setStatus] = useState<QuizStatus | null>(null);
  const [reflections, setReflections] = useState<ClassReflection[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const poll = useRef<number | undefined>(undefined);

  useEffect(() => {
    clearInterval(poll.current);
    if (!instanceId) return;
    const tick = () => classQuizStatus(instanceId).then(setStatus).catch(() => {});
    tick();
    poll.current = setInterval(tick, POLL_MS) as unknown as number;
    return () => clearInterval(poll.current);
  }, [instanceId]);

  useEffect(() => {
    if (status?.state !== "closed") return;
    classReflections(sessionId).then((r) => setReflections(r.reflections)).catch(() => {});
    const tick = () => classReflections(sessionId).then((r) => setReflections(r.reflections)).catch(() => {});
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [status?.state, sessionId]);

  async function onStart() {
    setBusy(true);
    setError(null);
    try {
      const { instance_id } = await startClassQuiz({ class_session_id: sessionId, content_slug: contentSlug });
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
      const fresh = await classQuizStatus(instanceId);
      setStatus(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("endOfClass.closeFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="card">
      <h2>{t("endOfClass.title")}</h2>
      <p class="hint">{t("endOfClass.body")}</p>
      {error ? <p class="error-text" role="alert">{error}</p> : null}

      {!instanceId ? (
        <button class="btn primary" type="button" disabled={busy} onClick={onStart}>
          {busy ? t("endOfClass.starting") : t("endOfClass.start")}
        </button>
      ) : status?.state !== "closed" ? (
        <div class="stack">
          <p class="big-number">{status?.submitted ?? 0}<span style="font-size:1rem;font-weight:600;color:var(--text-muted);"> / {status?.enrolled ?? "…"}</span></p>
          <p class="hint">{t("endOfClass.submittedOf", { started: status?.started ?? 0 })}</p>
          <button class="btn" type="button" disabled={busy} onClick={onClose}>
            {busy ? t("endOfClass.closing") : t("endOfClass.close")}
          </button>
        </div>
      ) : (
        <div class="stack">
          <div class="row">
            <span class="pill hidden">{t("endOfClass.closed")}</span>
            {typeof status?.average_score === "number" ? (
              <span class="hint">{t("endOfClass.average", { score: status.average_score })}</span>
            ) : null}
          </div>

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
        </div>
      )}
    </div>
  );
}
