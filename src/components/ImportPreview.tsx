// Preview and repair grid for an externally authored question file.
//
// The parser (features/import/questionFile.ts) is the only place that knows
// how to turn a raw file into problems and back. Rather than re-implement its
// validation rules here, every edit re-serializes the whole bank back into
// the file shape and calls parseQuestionFile() again — the same function the
// initial load used. A repair therefore clears its own flag exactly the same
// way loading a corrected file would, and the two code paths can never drift.
import {
  bankIsImportable,
  groupBySlide,
  parseQuestionFile,
  questionIsImportable,
  type Difficulty,
  type ImportLanguage,
  type NormalizedOption,
  type NormalizedQuestion,
  type ParsedBank
} from "../features/import/questionFile";
import { t } from "../i18n";
import type { StringKey } from "../i18n/strings";

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

function localized(language: ImportLanguage, primary: string, secondary: string | null) {
  if (language === "es") return { es: primary };
  if (language === "en") return { en: primary };
  return { en: primary, es: secondary ?? "" };
}

function serializeQuestion(question: NormalizedQuestion, language: ImportLanguage) {
  return {
    prompt: localized(language, question.prompt, question.prompt_es),
    options: question.options
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((option) => ({
        text: localized(language, option.option_text, option.option_text_es),
        correct: option.is_correct
      })),
    difficulty: question.difficulty,
    covers_up_to_slide: question.covers_up_to_slide ?? undefined,
    topic: question.topic ?? undefined,
    intended_use: question.topic_tags[0] ?? undefined
  };
}

/** Round-trips a ParsedBank back through the file shape the parser reads, so
 *  re-validation is always the real parser, never a second copy of its rules. */
function serializeBank(bank: ParsedBank) {
  return {
    schema: "tc2007b.bank.v1",
    title: localized(bank.language, bank.title, bank.title_es),
    language: bank.language,
    questions: bank.questions.map((question) => serializeQuestion(question, bank.language))
  };
}

function reparseWithEdit(
  bank: ParsedBank,
  questionIndex: number,
  edit: (question: NormalizedQuestion) => NormalizedQuestion
): ParsedBank {
  const nextQuestions = bank.questions.map((question) =>
    question.index === questionIndex ? edit(question) : question
  );
  const raw = serializeBank({ ...bank, questions: nextQuestions });
  return parseQuestionFile(JSON.stringify(raw));
}

function setPrompt(question: NormalizedQuestion, value: string): NormalizedQuestion {
  return { ...question, prompt: value };
}

function setPromptEs(question: NormalizedQuestion, value: string): NormalizedQuestion {
  return { ...question, prompt_es: value };
}

function setDifficulty(question: NormalizedQuestion, value: Difficulty): NormalizedQuestion {
  return { ...question, difficulty: value, difficulty_defaulted: false };
}

function setOptionText(question: NormalizedQuestion, position: number, value: string): NormalizedQuestion {
  return {
    ...question,
    options: question.options.map((option): NormalizedOption =>
      option.position === position ? { ...option, option_text: value } : option
    )
  };
}

function setOptionTextEs(question: NormalizedQuestion, position: number, value: string): NormalizedQuestion {
  return {
    ...question,
    options: question.options.map((option): NormalizedOption =>
      option.position === position ? { ...option, option_text_es: value } : option
    )
  };
}

function setCorrectOption(question: NormalizedQuestion, position: number): NormalizedQuestion {
  return {
    ...question,
    options: question.options.map((option): NormalizedOption => ({
      ...option,
      is_correct: option.position === position
    }))
  };
}

export function ImportPreview({
  bank,
  onChange,
  onCommit
}: {
  bank: ParsedBank;
  onChange: (next: ParsedBank) => void;
  onCommit: () => void;
}) {
  const groups = groupBySlide(bank.questions);
  const importable = bankIsImportable(bank);

  function edit(questionIndex: number, updater: (question: NormalizedQuestion) => NormalizedQuestion) {
    onChange(reparseWithEdit(bank, questionIndex, updater));
  }

  return (
    <div class="stack import-preview">
      {groups.map((group) => (
        <section class="stack" key={group.slide ?? "unslotted"}>
          <h3>
            {group.slide !== null
              ? t("import.group.upToSlide", { slide: group.slide })
              : t("import.group.noSlide")}
          </h3>
          <div class="stack">
            {group.questions.map((question) => (
              <QuestionEditor
                key={question.index}
                question={question}
                language={bank.language}
                onEdit={(updater) => edit(question.index, updater)}
              />
            ))}
          </div>
        </section>
      ))}

      <div class="row" style="justify-content: space-between; align-items: center;">
        {!importable ? <p class="error-text" role="alert">{t("import.fixFirst")}</p> : <span />}
        <button class="btn primary" type="button" disabled={!importable} onClick={onCommit}>
          {t("import.commit")}
        </button>
      </div>
    </div>
  );
}

function QuestionEditor({
  question,
  language,
  onEdit
}: {
  question: NormalizedQuestion;
  language: ImportLanguage;
  onEdit: (updater: (question: NormalizedQuestion) => NormalizedQuestion) => void;
}) {
  const importable = questionIsImportable(question);
  const showSpanish = language === "both";

  return (
    <article class={`card${importable ? "" : " muted"}`}>
      <div class="row" style="justify-content: space-between; align-items: flex-start;">
        <div class="row">
          <span class={`pill ${question.difficulty === "hard" ? "warn" : "hidden"}`}>
            {t(`quiz.difficulty.${question.difficulty}` as "quiz.difficulty.easy")}
          </span>
          {question.difficulty_defaulted ? (
            <span class="pill warn">{t("import.difficultyDefaulted")}</span>
          ) : null}
          {!importable ? <span class="pill warn">{t("import.fixFirst")}</span> : null}
        </div>
        {question.topic ? <span class="hint">{question.topic}</span> : null}
      </div>

      {question.problems.map((problem, index) => (
        <p class="error-text" role="alert" key={index}>
          {t(problem.messageKey as StringKey, { detail: problem.detail ?? "" })}
        </p>
      ))}

      <label class="field">
        {t("content.banks.field.prompt")}
        <textarea
          rows={2}
          value={question.prompt}
          onInput={(event) => onEdit((q) => setPrompt(q, (event.target as HTMLTextAreaElement).value))}
        />
      </label>
      {showSpanish ? (
        <label class="field">
          {t("content.banks.field.promptEs")}
          <textarea
            rows={2}
            value={question.prompt_es ?? ""}
            onInput={(event) => onEdit((q) => setPromptEs(q, (event.target as HTMLTextAreaElement).value))}
          />
        </label>
      ) : null}

      <label class="field" style="max-width: 12rem;">
        {t("content.banks.field.difficulty")}
        <select
          value={question.difficulty}
          onChange={(event) =>
            onEdit((q) => setDifficulty(q, (event.target as HTMLSelectElement).value as Difficulty))
          }
        >
          <option value="easy">{t("quiz.difficulty.easy")}</option>
          <option value="medium">{t("quiz.difficulty.medium")}</option>
          <option value="hard">{t("quiz.difficulty.hard")}</option>
        </select>
      </label>

      <div class="stack" style="gap: 0.5rem;">
        {question.options.map((option) => (
          <div class="row" style="align-items: flex-start;" key={option.position}>
            <label class="checkbox-label" style="padding-top: 0.55rem;">
              <input
                type="radio"
                name={`import-correct-${question.index}`}
                checked={option.is_correct}
                onChange={() => onEdit((q) => setCorrectOption(q, option.position))}
              />
              {OPTION_LETTERS[option.position] ?? String(option.position + 1)}
            </label>
            <div class="stack" style="flex: 1 1 auto; gap: 0.35rem;">
              <input
                type="text"
                value={option.option_text}
                placeholder={t("content.banks.field.option", {
                  letter: OPTION_LETTERS[option.position] ?? String(option.position + 1)
                })}
                onInput={(event) =>
                  onEdit((q) => setOptionText(q, option.position, (event.target as HTMLInputElement).value))
                }
              />
              {showSpanish ? (
                <input
                  type="text"
                  value={option.option_text_es ?? ""}
                  placeholder={t("content.banks.field.optionEs", {
                    letter: OPTION_LETTERS[option.position] ?? String(option.position + 1)
                  })}
                  onInput={(event) =>
                    onEdit((q) => setOptionTextEs(q, option.position, (event.target as HTMLInputElement).value))
                  }
                />
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
