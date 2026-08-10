import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const root = new URL("..", import.meta.url);
const source = await readFile(new URL("src/features/import/questionFile.ts", root), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const mod = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const bilingual = (en, es) => ({ en, es });
const goodQuestion = {
  prompt: bilingual("What is least privilege?", "¿Qué es el menor privilegio?"),
  options: [
    { text: bilingual("Minimum access needed", "Acceso mínimo necesario"), correct: true },
    { text: bilingual("Maximum access", "Acceso máximo"), correct: false },
    { text: bilingual("No access", "Sin acceso"), correct: false },
    { text: bilingual("Shared access", "Acceso compartido"), correct: false }
  ],
  difficulty: "hard",
  covers_up_to_slide: 15,
  topic: "Least privilege",
  intended_use: "pulse"
};
const file = (overrides) => JSON.stringify({
  schema: "tc2007b.bank.v1",
  title: bilingual("Week 5", "Semana 5"),
  language: "both",
  questions: [goodQuestion],
  ...overrides
});

assert.equal(mod.PROMPT_MAX, 4000, "prompt limit must match the questions.prompt column");
assert.equal(mod.OPTION_MAX, 2000, "option limit must match the option_text column");

const ok = mod.parseQuestionFile(file());
assert.equal(ok.ok, true);
assert.equal(ok.fileProblem, null);
assert.equal(ok.questions.length, 1);
assert.equal(ok.questions[0].prompt, "What is least privilege?");
assert.equal(ok.questions[0].prompt_es, "¿Qué es el menor privilegio?");
assert.equal(ok.questions[0].difficulty, "hard");
assert.equal(ok.questions[0].difficulty_defaulted, false);
assert.deepEqual(ok.questions[0].problems, []);
assert.equal(mod.questionIsImportable(ok.questions[0]), true);
assert.equal(mod.bankIsImportable(ok), true);
assert.deepEqual(ok.questions[0].topic_tags, ["pulse"]);
assert.equal(ok.questions[0].options[0].is_correct, true);
assert.equal(ok.questions[0].options[0].option_text_es, "Acceso mínimo necesario");

const broken = mod.parseQuestionFile("{ not json");
assert.equal(broken.ok, false);
assert.ok(broken.fileProblem, "a JSON parse failure must be reported at file level");
assert.equal(broken.questions.length, 0);

const spanishOnly = mod.parseQuestionFile(JSON.stringify({
  schema: "tc2007b.bank.v1",
  title: { es: "Semana 5" },
  language: "es",
  questions: [{
    prompt: { es: "¿Qué es el menor privilegio?" },
    options: [
      { text: { es: "Acceso mínimo" }, correct: true },
      { text: { es: "Acceso máximo" }, correct: false },
      { text: { es: "Sin acceso" }, correct: false },
      { text: { es: "Acceso compartido" }, correct: false }
    ],
    difficulty: "easy"
  }]
}));
assert.equal(
  spanishOnly.questions[0].prompt, "¿Qué es el menor privilegio?",
  "a Spanish-only file must land in the PRIMARY column so it shows for every student"
);
assert.equal(spanishOnly.questions[0].prompt_es, null);
assert.equal(spanishOnly.questions[0].options[0].option_text, "Acceso mínimo");
assert.equal(spanishOnly.questions[0].options[0].option_text_es, null);
assert.equal(mod.bankIsImportable(spanishOnly), true);

const defaulted = mod.parseQuestionFile(file({
  questions: [{ ...goodQuestion, difficulty: undefined }]
}));
assert.equal(defaulted.questions[0].difficulty, "medium");
assert.equal(
  defaulted.questions[0].difficulty_defaulted, true,
  "a defaulted difficulty must be visible, not silent"
);
assert.equal(mod.questionIsImportable(defaulted.questions[0]), true);

const threeOptions = mod.parseQuestionFile(file({
  questions: [{ ...goodQuestion, options: goodQuestion.options.slice(0, 3) }]
}));
assert.equal(mod.questionIsImportable(threeOptions.questions[0]), false);
assert.ok(threeOptions.questions[0].problems.some((p) => p.field === "options"));
assert.equal(
  threeOptions.ok, true,
  "one unusable question must NOT fail the whole file — it is repaired inline"
);

const noCorrect = mod.parseQuestionFile(file({
  questions: [{
    ...goodQuestion,
    options: goodQuestion.options.map((o) => ({ ...o, correct: false }))
  }]
}));
assert.equal(mod.questionIsImportable(noCorrect.questions[0]), false);

const twoCorrect = mod.parseQuestionFile(file({
  questions: [{
    ...goodQuestion,
    options: goodQuestion.options.map((o, i) => ({ ...o, correct: i < 2 }))
  }]
}));
assert.equal(mod.questionIsImportable(twoCorrect.questions[0]), false);

const longPrompt = mod.parseQuestionFile(file({
  questions: [{ ...goodQuestion, prompt: bilingual("x".repeat(4001), "y") }]
}));
assert.equal(
  mod.questionIsImportable(longPrompt.questions[0]), false,
  "over-length must be caught BEFORE insert — pitfall #7"
);
assert.ok(longPrompt.questions[0].problems.some((p) => p.field === "prompt"));

const longOption = mod.parseQuestionFile(file({
  questions: [{
    ...goodQuestion,
    options: [
      { text: bilingual("z".repeat(2001), "a"), correct: true },
      ...goodQuestion.options.slice(1)
    ]
  }]
}));
assert.equal(mod.questionIsImportable(longOption.questions[0]), false);

const missingEs = mod.parseQuestionFile(file({
  questions: [{ ...goodQuestion, prompt: { en: "Only English" } }]
}));
assert.ok(
  missingEs.questions[0].problems.some((p) => p.field === "prompt.es"),
  "a file declaring language 'both' must flag a missing Spanish field"
);

const grouped = mod.groupBySlide([
  { ...ok.questions[0], covers_up_to_slide: 20 },
  { ...ok.questions[0], covers_up_to_slide: 15 },
  { ...ok.questions[0], covers_up_to_slide: 15 },
  { ...ok.questions[0], covers_up_to_slide: null }
]);
assert.deepEqual(
  grouped.map((g) => [g.slide, g.questions.length]),
  [[15, 2], [20, 1], [null, 1]],
  "groups ascend by slide with ungrouped questions last"
);

const [api, preview, content, strings] = await Promise.all([
  readFile(new URL("src/api/contentImport.ts", root), "utf8"),
  readFile(new URL("src/components/ImportPreview.tsx", root), "utf8"),
  readFile(new URL("src/screens/instructor/Content.tsx", root), "utf8"),
  readFile(new URL("src/i18n/strings.ts", root), "utf8")
]);

assert.match(api, /export async function importContent/);
assert.match(api, /course-content-import/);
assert.match(preview, /groupBySlide/, "the preview must group by slide range as designed");
assert.match(preview, /difficulty_defaulted/, "a defaulted difficulty must be visible");
assert.match(preview, /questionIsImportable/);
assert.match(content, /ImportPreview/);
assert.match(strings, /"import\.problem\.optionCount"/);
assert.match(strings, /"import\.problem\.correctCount"/);
assert.match(strings, /"import\.problem\.promptTooLong"/);
assert.match(strings, /"import\.problem\.missingSpanish"/);
assert.match(strings, /"import\.deck\.relative"/);
assert.match(strings, /"import\.deck\.forbiddenHost"/);
assert.match(strings, /"import\.noAutoCue"/, "the capability difference must be stated, not discovered");

console.log("content import parser verified");
