// The end-of-class quiz, taken inside the student's live screen. Phone-first,
// one question per screen, server-graded — the browser never learns which
// option is correct until after submit. Questions are pre-mixed across
// difficulty tiers by the server (course-activity-attempt); this component
// just presents them in the order it received them.
import { useEffect, useRef, useState } from "preact/hooks";
import { t, lang } from "../../i18n";
import { startQuizAttempt, submitQuizAttempt, type QuizQuestion, type SubmitAttemptResponse } from "../../api/quiz";

export function QuizPlayer({ activityInstanceId }: { activityInstanceId: string }) {
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [endsAt, setEndsAt] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<SubmitAttemptResponse["score"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const startedAt = useRef(Date.now());
  const integrity = useRef({ focus_loss_count: 0, paste_count: 0, copy_count: 0 });

  useEffect(() => {
    startQuizAttempt(activityInstanceId)
      .then((res) => {
        setAttemptId(res.attempt.id);
        setQuestions(res.questions);
        setEndsAt(res.activity_instance.ends_at);
        if (res.attempt.submitted_at) {
          // Resuming a page reload after already submitting.
          setResult({ raw: 0, total: 0, percent: 0, speed_bonus: 0, final: 0 });
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not start the quiz."));

    const onBlur = () => { integrity.current.focus_loss_count += 1; };
    const onPaste = () => { integrity.current.paste_count += 1; };
    const onCopy = () => { integrity.current.copy_count += 1; };
    window.addEventListener("blur", onBlur);
    window.addEventListener("paste", onPaste);
    window.addEventListener("copy", onCopy);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("copy", onCopy);
    };
  }, [activityInstanceId]);

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, []);

  async function onSubmit() {
    if (!attemptId || !questions) return;
    setBusy(true);
    setError(null);
    try {
      const response = await submitQuizAttempt({
        attempt_id: attemptId,
        responses: questions.map((q) => ({ question_id: q.id, selected_option_id: answers[q.id] || "" })).filter((r) => r.selected_option_id),
        integrity: { ...integrity.current, elapsed_ms: Date.now() - startedAt.current, user_agent: navigator.userAgent.slice(0, 200) }
      });
      setResult(response.score);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit the quiz.");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p class="error-text" role="alert">{error}</p>;
  if (!questions) return <p class="hint">{t("quiz.loading")}</p>;

  if (result) {
    return (
      <div class="stack">
        <p class="eyebrow">{t("quiz.done")}</p>
        <span class="big-number">{result.percent}%</span>
        <p class="hint">{t("quiz.doneBody")}</p>
      </div>
    );
  }

  const remaining = endsAt ? Math.max(0, Math.round((new Date(endsAt).getTime() - now) / 1000)) : null;
  const current = questions[index];
  const answered = Object.keys(answers).length;

  return (
    <div class="stack">
      <div class="row" style="justify-content: space-between;">
        <p class="eyebrow">{t("quiz.questionN", { n: index + 1, total: questions.length })}</p>
        {remaining !== null ? (
          <span class={`pill ${remaining > 0 ? "live" : "warn"}`}>
            {remaining > 0 ? t("run.timeLeft", { seconds: remaining }) : t("live.timeUp")}
          </span>
        ) : null}
      </div>

      <h2 style="font-size: 1.3rem;">{(lang.value === "es" && current.prompt_es) || current.prompt}</h2>

      <div class="stack" style="gap: 0.5rem;">
        {current.options.map((option) => (
          <button
            class={`pulse-choice tappable${answers[current.id] === option.id ? " selected" : ""}`}
            type="button"
            onClick={() => setAnswers((prev) => ({ ...prev, [current.id]: option.id }))}
          >
            {(lang.value === "es" && option.option_text_es) || option.option_text}
          </button>
        ))}
      </div>

      <div class="row" style="justify-content: space-between;">
        <button class="btn" type="button" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
          {t("quiz.previous")}
        </button>
        {index < questions.length - 1 ? (
          <button class="btn primary" type="button" disabled={!answers[current.id]} onClick={() => setIndex((i) => i + 1)}>
            {t("quiz.next")}
          </button>
        ) : (
          <button class="btn primary" type="button" disabled={busy || answered === 0} onClick={onSubmit}>
            {busy ? t("quiz.submitting") : t("quiz.submit")}
          </button>
        )}
      </div>
      <p class="hint">{t("quiz.answeredOf", { answered, total: questions.length })}</p>
    </div>
  );
}
