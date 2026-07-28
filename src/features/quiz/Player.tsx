// The end-of-class quiz, taken inside the student's live screen. Phone-first,
// ONE question on screen at a time, each with its own countdown — short easy
// questions get 20s, harder ones get more room to think, up to 45s. When a
// question's timer runs out the player moves on by itself; there is no going
// back once a question has passed, matching how a live in-class quiz actually
// runs. Server-graded — the browser never learns which option is correct
// until after submit. Questions are pre-mixed across difficulty tiers by the
// server (course-activity-attempt); this component just presents them in the
// order it received them, each timed by its own difficulty.
import { useEffect, useRef, useState } from "preact/hooks";
import { t, lang } from "../../i18n";
import { startQuizAttempt, submitQuizAttempt, type QuizQuestion, type SubmitAttemptResponse } from "../../api/quiz";

const SECONDS_BY_DIFFICULTY: Record<string, number> = { easy: 20, medium: 30, hard: 45 };
const DEFAULT_SECONDS = 30;

function secondsFor(question: QuizQuestion) {
  return SECONDS_BY_DIFFICULTY[question.difficulty] || DEFAULT_SECONDS;
}

export function QuizPlayer({ activityInstanceId }: { activityInstanceId: string }) {
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<SubmitAttemptResponse["score"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [questionDeadline, setQuestionDeadline] = useState<number | null>(null);
  const startedAt = useRef(Date.now());
  const integrity = useRef({ focus_loss_count: 0, paste_count: 0, copy_count: 0 });
  // Refs mirror the latest state so the auto-advance effect (keyed only on the
  // clock tick) always reads current values without re-subscribing every render.
  const stateRef = useRef({ index: 0, questions: null as QuizQuestion[] | null, answers: {} as Record<string, string>, busy: false, result: null as SubmitAttemptResponse["score"] | null });
  stateRef.current = { index, questions, answers, busy, result };

  useEffect(() => {
    startQuizAttempt(activityInstanceId)
      .then((res) => {
        setAttemptId(res.attempt.id);
        setQuestions(res.questions);
        if (res.attempt.submitted_at) {
          // Resuming a page reload after already submitting.
          setResult({ raw: 0, total: 0, percent: 0, speed_bonus: 0, final: 0 });
        } else if (res.questions.length) {
          setQuestionDeadline(Date.now() + secondsFor(res.questions[0]) * 1000);
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

  async function submitNow(finalAnswers: Record<string, string>) {
    if (!attemptId || !stateRef.current.questions) return;
    setBusy(true);
    setError(null);
    try {
      const response = await submitQuizAttempt({
        attempt_id: attemptId,
        responses: stateRef.current.questions
          .map((q) => ({ question_id: q.id, selected_option_id: finalAnswers[q.id] || "" }))
          .filter((r) => r.selected_option_id),
        integrity: { ...integrity.current, elapsed_ms: Date.now() - startedAt.current, user_agent: navigator.userAgent.slice(0, 200) }
      });
      setResult(response.score);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit the quiz.");
    } finally {
      setBusy(false);
    }
  }

  function advance() {
    const { index: i, questions: qs, answers: a } = stateRef.current;
    if (!qs) return;
    if (i >= qs.length - 1) {
      void submitNow(a);
      return;
    }
    const nextIndex = i + 1;
    setIndex(nextIndex);
    setQuestionDeadline(Date.now() + secondsFor(qs[nextIndex]) * 1000);
  }

  // Auto-advance (or auto-submit on the last question) the moment a
  // question's own timer expires — the whole point of a live, timed,
  // one-after-another quiz instead of a browse-at-your-own-pace one.
  useEffect(() => {
    const { busy: isBusy, result: hasResult } = stateRef.current;
    if (!questionDeadline || hasResult || isBusy) return;
    if (now >= questionDeadline) advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, questionDeadline]);

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

  const remaining = questionDeadline ? Math.max(0, Math.round((questionDeadline - now) / 1000)) : null;
  const current = questions[index];
  const answered = Object.keys(answers).length;
  const difficultyLabel = t(`quiz.difficulty.${current.difficulty}` as "quiz.difficulty.easy");

  return (
    <div class="stack">
      <div class="row" style="justify-content: space-between;">
        <p class="eyebrow">{t("quiz.questionN", { n: index + 1, total: questions.length })}</p>
        <div class="row" style="gap: 0.4rem;">
          <span class="pill hidden">{difficultyLabel}</span>
          {remaining !== null ? (
            <span class={`pill ${remaining > 5 ? "live" : "warn"}`}>
              {remaining > 0 ? t("run.timeLeft", { seconds: remaining }) : t("quiz.timeUpAdvancing")}
            </span>
          ) : null}
        </div>
      </div>

      <h2 style="font-size: 1.3rem;">{(lang.value === "es" && current.prompt_es) || current.prompt}</h2>

      <div class="stack" style="gap: 0.5rem;">
        {current.options.map((option) => (
          <button
            class={`pulse-choice tappable${answers[current.id] === option.id ? " selected" : ""}`}
            type="button"
            disabled={busy}
            onClick={() => setAnswers((prev) => ({ ...prev, [current.id]: option.id }))}
          >
            {(lang.value === "es" && option.option_text_es) || option.option_text}
          </button>
        ))}
      </div>

      <div class="row" style="justify-content: flex-end;">
        {index < questions.length - 1 ? (
          <button class="btn primary" type="button" disabled={!answers[current.id] || busy} onClick={advance}>
            {t("quiz.next")}
          </button>
        ) : (
          <button class="btn primary" type="button" disabled={busy || answered === 0} onClick={() => submitNow(answers)}>
            {busy ? t("quiz.submitting") : t("quiz.submit")}
          </button>
        )}
      </div>
      <p class="hint">{t("quiz.answeredOf", { answered, total: questions.length })}</p>
      <p class="hint">{t("quiz.oneAtATime")}</p>
    </div>
  );
}
