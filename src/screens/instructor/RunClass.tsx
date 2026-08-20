// Run Class is the instructor's one-screen cockpit: the session's private
// lecture deck, slide-aware live question controls, final quiz, reflection
// arrivals, QR entry, and the irreversible end-class action.
import { useEffect, useRef, useState } from "preact/hooks";
import QRCode from "qrcode";
import { startClassSession } from "../../api/classes";
import {
  classAttendanceCount,
  closePulse,
  currentPulse,
  drawCheckpointQuestion,
  listBanks,
  pulseResults,
  pushBankQuestion,
  revealPulse,
  type BankSummary,
  type ClassAttendanceCount,
  type PulseRound
} from "../../api/pulse";
import { currentClassQuiz, closeClassQuiz } from "../../api/quiz";
import {
  endClassSession,
  pauseClassSession,
  reopenClassSession,
  resetClassSession,
  resumeClassSession,
  type ClassResetSummary
} from "../../api/session";
import { ClassQuestionPlanBoard } from "../../components/ClassQuestionPlanBoard";
import { StatusPill } from "../../components/StatusPill";
import { InstructorDeck } from "../../features/deck/InstructorDeck";
import type { CheckpointQuestion } from "../../features/deck/protocol";
import { useDeckBridge } from "../../features/deck/useDeckBridge";
import {
  autoContinueReason,
  autoRevealReason,
  countAdvance
} from "../../features/live/autoReveal";
import { CheckpointPanel } from "../../features/live/CheckpointPanel";
import { ClassroomQuestionLayer } from "../../features/live/ClassroomQuestionLayer";
import {
  checkpointIdentity,
  checkpointQuestionMatches,
  isCheckpointOperationCurrent,
  resolveCheckpointActionSequence,
  shouldAutoSendCheckpointQuestion,
  spaceIntentForCheckpoint,
  type ActiveCheckpoint,
  type CheckpointUiState
} from "../../features/live/checkpointState";
import { t, apiErrorText, localDateKey, formatDay } from "../../i18n";
import {
  autoSendCheckpoints,
  setAutoSendCheckpoints
} from "../../state/preferences";
import { context, refreshContext } from "../../state/session";
import { EndOfClass } from "./EndOfClass";

const POLL_MS = 3000;
const BRIDGE_TIMEOUT_MS = 8000;
// Slower than the results poll on purpose: a class fills up over minutes, not
// seconds, and this one runs for the whole hour rather than only while a
// question is open.
const ATTENDANCE_POLL_MS = 5000;

type RecoveryAction =
  | { type: "draw"; checkpoint: ActiveCheckpoint }
  | {
    type: "send";
    checkpoint: ActiveCheckpoint;
    question: CheckpointQuestion;
  }
  | {
    type: "reveal" | "close";
    checkpoint: ActiveCheckpoint | null;
    round: PulseRound;
  };

function JoinCard({
  joinUrl,
  joinCode,
  qrDataUrl,
  qrError,
  joined,
  compact = false
}: {
  joinUrl: string;
  joinCode: string;
  qrDataUrl: string | null;
  qrError: boolean;
  /** Null until the first count arrives — a bare "0" would read as nobody came. */
  joined: ClassAttendanceCount | null;
  compact?: boolean;
}) {
  return (
    <section class={`card run-join-card${compact ? " compact" : ""}`}>
      <div>
        <p class="eyebrow">{t("run.join.eyebrow")}</p>
        <h2>{t("run.join.title")}</h2>
        {!compact ? <p class="hint">{t("run.join.body")}</p> : null}
        <p>
          <strong>{t("run.join.code", { code: joinCode })}</strong>
        </p>
        <a href={joinUrl}>{joinUrl}</a>
      </div>
      <div class="run-join-qr">
        {/* Above the QR code, where the professor is already looking while the
            room scans in. aria-live so the climb is announced, not just seen. */}
        {joined ? (
          <div class="run-join-count" role="status" aria-live="polite">
            <span class="run-join-count-value">{joined.present}</span>
            <span class="run-join-count-label">
              {t("run.join.joinedLabel")}
            </span>
            <span class="run-join-count-roster">
              {t("run.join.joinedOfRoster", { enrolled: joined.enrolled })}
            </span>
          </div>
        ) : null}
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            width={compact ? 128 : 200}
            height={compact ? 128 : 200}
            alt={t("run.join.qrAlt")}
          />
        ) : qrError ? (
          <p class="error-text" role="alert">{t("run.join.qrFailed")}</p>
        ) : (
          <p class="hint" role="status">{t("run.join.qrLoading")}</p>
        )}
      </div>
    </section>
  );
}

function NoLectureDeck() {
  return (
    <div class="run-deck-frame run-deck-fallback card">
      <h2>{t("run.deck.noLecture")}</h2>
      <p class="hint">{t("run.deck.noLectureBody")}</p>
      <a class="btn" href="/teach/classes">{t("run.deck.openClasses")}</a>
    </div>
  );
}

export function RunClass({ sessionId }: { sessionId?: string }) {
  const ctx = context.value;
  const session = (ctx?.teacher_sessions ?? []).find(
    (candidate) => candidate.session_id === sessionId
  );
  const frameRef = useRef<HTMLIFrameElement>(null);
  const bridge = useDeckBridge(frameRef);

  const [bank, setBank] = useState<BankSummary | null>(null);
  const [banksLoaded, setBanksLoaded] = useState(false);
  const [checkpointState, setCheckpointState] =
    useState<CheckpointUiState>({ type: "idle" });
  const [activeCheckpoint, setActiveCheckpoint] =
    useState<ActiveCheckpoint | null>(null);
  const [askedKeys, setAskedKeys] = useState<string[]>([]);
  const [showFinalQuiz, setShowFinalQuiz] = useState(false);
  const [bridgeTimedOut, setBridgeTimedOut] = useState(false);
  const [busy, setBusy] = useState(false);
  const [endConfirming, setEndConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);
  const [joined, setJoined] = useState<ClassAttendanceCount | null>(null);
  const [recoveringCurrentRound, setRecoveringCurrentRound] = useState(false);
  const [advancesSinceAsked, setAdvancesSinceAsked] = useState(0);
  const [advancesSinceRevealed, setAdvancesSinceRevealed] = useState(0);
  const [resetConfirming, setResetConfirming] = useState(false);
  const [startConfirming, setStartConfirming] = useState(false);
  const [resetSummary, setResetSummary] = useState<ClassResetSummary | null>(null);

  const resultsPoll = useRef<number | undefined>(undefined);
  const attendancePoll = useRef<number | undefined>(undefined);
  const previousDeckCheckpoint = useRef<ActiveCheckpoint | null>(null);
  // Where the deck is standing *now*. A draw is asynchronous, and the professor
  // may have walked past the checkpoint while it was in flight, so auto-send
  // reads this ref rather than the render-time bridge value.
  const liveDeckCheckpoint = useRef<ActiveCheckpoint | null>(null);
  const autoSentCheckpoints = useRef<Set<string>>(new Set());
  const previousRevealSlide = useRef<number | null>(null);
  // Read by a 1s interval, so it must be a ref: a closure captured at mount
  // would keep judging the question on the answer count it had a minute ago.
  const autoRevealInputs = useRef({
    state: "closed" as "open" | "revealed" | "closed",
    endsAt: null as string | null,
    openedAtMs: null as number | null,
    answered: 0,
    present: 0,
    advancesSinceAsked: 0
  });
  const previousContinueSlide = useRef<number | null>(null);
  // Same reason the auto-reveal inputs are a ref: a 1s interval reading a
  // closure captured at mount would judge the question on stale numbers.
  const autoContinueInputs = useRef({
    state: "closed" as "open" | "revealed" | "closed",
    revealedAtMs: null as number | null,
    advancesSinceRevealed: 0
  });
  const previousBridgeNavigation = useRef(bridge.navigationSequence);
  const handledCheckpointAction = useRef(0);
  const checkpointDrawSequence = useRef(0);
  const checkpointLifecycleSequence = useRef(0);
  const checkpointOperationInFlight = useRef(false);
  const checkpointContinueInFlight = useRef(false);
  const recovery = useRef<RecoveryAction | null>(null);
  const recoveredSession = useRef<string | null>(null);

  const autoSend = autoSendCheckpoints.value;
  const isLive = session?.state === "live";
  const isPaused = session?.state === "paused";
  const ended = session?.state === "closed";
  const canStart = Boolean(
    session && ["planned", "open", "continued"].includes(session.state)
  );
  const joinUrl = session?.join_code
    ? `${location.origin}/join/${session.join_code}`
    : "";
  // A closed class cannot be joined, so showing its QR would invite a room full
  // of phones to a refusal — and counting arrivals against it would be counting
  // a door nobody can walk through.
  const showJoinCard = Boolean(joinUrl) && !ended;
  const coverage = bank?.checkpoint_coverage ?? [];
  const finalCheckpoint = coverage.length
    ? Math.max(...coverage.map((item) => item.checkpoint_after_slide))
    : null;
  const bridgeFailure =
    bridge.bridgeError
    || (bridgeTimedOut ? t("run.checkpoint.bridgeFailed") : null);
  const classroomRound =
    checkpointState.type === "open" || checkpointState.type === "revealed"
      ? checkpointState.round
      : null;

  liveDeckCheckpoint.current = bridge.checkpoint;

  function sendClassroomQuestion(round: PulseRound, checkpoint: ActiveCheckpoint) {
    if (!bridge.deckReady) return;
    const deckCheckpointKey = bridge.checkpoint?.key || checkpoint.key;
    bridge.send({
      version: 1,
      type: "checkpoint.question_display",
      checkpoint_key: deckCheckpointKey,
      prompt: round.text,
      prompt_es: round.text_es ?? null,
      options: round.options.map((option) => ({
        key: option.key,
        text: option.text,
        text_es: option.text_es ?? null
      }))
    });
  }

  useEffect(() => {
    if (!classroomRound || !activeCheckpoint) return;
    sendClassroomQuestion(classroomRound, activeCheckpoint);
  }, [
    classroomRound?.round_id,
    activeCheckpoint?.key,
    bridge.deckReady,
    bridge.checkpoint?.key
  ]);

  useEffect(() => {
    if (!joinUrl) {
      setQrDataUrl(null);
      return;
    }
    setQrError(false);
    QRCode.toDataURL(joinUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 240
    })
      .then(setQrDataUrl)
      .catch(() => {
        setQrDataUrl(null);
        setQrError(true);
      });
  }, [joinUrl]);

  // The professor's ask, 2026-08-14: watch the room fill up. Polled rather than
  // derived from a question's `present`, because the number he wants is the one
  // *before* the first question — while the class is still scanning in, and
  // before the class is even live.
  useEffect(() => {
    clearInterval(attendancePoll.current);
    setJoined(null);
    if (!sessionId || !showJoinCard) return;
    const tick = () =>
      classAttendanceCount(sessionId)
        .then((count) => {
          // A reply for the class we just navigated away from must not land on
          // the new one's counter.
          setJoined((current) =>
            count.class_session_id === sessionId ? count : current
          );
        })
        .catch(() => {
          // Keep the last good number through a Wi-Fi interruption. A counter
          // that blanks out mid-class reads as "everyone left".
        });
    void tick();
    attendancePoll.current = setInterval(
      tick,
      ATTENDANCE_POLL_MS
    ) as unknown as number;
    return () => clearInterval(attendancePoll.current);
  }, [sessionId, showJoinCard]);

  async function refreshCurrentRound() {
    if (!sessionId) return;
    const operationSequence = checkpointLifecycleSequence.current;
    setRecoveringCurrentRound(true);
    try {
      const view = await currentPulse(sessionId!);
      if (
        !isCheckpointOperationCurrent(
          operationSequence,
          checkpointLifecycleSequence.current
        )
        || !view.round
        ) {
        return;
      }
      const afterSlide = Number(view.round.checkpoint_after_slide);
      const checkpoint = Number.isInteger(afterSlide) && afterSlide >= 1
        ? {
          key:
            String(view.round.segment_key || "").trim()
            || coverage.find(
              (item) => item.checkpoint_after_slide === afterSlide
            )?.segment_key
            || `checkpoint-${afterSlide}`,
          afterSlide
        }
        : null;
      let results = view.results;
      if (view.round.state === "revealed" && !results) {
        results = await pulseResults(view.round.round_id).catch(() => null);
      }
      if (
        !isCheckpointOperationCurrent(
          operationSequence,
          checkpointLifecycleSequence.current
        )
      ) {
        return;
      }
      recovery.current = null;
      setActiveCheckpoint(checkpoint);
      if (view.round.state === "revealed" && results) {
        setCheckpointState({
          type: "revealed",
          round: view.round,
          results
        });
      } else {
        setCheckpointState({
          type: "open",
          round: view.round,
          results
        });
      }
    } catch {
      if (
        isCheckpointOperationCurrent(
          operationSequence,
          checkpointLifecycleSequence.current
        )
      ) {
        setError(t("run.checkpoint.recoverFailed"));
      }
    } finally {
      setRecoveringCurrentRound(false);
    }
  }

  async function refreshPlanBoardState() {
    if (!isLive || !banksLoaded) return;
    await refreshCurrentRound();
  }

  // The scheduled session chooses the lecture. There is no second lecture/bank
  // selector inside Run Class.
  useEffect(() => {
    let cancelled = false;
    checkpointLifecycleSequence.current += 1;
    checkpointDrawSequence.current += 1;
    recoveredSession.current = null;
    recovery.current = null;
    autoSentCheckpoints.current = new Set();
    setActiveCheckpoint(null);
    setAskedKeys([]);
    setShowFinalQuiz(false);
    setBanksLoaded(false);
    setBank(null);
    if (!session?.content_item_id) {
      setBanksLoaded(true);
      setCheckpointState({ type: "idle" });
      return;
    }
    listBanks()
      .then(({ banks }) => {
        if (cancelled) return;
        const selected =
          banks.find(
            (candidate) =>
              candidate.content_item_id === session.content_item_id
          ) ?? null;
        setBank(selected);
        setBanksLoaded(true);
        setCheckpointState({
          type: "idle",
          nextCheckpoint: selected?.checkpoint_coverage[0]
            ?.checkpoint_after_slide
        });
      })
      .catch(() => {
        if (cancelled) return;
        setBanksLoaded(true);
        setError(t("run.loadingBanksFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [session?.session_id, session?.content_item_id]);

  // The server is authoritative. A browser reload must recover any question
  // that students can still see so the instructor can reveal or close it.
  useEffect(() => {
    if (
      !isLive
      || !banksLoaded
      || recoveredSession.current === sessionId
    ) {
      return;
    }
    recoveredSession.current = sessionId || null;
    void refreshCurrentRound();
  }, [isLive, banksLoaded, sessionId, bank?.bank_id]);

  // If the deck never announces readiness, the class remains operable through
  // the exact checkpoint coverage loaded from the bank.
  useEffect(() => {
    setBridgeTimedOut(false);
    if (!isLive || bridge.deckReady || !session?.content_item_id) return;
    const id = setTimeout(
      () => setBridgeTimedOut(true),
      BRIDGE_TIMEOUT_MS
    );
    return () => clearTimeout(id);
  }, [isLive, bridge.deckReady, session?.content_item_id]);

  useEffect(() => {
    if (bridge.deckReady) setBridgeTimedOut(false);
  }, [bridge.deckReady]);

  // The deck stops at an authored checkpoint. Draw only from that exact
  // checkpoint, then tell the deck presentation that its question is ready —
  // and, when auto-send is on, push it to the class without waiting for a
  // click the professor would have to leave fullscreen to make.
  useEffect(() => {
    if (!isLive || recoveringCurrentRound || !bridge.checkpoint || !bank) return;
    if (
      checkpointState.type === "open"
      || checkpointState.type === "revealed"
    ) {
      return;
    }
    const next = bridge.checkpoint;
    if (
      activeCheckpoint?.key === next.key
      && activeCheckpoint.afterSlide === next.afterSlide
      && checkpointState.type !== "idle"
    ) {
      return;
    }
    setActiveCheckpoint(next);
    void loadQuestion(next, askedKeys, { fromDeckArrival: true });
  }, [
    isLive,
    recoveringCurrentRound,
    checkpointState.type,
    bridge.checkpoint?.key,
    bridge.checkpoint?.afterSlide,
    bank?.bank_id
  ]);

  // Right Arrow belongs to the deck. Once it reports that it resumed, close
  // any server round and retire the panel state without issuing a second deck
  // navigation command.
  useEffect(() => {
    if (previousBridgeNavigation.current !== bridge.navigationSequence) {
      previousBridgeNavigation.current = bridge.navigationSequence;
      previousDeckCheckpoint.current = null;
      return;
    }
    const previous = previousDeckCheckpoint.current;
    const current = bridge.checkpoint;
    previousDeckCheckpoint.current = current;
    if (isLive && previous && !current) {
      void continueCheckpoint(true, previous);
    }
  }, [
    isLive,
    bridge.navigationSequence,
    bridge.checkpoint?.key,
    bridge.checkpoint?.afterSlide
  ]);

  // Space is only an intent. The parent resolves it from its authoritative
  // state, so a stale deck cannot reveal an unsent answer or send twice.
  useEffect(() => {
    const action = bridge.checkpointAction;
    const resolution = resolveCheckpointActionSequence(
      handledCheckpointAction.current,
      action
    );
    handledCheckpointAction.current = resolution.sequence;
    if (
      !action
      || !resolution.shouldHandle
      || action.key !== activeCheckpoint?.key
    ) {
      return;
    }
    const intent = spaceIntentForCheckpoint(checkpointState);
    if (intent === "send") void sendReadyQuestion();
    if (intent === "reveal") void revealOpenRound();
  }, [bridge.checkpointAction?.sequence]);

  useEffect(() => {
    clearInterval(resultsPoll.current);
    if (checkpointState.type !== "open") return;
    const roundId = checkpointState.round.round_id;
    const tick = () =>
      pulseResults(roundId)
        .then((results) =>
          setCheckpointState((current) =>
            current.type === "open"
            && current.round.round_id === roundId
              ? { ...current, results }
              : current
          )
        )
        .catch(() => {
          // Keep the last good room snapshot through a Wi-Fi interruption.
        });
    void tick();
    resultsPoll.current = setInterval(
      tick,
      POLL_MS
    ) as unknown as number;
    return () => clearInterval(resultsPoll.current);
  }, [
    checkpointState.type,
    checkpointState.type === "open"
      ? checkpointState.round.round_id
      : null
  ]);

  // A poll slide carries its own answer as a click-to-reveal fragment, and the
  // deck shows it on the first forward press — one slip on the clicker and the
  // answer is on the projector while the class is still voting. Hold it back
  // for exactly as long as the question is open, and let it through the instant
  // the question is revealed, which is when the room should see it anyway.
  useEffect(() => {
    if (!bridge.deckReady) return;
    bridge.send({
      version: 1,
      type: "answer.lock",
      locked: checkpointState.type === "open"
    });
  }, [bridge.deckReady, checkpointState.type]);

  // A question nobody reveals leaves every phone saying "recorded" and never
  // "you were right". The professor is in fullscreen and cannot click, so the
  // cockpit ends the question itself: the clock ran out, the room has all
  // answered, or he has plainly moved on. It reveals and stops there — closing
  // would pull the answer off the phones in the same instant.
  const openRoundId =
    checkpointState.type === "open" ? checkpointState.round.round_id : null;
  const revealedRoundId =
    checkpointState.type === "revealed" ? checkpointState.round.round_id : null;

  useEffect(() => {
    setAdvancesSinceAsked(0);
    previousRevealSlide.current = bridge.slide;
  }, [openRoundId]);

  useEffect(() => {
    if (!openRoundId) return;
    setAdvancesSinceAsked((current) =>
      countAdvance(current, previousRevealSlide.current, bridge.slide));
    previousRevealSlide.current = bridge.slide;
  }, [bridge.slide, openRoundId]);

  // Counted separately from the advances before the reveal. Reusing that
  // counter would retire the answer instantly, because reaching the reveal by
  // "movedOn" already means three slides have gone by.
  useEffect(() => {
    setAdvancesSinceRevealed(0);
    previousContinueSlide.current = bridge.slide;
  }, [revealedRoundId]);

  useEffect(() => {
    if (!revealedRoundId) return;
    setAdvancesSinceRevealed((current) =>
      countAdvance(current, previousContinueSlide.current, bridge.slide));
    previousContinueSlide.current = bridge.slide;
  }, [bridge.slide, revealedRoundId]);

  autoRevealInputs.current = {
    state: checkpointState.type === "open" ? "open" : "closed",
    endsAt:
      checkpointState.type === "open"
        ? checkpointState.round.ends_at ?? null
        : null,
    openedAtMs:
      checkpointState.type === "open" && checkpointState.round.opened_at
        ? new Date(checkpointState.round.opened_at).getTime()
        : null,
    answered: checkpointState.type === "open"
      ? checkpointState.results?.answered ?? 0
      : 0,
    present: checkpointState.type === "open"
      ? checkpointState.results?.present ?? 0
      : 0,
    advancesSinceAsked
  };

  autoContinueInputs.current = {
    state: checkpointState.type === "revealed" ? "revealed" : "closed",
    revealedAtMs:
      checkpointState.type === "revealed" && checkpointState.round.revealed_at
        ? new Date(checkpointState.round.revealed_at).getTime()
        : null,
    advancesSinceRevealed
  };

  useEffect(() => {
    if (!openRoundId || !isLive) return;
    const tick = () => {
      const reason = autoRevealReason({
        ...autoRevealInputs.current,
        nowMs: Date.now()
      });
      if (reason) void revealOpenRound();
    };
    const id = setInterval(tick, 1000) as unknown as number;
    return () => clearInterval(id);
  }, [openRoundId, isLive]);

  // Revealing shows the answer; it does not end the question. The only
  // automatic end was a deck message an imported lecture cannot send, so on
  // every lecture after Week 1 the panel held the last question until it was
  // clicked — which the professor only ever saw when fullscreen dropped.
  useEffect(() => {
    if (!revealedRoundId || !isLive) return;
    const tick = () => {
      if (checkpointContinueInFlight.current) return;
      const reason = autoContinueReason({
        ...autoContinueInputs.current,
        nowMs: Date.now()
      });
      if (reason) void continueCheckpoint(false);
    };
    const id = setInterval(tick, 1000) as unknown as number;
    return () => clearInterval(id);
  }, [revealedRoundId, isLive]);

  useEffect(() => {
    if (
      finalCheckpoint
      && (
        (bridge.teachingSlide ?? 0) >= finalCheckpoint
        || activeCheckpoint?.afterSlide === finalCheckpoint
      )
    ) {
      setShowFinalQuiz(true);
    }
  }, [
    finalCheckpoint,
    bridge.teachingSlide,
    activeCheckpoint?.afterSlide
  ]);

  // A reloaded (or re-navigated) Run Class must put a RUNNING quiz back on the
  // instructor's screen. The End of Class box owns the quiz controls and the
  // piñata race layer, but it only mounts once showFinalQuiz flips — and a
  // fresh mount forgets that. Without this, starting the quiz and then coming
  // back to Run Class showed NOTHING: no box, no race, no way to close the
  // quiz short of finding the jump button again. Ask the server whether a quiz
  // is running and re-open the box; its own adopt effect then brings the race
  // layer back by itself.
  useEffect(() => {
    if (!sessionId || !isLive || !bank?.content_slug || showFinalQuiz) return;
    let cancelled = false;
    currentClassQuiz({ class_session_id: sessionId, content_slug: bank.content_slug })
      .then((res) => {
        if (!cancelled && res.instance_id) setShowFinalQuiz(true);
      })
      .catch(() => { /* the box can still be opened from the checkpoint rail */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, isLive, bank?.content_slug, showFinalQuiz]);

  if (!sessionId || !session) {
    return (
      <div class="empty-state card">
        <h3>{t("run.noSession")}</h3>
        <p>{t("run.noSessionBody")}</p>
        <a class="btn" href="/teach">{t("run.backToHome")}</a>
      </div>
    );
  }

  function nextCheckpointAfter(slide: number) {
    return coverage
      .map((item) => item.checkpoint_after_slide)
      .filter((checkpoint) => checkpoint > slide)
      .sort((a, b) => a - b)[0];
  }

  async function loadQuestion(
    checkpoint: ActiveCheckpoint,
    excluded = askedKeys,
    options: { fromDeckArrival?: boolean } = {}
  ) {
    const requestSequence = ++checkpointDrawSequence.current;
    if (!bank?.content_slug) {
      setCheckpointState({
        type: "error",
        checkpoint: checkpoint.afterSlide,
        message: t("run.checkpoint.noQuestion")
      });
      recovery.current = { type: "draw", checkpoint };
      return;
    }
    setCheckpointState({
      type: "loading",
      checkpoint: checkpoint.afterSlide
    });
    setError(null);
    try {
      const { question } = await drawCheckpointQuestion({
        content_slug: bank.content_slug,
        checkpoint_after_slide: checkpoint.afterSlide,
        exclude_keys: excluded
      });
      if (requestSequence !== checkpointDrawSequence.current) return;
      if (!checkpointQuestionMatches(checkpoint, question)) {
        throw new Error(t("run.checkpoint.mismatch"));
      }
      recovery.current = null;
      setCheckpointState({ type: "ready", question });
      if (bridge.deckReady && bridge.checkpoint) {
        bridge.send({
          version: 1,
          type: "checkpoint.question_ready",
          checkpoint_key: checkpoint.key
        });
      }
      const identity = checkpointIdentity(checkpoint);
      if (
        shouldAutoSendCheckpointQuestion({
          enabled: autoSendCheckpoints.value,
          isLive,
          drawnFromDeckArrival: Boolean(options.fromDeckArrival),
          drawIsCurrent: requestSequence === checkpointDrawSequence.current,
          deckCheckpoint: liveDeckCheckpoint.current,
          checkpoint,
          alreadyAutoSent: autoSentCheckpoints.current.has(identity)
        })
      ) {
        autoSentCheckpoints.current.add(identity);
        await sendQuestion(checkpoint, question);
      }
    } catch {
      if (requestSequence !== checkpointDrawSequence.current) return;
      recovery.current = { type: "draw", checkpoint };
      setCheckpointState({
        type: "error",
        checkpoint: checkpoint.afterSlide,
        message: t("run.checkpoint.noQuestion")
      });
    }
  }

  async function sendQuestion(
    checkpoint: ActiveCheckpoint,
    question: CheckpointQuestion
  ) {
    if (checkpointOperationInFlight.current) return;
    if (!checkpointQuestionMatches(checkpoint, question)) {
      setCheckpointState({
        type: "error",
        checkpoint: checkpoint.afterSlide,
        message: t("run.checkpoint.mismatch")
      });
      recovery.current = { type: "draw", checkpoint };
      return;
    }
    const operationSequence = checkpointLifecycleSequence.current;
    checkpointOperationInFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const { round } = await pushBankQuestion({
        class_session_id: sessionId!,
        question_id: question.question_id,
        checkpoint_after_slide: checkpoint.afterSlide,
        time_limit_seconds: 60,
        points: 1
      });
      if (operationSequence !== checkpointLifecycleSequence.current) {
        await closePulse(round.round_id).catch(() => {});
        return;
      }
      recovery.current = null;
      setAskedKeys((current) =>
        current.includes(question.generation_key)
          ? current
          : [...current, question.generation_key]
      );
      setCheckpointState({ type: "open", round, results: null });
      if (bridge.deckReady && bridge.checkpoint) {
        bridge.send({
          version: 1,
          type: "checkpoint.question_sent",
          checkpoint_key: checkpoint.key
        });
      }
    } catch {
      if (
        !isCheckpointOperationCurrent(
          operationSequence,
          checkpointLifecycleSequence.current
        )
      ) return;
      recovery.current = { type: "send", checkpoint, question };
      setCheckpointState({
        type: "error",
        checkpoint: checkpoint.afterSlide,
        message: t("run.pushFailed")
      });
    } finally {
      checkpointOperationInFlight.current = false;
      setBusy(false);
    }
  }

  async function sendReadyQuestion() {
    if (checkpointState.type !== "ready" || !activeCheckpoint) return;
    await sendQuestion(activeCheckpoint, checkpointState.question);
  }

  async function revealRound(
    checkpoint: ActiveCheckpoint | null,
    round: PulseRound
  ) {
    if (checkpointOperationInFlight.current) return;
    const operationSequence = checkpointLifecycleSequence.current;
    checkpointOperationInFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await revealPulse(round.round_id);
      if (operationSequence !== checkpointLifecycleSequence.current) return;
      const { round: revealedRound, ...results } = response;
      recovery.current = null;
      setCheckpointState({
        type: "revealed",
        round: revealedRound,
        results
      });
      if (checkpoint && bridge.deckReady && bridge.checkpoint) {
        bridge.send({
          version: 1,
          type: "checkpoint.answer_revealed",
          checkpoint_key: checkpoint.key
        });
      }
    } catch {
      if (
        !isCheckpointOperationCurrent(
          operationSequence,
          checkpointLifecycleSequence.current
        )
      ) return;
      recovery.current = { type: "reveal", checkpoint, round };
      setCheckpointState({
        type: "error",
        checkpoint: checkpoint?.afterSlide ?? 0,
        message: t("run.pushFailed")
      });
    } finally {
      checkpointOperationInFlight.current = false;
      setBusy(false);
    }
  }

  async function revealOpenRound() {
    if (checkpointState.type !== "open") return;
    await revealRound(activeCheckpoint, checkpointState.round);
  }

  async function continueCheckpoint(
    deckAlreadyResumed = false,
    checkpointOverride?: ActiveCheckpoint | null
  ) {
    if (checkpointContinueInFlight.current) return;
    checkpointLifecycleSequence.current += 1;
    checkpointDrawSequence.current += 1;
    const operationSequence = checkpointLifecycleSequence.current;
    const failedAction = recovery.current;
    const checkpoint =
      checkpointOverride
      ?? activeCheckpoint
      ?? (
        failedAction?.type === "reveal"
        || failedAction?.type === "close"
          ? failedAction.checkpoint
          : null
      );
    const round =
      checkpointState.type === "open"
      || checkpointState.type === "revealed"
        ? checkpointState.round
        : failedAction?.type === "reveal"
          || failedAction?.type === "close"
          ? failedAction.round
          : null;
    if (!checkpoint && !round) return;

    checkpointContinueInFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      if (round) await closePulse(round.round_id);
      if (
        !isCheckpointOperationCurrent(
          operationSequence,
          checkpointLifecycleSequence.current
        )
      ) return;
      recovery.current = null;
      if (checkpoint && bridge.deckReady) {
        const deckCheckpointKey = bridge.checkpoint?.key || checkpoint.key;
        bridge.send({
          version: 1,
          type: "checkpoint.question_clear",
          checkpoint_key: deckCheckpointKey
        });
      }
      if (checkpoint && !deckAlreadyResumed && bridge.deckReady) {
        bridge.send({
          version: 1,
          type: "checkpoint.resume",
          checkpoint_key: checkpoint.key
        });
      }
      setActiveCheckpoint(null);
      setCheckpointState({
        type: "idle",
        nextCheckpoint: checkpoint
          ? nextCheckpointAfter(checkpoint.afterSlide)
          : undefined
      });
    } catch {
      if (
        !isCheckpointOperationCurrent(
          operationSequence,
          checkpointLifecycleSequence.current
        )
      ) return;
      if (round) {
        recovery.current = { type: "close", checkpoint, round };
      }
      setCheckpointState({
        type: "error",
        checkpoint: checkpoint?.afterSlide ?? 0,
        message: t("run.pushFailed")
      });
    } finally {
      checkpointContinueInFlight.current = false;
      setBusy(false);
    }
  }

  async function retryCheckpoint(checkpointSlide: number) {
    const action = recovery.current;
    if (action?.type === "send") {
      await sendQuestion(action.checkpoint, action.question);
      return;
    }
    if (action?.type === "reveal") {
      await revealRound(action.checkpoint, action.round);
      return;
    }
    if (action?.type === "close") {
      await continueCheckpoint(false, action.checkpoint);
      return;
    }
    const checkpoint =
      action?.type === "draw"
        ? action.checkpoint
        : activeCheckpoint
          ?? coverage
            .filter(
              (item) => item.checkpoint_after_slide === checkpointSlide
            )
            .map((item) => ({
              key: item.segment_key,
              afterSlide: item.checkpoint_after_slide
            }))[0];
    if (checkpoint) await loadQuestion(checkpoint);
  }

  async function drawAgain() {
    if (checkpointState.type !== "ready" || !activeCheckpoint) return;
    const excluded = Array.from(
      new Set([...askedKeys, checkpointState.question.generation_key])
    );
    setAskedKeys(excluded);
    await loadQuestion(activeCheckpoint, excluded);
  }

  function selectManualCheckpoint(item: BankSummary["checkpoint_coverage"][number]) {
    const checkpoint = {
      key: item.segment_key,
      afterSlide: item.checkpoint_after_slide
    };
    setActiveCheckpoint(checkpoint);
    void loadQuestion(checkpoint);
  }

  async function onStartClass() {
    setBusy(true);
    setError(null);
    try {
      await startClassSession(sessionId!);
      await refreshContext();
    } catch (cause) {
      console.error("Starting class failed", cause);
      setError(t("run.startFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onReopenClass() {
    setBusy(true);
    setError(null);
    try {
      await reopenClassSession(sessionId!, t("run.reopenReason"));
      await refreshContext();
    } catch {
      setError(t("run.reopenFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onResetClass() {
    if (!resetConfirming) {
      setResetConfirming(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { removed } = await resetClassSession(sessionId!);
      setResetSummary(removed);
      setResetConfirming(false);
      // Everything the cockpit is holding describes a class that no longer
      // happened: the drawn question, the asked-keys, the auto-send latches.
      checkpointLifecycleSequence.current += 1;
      checkpointDrawSequence.current += 1;
      autoSentCheckpoints.current = new Set();
      recovery.current = null;
      recoveredSession.current = null;
      setActiveCheckpoint(null);
      setAskedKeys([]);
      setShowFinalQuiz(false);
      setCheckpointState({ type: "idle" });
      await refreshContext();
    } catch (cause) {
      setError(apiErrorText(cause, "run.reset.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function onEndClass() {
    if (!endConfirming) {
      setEndConfirming(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const activeRound =
        checkpointState.type === "open"
        || checkpointState.type === "revealed"
          ? checkpointState.round
          : recovery.current?.type === "reveal"
            || recovery.current?.type === "close"
            ? recovery.current.round
            : null;
      if (activeRound) {
        await closePulse(activeRound.round_id).catch(() => {});
      }
      if (bank?.content_slug) {
        const quiz = await currentClassQuiz({
          class_session_id: sessionId!,
          content_slug: bank.content_slug
        }).catch(() => null);
        if (quiz?.instance_id) {
          await closeClassQuiz(quiz.instance_id).catch(() => {});
        }
      }
      await endClassSession(sessionId!);
      await refreshContext();
      setEndConfirming(false);
    } catch {
      setError(t("run.endFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onPauseClass() {
    setBusy(true);
    setError(null);
    try {
      // The same courtesy End class already performs. A question left open is a
      // question thirty students sit staring at until it times out — and while
      // paused, nobody can reveal it.
      const activeRound =
        checkpointState.type === "open" || checkpointState.type === "revealed"
          ? checkpointState.round
          : null;
      if (activeRound) await closePulse(activeRound.round_id).catch(() => {});
      await pauseClassSession(sessionId!);
      await refreshContext();
    } catch {
      setError(t("run.pauseFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onResumeClass() {
    setBusy(true);
    setError(null);
    try {
      await resumeClassSession(sessionId!);
      await refreshContext();
    } catch {
      setError(t("run.resumeFailed"));
    } finally {
      setBusy(false);
    }
  }

  const deck = session.content_item_id ? (
    <InstructorDeck
      contentItemId={session.content_item_id}
      title={session.content_title || session.title || t("run.title")}
      frameRef={frameRef}
      slide={bridge.slide}
      onNavigation={bridge.reset}
    />
  ) : (
    <NoLectureDeck />
  );

  return (
    <div class="stack run-class-shell">
      <header class="run-class-header">
        <div>
          <p class="eyebrow">{t("run.eyebrow")}</p>
          <div class="row">
            <h1>
              {session.title
                || t("teach.sessionN", { n: session.sequence_number })}
            </h1>
            <StatusPill state={session.state} />
          </div>
          <p class="hint">
            {session.section_code} · {session.section_name}
            {session.content_title ? ` · ${session.content_title}` : ""}
          </p>
        </div>
        <div class="row">
          <a
            class="btn quiet"
            href="/student"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("teach.card.asStudent")}
          </a>
          {isLive ? (
            <>
              {/* Reachable before End class, and deliberately plainer: pausing
                  is reversible in one click and creates nothing, while ending
                  posts every grade and publishes the lecture. Giving them the
                  same weight is what pushes a professor who has run out of time
                  toward the irreversible one. */}
              <button
                class="btn"
                type="button"
                disabled={busy}
                onClick={() => void onPauseClass()}
              >
                {busy ? t("run.pausing") : t("run.pause")}
              </button>
              <button
                class="btn danger"
                type="button"
                disabled={busy}
                onClick={onEndClass}
              >
                {endConfirming
                  ? t("run.endConfirmAction")
                  : t("run.endClass")}
              </button>
              {endConfirming ? (
                <p class="hint run-end-confirm">{t("run.endConfirm")}</p>
              ) : null}
            </>
          ) : null}
          <a class="btn quiet" href="/teach">← {t("run.backToHome")}</a>
        </div>
      </header>

      {error ? <p class="error-text" role="alert">{error}</p> : null}

      {!isLive ? (
        <div class="run-prelive-grid">
          <div class="run-deck-column">{deck}</div>
          <div class="run-control-column">
            {showJoinCard ? (
              <JoinCard
                joinUrl={joinUrl}
                joinCode={session.join_code}
                qrDataUrl={qrDataUrl}
                qrError={qrError}
                joined={joined}
              />
            ) : null}
            {/* Pre-class is exactly when a professor wants to plan questions —
                the backend has always allowed editing a planned session. Ask
                now stays disabled until the class is live. */}
            {sessionId && banksLoaded ? (
              <ClassQuestionPlanBoard
                classSessionId={sessionId}
                contentItemId={session?.content_item_id}
                isLive={isLive}
                autoAsk={autoSend}
                deckReady={bridge.deckReady}
                deckSlide={bridge.slide}
                deckTeachingSlide={bridge.teachingSlide}
                onRefresh={() => void refreshPlanBoardState()}
              />
            ) : null}
            <section class="card stack">
              <h2>
                {isPaused
                  ? t("run.paused")
                  : ended
                    ? t("run.ended")
                    : t("run.start.title")}
              </h2>
              <p class="hint">
                {isPaused
                  ? t("run.pausedBody")
                  : ended
                    ? t("run.endedBody")
                    : canStart
                      ? t("run.start.body")
                      : t("run.start.unavailable")}
              </p>
              {/* `canStart` is false for a paused session, so this and the
                  start button can never both appear. */}
              {isPaused ? (
                <button
                  class="btn primary"
                  type="button"
                  disabled={busy}
                  onClick={() => void onResumeClass()}
                >
                  {busy ? t("run.resuming") : t("run.resume")}
                </button>
              ) : null}
              {canStart ? (
                (() => {
                  // Starting a future-dated class silently is how a class for
                  // next week once went live with a test question in it. One
                  // extra press when the date isn't today.
                  const futureDated = Boolean(
                    session.planned_date && session.planned_date > localDateKey()
                  );
                  return (
                    <>
                      <button
                        class="btn primary"
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (futureDated && !startConfirming) {
                            setStartConfirming(true);
                            return;
                          }
                          void onStartClass();
                        }}
                      >
                        {busy
                          ? t("run.starting")
                          : startConfirming
                            ? t("run.start.confirmFuture")
                            : t("run.start")}
                      </button>
                      {startConfirming ? (
                        <p class="hint">
                          {t("run.start.futureWarning", {
                            date: formatDay(session.planned_date!)
                          })}
                        </p>
                      ) : null}
                    </>
                  );
                })()
              ) : null}
              {ended ? (
                <button
                  class="btn primary"
                  type="button"
                  disabled={busy}
                  onClick={() => void onReopenClass()}
                >
                  {busy ? t("run.reopening") : t("run.reopen")}
                </button>
              ) : null}
            </section>

            {/* Rehearsing consumes a class: polls go to "asked", students to
                "present", a grade gets posted. Without this the second run of
                the same lecture starts from a used-up session. */}
            <section class="card stack">
              <h2>{t("run.reset.title")}</h2>
              <p class="hint">{t("run.reset.body")}</p>
              {resetSummary ? (
                <p class="hint" role="status">
                  {t("run.reset.done", {
                    rounds: resetSummary.pulse_rounds,
                    answers: resetSummary.pulse_answers,
                    polls: resetSummary.plan_checkpoints_reset,
                    attendance: resetSummary.attendance
                  })}
                </p>
              ) : null}
              {isLive ? (
                <p class="hint">{t("run.reset.endFirst")}</p>
              ) : (
                <button
                  class="btn danger"
                  type="button"
                  disabled={busy}
                  onClick={() => void onResetClass()}
                >
                  {resetConfirming
                    ? t("run.reset.confirmAction")
                    : t("run.reset.action")}
                </button>
              )}
              {resetConfirming ? (
                <p class="hint">{t("run.reset.confirm")}</p>
              ) : null}
            </section>
          </div>
        </div>
      ) : (
        <div class="run-cockpit">
          <div class="run-deck-column">
            {deck}
            <ClassroomQuestionLayer round={classroomRound} />
          </div>
          <div class="run-control-column">
            {showJoinCard ? (
              <JoinCard
                joinUrl={joinUrl}
                joinCode={session.join_code}
                qrDataUrl={qrDataUrl}
                qrError={qrError}
                joined={joined}
                compact
              />
            ) : null}

            {!banksLoaded ? (
              <section class="checkpoint-panel card">
                <p class="hint" role="status">{t("run.loadingBanks")}</p>
              </section>
            ) : (
              <CheckpointPanel
                state={checkpointState}
                coverage={coverage}
                activeCheckpoint={activeCheckpoint}
                bridgeFailure={bridgeFailure}
                busy={busy}
                autoSend={autoSend}
                onToggleAutoSend={setAutoSendCheckpoints}
                onSend={() => void sendReadyQuestion()}
                onReveal={() => void revealOpenRound()}
                onContinue={() => void continueCheckpoint()}
                onDrawAgain={() => void drawAgain()}
                onRetry={(checkpoint) => void retryCheckpoint(checkpoint)}
                onManualCheckpoint={selectManualCheckpoint}
                onOpenFinalQuiz={() => setShowFinalQuiz(true)}
                finalQuizAvailable={Boolean(bank?.content_slug)}
              />
            )}

            {sessionId && banksLoaded ? (
              <ClassQuestionPlanBoard
                classSessionId={sessionId}
                contentItemId={session?.content_item_id}
                isLive={isLive}
                autoAsk={autoSend}
                deckReady={bridge.deckReady}
                deckSlide={bridge.slide}
                deckTeachingSlide={bridge.teachingSlide}
                onRefresh={() => void refreshPlanBoardState()}
              />
            ) : null}

            {showFinalQuiz && bank?.content_slug ? (
              <EndOfClass
                sessionId={sessionId}
                contentSlug={bank.content_slug}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
