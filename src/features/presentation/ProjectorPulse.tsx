import type { ProjectorPulse as ProjectorPulseState } from "../../api/presentation";
import { lang, t } from "../../i18n";

export function ProjectorPulse({ pulse }: { pulse: ProjectorPulseState }) {
  const useSpanish = lang.value === "es";
  const revealed = pulse.state === "revealed";
  const correctKey = revealed ? pulse.correct_option?.key : null;
  const explanation = revealed
    ? (useSpanish && pulse.explanation_es) || pulse.explanation
    : null;

  return (
    <section class="projector-pulse" aria-live="polite">
      <div class="projector-pulse-heading">
        <p class="eyebrow">{t("projector.pulse.eyebrow")}</p>
        <p class="projector-pulse-progress">
          {t("projector.pulse.answeredOf", {
            answered: pulse.submitted,
            eligible: pulse.eligible
          })}
        </p>
      </div>
      <h1>{(useSpanish && pulse.prompt_es) || pulse.prompt}</h1>
      <div class="projector-pulse-options">
        {pulse.options.map((option) => (
          <div
            key={option.key}
            class={`projector-pulse-option${option.key === correctKey ? " correct" : ""}`}
          >
            {(useSpanish && option.text_es) || option.text}
          </div>
        ))}
      </div>
      {revealed ? (
        <div class="projector-pulse-reveal">
          {pulse.correct_option ? (
            <p class="projector-pulse-correct">
              {t("projector.pulse.correctAnswer", {
                answer: (useSpanish && pulse.correct_option.text_es)
                  || pulse.correct_option.text
              })}
            </p>
          ) : null}
          {explanation ? <p>{explanation}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
