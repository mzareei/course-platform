// Every question, what the student chose, what was right, and why — read after
// submitting, while the exit ticket is open. The ten-second break is enough to
// see a ✅ or an ❌; it is not enough to read a paragraph, so the paragraphs
// wait here.
//
// This only ever renders from Player.tsx's `result` branch, which is only
// reached after submit_attempt has already graded the attempt. `correct` is
// the server's own answer key for THIS attempt — never build this list, or
// pass this prop, anywhere a round could still be open.
import type { QuizQuestion } from "../../api/quiz";
import { t, lang } from "../../i18n";

export function ReviewList({
  questions,
  answers,
  correct
}: {
  questions: QuizQuestion[];
  answers: Record<string, string>;
  /** question id -> correct option id */
  correct: Record<string, string>;
}) {
  const es = lang.value === "es";
  return (
    <div class="stack quiz-review" data-testid="quiz-review">
      <h3>{t("quiz.reviewTitle")}</h3>
      {questions.map((question, index) => {
        const chosen = question.options.find((o) => o.id === answers[question.id]);
        const right = question.options.find((o) => o.id === correct[question.id]);
        const wasCorrect = Boolean(chosen && right && chosen.id === right.id);
        const explanation = (es && question.explanation_es) || question.explanation;
        return (
          <div class="card muted quiz-review-item" key={question.id}>
            <p class="eyebrow">
              {wasCorrect ? "✅" : "❌"} {t("quiz.questionN", { n: index + 1, total: questions.length })}
            </p>
            <p class="quiz-review-prompt">{(es && question.prompt_es) || question.prompt}</p>
            <p class="hint">
              {chosen
                ? t("quiz.youChose", { answer: (es && chosen.option_text_es) || chosen.option_text })
                : t("quiz.youSkipped")}
            </p>
            {!wasCorrect && right ? (
              <p class="quiz-review-answer">
                {t("quiz.correctAnswerWas", { answer: (es && right.option_text_es) || right.option_text })}
              </p>
            ) : null}
            {explanation ? <p class="quiz-review-why">{explanation}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
