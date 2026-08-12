// Auto-ask for the class question plan.
//
// The professor's polls live in the plan, not in the deck's checkpoint map: an
// imported lecture has no checkpoint coverage by design (migration 0036), so
// `drawCheckpointQuestion` has nothing to draw and the deck-checkpoint path
// never produces a question. What the plan does have is `slide_hint` — the
// answer to "Which slide are you on?" — and the deck reports where it is. That
// pair is enough to send a planned poll the moment its slide comes up.
import type { PlanCheckpoint } from "../../api/classQuestionPlans";

export type DeckPosition = {
  /** The deck's own 1-based position, the number its counter shows. */
  slide: number | null;
  /** Authored teaching-slide number, which skips checkpoint slides. May be null. */
  teachingSlide: number | null;
};

/**
 * A deck reports two numbers for the same moment and they are not the same:
 * measured on the Week 1 deck, DOM slide 40 reports `teaching_slide: 37`,
 * because teaching numbering skips the checkpoint slides already passed.
 *
 * `slide_hint` is hand-typed into "Which slide are you on?", so it is whatever
 * the professor read off the deck's own counter — which is the DOM position.
 * Match that. Accepting the teaching number as well would fire a poll three
 * slides early on exactly the deck he teaches from. The teaching number is a
 * fallback only for a deck that somehow reports no counter value at all.
 *
 * Only `planned` checkpoints are eligible — one already sent or skipped must
 * never fire again when the professor pages back over its slide.
 */
export function planCheckpointForSlide(
  checkpoints: PlanCheckpoint[],
  position: DeckPosition
): PlanCheckpoint | null {
  const shown = position.slide ?? position.teachingSlide;
  const matches = (hint: number) => shown !== null && shown === hint;

  return checkpoints
    .filter((checkpoint) =>
      checkpoint.state === "planned"
      && typeof checkpoint.slide_hint === "number"
      && matches(checkpoint.slide_hint))
    .slice()
    .sort((a, b) => a.position - b.position)[0] || null;
}

/**
 * Deliberately the same conditions the "Ask now" button enforces, so an
 * automatic ask can never do something the professor could not have done by
 * hand. The one addition is `alreadyAsked`: a local latch so a re-render, a
 * plan refresh, or paging back and forth cannot push the same poll twice.
 */
export function shouldAutoAskPlanCheckpoint(input: {
  enabled: boolean;
  isLive: boolean;
  questionId: string;
  alreadyAsked: boolean;
}): boolean {
  return Boolean(
    input.enabled
    && input.isLive
    && input.questionId
    && !input.alreadyAsked
  );
}

/**
 * True when auto-ask is armed and the plan is keyed to slides, but the deck has
 * never said where it is. Every lecture after Week 1 is in this state: the deck
 * carries no bridge engine, so it cannot report a slide and no poll can send
 * itself. Saying so beats a professor waiting on a question that cannot come.
 */
export function deckCannotReportSlides(input: {
  enabled: boolean;
  deckReady: boolean;
  position: DeckPosition;
  checkpoints: PlanCheckpoint[];
}): boolean {
  if (!input.enabled) return false;
  if (input.position.slide !== null || input.position.teachingSlide !== null) {
    return false;
  }
  return (
    input.deckReady === false
    && input.checkpoints.some(
      (checkpoint) =>
        checkpoint.state === "planned" && typeof checkpoint.slide_hint === "number"
    )
  );
}
