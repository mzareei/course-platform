import { useEffect, useRef, useState } from "preact/hooks";
import type { PulseRound } from "../../api/pulse";
import { t } from "../../i18n";

/**
 * The audience-facing question layer. It intentionally receives a PulseRound
 * rather than results and never reads correctness, respondents, or scores.
 * The deck engine renders the same neutral layer inside browser fullscreen.
 */
export function ClassroomQuestionLayer({ round }: { round: PulseRound | null }) {
  const layerRef = useRef<HTMLElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === layerRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    const layer = layerRef.current;
    if (!layer) return;
    if (document.fullscreenElement === layer) {
      await document.exitFullscreen();
    } else {
      await layer.requestFullscreen();
    }
  }

  if (!round) return null;
  return (
    <section
      ref={layerRef}
      class="classroom-question-layer"
      data-testid="classroom-question-layer"
      aria-live="polite"
    >
      <div class="classroom-question-shell">
        <p class="eyebrow">{t("run.classroomQuestion.eyebrow")}</p>
        <h2>{round.text}</h2>
        {round.text_es ? <p class="classroom-question-es">{round.text_es}</p> : null}
        <p class="classroom-question-instruction">
          {t("run.classroomQuestion.answerNeutral")}
        </p>
        <div class="classroom-question-options">
          {round.options.map((option, index) => (
            <div class="classroom-question-option" key={option.key}>
              <span class="classroom-question-key">
                {String.fromCharCode(65 + index)}
              </span>
              <span>
                <span>{option.text}</span>
                {option.text_es ? (
                  <span class="classroom-question-option-es">{option.text_es}</span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
        <p class="classroom-question-hint">
          {t("run.classroomQuestion.continueHint")}
        </p>
        <div class="classroom-question-actions">
          <button
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
