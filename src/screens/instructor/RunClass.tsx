// Run Class is the instructor's one-screen cockpit: the session's private
// lecture deck, slide-aware live question controls, final quiz, reflection
// arrivals, QR entry, and the irreversible end-class action.
import { useEffect, useRef, useState } from "preact/hooks";
import QRCode from "qrcode";
import { startClassSession } from "../../api/classes";
import {
  closePulse,
  drawCheckpointQuestion,
  listBanks,
  pulseResults,
  pushBankQuestion,
  revealPulse,
  type BankSummary,
  type PulseRound
} from "../../api/pulse";
import { currentClassQuiz, closeClassQuiz } from "../../api/quiz";
import { endClassSession } from "../../api/session";
import { StatusPill } from "../../components/StatusPill";
import { InstructorDeck } from "../../features/deck/InstructorDeck";
import type { CheckpointQuestion } from "../../features/deck/protocol";
import { useDeckBridge } from "../../features/deck/useDeckBridge";
import { CheckpointPanel } from "../../features/live/CheckpointPanel";
import {
  checkpointQuestionMatches,
  resolveCheckpointActionSequence,
  spaceIntentForCheckpoint,
  type ActiveCheckpoint,
  type CheckpointUiState
} from "../../features/live/checkpointState";
import { t } from "../../i18n";
import { context, refreshContext } from "../../state/session";
import { EndOfClass } from "./EndOfClass";

const POLL_MS = 3000;
const BRIDGE_TIMEOUT_MS = 8000;

type RecoveryAction =
  | { type: "draw"; checkpoint: ActiveCheckpoint }
  | {
    type: "send";
    checkpoint: ActiveCheckpoint;
    question: CheckpointQuestion;
  }
  | {
    type: "reveal" | "close";
    checkpoint: ActiveCheckpoint;
    round: PulseRound;
  };

function JoinCard({
  joinUrl,
  joinCode,
  qrDataUrl,
  qrError,
  compact = false
}: {
  joinUrl: string;
  joinCode: string;
  qrDataUrl: string | null;
  qrError: boolean;
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
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);

  const resultsPoll = useRef<number | undefined>(undefined);
  const previousDeckCheckpoint = useRef<ActiveCheckpoint | null>(null);
  const handledCheckpointAction = useRef(0);
  const checkpointDrawSequence = useRef(0);
  const checkpointLifecycleSequence = useRef(0);
  const checkpointOperationInFlight = useRef(false);
  const checkpointContinueInFlight = useRef(false);
  const recovery = useRef<RecoveryAction | null>(null);

  const isLive = session?.state === "live";
  const ended = session?.state === "closed";
  const canStart = Boolean(
    session && ["planned", "open", "continued"].includes(session.state)
  );
  const joinUrl = session?.join_code
    ? `${location.origin}/join/${session.join_code}`
    : "";
  const coverage = bank?.checkpoint_coverage ?? [];
  const finalCheckpoint = coverage.length
    ? Math.max(...coverage.map((item) => item.checkpoint_after_slide))
    : null;
  const bridgeFailure =
    bridge.bridgeError
    || (bridgeTimedOut ? t("run.checkpoint.bridgeFailed") : null);

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

  // The scheduled session chooses the lecture. There is no second lecture/bank
  // selector inside Run Class.
  useEffect(() => {
    let cancelled = false;
    checkpointLifecycleSequence.current += 1;
    checkpointDrawSequence.current += 1;
    recovery.current = null;
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
      .catch((cause) => {
        if (cancelled) return;
        setBanksLoaded(true);
        setError(
          cause instanceof Error ? cause.message : t("run.loadingBanksFailed")
        );
      });
    return () => {
      cancelled = true;
    };
  }, [session?.session_id, session?.content_item_id]);

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
  // checkpoint, then tell the deck presentation that its question is ready.
  useEffect(() => {
    if (!isLive || !bridge.checkpoint || !bank) return;
    const next = bridge.checkpoint;
    if (
      activeCheckpoint?.key === next.key
      && activeCheckpoint.afterSlide === next.afterSlide
      && checkpointState.type !== "idle"
    ) {
      return;
    }
    setActiveCheckpoint(next);
    void loadQuestion(next);
  }, [
    isLive,
    bridge.checkpoint?.key,
    bridge.checkpoint?.afterSlide,
    bank?.bank_id
  ]);

  // Right Arrow belongs to the deck. Once it reports that it resumed, close
  // any server round and retire the panel state without issuing a second deck
  // navigation command.
  useEffect(() => {
    const previous = previousDeckCheckpoint.current;
    const current = bridge.checkpoint;
    previousDeckCheckpoint.current = current;
    if (isLive && previous && !current) {
      void continueCheckpoint(true, previous);
    }
  }, [
    isLive,
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
    excluded = askedKeys
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
    } catch (cause) {
      if (requestSequence !== checkpointDrawSequence.current) return;
      recovery.current = { type: "draw", checkpoint };
      setCheckpointState({
        type: "error",
        checkpoint: checkpoint.afterSlide,
        message:
          cause instanceof Error
            ? cause.message
            : t("run.checkpoint.noQuestion")
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
    } catch (cause) {
      recovery.current = { type: "send", checkpoint, question };
      setCheckpointState({
        type: "error",
        checkpoint: checkpoint.afterSlide,
        message:
          cause instanceof Error ? cause.message : t("run.pushFailed")
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
    checkpoint: ActiveCheckpoint,
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
      if (bridge.deckReady && bridge.checkpoint) {
        bridge.send({
          version: 1,
          type: "checkpoint.answer_revealed",
          checkpoint_key: checkpoint.key
        });
      }
    } catch (cause) {
      recovery.current = { type: "reveal", checkpoint, round };
      setCheckpointState({
        type: "error",
        checkpoint: checkpoint.afterSlide,
        message:
          cause instanceof Error ? cause.message : t("run.pushFailed")
      });
    } finally {
      checkpointOperationInFlight.current = false;
      setBusy(false);
    }
  }

  async function revealOpenRound() {
    if (checkpointState.type !== "open" || !activeCheckpoint) return;
    await revealRound(activeCheckpoint, checkpointState.round);
  }

  async function continueCheckpoint(
    deckAlreadyResumed = false,
    checkpointOverride?: ActiveCheckpoint
  ) {
    const checkpoint = checkpointOverride ?? activeCheckpoint;
    if (!checkpoint) return;
    if (checkpointContinueInFlight.current) return;
    checkpointLifecycleSequence.current += 1;
    checkpointDrawSequence.current += 1;
    const failedAction = recovery.current;
    const round =
      checkpointState.type === "open"
      || checkpointState.type === "revealed"
        ? checkpointState.round
        : failedAction?.type === "reveal"
          || failedAction?.type === "close"
          ? failedAction.round
          : null;

    checkpointContinueInFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      if (round) await closePulse(round.round_id);
      recovery.current = null;
      if (!deckAlreadyResumed && bridge.deckReady) {
        bridge.send({
          version: 1,
          type: "checkpoint.resume",
          checkpoint_key: checkpoint.key
        });
      }
      setActiveCheckpoint(null);
      setCheckpointState({
        type: "idle",
        nextCheckpoint: nextCheckpointAfter(checkpoint.afterSlide)
      });
    } catch (cause) {
      if (round) {
        recovery.current = { type: "close", checkpoint, round };
      }
      setCheckpointState({
        type: "error",
        checkpoint: checkpoint.afterSlide,
        message:
          cause instanceof Error ? cause.message : t("run.pushFailed")
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
      setError(
        cause instanceof Error ? cause.message : t("run.startFailed")
      );
    } finally {
      setBusy(false);
    }
  }

  async function onEndClass() {
    if (!confirm(t("run.endConfirm"))) return;
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
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t("run.endFailed")
      );
    } finally {
      setBusy(false);
    }
  }

  const deck = session.content_item_id ? (
    <InstructorDeck
      contentItemId={session.content_item_id}
      title={session.content_title || session.title || t("run.title")}
      frameRef={frameRef}
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
            <button
              class="btn danger"
              type="button"
              disabled={busy}
              onClick={onEndClass}
            >
              {t("run.endClass")}
            </button>
          ) : null}
          <a class="btn quiet" href="/teach">← {t("run.backToHome")}</a>
        </div>
      </header>

      {error ? <p class="error-text" role="alert">{error}</p> : null}

      {!isLive ? (
        <div class="run-prelive-grid">
          <div class="run-deck-column">{deck}</div>
          <div class="run-control-column">
            {joinUrl ? (
              <JoinCard
                joinUrl={joinUrl}
                joinCode={session.join_code}
                qrDataUrl={qrDataUrl}
                qrError={qrError}
              />
            ) : null}
            <section class="card stack">
              <h2>
                {ended ? t("run.ended") : t("run.start.title")}
              </h2>
              <p class="hint">
                {ended
                  ? t("run.endedBody")
                  : canStart
                    ? t("run.start.body")
                    : t("run.start.unavailable")}
              </p>
              {canStart ? (
                <button
                  class="btn primary"
                  type="button"
                  disabled={busy}
                  onClick={onStartClass}
                >
                  {busy ? t("run.starting") : t("run.start")}
                </button>
              ) : null}
            </section>
          </div>
        </div>
      ) : (
        <div class="run-cockpit">
          <div class="run-deck-column">{deck}</div>
          <div class="run-control-column">
            {joinUrl ? (
              <JoinCard
                joinUrl={joinUrl}
                joinCode={session.join_code}
                qrDataUrl={qrDataUrl}
                qrError={qrError}
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
                onSend={() => void sendReadyQuestion()}
                onReveal={() => void revealOpenRound()}
                onContinue={() => void continueCheckpoint()}
                onDrawAgain={() => void drawAgain()}
                onRetry={(checkpoint) => void retryCheckpoint(checkpoint)}
                onManualCheckpoint={selectManualCheckpoint}
                onOpenFinalQuiz={() => setShowFinalQuiz(true)}
              />
            )}

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
