import { useEffect, useRef, useState } from "preact/hooks";
import type { PulseRound } from "../../api/pulse";
import { lang, t } from "../../i18n";

/**
 * The audience-facing question layer. It intentionally receives a PulseRound
 * rather than results and never reads correctness, respondents, or scores.
 * The deck engine renders the same neutral layer inside browser fullscreen.
 */
export function ClassroomQuestionLayer({ round }: { round: PulseRound | null }) {
  const layerRef = useRef<HTMLElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  // Focus only moves once the professor has actually toggled — never on mount.
  const everToggled = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const useSpanish = lang.value === "es";

  useEffect(() => {
    if (!everToggled.current) return;
    // Entering fullscreen moves keyboard focus (and the screen reader) into
    // the layer; leaving hands it back to the button that was pressed.
    if (isFullscreen) layerRef.current?.focus();
    else toggleRef.current?.focus();
  }, [isFullscreen]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === layerRef.current);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  async function toggleFullscreen() {
    const layer = layerRef.current;
    if (!layer) return;
    everToggled.current = true;
    if (isFullscreen) {
      setIsFullscreen(false);
      if (document.fullscreenElement) await document.exitFullscreen();
    } else {
      setIsFullscreen(true);
      try {
        await layer.requestFullscreen();
      } catch {
        // The app-viewport mode remains available when browser fullscreen is blocked.
      }
    }
  }

  if (!round) return null;
  return (
    <section
      ref={layerRef}
      class={`classroom-question-layer${isFullscreen ? " classroom-question-layer-fullscreen" : ""}`}
      data-testid="classroom-question-layer"
      aria-live="polite"
      tabindex={-1}
    >
      <div class="classroom-question-shell">
        <p class="eyebrow">{t("run.classroomQuestion.eyebrow")}</p>
        <h2>{(useSpanish && round.text_es) || round.text}</h2>
        <p class="classroom-question-instruction">
          {t("run.classroomQuestion.answerNeutral")}
        </p>
        <div class="classroom-question-options">
          {round.options.map((option, index) => (
            <div class="classroom-question-option" key={option.key}>
              <span class="classroom-question-key">
                {String.fromCharCode(65 + index)}
              </span>
              <span>{(useSpanish && option.text_es) || option.text}</span>
            </div>
          ))}
        </div>
        <p class="classroom-question-hint">
          {t("run.classroomQuestion.continueHint")}
        </p>
        <div class="classroom-question-actions">
          <button
            ref={toggleRef}
            class="btn classroom-question-fullscreen"
            type="button"
            aria-pressed={isFullscreen}
            onClick={() => void toggleFullscreen()}
          >
            {isFullscreen
              ? t("run.classroomQuestion.exitFullscreen")
              : t("run.classroomQuestion.fullscreen")}
          </button>
        </div>
      </div>
    </section>
  );
}
