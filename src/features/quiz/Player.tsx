// The end-of-class quiz, taken inside the student's live screen. Phone-first,
// ONE question on screen at a time, each with its own countdown — thirty
// seconds for almost everything, and forty-five for a question that simply
// takes longer to read. The server
// decides and sends the number with the question; this file holds no timing
// rule of its own — the carry-over (seconds saved on one question roll into
// the next, never past the budget's sixty-second ceiling) lives in budget.ts.
// When a question's timer runs out the player moves on by
// itself; there is no going back once a question has passed, matching how a
// live in-class quiz actually runs. Server-graded — the browser never learns
// which option is correct until after submit. Questions are pre-mixed across
// difficulty tiers by the server (course-activity-attempt); this component
// just presents them in the order it received them, each timed by its own
// duration.
import { useEffect, useRef, useState } from "preact/hooks";
import { t, lang, apiErrorText } from "../../i18n";
import { startQuizAttempt, submitQuizAttempt, reportProgress, type QuizQuestion, type SubmitAttemptResponse } from "../../api/quiz";
import type { MyRace } from "../../api/pulse";
import { clockText } from "./clock";
import { deadlines, positionAt, rebase } from "./budget";
import { PinataCard } from "./PinataCard";

// The server sends each question's own time. The fallback is the floor, never
// a table: if a stale deployment omits the field, a student gets the minimum
// the professor asked for rather than a number this file invented.
const FALLBACK_SECONDS = 30;

function secondsFor(question: QuizQuestion) {
  return Number(question.seconds) > 0 ? Number(question.seconds) : FALLBACK_SECONDS;
}

export function QuizPlayer({
  activityInstanceId,
  quizClosed,
  onFinished,
  myRace
}: {
  activityInstanceId: string;
  /**
   * The class poll has seen the instance flip to `closed`. It can learn this a
   * second or two before this player's own clock reaches the deadline, and
   * before the fix that added this prop, Live.tsx unmounted the player at that
   * moment — clearing the interval that was about to auto-submit and throwing
   * away the whole attempt, silently, for the students still working.
   */
  quizClosed: boolean;
  /** The player has nothing left to send. Live.tsx may take the screen back. */
  onFinished: () => void;
  /** The race card for a finished student's phone; null once the quiz closes. */
  myRace?: MyRace | null;
}) {
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
  const [t0, setT0] = useState<number | null>(null);
  const [racer, setRacer] = useState<{ name: string; emoji: string } | null>(null);
  const [instanceEndsAt, setInstanceEndsAt] = useState<number | null>(null);
  const startedAt = useRef(Date.now());
  const questionRef = useRef<HTMLHeadingElement | null>(null);
  const integrity = useRef({ focus_loss_count: 0, paste_count: 0, copy_count: 0 });
  // The one thing that can stop a double submit inside a single tick. `busy` is
  // state — it is not visible to the sibling effect that runs microseconds later
  // off the same stateRef snapshot. Reset only on failure, so a successful
  // submit stays latched for good.
  const submitting = useRef(false);
  // Separate from `submitting`, and not a second submit latch: this one only
  // makes sure Live.tsx is told exactly once that the player is done. Without
  // it, every re-render after a terminal state would fire the callback again.
  const finished = useRef(false);
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
          if (res.attempt.racer_name) {
            // The splash owns the clock: T0 is set when the student taps.
            setRacer({ name: res.attempt.racer_name, emoji: res.attempt.racer_emoji || "🎒" });
          } else {
            // Stale server without racer names — no splash, clock starts now.
            setT0(Date.now());
          }
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

  function reportFinished() {
    if (finished.current) return;
    finished.current = true;
    onFinished();
  }

  async function submitNow(finalAnswers: Record<string, string>) {
    if (!attemptId || !stateRef.current.questions) return;
    if (submitting.current) return;
    submitting.current = true;
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
      submitting.current = false;
    } finally {
      setBusy(false);
    }
  }

  function advance() {
    const { index: i, questions: qs, answers: a } = stateRef.current;
    if (!qs) return;
    if (i >= qs.length - 1) {
      // Same rule as the deadline effect: the server refuses an empty
      // submission, so a student who answered nothing must not be handed an
      // error for never having started.
      if (Object.keys(a).length === 0) {
        setResumed({ percent: null });
        return;
      }
      void submitNow(a);
      return;
    }
    const nextIndex = i + 1;
    // A tap before the deadline saved time; the budget decides how much of it
    // the next question may keep. A timeout never comes through here.
    setDl((prev) => (prev ? rebase(prev, qs.map(secondsFor), i, Date.now()) : prev));
    setIndex(nextIndex);
    ping(nextIndex);
  }

  function ping(position: number) {
    if (!attemptId) return;
    const answered = Object.keys(stateRef.current.answers).length;
    reportProgress({ attempt_id: attemptId, position, answered }).catch(() => {
      /* fire-and-forget: the race is cosmetic, the quiz is not */
    });
  }

  function onLetsGo() {
    setT0(Date.now());
    ping(0);
  }

  // Deadlines are state, not derived: an early answer rebases the schedule so
  // the carried seconds meet the sixty-second ceiling. Initialized once, the
  // moment the clock has a start and the questions have arrived.
  const [dl, setDl] = useState<number[] | null>(null);
  useEffect(() => {
    if (t0 === null || !questions) return;
    setDl((prev) => prev ?? deadlines(questions.map(secondsFor), t0));
  }, [t0, questions]);

  // The budget clock. One effect owns both moves: skip forward to wherever
  // the running budget says the student should be (a phone asleep through
  // three questions lands on the right one in a single tick), and submit
  // when the final deadline passes.
  useEffect(() => {
    const { index: i, questions: qs, answers: a, busy: isBusy, result: hasResult, resumed: hasResumed, error: hasError } = stateRef.current;
    if (!dl || !qs || hasResult || hasResumed || isBusy || hasError) return;
    if (now >= dl[dl.length - 1] && i >= qs.length - 1) {
      if (Object.keys(a).length === 0) {
        setResumed({ percent: null });
        return;
      }
      void submitNow(a);
      return;
    }
    const target = positionAt(dl, now);
    if (target > i) {
      setIndex(target);
      ping(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, dl === null]);

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

  // The handoff. Two clocks are racing at the deadline: this player's own
  // 1-second interval, which fires 0–1s late, and the class poll, which learns
  // the instance closed 0–3s late plus a round trip. The poll wins often enough
  // — roughly one student in eight or ten of those still working — and when it
  // did, Live.tsx unmounted this component and the attempt was never sent at
  // all. No error, no rank, no quiz mark, and nobody finds out.
  //
  // So the player is no longer allowed to be surprised by the close. It is told,
  // and it sends what the student has straight away, landing inside the server's
  // sixty-second grace instead of waiting for its own tick.
  useEffect(() => {
    if (!quizClosed) return;
    const { answers: a, busy: isBusy, result: hasResult, resumed: hasResumed } = stateRef.current;
    // Already terminal, or a submit is in flight — the same latch the deadline
    // path uses, deliberately not a second one.
    if (hasResult || hasResumed || isBusy || submitting.current) return;
    // Still loading. The deps below bring us back the moment the attempt lands.
    if (!attemptId || !questions) return;
    // A student who answered nothing submits nothing: the server refuses an
    // empty submission, so this is the finished state rather than an error on
    // the phone of someone who never started.
    if (Object.keys(a).length === 0) {
      setResumed({ percent: null });
      return;
    }
    void submitNow(a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizClosed, attemptId, questions]);

  // Terminal in either direction — graded, or finished with nothing to grade.
  useEffect(() => {
    if (result || resumed) reportFinished();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, resumed]);

  // The quiz is over and this player never got an attempt to submit: the start
  // call failed, most likely because the server had already closed the instance
  // by the time it arrived. There is nothing to send and nothing worth retrying,
  // so hand the screen back rather than leaving the student on a Try again
  // button that cannot work.
  useEffect(() => {
    if (quizClosed && error && !questions) reportFinished();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizClosed, error, questions]);

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

  // The racer splash: the identity is secret, so it shows once, full screen,
  // and the clock does not run until the student says go.
  if (racer && t0 === null && !resumed && !result) {
    return (
      <div class="stack quiz-splash">
        <p class="eyebrow">{t("quiz.splashEyebrow")}</p>
        <p class="quiz-splash-racer"><span aria-hidden="true">{racer.emoji}</span> {racer.name}</p>
        <p class="hint">{t("quiz.splashHint")}</p>
        <button class="btn primary" type="button" onClick={onLetsGo}>{t("quiz.letsGo")}</button>
      </div>
    );
  }

  if (resumed) {
    return (
      <div class="stack">
        <p class="eyebrow">{t("quiz.done")}</p>
        {resumed.percent !== null ? <span class="big-number">{resumed.percent}%</span> : null}
        <p class="hint">{resumed.percent !== null ? t("quiz.doneBody") : t("quiz.resumedNoScore")}</p>
        {myRace && attemptId ? <PinataCard race={myRace} attemptId={attemptId} /> : null}
      </div>
    );
  }

  if (result) {
    return (
      <div class="stack">
        <p class="eyebrow">{t("quiz.done")}</p>
        <span class="big-number">{result.percent}%</span>
        <p class="hint">{t("quiz.doneBody")}</p>
        {myRace && attemptId ? <PinataCard race={myRace} attemptId={attemptId} /> : null}
      </div>
    );
  }

  const remaining = dl ? Math.max(0, Math.round((dl[index] - now) / 1000)) : null;
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
