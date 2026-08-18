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
assert.equal(ok.fileProblemKey, null, "a clean parse must carry no translatable file-level problem key");
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
assert.equal(
  broken.fileProblemKey, "import.problem.notJson",
  "a JSON parse failure must carry a translatable key — bank.fileProblem is raw V8 text and must never render directly"
);
assert.equal(broken.questions.length, 0);

const noQuestionsArray = mod.parseQuestionFile(JSON.stringify({ schema: "tc2007b.bank.v1" }));
assert.equal(noQuestionsArray.ok, false);
assert.equal(
  noQuestionsArray.fileProblemKey, "import.problem.noQuestions",
  "a missing questions array must carry its own translatable key, distinct from a JSON parse failure"
);

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

const [api, preview, content, strings, promptCard, deckPrompt] = await Promise.all([
  readFile(new URL("src/api/contentImport.ts", root), "utf8"),
  readFile(new URL("src/components/ImportPreview.tsx", root), "utf8"),
  readFile(new URL("src/screens/instructor/Content.tsx", root), "utf8"),
  readFile(new URL("src/i18n/strings.ts", root), "utf8"),
  readFile(new URL("src/components/ImportPromptCard.tsx", root), "utf8"),
  // Step 1 lives outside the .tsx on purpose — it quotes slide markup, and
  // verify-i18n.mjs reads >English sentence< inside any .tsx component as
  // untranslated JSX. See the header comment in deckPrompt.ts.
  readFile(new URL("src/features/import/deckPrompt.ts", root), "utf8")
]);

assert.match(api, /export async function importContent/);
assert.match(api, /course-content-import/);

// ------------------------------------------------- either half may go alone
// The edge function seeds {bank:{ok:false},deck:{ok:false}} and fills in only
// the halves it was given; writeDeck resolves its own slug, uploads its own
// bytes and writes its own content_items row with no bank involved. Both
// halves of the API type are optional. The screen was the only thing that
// required a bank — onCommit returned early without one, and the sole commit
// button lived inside ImportPreview, which renders only for a loaded bank. A
// professor could choose a deck HTML, see its filename echoed back, and have
// nothing on the page to press. That is the exact order the two-step authoring
// flow produces files in, so the deck was unuploadable precisely when it was
// the only thing that existed.
assert.doesNotMatch(
  content, /if \(!bank \|\| !bankIsImportable\(bank\)\) return;/,
  "onCommit must not refuse a deck-only import — a deck with no bank yet is the normal state in the two-step flow"
);
assert.match(
  content, /const hasBank = Boolean\(bank && bankIsImportable\(bank\)\)/,
  "onCommit must decide the two halves independently"
);
assert.match(
  content, /if \(!hasBank && !hasDeck\) return;/,
  "onCommit must still refuse when there is nothing at all to send"
);
// The button must be visible before a file is chosen, not summoned by choosing
// one: gating its existence on deckHtml hid the missing control behind the very
// action the professor was hunting for it to perform. Disabled-and-present is
// the discoverable form.
assert.match(
  content, /disabled=\{busy \|\| !deckHtml\.trim\(\)\}/,
  "the deck commit button must render disabled when no deck is chosen, not vanish"
);
assert.doesNotMatch(
  content, /\{deckHtml\.trim\(\) && !\(bank && bank\.ok && !replacing\) \?/,
  "the deck commit button must not be conditional on a file already being chosen"
);
assert.match(
  content, /t\("import\.deck\.savedWithQuestions"\)/,
  "when a bank is loaded ImportPreview owns the only button and sends the deck with it — that must be stated, or the deck button disappearing reads as the deck being dropped"
);
assert.match(
  content, /hasBank=\{resultHadBank\}/,
  "the result summary must know whether a bank was sent, or a deck-only import reports a bank failure that never happened"
);
assert.match(
  content, /function deckTitleFromHtml/,
  "a deck with no bank must name itself from its own <title>"
);
for (const key of [
  "commitAlone", "aloneHint", "titleMissing", "chooseFirst", "savedWithQuestions",
  "linksOutTo", "linksOutExplain"
]) {
  assert.match(
    strings, new RegExp(`"import\\.deck\\.${key}"`),
    `import.deck.${key} must be bilingual`
  );
}
assert.match(preview, /groupBySlide/, "the preview must group by slide range as designed");
assert.match(preview, /difficulty_defaulted/, "a defaulted difficulty must be visible");
assert.match(preview, /questionIsImportable/);
// Regression guard for a real bug: every edit round-trips the WHOLE bank
// through parseQuestionFile(), so if the serializer ever emits a concrete
// `difficulty` for a question whose difficulty was never actually declared
// by the file (question.difficulty_defaulted === true), editing any ONE
// question silently clears the defaulted flag on every OTHER question too.
// This can't be caught by executing the component (it imports "../i18n",
// which imports the bare specifier "@preact/signals" — unresolvable by the
// dependency-free transpile+data-URI trick used above for the pure parser,
// with no bundler in this verifier), so it's asserted structurally instead:
// the serializer must omit `difficulty` — not just fall back to a default
// — whenever difficulty_defaulted is true.
assert.match(
  preview,
  /difficulty:\s*question\.difficulty_defaulted\s*\?\s*undefined\s*:\s*question\.difficulty/,
  "serializeQuestion must omit difficulty (not emit the resolved default) when difficulty_defaulted is true, " +
  "or reparsing after editing one question clears every other question's defaulted flag"
);
assert.match(content, /ImportPreview/);
assert.match(strings, /"import\.problem\.optionCount"/);
assert.match(strings, /"import\.problem\.correctCount"/);
assert.match(strings, /"import\.problem\.promptTooLong"/);
assert.match(strings, /"import\.problem\.missingSpanish"/);
assert.match(strings, /"import\.deck\.relative"/);
assert.match(strings, /"import\.deck\.forbiddenHost"/);
assert.match(strings, /"import\.noAutoCue"/, "the capability difference must be stated, not discovered");

// Final-review fix #1: a question with the wrong option count must be
// repairable in the preview itself, not just flagged and left stuck.
assert.match(preview, /function addOption/, "the preview must offer a way to add a missing option");
assert.match(preview, /function removeOption/, "the preview must offer a way to remove an extra option");
assert.match(strings, /"import\.addOption"/);
assert.match(strings, /"import\.removeOption"/);

// Final-review fix #2: bank.fileProblem is raw, untranslated text (a V8
// JSON.parse message or the parser's own hardcoded English) — it must never
// reach the DOM directly. Assert both halves of the contract: the parser
// emits a translatable key (checked above via broken.fileProblemKey /
// noQuestionsArray.fileProblemKey), and the screen renders through it.
assert.match(strings, /"import\.problem\.notJson"/);
assert.match(strings, /"import\.problem\.noQuestions"/);
assert.match(
  content, /t\(bank\.fileProblemKey/,
  "bank.fileProblem must render through t(bank.fileProblemKey, ...), never as raw text in the DOM"
);

// Final-review fix #3: choosing a new file or typing into the paste box must
// never be able to silently discard in-progress repairs made in the preview.
// The fix collapses the raw inputs behind a summary once a bank has loaded
// cleanly; `replacing` is the only deliberate way back to a live textarea.
assert.match(
  content, /const showRawInputs = !bank \|\| !bank\.ok \|\| replacing/,
  "the raw file/paste inputs must stay collapsed behind a summary once a bank has loaded, " +
  "or a stray click / re-selection can silently wipe out every repair made in the preview"
);
assert.match(strings, /"import\.loadDifferentFile"/);

// Final-review fix #4: a malformed localStorage draft (e.g. from a future
// ParsedBank schema change) must never reach ImportPreview — there is no
// error boundary in this app, and it would blank the whole SPA on reload
// with no in-app way to clear it, since the draft restores again on mount.
assert.match(
  content, /typeof \(parsed\.bank as ParsedBank\)\.ok !== "boolean"/,
  "a restored import draft must be structurally validated before use, not just checked for truthiness"
);
assert.match(
  content, /!Array\.isArray\(\(parsed\.bank as ParsedBank\)\.questions\)/,
  "a restored import draft must confirm bank.questions is an array before handing it to groupBySlide()"
);

// 2026-08-10: the professor replaced the agent-drafted prompt with his own,
// tested by him directly rather than through this repo's self-test loop —
// the lede/caveat strings and the clause list below were updated to match
// his actual wording, not the version they used to describe.
//
// 2026-08-17, later the same day: the credit came out entirely, at the course
// owner's request. Many instructors use this platform, and one instructor's
// name on the shared authoring surface reads as ownership of everyone's
// lectures. So the assertion inverts — the caveat must keep the warning and
// name nobody, and no personal name may appear in the dictionary at all.
assert.match(
  strings, /As with any AI-generated content, check the result in the preview/,
  "the caveat must keep the AI-content warning — it is the only thing telling a professor to read the output before teaching from it"
);
// Deliberately a shape, not a name: spelling the surname here would put back
// the very string this guard exists to keep out. "Prof. X", "Professor X" and
// "Dr. X" are the forms a byline actually takes; the dictionary's many lowercase
// uses of "professor" as a role are untouched by it.
const BYLINE = /(Prof\.|Professor|Dr\.)\s+[A-Z]/;
for (const [label, text] of [["strings", strings], ["step 2", promptCard], ["step 1", deckPrompt]]) {
  assert.doesNotMatch(
    text, BYLINE,
    `${label}: no individual may be named on the shared authoring surface — it is read, copied and re-used by every instructor on the platform`
  );
}

// A name must not survive the trip from an attached PDF either: lecture title
// slides routinely carry the author's name, and without this clause a prompt
// copies it onto the deck or lifts it into a question.
//
// 2026-08-17: step 1 no longer carries the clause. Its prompt was replaced
// wholesale by the course owner's own universal lecture prompt, adopted
// verbatim on his instruction, and that prompt has no identity rule — it says
// to preserve the source lecture's visuals and personal teaching elements,
// which is the opposite instinct. So the assertion below now covers step 2
// only, and this is a real regression stated rather than hidden: a name on an
// attached lecture's title slide can now reach the generated deck.
//
// It is not unguarded end to end. Step 2 still refuses to carry a name into
// the question bank, and the guard above still keeps every name off this
// shared surface. What is gone is the guard on the deck itself, which is
// projected in the professor's own classroom — the narrower blast radius of
// the two. Closing it means one added clause in step 1's prompt text, which
// was explicitly out of scope for the swap; raise it with him rather than
// slipping it in.
assert.doesNotMatch(
  deckPrompt, /NEVER CARRY PERSONAL IDENTITY ACROSS/,
  "step 1's identity clause is a known, deliberate gap — if it has been added back, restore this file's assertion to the two-prompt loop instead of leaving a stale note"
);
for (const [label, body] of [["step 2", promptCard]]) {
  assert.match(
    body, /NEVER CARRY PERSONAL IDENTITY ACROSS/,
    `${label}: must instruct the model to drop instructor and student identity found in the attachment`
  );
  assert.match(
    body, /historical figure the lecture actually teaches about/,
    `${label}: must carve out people who are genuinely subject matter, or it would strip cited researchers too`
  );
}
assert.match(
  promptCard, /t\("import\.prompt\.validationCaveat"\)/,
  "the validation caveat must be rendered in the UI, not left as a code comment only the next developer reads"
);

// ------------------------------------------------------------ authoring prompt
// The platform makes no model call on this path, so the prompt IS the contract.
// Each clause below is checked against the professor's own wording — do not
// "fix" a clause to match old phrasing if he revises the prompt again; update
// the regex to match his actual text instead.
assert.match(content, /ImportPromptCard/, "the prompt must be reachable from the Import tab");
assert.match(
  promptCard, /^export function ImportPromptCard/m,
  "ImportPromptCard must be declared at module scope — pitfall #4"
);

const promptBody = promptCard.match(/export const IMPORT_PROMPT = `([\s\S]*?)`;\n/)?.[1];
assert.ok(promptBody, "IMPORT_PROMPT must be an exported module-scope template literal");

for (const [clause, why] of [
  [/The attachment always wins/i, "pitfall #65: the title is a label, never subject matter"],
  [/only labels unless the same information actually appears inside the lecture/i, "pitfall #65: a filename/title alone must never become content"],
  [/must have exactly four options/i, "four options is a display requirement, not a preference"],
  [/Never put the boolean inside quotation marks/i, 'a quoted "true" parses and silently yields zero correct answers — pitfall #66'],
  [/There is no separate answer field, answer_index field, correct_option field/i, "bare-string/answer-index shapes parse and yield unusable options"],
  [/Nothing may wrap this object/i, "a wrapper key makes the whole file import as no questions array"],
  [/Never put Spanish text under en/i, "Spanish under an en key is silent and unrecoverable"],
  [/last slide a student must have seen/i, "covers_up_to_slide is the professor's own numbering"],
  [/exactly one JSON code block and nothing else/i, "commentary around the block breaks the paste"]
]) {
  assert.match(promptBody, clause, `authoring prompt must state: ${why}`);
}

// NOT asserted, deliberately: this version doesn't restate the database's
// hard character ceiling (4000/2000) the way the version it replaced did —
// flagged to the professor when the swap was made, adopted as-is per his
// explicit instruction. The actual ceiling is still enforced regardless of
// prompt wording, in questionFile.ts and again server-side in
// course-content-import — a prompt that omits the number doesn't weaken the
// database's own guard, it only removes the model's early warning.

// A model that copies the worked example verbatim must produce a loadable file,
// so the example is parsed by the same parser the import screen uses.
const exampleStart = promptBody.indexOf('{\n  "schema"');
const exampleEnd = promptBody.indexOf("\n}\n", exampleStart) + 2;
assert.ok(exampleStart > -1 && exampleEnd > exampleStart, "the prompt must carry a filled JSON example");
const exampleBank = mod.parseQuestionFile(promptBody.slice(exampleStart, exampleEnd));
assert.equal(exampleBank.ok, true, "the prompt's own example must be valid JSON");
assert.equal(
  mod.bankIsImportable(exampleBank), true,
  "the prompt's own worked example must import with zero problems, or it teaches the wrong shape"
);
assert.equal(exampleBank.questions[0].options.length, 4);
assert.equal(exampleBank.questions[0].options.filter((o) => o.is_correct).length, 1);

// The prompt body is deliberately English-only; the chrome around it is not.
// Every instruction a professor reads has to exist in both languages, and
// verify-i18n.mjs proves each of these keys carries a distinct Spanish string.
for (const key of [
  "title", "lede", "attach", "copy", "copied", "copyFailed",
  "howRule", "showText",
  "step1Title", "step1Lede", "step1Save",
  "step2Title", "step2Lede", "step2Save"
]) {
  assert.match(strings, new RegExp(`"import\\.prompt\\.${key}"`), `import.prompt.${key} must be bilingual`);
}

// ------------------------------------------------- step 1: the deck prompt
// Step 2 copies the pause questions instead of inventing them, which only
// works if step 1 actually planted them. These clauses are the seam between
// the two prompts — if step 1 stops emitting the badge, the attributes, or
// the four .choice buttons, step 2 silently produces a bank with no live
// questions at all and the class runs with nothing to ask.
assert.match(
  deckPrompt, /^export const DECK_PROMPT = `/m,
  "DECK_PROMPT must be an exported module-scope template literal"
);
// The prompt is markdown and quotes markup in code spans, so its own backticks
// are escaped in the source. A lazy [\s\S]*? would stop at the first one and
// silently hand every clause check below a truncated body that still passes —
// so match escapes explicitly, and prove the extraction reached the end.
const deckBody = deckPrompt
  .match(/export const DECK_PROMPT = `((?:[^`\\]|\\[\s\S])*)`;\n/)?.[1]
  ?.replace(/\\([\s\S])/g, "$1");
assert.ok(deckBody, "DECK_PROMPT must be readable as a template literal");
assert.match(
  deckBody, /Core principle/,
  "the extracted prompt must run to the end — a truncated body would pass the clause checks below on the half that survived"
);

// The prompt delegates the presentation system to the reference deck the
// professor downloads from this same tab, so most of what used to be spelled
// out inline now lives in that file. What CANNOT live there is the contract:
// the reference is a design, and a model rewriting a slide drops an attribute
// without anything looking wrong on the projector. Section 17 names every
// marker the platform reads, and these clauses hold it in place — if step 1
// stops demanding the badge, the pause attributes, or the four .choice
// buttons, step 2 silently produces a bank with no live questions at all and
// the class runs with nothing to ask.
for (const [clause, why] of [
  [/Use the newly uploaded PPTX\/PDF for \*\*WHAT the lecture teaches\*\*/, "the uploaded lecture is the only source of subject matter; the reference supplies design, never content"],
  [/Do \*\*not\*\* reuse the placeholder subject matter from the reference HTML/, "the reference's own placeholder slides must not leak into a real lecture"],
  [/Pulse check/, "step 2 finds pause slides by this exact badge text"],
  [/data-pause-topic-en/, "the checkpoint's name on the plan board comes from this attribute"],
  [/data-pause-id/, "the stable pause slug, forward-compatible with checkpoint matching by id"],
  [/data-slide/, "the platform tracks position by this attribute, and step 2 reads it for covers_up_to_slide"],
  [/exactly four button elements with class .?choice/i, "four options is a display requirement the bank inherits"],
  [/answer-reveal fragment correct/, "the answer must stay hidden until the professor reveals it"],
  [/Never add the attribute .?data-course-deck-engine/i, "that attribute suppresses the injected slide reporter — the deck would stop reporting position"],
  [/Never add the attribute .?data-teaching-slide/i, "a second numbering system silently competes with data-slide"],
  [/no link to an external stylesheet or font/i, "deck-validation rejects a deck that reaches outside itself"],
  [/class .?active/, "the slide reporter finds the current slide by this class"],
  [/class="slide activity"/, "step 2 finds a pause slide by the activity class as well as the badge"]
]) {
  assert.match(deckBody, clause, `deck prompt must state: ${why}`);
}

// ------------------------------------------ step 1: the reference deck itself
// Section 17 tells the model to reproduce five markers. The reference deck is
// the worked example it copies them from, and it is served straight out of
// public/ — so if that file's own Pulse Check slide loses a marker, every deck
// generated afterwards loses it too, and nothing on the projector looks wrong.
// The prompt and the file it points at have to be checked together or not at
// all.
const referenceDeck = await readFile(
  new URL("public/TC2007B_Presentation_Style_Reference.html", root), "utf8"
);
for (const [marker, why] of [
  ['class="slide activity"', "the pause slide must carry the activity class step 2 looks for"],
  ['data-pause-id="', "the pause slug the prompt asks every Pulse Check to carry"],
  ['data-pause-topic-en="', "the checkpoint label the plan board reads"],
  ['data-pause-topic-es="', "the Spanish half of that label"],
  ['<span class="lang-en">Pulse check</span>', "the English badge, spelled exactly as step 2 searches for it"],
  ['<span class="lang-es">Pregunta rapida</span>', "the Spanish badge, spelled exactly as step 2 searches for it"],
  ['answer-reveal fragment correct', "the answer stays hidden behind a fragment until the professor reveals it"],
  ['data-slide="1"', "slide numbering starts at 1, as the platform's position tracking assumes"]
]) {
  assert.ok(referenceDeck.includes(marker), `the reference deck must carry: ${why}`);
}
assert.equal(
  (referenceDeck.match(/class="choice"/g) ?? []).length, 4,
  "the reference deck's Pulse Check must show exactly four options, or it teaches the wrong shape"
);
// It is attached to a chat and it renders offline in front of a class. Either
// way a remote reference is a broken reference.
assert.doesNotMatch(
  referenceDeck, /(?:src|href)="(?:https?:)?\/\//,
  "the reference deck must stay self-contained — no remote script, style, font, or image"
);
assert.match(
  promptCard, /href=\{REFERENCE_DECK_PATH\}[\s\S]*?download=/,
  "the reference must be offered as a download: served under the app's own CSP it would render with its presenter engine blocked"
);
for (const key of ["referenceTitle", "referenceLede", "referenceDownload"]) {
  assert.match(
    strings, new RegExp(`"import\\.prompt\\.${key}"`),
    `import.prompt.${key} must be bilingual — the reference download is part of step 1, not documentation`
  );
}

// The two prompts have to agree on the badge, or step 2 finds nothing.
assert.ok(
  promptBody.includes("Pulse check") && deckBody.includes("Pulse check"),
  "both prompts must name the same badge text, or step 2 finds no pause slides"
);
assert.match(
  promptBody, /intended_use uses only pulse or final\. The value both never appears\./,
  "step 2 must ban intended_use=both: the plan builder treats it as checkpoint-eligible, so it would stop the class at a slide with no pause slide behind it"
);
assert.match(
  promptBody, /equal the number of Pulse check slides/i,
  "step 2 must assert one pulse question per pause slide, in both the instructions and its own final check"
);
assert.doesNotMatch(
  deckBody, /\$\{/,
  "an interpolation inside the prompt would splice app state into instructions sent to a model"
);

console.log("content import parser verified");
