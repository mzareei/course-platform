import { useEffect, useState } from "preact/hooks";
import type { CheckpointCoverage } from "../../api/checkpoints";
import { lang, t } from "../../i18n";
import type { ActiveCheckpoint, CheckpointUiState } from "./checkpointState";

function secondsLeft(endsAt?: string) {
  if (!endsAt) return 0;
  return Math.max(
    0,
    Math.round((new Date(endsAt).getTime() - Date.now()) / 1000)
  );
}

export function CheckpointPanel({
  state,
  coverage,
  activeCheckpoint,
  bridgeFailure,
  busy,
  autoSend,
  onToggleAutoSend,
  onSend,
  onReveal,
  onContinue,
  onDrawAgain,
  onRetry,
  onManualCheckpoint,
  onOpenFinalQuiz,
  finalQuizAvailable
}: {
  state: CheckpointUiState;
  coverage: CheckpointCoverage[];
  activeCheckpoint: ActiveCheckpoint | null;
  bridgeFailure: string | null;
  busy: boolean;
  autoSend: boolean;
  onToggleAutoSend: (next: boolean) => void;
  onSend: () => void;
  onReveal: () => void;
  onContinue: () => void;
  onDrawAgain: () => void;
  onRetry: (checkpoint: number) => void;
  onManualCheckpoint: (coverage: CheckpointCoverage) => void;
  onOpenFinalQuiz: () => void;
  /** There is an active question bank behind this lecture. That, and only
   *  that, is what the end-of-class quiz needs — not deck checkpoints. */
  finalQuizAvailable: boolean;
}) {
  const [, setClock] = useState(Date.now());
  const useSpanish = lang.value === "es";

  useEffect(() => {
    if (state.type !== "open") return;
    const id = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.type]);

  const resultState =
    state.type === "open" || state.type === "revealed" ? state : null;
  const results = resultState?.results ?? null;
  const round = resultState?.round ?? null;
  const remaining = secondsLeft(round?.ends_at);

  return (
    <aside class="checkpoint-panel card">
      <div class="row checkpoint-panel-heading">
        <div>
          <p class="eyebrow">{t("run.checkpoint.eyebrow")}</p>
          <h2>{t("run.checkpoint.title")}</h2>
        </div>
        {activeCheckpoint ? (
          <span class="pill live">
            {t("run.checkpoint.afterSlide", {
              slide: activeCheckpoint.afterSlide
            })}
          </span>
        ) : null}
      </div>

      <div class="checkpoint-autosend">
        <label class="checkpoint-autosend-switch">
          <input
            type="checkbox"
            checked={autoSend}
            onChange={(event) =>
              onToggleAutoSend((event.target as HTMLInputElement).checked)
            }
          />
          <span>{t("run.checkpoint.autoSend")}</span>
        </label>
        <p class="hint">
          {t(autoSend
            ? "run.checkpoint.autoSendOn"
            : "run.checkpoint.autoSendOff")}
        </p>
      </div>

      {bridgeFailure ? (
        <div class="checkpoint-manual">
          <p class="error-text" role="alert">{bridgeFailure}</p>
          <p class="hint">{t("run.checkpoint.manualBody")}</p>
          {coverage.length ? (
            <label class="field">
              {t("run.checkpoint.manualSelect")}
              <select
                value=""
                onChange={(event) => {
                  const slide = Number(
                    (event.target as HTMLSelectElement).value
                  );
                  const selected = coverage.find(
                    (item) => item.checkpoint_after_slide === slide
                  );
                  if (selected) onManualCheckpoint(selected);
                }}
              >
                <option value="">{t("run.checkpoint.choose")}</option>
                {coverage.map((item) => (
                  <option value={item.checkpoint_after_slide}>
                    {t("run.checkpoint.option", {
                      slide: item.checkpoint_after_slide,
                      count: item.candidate_count
                    })}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}

      {state.type === "idle" ? (
        <div class="stack">
          <p>{t("run.checkpoint.teaching")}</p>
          <p class="hint">
            {state.nextCheckpoint
              ? t("run.checkpoint.next", { slide: state.nextCheckpoint })
              : t("run.checkpoint.finalReached")}
          </p>
        </div>
      ) : null}

      {state.type === "loading" ? (
        <p class="hint" role="status">
          {t("run.checkpoint.loading", { slide: state.checkpoint })}
        </p>
      ) : null}

      {state.type === "ready" ? (
        <div class="stack">
          <p class="eyebrow">
            {t(`difficulty.${state.question.difficulty}`)}
            {" · "}
            {t("run.checkpoint.source", {
              start: state.question.source_slide_start,
              end: state.question.source_slide_end
            })}
          </p>
          <h3>
            {(useSpanish && state.question.prompt_es)
              || state.question.prompt}
          </h3>
          <div class="stack checkpoint-options">
            {state.question.options.map((option) => (
              <div class="pulse-choice" key={option.key}>
                {(useSpanish && option.text_es) || option.text}
              </div>
            ))}
          </div>
          <div class="row">
            <button
              class="btn primary"
              type="button"
              disabled={busy}
              onClick={onSend}
            >
              {busy ? t("run.pushing") : t("run.push")}
            </button>
            <button
              class="btn"
              type="button"
              disabled={busy}
              onClick={onDrawAgain}
            >
              {t("run.drawAgain")}
            </button>
            <button
              class="btn quiet"
              type="button"
              disabled={busy}
              onClick={onContinue}
            >
              {t("run.checkpoint.skip")}
            </button>
          </div>
          <p class="hint">
            {autoSend
              ? t("run.checkpoint.autoSendHeld")
              : t("run.checkpoint.spaceHint")}
          </p>
        </div>
      ) : null}

      {round ? (
        <div class="stack">
          <div class="row checkpoint-panel-heading">
            <p class="eyebrow">
              {state.type === "revealed"
                ? t("run.revealed")
                : t("run.liveQuestion")}
            </p>
            <span class={`pill ${remaining > 0 ? "live" : "hidden"}`}>
              {state.type === "open"
                ? remaining > 0
                  ? t("run.timeLeft", { seconds: remaining })
                  : t("run.timeUp")
                : t("run.revealed")}
            </span>
          </div>
          <h3>{(useSpanish && round.text_es) || round.text}</h3>
          <div class="stack checkpoint-results">
            {(results?.distribution
              ?? round.options.map((option) => ({ ...option, count: 0 }))
            ).map((option) => {
              const total = Math.max(1, results?.answered ?? 0);
              const share = Math.round(
                ((option.count ?? 0) / total) * 100
              );
              const roundOption = round.options.find(
                (candidate) => candidate.key === option.key
              );
              const isCorrect =
                state.type === "revealed"
                && option.key === round.correct_key;
              return (
                <div class={`pulse-bar${isCorrect ? " correct" : ""}`} key={option.key}>
                  <div
                    class="pulse-bar-fill"
                    style={`width: ${results?.answered ? share : 0}%`}
                  />
                  <span class="pulse-bar-label">
                    {(useSpanish && roundOption?.text_es) || option.text}
                    {isCorrect ? ` ✓ ${t("run.correctAnswer")}` : ""}
                  </span>
                  <span class="pulse-bar-count">{option.count ?? 0}</span>
                </div>
              );
            })}
          </div>
          <p class="hint">
            {/* Against the roster this reads "3 of 28" in a room of nine and
                looks like failure. The count that matters is who scanned in. */}
            {results?.present
              ? t("run.answeredOfPresent", {
                answered: results.answered,
                present: results.present,
                enrolled: results.enrolled
              })
              : t("run.answeredOf", {
                answered: results?.answered ?? 0,
                enrolled: results?.enrolled ?? 0
              })}
            {state.type === "revealed" && results
              ? ` · ${t("run.correctCount", { correct: results.correct })}`
              : ""}
          </p>
          <div class="row">
            {state.type === "open" ? (
              <button
                class="btn primary"
                type="button"
                disabled={busy}
                onClick={onReveal}
              >
                {t("run.reveal")}
              </button>
            ) : (
              <button
                class="btn primary"
                type="button"
                disabled={busy}
                onClick={onContinue}
              >
                {t("run.checkpoint.continue")}
              </button>
            )}
            {state.type === "open" ? (
              <button
                class="btn quiet"
                type="button"
                disabled={busy}
                onClick={onContinue}
              >
                {t("run.checkpoint.closeContinue")}
              </button>
            ) : null}
          </div>
          <p class="hint">
            {state.type === "open"
              ? autoSend
                ? t("run.checkpoint.autoRevealHint")
                : t("run.checkpoint.spaceRevealHint")
              : autoSend
                ? t("run.checkpoint.revealedAutoHint")
                : t("run.checkpoint.arrowHint")}
          </p>
        </div>
      ) : null}

      {state.type === "error" ? (
        <div class="stack">
          <p class="error-text" role="alert">{state.message}</p>
          <div class="row">
            <button
              class="btn primary"
              type="button"
              disabled={busy}
              onClick={() => onRetry(state.checkpoint)}
            >
              {t("app.tryAgain")}
            </button>
            <button
              class="btn quiet"
              type="button"
              disabled={busy}
              onClick={onContinue}
            >
              {t("run.checkpoint.skip")}
            </button>
          </div>
        </div>
      ) : null}

      {/* `coverage` is the LEGACY deck-checkpoint map, and only a
          platform-generated deck has one. An imported deck has none by design
          (migration 0036), so gating the quiz on it told a professor
          mid-class that the quiz was unavailable when the bank was sitting
          right there — the quiz only ever needed an active bank. Empty
          coverage now means "this deck will not stop by itself", nothing
          more; the Class question plan below drives the questions. */}
      {!coverage.length ? (
        <div class="checkpoint-no-bank">
          <p class="hint">
            {finalQuizAvailable
              ? t("run.checkpoint.planDrivenBank")
              : t("run.checkpoint.noBank")}
          </p>
          {finalQuizAvailable ? null : (
            <a class="btn quiet" href="/teach/content">
              {t("run.checkpoint.openContent")}
            </a>
          )}
        </div>
      ) : null}

      {finalQuizAvailable ? (
        <button
          class="btn quiet checkpoint-final-action"
          type="button"
          onClick={onOpenFinalQuiz}
        >
          {t("endOfClass.title")}
        </button>
      ) : null}
    </aside>
  );
}
