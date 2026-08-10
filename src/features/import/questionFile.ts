// Parses the question file a professor's own AI produced.
//
// The platform makes no model call here. This module's whole job is to turn
// somebody else's JSON into the exact column shape the database already uses,
// and to say precisely what is wrong with a question that could not be
// displayed — so the professor repairs it in the preview rather than being
// bounced back to their chat window.
//
// Limits are the database's own, not this module's invention:
// questions.prompt is 1..4000 and question_options.option_text is 1..2000.
// A verbose generated question that passes an app-level check and is then
// refused by Postgres at insert is pitfall #7 repeating itself.

export const PROMPT_MAX = 4000;
export const OPTION_MAX = 2000;

export type ImportLanguage = "en" | "es" | "both";
export type Difficulty = "easy" | "medium" | "hard";

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
const USES = ["pulse", "final", "both"];

export interface QuestionProblem {
  field: string;
  messageKey: string;
  detail?: string;
}

export interface NormalizedOption {
  option_text: string;
  option_text_es: string | null;
  is_correct: boolean;
  position: number;
}

export interface NormalizedQuestion {
  index: number;
  prompt: string;
  prompt_es: string | null;
  options: NormalizedOption[];
  difficulty: Difficulty;
  difficulty_defaulted: boolean;
  covers_up_to_slide: number | null;
  topic: string | null;
  topic_tags: string[];
  problems: QuestionProblem[];
}

export interface ParsedBank {
  ok: boolean;
  fileProblem: string | null;
  title: string;
  title_es: string | null;
  language: ImportLanguage;
  questions: NormalizedQuestion[];
}

export interface SlideGroup {
  slide: number | null;
  questions: NormalizedQuestion[];
}

interface Localized { en?: unknown; es?: unknown }

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Which key holds the primary column, given the file's declared language.
 *  A single-language file lands in the primary column so it renders for every
 *  student regardless of their personal toggle. */
function pick(pair: Localized | undefined, language: ImportLanguage) {
  const en = text(pair?.en);
  const es = text(pair?.es);
  if (language === "es") return { primary: es, secondary: null as string | null };
  if (language === "en") return { primary: en, secondary: null as string | null };
  return { primary: en, secondary: es || null };
}

function inferLanguage(raw: Record<string, unknown>): ImportLanguage {
  const declared = text(raw.language).toLowerCase();
  if (declared === "en" || declared === "es" || declared === "both") return declared;
  const questions = Array.isArray(raw.questions) ? raw.questions : [];
  let sawEn = false;
  let sawEs = false;
  for (const entry of questions) {
    const prompt = (entry as { prompt?: Localized })?.prompt;
    if (text(prompt?.en)) sawEn = true;
    if (text(prompt?.es)) sawEs = true;
  }
  if (sawEn && sawEs) return "both";
  if (sawEs) return "es";
  return "en";
}

function normalizeOption(
  raw: unknown, position: number, language: ImportLanguage, problems: QuestionProblem[]
): NormalizedOption {
  const entry = (raw ?? {}) as { text?: Localized; correct?: unknown };
  const { primary, secondary } = pick(entry.text, language);
  if (!primary) {
    problems.push({ field: `options.${position}`, messageKey: "import.problem.optionEmpty" });
  }
  if (primary.length > OPTION_MAX) {
    problems.push({
      field: `options.${position}`,
      messageKey: "import.problem.optionTooLong",
      detail: `${primary.length}/${OPTION_MAX}`
    });
  }
  if (secondary && secondary.length > OPTION_MAX) {
    problems.push({
      field: `options.${position}.es`,
      messageKey: "import.problem.optionTooLong",
      detail: `${secondary.length}/${OPTION_MAX}`
    });
  }
  if (language === "both" && !secondary) {
    problems.push({ field: `options.${position}.es`, messageKey: "import.problem.missingSpanish" });
  }
  return {
    option_text: primary,
    option_text_es: secondary,
    is_correct: entry.correct === true,
    position
  };
}

function normalizeQuestion(
  raw: unknown, index: number, language: ImportLanguage
): NormalizedQuestion {
  const entry = (raw ?? {}) as Record<string, unknown>;
  const problems: QuestionProblem[] = [];

  const { primary, secondary } = pick(entry.prompt as Localized, language);
  if (!primary) problems.push({ field: "prompt", messageKey: "import.problem.promptEmpty" });
  if (primary.length > PROMPT_MAX) {
    problems.push({
      field: "prompt",
      messageKey: "import.problem.promptTooLong",
      detail: `${primary.length}/${PROMPT_MAX}`
    });
  }
  if (secondary && secondary.length > PROMPT_MAX) {
    problems.push({
      field: "prompt.es",
      messageKey: "import.problem.promptTooLong",
      detail: `${secondary.length}/${PROMPT_MAX}`
    });
  }
  if (language === "both" && !secondary) {
    problems.push({ field: "prompt.es", messageKey: "import.problem.missingSpanish" });
  }

  const rawOptions = Array.isArray(entry.options) ? entry.options : [];
  const options = rawOptions.map((option, position) =>
    normalizeOption(option, position, language, problems)
  );
  if (options.length !== 4) {
    problems.push({
      field: "options",
      messageKey: "import.problem.optionCount",
      detail: String(options.length)
    });
  }
  const correct = options.filter((option) => option.is_correct).length;
  if (correct !== 1) {
    problems.push({
      field: "options",
      messageKey: "import.problem.correctCount",
      detail: String(correct)
    });
  }

  const declaredDifficulty = text(entry.difficulty).toLowerCase() as Difficulty;
  const known = DIFFICULTIES.includes(declaredDifficulty);
  const slide = Number(entry.covers_up_to_slide);
  const use = text(entry.intended_use).toLowerCase();
  const topic = text(entry.topic);

  return {
    index,
    prompt: primary,
    prompt_es: secondary,
    options,
    difficulty: known ? declaredDifficulty : "medium",
    difficulty_defaulted: !known,
    covers_up_to_slide: Number.isFinite(slide) && slide > 0 ? Math.floor(slide) : null,
    topic: topic || null,
    topic_tags: USES.includes(use) ? [use] : [],
    problems
  };
}

export function parseQuestionFile(input: string): ParsedBank {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(input) as Record<string, unknown>;
  } catch (error) {
    return {
      ok: false,
      fileProblem: error instanceof Error ? error.message : "The file is not valid JSON.",
      title: "",
      title_es: null,
      language: "both",
      questions: []
    };
  }
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.questions)) {
    return {
      ok: false,
      fileProblem: "The file has no questions array.",
      title: "",
      title_es: null,
      language: "both",
      questions: []
    };
  }

  const language = inferLanguage(raw);
  const title = pick(raw.title as Localized, language);
  return {
    ok: true,
    fileProblem: null,
    title: title.primary,
    title_es: title.secondary,
    language,
    questions: raw.questions.map((entry, index) => normalizeQuestion(entry, index, language))
  };
}

/** Structurally displayable. Not a judgment about whether the question is good —
 *  that is the professor's, and the platform never makes it. */
export function questionIsImportable(question: NormalizedQuestion): boolean {
  return question.problems.length === 0;
}

export function bankIsImportable(bank: ParsedBank): boolean {
  return bank.ok
    && bank.questions.length > 0
    && bank.questions.every(questionIsImportable);
}

/** Ascending by slide, with questions that name no slide last. */
export function groupBySlide(questions: NormalizedQuestion[]): SlideGroup[] {
  const slides = new Map<number | null, NormalizedQuestion[]>();
  for (const question of questions) {
    const key = question.covers_up_to_slide;
    const bucket = slides.get(key);
    if (bucket) bucket.push(question);
    else slides.set(key, [question]);
  }
  return [...slides.entries()]
    .sort(([a], [b]) => {
      if (a === null) return 1;
      if (b === null) return -1;
      return a - b;
    })
    .map(([slide, group]) => ({ slide, questions: group }));
}
