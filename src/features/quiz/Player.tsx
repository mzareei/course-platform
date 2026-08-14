// The end-of-class quiz, taken inside the student's live screen. Phone-first,
// ONE question on screen at a time, each with its own countdown — thirty
// seconds for almost everything, and forty-five for a question that simply
// takes longer to read. The server
// decides and sends the number with the question; this file holds no timing
// rule of its own. When a question's timer runs out the player moves on by
// itself; there is no going back once a question has passed, matching how a
// live in-class quiz actually runs. Server-graded — the browser never learns
// which option is correct until after submit. Questions are pre-mixed across
// difficulty tiers by the server (course-activity-attempt); this component
// just presents them in the order it received them, each timed by its own
// duration.
import { useEffect, useRef, useState } from "preact/hooks";
import { t, lang, apiErrorText } from "../../i18n";
import { startQuizAttempt, submitQuizAttempt, type QuizQuestion, type SubmitAttemptResponse } from "../../api/quiz";
import { clockText } from "./clock";

// The server sends each question's own time. The fallback is the floor, never
// a table: if a stale deployment omits the field, a student gets the minimum
// the professor asked for rather than a number this file invented.
const FALLBACK_SECONDS = 30;

function secondsFor(question: QuizQuestion) {
  return Number(question.seconds) > 0 ? Number(question.seconds) : FALLBACK_SECONDS;
}

export function QuizPlayer({ activityInstanceId }: { activityInstanceId: string }) {
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<SubmitAttemptResponse["score"] | null>(null);
  const [resumed, setResumed] = useState<{ percent: number | null } | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [questionDeadline, setQuestionDeadline] = useState<number | null>(null);
  const [instanceEndsAt, setInstanceEndsAt] = useState<number | null>(null);
  const startedAt = useRef(Date.now());
  const questionRef = useRef<HTMLHeadingElement | null>(null);
  const integrity = useRef({ focus_loss_count: 0, paste_count: 0, copy_count: 0 });
  // Refs mirror the latest state so the auto-advance effect (keyed only on the
  // clock tick) always reads current values without re-subscribing every render.
  const stateRef = useRef({ index: 0, questions: null as QuizQuestion[] | null, answers: {} as Record<string, string>, busy: false, result: null as SubmitAttemptResponse["score"] | null, resumed: null as { percent: number | null } | null, error: null as string | null });
  stateRef.current = { index, questions, answers, busy, result, resumed, error };

  useEffect(() => {
    setError(null);
    startQuizAttempt(activityInstanceId)
      .then((res) => {
        setAttemptId(res.attempt.id);
        setQuestions(res.questions);
        setInstanceEndsAt(
          res.activity_instance?.ends_at
            ? new Date(res.activity_instance.ends_at).getTime()
            : null
        );
        if (res.attempt.submitted_at) {
          // Resuming after already submitting: show the real graded score if
          // the server sent one, and never a fabricated 0%.
          setResumed({ percent: typeof res.attempt.score_percent === "number" ? res.attempt.score_percent : null });
        } else if (res.questions.length) {
          setQuestionDeadline(Date.now() + secondsFor(res.questions[0]) * 1000);
        }
      })
      .catch((e) => setError(apiErrorText(e, "quiz.startFailed")));
  }, [activityInstanceId, loadAttempt]);

  // The integrity listeners live in their own mount effect so a load retry
  // never re-subscribes (and never resets) them.
  useEffect(() => {
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
  }, []);

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, []);

  // Every advance — tap or timeout — announces the new question to a screen
  // reader and scrolls it into view. Not on first paint (index 0).
  useEffect(() => {
    if (index > 0) questionRef.current?.focus();
  }, [index]);

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
      setError(apiErrorText(e, "quiz.submitFailed"));
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
    const { busy: isBusy, result: hasResult, resumed: hasResumed, error: hasError } = stateRef.current;
    // hasError: a failed auto-submit must not re-fire every clock tick — the
    // student retries from the visible Submit button instead.
    if (!questionDeadline || hasResult || hasResumed || isBusy || hasError) return;
    if (now >= questionDeadline) advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, questionDeadline]);

  // The whole quiz has a deadline, not just each question. When it passes the
  // player stops feeding new questions and sends what the student has, landing
  // inside the server's sixty-second grace.
  //
  // A student who answered nothing submits nothing: the server refuses an empty
  // submission ("At least one response is required"), so auto-submitting a
  // blank attempt would put an error on the phone of someone who never started.
  useEffect(() => {
    const { answers: a, busy: isBusy, result: hasResult, resumed: hasResumed, error: hasError } = stateRef.current;
    if (!instanceEndsAt || hasResult || hasResumed || isBusy || hasError) return;
    if (now < instanceEndsAt) return;
    if (Object.keys(a).length === 0) {
      setResumed({ percent: null });
      return;
    }
    void submitNow(a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, instanceEndsAt]);

  if (error && !questions) {
    // The quiz never loaded — a dead end mid-class without a way to retry.
    return (
      <div class="stack">
        <p class="error-text" role="alert">{error}</p>
        <div class="row">
          <button class="btn primary" type="button" onClick={() => setLoadAttempt((n) => n + 1)}>
            {t("app.tryAgain")}
          </button>
          <a class="btn quiet" href="/">{t("live.backToToday")}</a>
        </div>
      </div>
    );
  }
  if (!questions) return <p class="hint">{t("quiz.loading")}</p>;

  if (resumed) {
    return (
      <div class="stack">
        <p class="eyebrow">{t("quiz.done")}</p>
        {resumed.percent !== null ? <span class="big-number">{resumed.percent}%</span> : null}
        <p class="hint">{resumed.percent !== null ? t("quiz.doneBody") : t("quiz.resumedNoScore")}</p>
      </div>
    );
  }

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
          {instanceEndsAt !== null ? (
            <span class="pill hidden">
              {t("quiz.totalLeft", { time: clockText(Math.max(0, instanceEndsAt - now)) })}
            </span>
          ) : null}
        </div>
      </div>

      <h2 ref={questionRef} tabindex={-1} style="font-size: 1.3rem;">{(lang.value === "es" && current.prompt_es) || current.prompt}</h2>

      <div class="stack" style="gap: 0.5rem;">
        {current.options.map((option) => (
          <button
            key={option.id}
            class={`pulse-choice tappable${answers[current.id] === option.id ? " selected" : ""}`}
            type="button"
            disabled={busy}
            onClick={() => setAnswers((prev) => ({ ...prev, [current.id]: option.id }))}
          >
            {(lang.value === "es" && option.option_text_es) || option.option_text}
          </button>
        ))}
      </div>

      {/* A submit failure shows here, inside the question view, so the Submit
          button stays on screen and pressing it again is the retry. */}
      {error ? <p class="error-text" role="alert">{error}</p> : null}

      <div class="row" style="justify-content: flex-end;">
        {index < questions.length - 1 ? (
          <button class="btn primary" type="button" disabled={!answers[current.id] || busy} onClick={advance}>
            {t("quiz.next")}
          </button>
        ) : (
          <button class={`btn primary${busy ? " loading" : ""}`} type="button" disabled={busy || answered === 0} aria-busy={busy} onClick={() => submitNow(answers)}>
            {busy ? t("quiz.submitting") : t("quiz.submit")}
          </button>
        )}
      </div>
      <p class="hint">{t("quiz.answeredOf", { answered, total: questions.length })}</p>
      <p class="hint">{t("quiz.oneAtATime")}</p>
    </div>
  );
}
