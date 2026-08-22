// The end-of-class quiz, taken inside the student's live screen. Phone-first,
// ONE question on screen at a time — but the clock is the ROOM's, not this
// phone's.
//
// It used to be this phone's. Every student's countdown started when they
// tapped "Let's go", so no two phones were ever on the same question, nobody
// ever had a spare second to look up, and the room's screen played to an
// audience of one. The 2026-08-20 class run is what proved it. The activity
// instance now publishes one schedule — round k answers for its window, then
// the whole room breaks — and this component only renders what the server
// says: which round it is, and the absolute instant its window closes.
//
// So there is no Next button and no Submit button. The room advances, and the
// room ends the quiz. What the student does is tap an option, and every tap
// pings the server, which is no longer cosmetic: the grade is computed from
// the server's own record of what it was pinged, not from the submit payload.
//
// The ten-second break is the point of the whole design. The phone shows the
// student their own result, then sends their eyes to the screen. Server-graded
// throughout — the browser learns which option was correct only in the break
// after that round's answers have stopped being accepted.
import { useEffect, useRef, useState } from "preact/hooks";
import { t, lang, apiErrorText } from "../../i18n";
import { startQuizAttempt, submitQuizAttempt, reportProgress, type QuizQuestion, type SubmitAttemptResponse } from "../../api/quiz";
import type { MyRace, PulseQuizRound } from "../../api/pulse";
import { clockText } from "./clock";
import { remainingMs, isBreak } from "./rounds";
import { PinataCard } from "./PinataCard";
import { ReviewList } from "./ReviewList";

// How long to wait before re-sending a tap that never left the phone, and how
// many times. NOT a quiz duration — the quiz's own timings are the server's and
// arrive as absolute timestamps. This is the gap between two attempts at one
// HTTP request, and the only thing that bounds it is the round's own deadline,
// which the server sent.
const PING_RETRY_GAP_MS = 400;
const PING_RETRY_LIMIT = 2;

export function QuizPlayer({
  activityInstanceId,
  quizClosed,
  onFinished,
  myRace,
  round
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
  /**
   * The room's round, straight from the class poll. Null only while a stale
   * backend is deployed without the schedule, or for the instant a poll fails.
   */
  round: PulseQuizRound | null;
}) {
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  // Which question is on screen. The room owns this — the effect below copies
  // the round index across — and it is state rather than a plain read of
  // `round` so that a poll blinking to null cannot throw a student back to
  // question one on a request that merely timed out.
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<SubmitAttemptResponse["score"] | null>(null);
  // question id -> correct option id, straight from this submit's own grading.
  // Only ever set alongside `result`, which is why the review list has no
  // fallback for a resumed attempt below: resuming never calls submit_attempt
  // again, so there is never a grading pass here to have set this from.
  //
  // `null` means "no submit response yet" and is what gates the review list
  // below — deliberately NOT `response.correct || {}`. `||` treats an empty
  // object as a substitute for a missing field, and an empty object is exactly
  // what a frontend deployed ahead of an un-redeployed course-activity-attempt
  // would get back (this repo's edge functions do not deploy on push; the
  // frontend does). `{}` is truthy, so a naive render guard would pass and
  // ReviewList would mark every question ❌ regardless of what was chosen —
  // the same failure shape the "no review on resume" decision below exists to
  // avoid, reintroduced through the one path that decision didn't cover.
  const [correctMap, setCorrectMap] = useState<Record<string, string> | null>(null);
  // question id -> explanation, in both languages. Never present on the
  // `questions` state itself — start_attempt's payload carries no explanation
  // field at all (see the comment on QuizQuestion.explanation in
  // src/api/quiz.ts) — so this is merged onto a copy of `questions` only for
  // the review list, only after a submit response has actually arrived.
  const [explanations, setExplanations] = useState<Record<string, { explanation: string | null; explanation_es: string | null }> | null>(null);
  const [resumed, setResumed] = useState<{ percent: number | null } | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [racer, setRacer] = useState<{ name: string; emoji: string } | null>(null);
  // The student has tapped through the racer splash. It gates nothing but the
  // splash itself: the room's schedule runs whether this phone has tapped or
  // not, so a student who taps thirty seconds into round three lands in round
  // three with whatever is left of it.
  const [joined, setJoined] = useState(false);
  // The first round this phone was actually showing. A student who taps "Let's
  // go" halfway through the quiz has not played the rounds behind them, and the
  // break must not hand them a verdict on a question that was never on screen.
  const joinedAtRound = useRef(0);
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
  // Refs mirror the latest state so the effects (keyed only on the clock tick
  // or on the round) always read current values without re-subscribing every
  // render.
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
          // Everything the student already chose comes back from the server —
          // a kick, a reload or a re-sign-in resumes in place. The position
          // does not: the room says which round it is, and this phone's
          // furthest-reached question no longer has a vote.
          setAnswers(res.attempt.progress_answers || {});
          if (res.attempt.clock_t0) {
            // clock_t0 no longer anchors a countdown. It survives as the
            // record that this student already tapped, so a phone that
            // reloads mid-quiz is not handed the racer splash a second time.
            setJoined(true);
          } else if (res.attempt.racer_name) {
            setRacer({ name: res.attempt.racer_name, emoji: res.attempt.racer_emoji || "🎒" });
          } else {
            // Stale server without racer names — there is no splash to show.
            setJoined(true);
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

  // Every advance announces the new question to a screen reader and scrolls it
  // into view. Not on first paint (index 0).
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
        // Every dealt question is submitted, answered or not. A question the
        // student never reached is a question they got wrong, and the grade has
        // to say so — filtering the blanks out is what made five-of-ten with
        // four right score 80% instead of 40%.
        responses: stateRef.current.questions
          .map((q) => ({ question_id: q.id, selected_option_id: finalAnswers[q.id] || "" })),
        integrity: { ...integrity.current, elapsed_ms: Date.now() - startedAt.current, user_agent: navigator.userAgent.slice(0, 200) }
      });
      setResult(response.score);
      // `?? null`, not `|| {}` — see the comment on the `correctMap` state
      // above. An empty object here must read as "nothing to show", not as
      // legitimate (empty) grading data.
      setCorrectMap(response.correct ?? null);
      setExplanations(response.explanations ?? null);
    } catch (e) {
      setError(apiErrorText(e, "quiz.submitFailed"));
      submitting.current = false;
      // The submit did not land; leave the server's stored copy complete so a
      // retry or a resume has everything. This is NOT a recovery for a tap
      // whose own ping was dropped: by the time a submit fails, that round has
      // closed, and `answeredInWindow` judges an answer by when the server
      // FIRST saw it. An answer the server never saw in time cannot be
      // back-dated — which is why the tap itself retries, below.
      ping(stateRef.current.index, { map: finalAnswers });
    } finally {
      setBusy(false);
    }
  }

  // Every ping carries the full answer map — the server's record of what this
  // student chose, which is both what a kicked or reloaded phone resumes from
  // AND what the grade is computed against. Pass `map` when state has not
  // caught up yet (an option was tapped microseconds ago).
  //
  // `retryWhileOpen` is for the tap and the tap only. Since the grade is
  // computed from the server's record of what it was pinged, a fetch that fell
  // off classroom wifi is a question silently marked wrong, and no later ping
  // can repair it: `answeredInWindow` judges an answer by when the server FIRST
  // saw it, so a re-send after the round shut is not an answer any more. A
  // round-change or splash ping earns no mark and is not worth a retry.
  //
  // The retry is bounded by the round's OWN deadline, which is a timestamp the
  // server sent — the phone still owns no rule about how long a round lasts.
  function ping(
    position: number,
    opts?: { map?: Record<string, string>; clockStart?: boolean; retryWhileOpen?: boolean }
  ) {
    if (!attemptId) return;
    const send = (attemptsLeft: number, answers: Record<string, string>) => {
      reportProgress({
        attempt_id: attemptId,
        position,
        answered: Object.keys(answers).length,
        answers,
        ...(opts?.clockStart ? { clock_start: true } : {})
      }).catch(() => {
        // Fire-and-forget past this point: a dropped ping must never interrupt
        // a student, and a retry that also fails is simply over.
        if (attemptsLeft <= 0) return;
        if (remainingMs(round?.answer_ends_at, Date.now()) <= 0) return;
        setTimeout(() => {
          // Re-read the answer map on the way back out rather than re-sending
          // the captured one: the student may have changed their mind in the
          // meantime, and a stale retry must never overwrite a newer choice.
          send(attemptsLeft - 1, stateRef.current.answers);
        }, PING_RETRY_GAP_MS);
      });
    };
    send(opts?.retryWhileOpen ? PING_RETRY_LIMIT : 0, opts?.map ?? stateRef.current.answers);
  }

  function onLetsGo() {
    setJoined(true);
    // Joining during a break means the round on screen has already closed: the
    // first one this student can play is the next one.
    joinedAtRound.current = stateRef.current.index + (isBreak(round) ? 1 : 0);
    // The tap registers this phone rather than starting anything: the server
    // stamps clock_t0 on the first ping it sees, and that stamp is what puts
    // this racer on the room's screen. The room's schedule has been running
    // since the professor pressed start, with or without this student.
    ping(stateRef.current.index, { clockStart: true });
  }

  // The room's round, copied across as it changes. One effect, one move: a
  // phone that slept through three rounds lands on the live one in a single
  // poll, because the server sends where the room IS rather than how far it
  // has travelled. The ping tells the server this phone is on the round with
  // everyone else — the server clamps it forward-only.
  //
  // `joined` is read but deliberately NOT a dependency. A phone still on the
  // splash tracks the room silently so that the tap lands the student straight
  // into the live round, but it must not ping: the first ping is what stamps
  // this attempt as started and pops the racer onto the room's screen, and
  // that moment belongs to the tap. Depending on `joined` would fire this
  // effect on the tap as well and send the same ping twice.
  useEffect(() => {
    const total = questions?.length ?? 0;
    if (!round || total === 0) return;
    const target = Math.max(0, Math.min(round.index, total - 1));
    setIndex(target);
    if (joined) ping(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.index, questions, attemptId]);

  // The room clock ends the quiz. When the schedule reports every round done,
  // this phone sends what it has instead of sitting on the last question until
  // the instance's own deadline — that gap is the professor's cushion, and
  // waiting it out is a full minute of dead air with every phone showing a
  // question nobody is allowed to answer. It is also what lets the room close
  // early once everyone has submitted.
  useEffect(() => {
    const { answers: a, busy: isBusy, result: hasResult, resumed: hasResumed, error: hasError } = stateRef.current;
    if (!round || round.phase !== "done") return;
    if (!attemptId || !questions) return;
    if (hasResult || hasResumed || isBusy || hasError || submitting.current) return;
    // Every dealt question goes in, blank or not; the server grades the blanks
    // as wrong rather than refusing an empty attempt.
    void submitNow(a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.phase, attemptId, questions]);

  // The whole quiz has a deadline, not just each round. When it passes the
  // player sends what the student has, landing inside the server's sixty-second
  // grace. This is the backstop for a phone the room clock never reached — a
  // poll that has been failing, or a backend deployed without the schedule.
  //
  // A student who answered nothing still submits: every dealt question goes in,
  // blank or not, and the server grades the blanks as wrong instead of
  // refusing an empty attempt.
  useEffect(() => {
    const { answers: a, busy: isBusy, result: hasResult, resumed: hasResumed, error: hasError } = stateRef.current;
    if (!instanceEndsAt || hasResult || hasResumed || isBusy || hasError) return;
    if (now < instanceEndsAt) return;
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
  // sixty-second grace instead of waiting for its own tick. With the Submit
  // button gone this is also the retry: a submit that failed at the end of the
  // last round gets one more attempt when the instance closes.
  useEffect(() => {
    if (!quizClosed) return;
    const { answers: a, busy: isBusy, result: hasResult, resumed: hasResumed } = stateRef.current;
    // Already terminal, or a submit is in flight — the same latch the deadline
    // path uses, deliberately not a second one.
    if (hasResult || hasResumed || isBusy || submitting.current) return;
    // Still loading. The deps below bring us back the moment the attempt lands.
    if (!attemptId || !questions) return;
    // A student who answered nothing is submitted too: every dealt question
    // goes in blank, and the server grades those as wrong rather than
    // refusing the attempt.
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

  // The three quiet cards — the break's wait, the room-schedule wait, and the
  // last round's submit — are early returns that never reach the question
  // view's error line, and every one of them can be on screen while a submit
  // is failing. Without this, a failed submit reads as a screen that is simply
  // thinking: the instance-deadline effect refuses to retry once `error` is
  // set, so the student waits on a calm ellipsis until the room closes.
  //
  // One helper rather than the same four lines three times, so a fourth quiet
  // card cannot be added without the error coming with it. Called as a plain
  // function, never mounted as a component: a component declared inside a
  // render gets a new identity every pass and remounts its whole subtree —
  // the bug LiveShell in Live.tsx carries a comment about.
  function holdingCard(eyebrow: string, body: string) {
    return (
      <div class="stack quiz-reveal">
        <p class="eyebrow">{eyebrow}</p>
        <p class="quiz-reveal-mark" aria-hidden="true">…</p>
        {error
          ? <p class="error-text" role="alert">{error}</p>
          : <p class="hint">{body}</p>}
      </div>
    );
  }

  // The racer splash: the identity is secret, so it shows once, full screen.
  // The tap costs the student nothing but the seconds they spend reading it —
  // it starts no clock, and the round waiting behind it is whichever one the
  // room is on.
  if (racer && !joined && !resumed && !result) {
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
    // No review here. Resuming loads the attempt's stored score, not a fresh
    // grade — there is no submit_attempt call in this path, so there is no
    // `correct` map and no `answers` either (progress_answers is never copied
    // into state for an attempt that already has a submitted_at). Rendering
    // ReviewList against an empty map would mark every question ❌ regardless
    // of what was actually chosen, which is worse than showing nothing.
    // Sourcing the map another way would mean a second round trip on every
    // reload just to redraw a screen that already told the student their
    // score; not worth it for a page most students see once, right after
    // they already read this same review post-submit.
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
    // Explanations are merged onto a COPY of `questions` here, never onto
    // `questions` state itself — that state is what the question view above
    // still reads from, and it must stay exactly what start_attempt sent for
    // as long as a round could still be open. `explanations` starts `null`
    // and every lookup is optional-chained, so a submit response that (for
    // any reason) arrived without it still renders the rest of the review
    // rather than throwing.
    const reviewQuestions = questions.map((q) => ({
      ...q,
      explanation: explanations?.[q.id]?.explanation ?? null,
      explanation_es: explanations?.[q.id]?.explanation_es ?? null
    }));
    return (
      <div class="stack">
        <p class="eyebrow">{t("quiz.done")}</p>
        <span class="big-number">{result.percent}%</span>
        <p class="hint">{t("quiz.doneBody")}</p>
        {myRace && attemptId ? <PinataCard race={myRace} attemptId={attemptId} /> : null}
        {/* Non-empty, not just non-null — see the correctMap state comment:
            an edge function that hasn't redeployed yet answers with no
            `correct` field at all, and `{}` must never read as "reviewed and
            every answer was wrong". */}
        {correctMap && Object.keys(correctMap).length > 0 ? (
          <ReviewList questions={reviewQuestions} answers={answers} correct={correctMap} />
        ) : null}
      </div>
    );
  }

  // The break. This is the moment the whole room shares, so the phone gives up
  // the question for all ten seconds of it and never takes it back.
  //
  // The reveal does not arrive with the break. The server accepts an answer for
  // a couple of seconds past the countdown — a tap at 39.5s whose ping crosses
  // classroom wifi is a real answer, not a late one — and it will not publish
  // the correct option until after that window has provably shut. So the first
  // beat of a break carries no `last_result`, and that is a WAIT, not an
  // absence. Falling through to the question here would flash it back onto the
  // screen and snatch it away again three seconds later.
  //
  // Two more things have to line up before a verdict is shown, and either one
  // missing means the same calm wait:
  //
  //   - the round has to be one this phone was actually SHOWING. The server
  //     settles every closed round for every attempt, answered or not, so a
  //     student who taps "Let's go" during round four's break would otherwise
  //     be told they got round four wrong when it was never on their screen.
  //     Not the same test as "did they answer": a student who watched the
  //     question and ran out of time has earned the reveal, and that is the
  //     teaching moment the break exists for.
  //   - the correct option has to be findable in this student's own deal, or
  //     the sentence renders as "The answer was: " with nothing after it.
  if (isBreak(round)) {
    const revealed = myRace?.last_result ?? null;
    const revealedIndex = revealed ? questions.findIndex((q) => q.id === revealed.question_id) : -1;
    const correctOption = revealed
      ? questions[revealedIndex]?.options.find((o) => o.id === revealed.correct_option_id)
      : undefined;
    const played = revealedIndex >= joinedAtRound.current;
    if (!revealed || !played || !correctOption) {
      return holdingCard(t("quiz.roundOver"), t("quiz.checkingAnswer"));
    }
    return (
      <div class="stack quiz-reveal">
        <p class="eyebrow">{t("quiz.roundOver")}</p>
        <p class="quiz-reveal-mark">{revealed.correct ? "✅" : "❌"}</p>
        <p class="quiz-reveal-answer">
          {t("quiz.correctAnswerWas", {
            answer: (lang.value === "es" && correctOption.option_text_es) || correctOption.option_text
          })}
        </p>
        {revealed.candy > 0 ? <p class="hint">{t("quiz.earnedCandy", { candy: revealed.candy })}</p> : null}
        <p class="quiz-reveal-lookup">{t("quiz.lookUp")}</p>
      </div>
    );
  }

  // The room has run every round. The submit is already in flight from the
  // effect above; this is what the student looks at while it lands.
  if (round?.phase === "done") {
    return holdingCard(t("quiz.quizOver"), t("quiz.submitting"));
  }

  // No round at all. In practice that means one thing: this frontend deployed
  // ahead of course-pulse, which is routine here because the frontend ships on
  // push and the edge functions are deployed by hand. Without the room's
  // schedule nothing can move this phone forward — there is no Next button and
  // no clock of its own to invent one — so a student left on question one would
  // sit on a question that LOOKS answerable and quietly score zero on nine of
  // ten. A legible wait is recoverable; a frozen question is not. The instance
  // deadline still submits whatever is stored.
  if (!round) {
    return holdingCard(t("quiz.waitingForRoom"), t("quiz.waitingForRoomBody"));
  }

  const remaining = Math.ceil(remainingMs(round.answer_ends_at, now) / 1000);
  const current = questions[index];
  const answered = Object.keys(answers).length;
  const difficultyLabel = t(`quiz.difficulty.${current.difficulty}` as "quiz.difficulty.easy");

  return (
    <div class="stack">
      <div class="row" style="justify-content: space-between;">
        <p class="eyebrow">{t("quiz.questionN", { n: index + 1, total: questions.length })}</p>
        <div class="row" style="gap: 0.4rem;">
          <span class="pill hidden">{difficultyLabel}</span>
          <span class={`pill ${remaining > 5 ? "live" : "warn"}`}>
            {remaining > 0 ? t("run.timeLeft", { seconds: remaining }) : t("quiz.timeUpAdvancing")}
          </span>
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
            onClick={() => {
              const next = { ...stateRef.current.answers, [current.id]: option.id };
              setAnswers(next);
              // The ping goes out on the tap, not on some later advance, and it
              // is never gated on the countdown this phone happens to be
              // showing: a tap in the last half-second is a real answer, and
              // whether it arrives in time is the server's call, not ours. This
              // is the one ping worth retrying — it is what earns the mark.
              ping(stateRef.current.index, { map: next, retryWhileOpen: true });
            }}
          >
            {(lang.value === "es" && option.option_text_es) || option.option_text}
          </button>
        ))}
      </div>

      {/* A failed submit shows here. There is no button to press again — the
          room's close is the retry. */}
      {error ? <p class="error-text" role="alert">{error}</p> : null}

      <p class="hint">{t("quiz.answeredOf", { answered, total: questions.length })}</p>
      <p class="hint">{t("quiz.oneAtATime")}</p>
    </div>
  );
}
