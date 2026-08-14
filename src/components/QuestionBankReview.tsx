import { useEffect, useState } from "preact/hooks";
import {
  deleteQuestion,
  listQuestions,
  updateQuestion,
  type BankQuestion
} from "../api/checkpoints";
import { ConfirmButton } from "./ConfirmButton";
import { t, apiErrorText } from "../i18n";

type DraftOption = {
  text: string;
  text_es: string;
  is_correct: boolean;
};

type QuestionDraft = {
  id: string;
  prompt: string;
  prompt_es: string;
  explanation: string;
  explanation_es: string;
  difficulty: BankQuestion["difficulty"];
  options: DraftOption[];
};

export function QuestionBankReview({
  bankId,
  onChanged
}: {
  bankId: string;
  onChanged: () => Promise<unknown>;
}) {
  const [questions, setQuestions] = useState<BankQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<QuestionDraft | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setError(null);
    try {
      const response = await listQuestions(bankId);
      setQuestions(response.questions);
    } catch (cause) {
      setError(apiErrorText(cause, "content.banks.questionsLoadFailed"));
    }
  }

  useEffect(() => {
    void load();
  }, [bankId]);

  function beginEdit(question: BankQuestion) {
    setNotice(null);
    setDraft({
      id: question.id,
      prompt: question.prompt,
      prompt_es: question.prompt_es || "",
      explanation: question.explanation || "",
      explanation_es: question.explanation_es || "",
      difficulty: question.difficulty,
      options: question.question_options.map((option) => ({
        text: option.option_text,
        text_es: option.option_text_es || "",
        is_correct: option.is_correct
      }))
    });
  }

  function updateDraft(field: keyof Omit<QuestionDraft, "id" | "options">, value: string) {
    setDraft((current) => current ? { ...current, [field]: value } : current);
  }

  function updateOption(index: number, field: keyof DraftOption, value: string | boolean) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        options: current.options.map((option, optionIndex) =>
          optionIndex === index
            ? { ...option, [field]: value }
            : field === "is_correct" && value === true
              ? { ...option, is_correct: false }
              : option
        )
      };
    });
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await updateQuestion({
        question_bank_id: bankId,
        question_id: draft.id,
        prompt: draft.prompt,
        prompt_es: draft.prompt_es || null,
        explanation: draft.explanation || null,
        explanation_es: draft.explanation_es || null,
        difficulty: draft.difficulty,
        options: draft.options
      });
      setDraft(null);
      setNotice(t("content.banks.questionSaved"));
      await Promise.all([load(), onChanged()]);
    } catch (cause) {
      setError(apiErrorText(cause, "content.banks.questionSaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(question: BankQuestion) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await deleteQuestion({ question_bank_id: bankId, question_id: question.id });
      if (draft?.id === question.id) setDraft(null);
      setNotice(t("content.banks.questionDeleted"));
      await Promise.all([load(), onChanged()]);
    } catch (cause) {
      setError(apiErrorText(cause, "content.banks.questionDeleteFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="question-bank-review card muted">
      <h3>{t("content.banks.reviewQuestions")}</h3>
      <p class="hint">{t("content.banks.lede")}</p>
      {error ? <p class="error-text" role="alert">{error}</p> : null}
      {notice ? <p class="hint" role="status">{notice}</p> : null}
      {questions === null ? (
        <p class="hint" role="status">{t("content.banks.loadingQuestions")}</p>
      ) : !questions.length ? (
        <p class="hint">{t("content.banks.emptyTitle")}</p>
      ) : (
        <div class="stack question-bank-question-list">
          {questions.map((question, index) => (
            <QuestionReviewCard
              key={question.id}
              question={question}
              index={index}
              draft={draft?.id === question.id ? draft : null}
              busy={busy}
              onEdit={() => beginEdit(question)}
              onCancel={() => setDraft(null)}
              onSave={() => void save()}
              onDelete={() => void remove(question)}
              onDraftField={updateDraft}
              onDraftOption={updateOption}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function QuestionReviewCard({
  question,
  index,
  draft,
  busy,
  onEdit,
  onCancel,
  onSave,
  onDelete,
  onDraftField,
  onDraftOption
}: {
  question: BankQuestion;
  index: number;
  draft: QuestionDraft | null;
  busy: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete: () => void;
  onDraftField: (field: keyof Omit<QuestionDraft, "id" | "options">, value: string) => void;
  onDraftOption: (index: number, field: keyof DraftOption, value: string | boolean) => void;
}) {
  const letters = ["A", "B", "C", "D"];
  const correctCount = draft?.options.filter((option) => option.is_correct).length ?? 1;

  return (
    <article class="question-bank-question card">
      <div class="row" style="justify-content: space-between; align-items: flex-start;">
        <div>
          <p class="eyebrow">{t("content.banks.questionNumber", { number: index + 1 })}</p>
          <div class="row question-bank-question-tags">
            <span class="pill">{t("content.banks.endOfClass")}</span>
            {typeof question.checkpoint_after_slide === "number" ? (
              <span class="pill live">
                {t("content.banks.duringClass")} · {t("content.banks.afterSlide", { slide: question.checkpoint_after_slide })}
              </span>
            ) : typeof question.suggested_slide_hint === "number" ? (
              <span class="pill live">
                {t("content.banks.duringClass")} · {t("content.banks.afterSlide", { slide: question.suggested_slide_hint })}
              </span>
            ) : null}
            {question.source === "generated_edited" ? (
              <span class="pill hidden">{t("content.banks.sourceEdited")}</span>
            ) : null}
          </div>
        </div>
        {!draft ? (
          <div class="row">
            <button class="btn quiet" type="button" disabled={busy} onClick={onEdit}>
              {t("content.banks.editQuestion")}
            </button>
            <ConfirmButton
              label={t("content.banks.deleteQuestion")}
              confirmLabel={t("app.pressAgainConfirm")}
              className="btn quiet"
              disabled={busy}
              onConfirm={onDelete}
            />
          </div>
        ) : null}
      </div>

      {draft ? (
        <div class="stack question-bank-editor">
          <label class="field">
            {t("content.banks.field.prompt")}
            <textarea rows={3} value={draft.prompt} onInput={(event) => onDraftField("prompt", (event.target as HTMLTextAreaElement).value)} />
          </label>
          <label class="field">
            {t("content.banks.field.promptEs")}
            <textarea rows={3} value={draft.prompt_es} onInput={(event) => onDraftField("prompt_es", (event.target as HTMLTextAreaElement).value)} />
          </label>
          <div class="grid-2">
            <label class="field">
              {t("content.banks.field.explanation")}
              <textarea rows={2} value={draft.explanation} onInput={(event) => onDraftField("explanation", (event.target as HTMLTextAreaElement).value)} />
            </label>
            <label class="field">
              {t("content.banks.field.explanationEs")}
              <textarea rows={2} value={draft.explanation_es} onInput={(event) => onDraftField("explanation_es", (event.target as HTMLTextAreaElement).value)} />
            </label>
          </div>
          <label class="field question-bank-difficulty">
            {t("content.banks.field.difficulty")}
            <select value={draft.difficulty} onChange={(event) => onDraftField("difficulty", (event.target as HTMLSelectElement).value)}>
              <option value="easy">{t("quiz.difficulty.easy")}</option>
              <option value="medium">{t("quiz.difficulty.medium")}</option>
              <option value="hard">{t("quiz.difficulty.hard")}</option>
            </select>
          </label>
          <div class="stack question-bank-editor-options">
            {draft.options.map((option, optionIndex) => (
              <div class="question-bank-editor-option" key={optionIndex}>
                <div class="row" style="justify-content: space-between;">
                  <strong>{t("content.banks.field.option", { letter: letters[optionIndex] })}</strong>
                  <label class="checkbox-label">
                    <input type="radio" name={`correct-${question.id}`} checked={option.is_correct} onChange={() => onDraftOption(optionIndex, "is_correct", true)} />
                    {t("content.banks.correctOption")}
                  </label>
                </div>
                <input type="text" value={option.text} onInput={(event) => onDraftOption(optionIndex, "text", (event.target as HTMLInputElement).value)} />
                <input type="text" value={option.text_es} placeholder={t("content.banks.field.optionEs", { letter: letters[optionIndex] })} onInput={(event) => onDraftOption(optionIndex, "text_es", (event.target as HTMLInputElement).value)} />
              </div>
            ))}
          </div>
          <p class="hint">
            {correctCount === 1 ? t("content.banks.correctOption") : `${correctCount} / 1`}
          </p>
          <div class="row">
            <button class="btn primary" type="button" disabled={busy || correctCount !== 1} onClick={onSave}>
              {busy ? t("content.banks.savingQuestion") : t("content.banks.saveQuestion")}
            </button>
            <button class="btn quiet" type="button" disabled={busy} onClick={onCancel}>
              {t("content.banks.cancelEdit")}
            </button>
          </div>
        </div>
      ) : (
        <>
          <h4>{question.prompt}</h4>
          {question.prompt_es ? <p class="hint">{question.prompt_es}</p> : null}
          <div class="question-bank-answer-list">
            {question.question_options.map((option, optionIndex) => (
              <div class={`question-bank-answer${option.is_correct ? " correct" : ""}`} key={option.id}>
                <strong>{letters[optionIndex]}</strong>
                <span>{option.option_text}{option.option_text_es ? <small>{option.option_text_es}</small> : null}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </article>
  );
}
