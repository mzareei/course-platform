import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  acknowledgeSlide,
  checkpointReached,
  presentationHeartbeat,
  projectorCurrent,
  type ProjectorPresentationState
} from "../../api/presentation";
import { InstructorDeck } from "../../features/deck/InstructorDeck";
import { useDeckBridge } from "../../features/deck/useDeckBridge";
import { ProjectorPulse } from "../../features/presentation/ProjectorPulse";
import { t } from "../../i18n";
import { context } from "../../state/session";

const POLL_MS = 2000;
const HEARTBEAT_MS = 5000;
const TELEMETRY_RETRY_MS = 750;
const MAX_TELEMETRY_RETRIES = 3;

export function Projector({ sessionId }: { sessionId?: string }) {
  const classSessionId = sessionId || "";
  const activeSession = useRef({ id: classSessionId, generation: 0 });
  if (activeSession.current.id !== classSessionId) {
    activeSession.current = {
      id: classSessionId,
      generation: activeSession.current.generation + 1
    };
  }
  const sessionGeneration = activeSession.current.generation;
  const classSession = (context.value?.teacher_sessions ?? []).find(
    (candidate) => candidate.session_id === classSessionId
  );
  const frameRef = useRef<HTMLIFrameElement>(null);
  const bridge = useDeckBridge(frameRef);
  const stateRef = useRef<ProjectorPresentationState | null>(null);
  const requestedRevision = useRef(-1);
  const acknowledgedRevision = useRef(-1);
  const reportedCheckpoint = useRef("");
  const ackRetryTimer = useRef<number | undefined>(undefined);
  const checkpointRetryTimer = useRef<number | undefined>(undefined);
  const ackRetries = useRef(0);
  const checkpointRetries = useRef({ key: "", count: 0 });
  const [presentation, setPresentation] =
    useState<ProjectorPresentationState | null>(null);
  const [acknowledged, setAcknowledged] = useState(-1);
  const [ackRetry, setAckRetry] = useState(0);
  const [checkpointRetry, setCheckpointRetry] = useState(0);
  const [bridgeSession, setBridgeSession] = useState({ id: "", generation: -1 });
  const [error, setError] = useState(false);

  const isActiveSession = useCallback((id: string, generation: number) =>
    activeSession.current.id === id
    && activeSession.current.generation === generation, []);

  const applyPresentation = useCallback((
    next: ProjectorPresentationState,
    id: string,
    generation: number
  ) => {
    if (!isActiveSession(id, generation) || next.session_id !== id) return;
    setPresentation((current) => {
      if (!isActiveSession(id, generation)) return current;
      const accepted = current?.session_id === id && next.revision < current.revision
        ? current
        : next;
      stateRef.current = accepted;
      return accepted;
    });
    setError(false);
  }, [isActiveSession]);

  const presentationForSession = presentation?.session_id === classSessionId
    ? presentation
    : null;
  const bridgeBelongsToSession =
    bridgeSession.id === classSessionId
    && bridgeSession.generation === sessionGeneration;

  useEffect(() => {
    if (!isActiveSession(classSessionId, sessionGeneration)) return;
    stateRef.current = null;
    requestedRevision.current = -1;
    acknowledgedRevision.current = -1;
    reportedCheckpoint.current = "";
    bridge.reset();
    setBridgeSession({ id: classSessionId, generation: sessionGeneration });
    setPresentation(null);
    setAcknowledged(-1);
    setError(false);
    if (!classSessionId) return;

    let cancelled = false;
    const refresh = () => projectorCurrent(classSessionId)
      .then((next) => {
        if (!cancelled) applyPresentation(next, classSessionId, sessionGeneration);
      })
      .catch(() => {
        if (
          !cancelled
          && isActiveSession(classSessionId, sessionGeneration)
          && (!stateRef.current || stateRef.current.session_id !== classSessionId)
        ) setError(true);
      });

    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [classSessionId, sessionGeneration, applyPresentation, bridge.reset, isActiveSession]);

  useEffect(() => {
    clearTimeout(ackRetryTimer.current);
    clearTimeout(checkpointRetryTimer.current);
    ackRetries.current = 0;
    checkpointRetries.current = { key: "", count: 0 };
    return () => {
      clearTimeout(ackRetryTimer.current);
      clearTimeout(checkpointRetryTimer.current);
    };
  }, [classSessionId, sessionGeneration, presentationForSession?.revision]);

  useEffect(() => {
    if (!classSessionId) return;
    let cancelled = false;
    const beat = () => {
      if (!isActiveSession(classSessionId, sessionGeneration)) return;
      const revision = stateRef.current?.session_id === classSessionId
        ? stateRef.current.revision
        : 0;
      presentationHeartbeat(classSessionId, revision, "projector")
        .then((next) => {
          if (!cancelled) applyPresentation(next, classSessionId, sessionGeneration);
        })
        .catch(() => undefined);
    };
    const timer = setInterval(beat, HEARTBEAT_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [classSessionId, sessionGeneration, applyPresentation, isActiveSession]);

  useEffect(() => {
    if (
      !presentationForSession
      || !bridge.deckReady
      || presentationForSession.revision < 1
      || presentationForSession.revision <= requestedRevision.current
      || !bridgeBelongsToSession
      || !isActiveSession(classSessionId, sessionGeneration)
    ) return;
    bridge.goToTeachingSlide(
      presentationForSession.requested_slide,
      presentationForSession.revision
    );
    requestedRevision.current = presentationForSession.revision;
  }, [
    classSessionId,
    sessionGeneration,
    presentationForSession?.revision,
    presentationForSession?.requested_slide,
    bridge.deckReady,
    bridgeBelongsToSession,
    bridge.goToTeachingSlide,
    isActiveSession
  ]);

  useEffect(() => {
    const revision = bridge.appliedRevision;
    const slide = bridge.teachingSlide;
    if (
      !classSessionId
      || !presentationForSession
      || revision !== presentationForSession.revision
      || !slide
      || acknowledgedRevision.current === revision
      || !bridgeBelongsToSession
      || !isActiveSession(classSessionId, sessionGeneration)
    ) return;
    let cancelled = false;
    acknowledgedRevision.current = revision;
    acknowledgeSlide(classSessionId, revision, slide)
      .then((next) => {
        if (cancelled || !isActiveSession(classSessionId, sessionGeneration) || !bridgeBelongsToSession) return;
        clearTimeout(ackRetryTimer.current);
        setAcknowledged(revision);
        applyPresentation(next, classSessionId, sessionGeneration);
      })
      .catch(() => {
        if (cancelled || !isActiveSession(classSessionId, sessionGeneration) || !bridgeBelongsToSession) return;
        if (ackRetries.current >= MAX_TELEMETRY_RETRIES) return;
        ackRetries.current += 1;
        clearTimeout(ackRetryTimer.current);
        ackRetryTimer.current = setTimeout(() => {
          if (cancelled || !isActiveSession(classSessionId, sessionGeneration) || !bridgeBelongsToSession) return;
          acknowledgedRevision.current = -1;
          setAckRetry((current) => current + 1);
        }, TELEMETRY_RETRY_MS) as unknown as number;
      });
    return () => {
      cancelled = true;
    };
  }, [
    classSessionId,
    sessionGeneration,
    presentationForSession?.revision,
    bridge.appliedRevision,
    bridge.teachingSlide,
    bridgeBelongsToSession,
    ackRetry,
    applyPresentation,
    isActiveSession
  ]);

  useEffect(() => {
    const checkpoint = bridge.checkpoint;
    if (
      !classSessionId
      || !presentationForSession
      || !checkpoint
      || bridge.teachingSlide !== checkpoint.afterSlide
      || acknowledged !== presentationForSession.revision
      || !bridgeBelongsToSession
      || !isActiveSession(classSessionId, sessionGeneration)
    ) return;
    const reportKey = `${presentationForSession.revision}:${checkpoint.key}:${checkpoint.afterSlide}`;
    if (reportedCheckpoint.current === reportKey) return;
    if (checkpointRetries.current.key !== reportKey) {
      checkpointRetries.current = { key: reportKey, count: 0 };
    }
    let cancelled = false;
    reportedCheckpoint.current = reportKey;
    checkpointReached(
      classSessionId,
      presentationForSession.revision,
      checkpoint.key,
      checkpoint.afterSlide
    ).then((next) => {
      if (cancelled || !isActiveSession(classSessionId, sessionGeneration) || !bridgeBelongsToSession) return;
      clearTimeout(checkpointRetryTimer.current);
      applyPresentation(next, classSessionId, sessionGeneration);
    }).catch(() => {
      if (cancelled || !isActiveSession(classSessionId, sessionGeneration) || !bridgeBelongsToSession) return;
      if (checkpointRetries.current.count >= MAX_TELEMETRY_RETRIES) return;
      checkpointRetries.current.count += 1;
      clearTimeout(checkpointRetryTimer.current);
      checkpointRetryTimer.current = setTimeout(() => {
        if (cancelled || !isActiveSession(classSessionId, sessionGeneration) || !bridgeBelongsToSession) return;
        reportedCheckpoint.current = "";
        setCheckpointRetry((current) => current + 1);
      }, TELEMETRY_RETRY_MS) as unknown as number;
    });
    return () => {
      cancelled = true;
    };
  }, [
    classSessionId,
    sessionGeneration,
    presentationForSession?.revision,
    bridge.checkpoint,
    bridge.teachingSlide,
    acknowledged,
    bridgeBelongsToSession,
    checkpointRetry,
    applyPresentation,
    isActiveSession
  ]);

  if (!classSession || !classSession.content_item_id) {
    return (
      <main class="projector-screen projector-empty">
        <div class="card">
          <h1>{t("projector.unavailableTitle")}</h1>
          <p class="hint">{t("projector.unavailableBody")}</p>
        </div>
      </main>
    );
  }

  const pulseActive = presentationForSession?.phase === "pulse"
    ? presentationForSession.pulse
    : null;

  return (
    <main class="projector-screen">
      <div class={`projector-deck${pulseActive ? " is-covered" : ""}`}>
        <InstructorDeck
          key={`${classSessionId}:${sessionGeneration}`}
          contentItemId={classSession.content_item_id}
          title={classSession.content_title || classSession.title || t("projector.deckTitle")}
          frameRef={frameRef}
          slide={presentationForSession?.requested_slide ?? null}
          onNavigation={bridge.reset}
        />
      </div>
      {pulseActive ? <ProjectorPulse pulse={pulseActive} /> : null}
      {!presentationForSession && !error ? (
        <div class="projector-status" role="status">{t("projector.loading")}</div>
      ) : null}
      {error ? (
        <div class="projector-status" role="alert">{t("projector.syncFailed")}</div>
      ) : null}
    </main>
  );
}
