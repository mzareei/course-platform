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
  const [presentation, setPresentation] =
    useState<ProjectorPresentationState | null>(null);
  const [acknowledged, setAcknowledged] = useState(-1);
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
    acknowledgedRevision.current = revision;
    acknowledgeSlide(classSessionId, revision, slide)
      .then((next) => {
        setAcknowledged(revision);
        applyPresentation(next);
      })
      .catch(() => {
        acknowledgedRevision.current = -1;
      });
  }, [classSessionId, presentation?.revision, bridge.appliedRevision, bridge.teachingSlide, applyPresentation]);

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
    reportedCheckpoint.current = reportKey;
    checkpointReached(
      classSessionId,
      presentation.revision,
      checkpoint.key,
      checkpoint.afterSlide
    ).then(applyPresentation).catch(() => {
      reportedCheckpoint.current = "";
    });
  }, [
    classSessionId,
    presentation?.revision,
    bridge.checkpoint,
    bridge.teachingSlide,
    acknowledged,
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
