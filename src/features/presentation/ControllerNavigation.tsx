import { useEffect, useState } from "preact/hooks";
import {
  controllerCurrent,
  requestSlide,
  type ControllerPresentationState
} from "../../api/presentation";
import { projectorIsStale } from "./state";
import { t } from "../../i18n";

const POLL_MS = 3000;

export function ControllerNavigation({
  sessionId,
  currentSlide,
  onSlide
}: {
  sessionId: string;
  currentSlide: number | null;
  onSlide?: (slide: number, revision: number) => void;
}) {
  const [state, setState] = useState<ControllerPresentationState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const projectorUrl = `${location.origin}/teach/run/${sessionId}/projector`;

  useEffect(() => {
    let cancelled = false;
    const refresh = () => controllerCurrent(sessionId)
      .then((next) => {
        if (!cancelled) {
          setState(next);
          onSlide?.(next.requested_slide, next.revision);
          setError(false);
        }
      })
      .catch(() => { if (!cancelled) setError(true); });
    void refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [sessionId, onSlide]);

  async function move(delta: number) {
    const base = currentSlide || state?.requested_slide || 1;
    const nextSlide = Math.max(1, base + delta);
    setBusy(true);
    try {
      const next = await requestSlide(sessionId, state?.revision || 0, nextSlide);
      setState(next);
      onSlide?.(nextSlide, next.revision);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const stale = projectorIsStale(state?.projector_seen_at, Date.now());
  return (
    <section class="card controller-navigation" aria-label={t("run.controller.title")}>
      <div class="row controller-navigation-heading">
        <div>
          <p class="eyebrow">{t("run.controller.eyebrow")}</p>
          <h2>{t("run.controller.title")}</h2>
        </div>
        <span class={`status-pill ${stale ? "warning" : "success"}`}>
          {stale ? t("run.controller.projectorOffline") : t("run.controller.projectorLive")}
        </span>
      </div>
      <p class="hint">{t("run.controller.body")}</p>
      <div class="row controller-navigation-actions">
        <button class="btn quiet" type="button" disabled={busy} onClick={() => void move(-1)}>
          {t("run.controller.previous")}
        </button>
        <strong>{t("run.controller.slide", { slide: currentSlide || state?.requested_slide || 1 })}</strong>
        <button class="btn primary" type="button" disabled={busy} onClick={() => void move(1)}>
          {t("run.controller.next")}
        </button>
      </div>
      <a class="btn quiet" href={projectorUrl} target="_blank" rel="noopener noreferrer">
        {t("run.controller.openProjector")}
      </a>
      {error ? <p class="error-text" role="alert">{t("run.controller.failed")}</p> : null}
    </section>
  );
}
