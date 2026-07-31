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
  const [error, setError] = useState(false);

  const applyPresentation = useCallback((next: ProjectorPresentationState) => {
    setPresentation((current) => {
      const accepted = current && next.revision < current.revision ? current : next;
      stateRef.current = accepted;
      return accepted;
    });
    setError(false);
  }, []);

  useEffect(() => {
    stateRef.current = null;
    requestedRevision.current = -1;
    acknowledgedRevision.current = -1;
    reportedCheckpoint.current = "";
    setPresentation(null);
    setAcknowledged(-1);
    setError(false);
    if (!classSessionId) return;

    let cancelled = false;
    const refresh = () => projectorCurrent(classSessionId)
      .then((next) => {
        if (!cancelled) applyPresentation(next);
      })
      .catch(() => {
        if (!cancelled && !stateRef.current) setError(true);
      });

    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [classSessionId, applyPresentation]);

  useEffect(() => {
    clearTimeout(ackRetryTimer.current);
    clearTimeout(checkpointRetryTimer.current);
    ackRetries.current = 0;
    checkpointRetries.current = { key: "", count: 0 };
    return () => {
      clearTimeout(ackRetryTimer.current);
      clearTimeout(checkpointRetryTimer.current);
    };
  }, [classSessionId, presentation?.revision]);

  useEffect(() => {
    if (!classSessionId) return;
    let cancelled = false;
    const beat = () => {
      const revision = stateRef.current?.revision ?? 0;
      presentationHeartbeat(classSessionId, revision, "projector")
        .then((next) => {
          if (!cancelled) applyPresentation(next);
        })
        .catch(() => undefined);
    };
    const timer = setInterval(beat, HEARTBEAT_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [classSessionId, applyPresentation]);

  useEffect(() => {
    if (
      !presentation
      || !bridge.deckReady
      || presentation.revision < 1
      || presentation.revision <= requestedRevision.current
    ) return;
    bridge.goToTeachingSlide(presentation.requested_slide, presentation.revision);
    requestedRevision.current = presentation.revision;
  }, [presentation?.revision, presentation?.requested_slide, bridge.deckReady, bridge.goToTeachingSlide]);

  useEffect(() => {
    const revision = bridge.appliedRevision;
    const slide = bridge.teachingSlide;
    if (
      !classSessionId
      || !presentation
      || revision !== presentation.revision
      || !slide
      || acknowledgedRevision.current === revision
    ) return;
    let cancelled = false;
    acknowledgedRevision.current = revision;
    acknowledgeSlide(classSessionId, revision, slide)
      .then((next) => {
        if (cancelled) return;
        clearTimeout(ackRetryTimer.current);
        setAcknowledged(revision);
        applyPresentation(next);
      })
      .catch(() => {
        if (cancelled) return;
        if (ackRetries.current >= MAX_TELEMETRY_RETRIES) return;
        ackRetries.current += 1;
        clearTimeout(ackRetryTimer.current);
        ackRetryTimer.current = setTimeout(() => {
          if (cancelled) return;
          acknowledgedRevision.current = -1;
          setAckRetry((current) => current + 1);
        }, TELEMETRY_RETRY_MS) as unknown as number;
      });
    return () => {
      cancelled = true;
    };
  }, [
    classSessionId,
    presentation?.revision,
    bridge.appliedRevision,
    bridge.teachingSlide,
    ackRetry,
    applyPresentation
  ]);

  useEffect(() => {
    const checkpoint = bridge.checkpoint;
    if (
      !classSessionId
      || !presentation
      || !checkpoint
      || bridge.teachingSlide !== checkpoint.afterSlide
      || acknowledged !== presentation.revision
    ) return;
    const reportKey = `${presentation.revision}:${checkpoint.key}:${checkpoint.afterSlide}`;
    if (reportedCheckpoint.current === reportKey) return;
    if (checkpointRetries.current.key !== reportKey) {
      checkpointRetries.current = { key: reportKey, count: 0 };
    }
    let cancelled = false;
    reportedCheckpoint.current = reportKey;
    checkpointReached(
      classSessionId,
      presentation.revision,
      checkpoint.key,
      checkpoint.afterSlide
    ).then((next) => {
      if (cancelled) return;
      clearTimeout(checkpointRetryTimer.current);
      applyPresentation(next);
    }).catch(() => {
      if (cancelled) return;
      if (checkpointRetries.current.count >= MAX_TELEMETRY_RETRIES) return;
      checkpointRetries.current.count += 1;
      clearTimeout(checkpointRetryTimer.current);
      checkpointRetryTimer.current = setTimeout(() => {
        if (cancelled) return;
        reportedCheckpoint.current = "";
        setCheckpointRetry((current) => current + 1);
      }, TELEMETRY_RETRY_MS) as unknown as number;
    });
    return () => {
      cancelled = true;
    };
  }, [
    classSessionId,
    presentation?.revision,
    bridge.checkpoint,
    bridge.teachingSlide,
    acknowledged,
    checkpointRetry,
    applyPresentation
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

  const pulseActive = presentation?.phase === "pulse" ? presentation.pulse : null;

  return (
    <main class="projector-screen">
      <div class={`projector-deck${pulseActive ? " is-covered" : ""}`}>
        <InstructorDeck
          contentItemId={classSession.content_item_id}
          title={classSession.content_title || classSession.title || t("projector.deckTitle")}
          frameRef={frameRef}
          slide={presentation?.requested_slide ?? null}
          onNavigation={bridge.reset}
        />
      </div>
      {pulseActive ? <ProjectorPulse pulse={pulseActive} /> : null}
      {!presentation && !error ? (
        <div class="projector-status" role="status">{t("projector.loading")}</div>
      ) : null}
      {error ? (
        <div class="projector-status" role="alert">{t("projector.syncFailed")}</div>
      ) : null}
    </main>
  );
}
