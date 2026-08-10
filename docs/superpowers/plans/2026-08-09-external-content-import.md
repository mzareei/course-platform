# External Content Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a professor author a deck and question bank with their own AI subscription and import both into the platform, with no model call made by the platform.

**Architecture:** A pure parser normalizes the professor's question JSON into the exact column shape the database already uses; an import screen previews it grouped by slide range and difficulty and allows inline repair; one new edge function authorizes and commits both halves. The audience-facing question layer is fixed first, in both of its copies, so the room shows one language.

**Tech Stack:** Preact + TypeScript + Vite (frontend), Supabase Edge Functions on Deno (backend), Postgres, Node `assert` verifiers run by `tools/run-verifiers.mjs`.

## Global Constraints

- The platform makes **no Anthropic or other model API call** on this path. No exceptions.
- **No database migration.** Every column written already exists. If a task appears to need one, stop and re-read the spec.
- Every user-facing string is added to `src/i18n/strings.ts` as an `["English", "Español"]` pair. `tools/verify-i18n.mjs` fails the build otherwise.
- Deck HTML is only ever loaded through gated same-origin `/content?t=…`. Never `srcdoc`, never `blob:`.
- The browser never queries a Supabase table. Edge functions authorize every read and write.
- Column limits are the database's, copied exactly: `questions.prompt` 1–4000, `question_options.option_text` 1–2000, `questions.difficulty` in (`easy`, `medium`, `hard`) defaulting to `medium`.
- Do not modify, delete, or undeploy anything in `course-generation`, `course-generation-worker`, or migration `0035`.
- Do not change the deck bridge message shape. `deck-script.js` validates the exact key set `checkpoint_key,options,prompt,prompt_es,type,version`.
- Frontend repo root: `~/Documents/GitHub/Tec Hub/course-platform`. Backend repo root: `~/Documents/GitHub/Tec Hub/mzareei.github.io`. Both paths contain a space — quote them.
- Preserve the untracked `.superdesign/` and `AGENTS.md`; never `git add -A`.

## File Structure

**Frontend — `~/Documents/GitHub/Tec Hub/course-platform`**

| File | Responsibility |
|---|---|
| `src/features/live/ClassroomQuestionLayer.tsx` (modify) | Audience overlay — render one language |
| `src/features/import/questionFile.ts` (create) | Pure parse + normalize + problem detection. No I/O, no Preact. |
| `src/features/import/questionFile.test-fixtures.ts` (create) | Shared fixtures for the verifier |
| `src/api/contentImport.ts` (create) | Typed wrapper over the `course-content-import` function |
| `src/components/ImportPreview.tsx` (create) | Preview grouped by slide range + difficulty, inline editing |
| `src/components/ImportPromptCard.tsx` (create) | The copyable prompt |
| `src/screens/instructor/Content.tsx` (modify) | Mount the import entry point |
| `src/i18n/strings.ts` (modify) | Bilingual copy |
| `tools/verify-classroom-language.mjs` (create) | Audience layer renders one language |
| `tools/verify-content-import.mjs` (create) | Parser contract, executed not just grepped |

**Backend — `~/Documents/GitHub/Tec Hub/mzareei.github.io`**

| File | Responsibility |
|---|---|
| `supabase/functions/_shared/templates/deck-script.js` (modify) | In-deck audience layer — render one language |
| `supabase/functions/course-generation-worker/deck-assets.ts` (regenerate) | Built artifact — never hand-edit |
| `supabase/functions/_shared/deck-validation.ts` (create) | Ported HTML validator |
| `supabase/functions/course-content-import/index.ts` (create) | The single commit door |
| `supabase/config.toml` (modify) | Register the new function |
| `tools/verify-classroom-language.mjs` (create) | Deck layer renders one language |
| `tools/verify-content-import-security.mjs` (create) | Validator + authorization contract |

---

### Task 1: Audience overlay renders one language

Ships independently and fixes a live defect for groups 501 and 502. Do this first even if the rest of the plan slips.

**Files:**
- Modify: `src/features/live/ClassroomQuestionLayer.tsx`
- Modify: `src/i18n/strings.ts` (no new keys; verify no orphans)
- Create: `tools/verify-classroom-language.mjs`

**Interfaces:**
- Consumes: `lang` signal exported from `src/i18n/index.ts` (`signal<"en" | "es">`), already imported in sibling components.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Write the failing verifier**

Create `tools/verify-classroom-language.mjs`:

```javascript
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const layer = await readFile(new URL("src/features/live/ClassroomQuestionLayer.tsx", root), "utf8");

assert.match(
  layer,
  /import \{ lang, t \} from "\.\.\/\.\.\/i18n"/,
  "the audience layer must read the app language signal"
);
assert.match(
  layer,
  /const useSpanish = lang\.value === "es"/,
  "the audience layer must derive useSpanish from the language signal"
);
assert.match(
  layer,
  /\(useSpanish && round\.text_es\) \|\| round\.text/,
  "the prompt must render exactly one language"
);
assert.match(
  layer,
  /\(useSpanish && option\.text_es\) \|\| option\.text/,
  "each option must render exactly one language"
);
assert.doesNotMatch(
  layer,
  /classroom-question-es/,
  "the stacked Spanish prompt element must be gone — both languages must never render together"
);
assert.doesNotMatch(
  layer,
  /classroom-question-option-es/,
  "the stacked Spanish option element must be gone"
);

console.log("classroom audience language verified");
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd ~/Documents/GitHub/"Tec Hub"/course-platform && node tools/verify-classroom-language.mjs
```

Expected: `AssertionError` on the first assertion — the file currently imports only `t`, not `lang`.

- [ ] **Step 3: Read the current implementation**

```bash
cd ~/Documents/GitHub/"Tec Hub"/course-platform && sed -n '1,12p;47,80p' src/features/live/ClassroomQuestionLayer.tsx
```

Note the current import on line 3 and the stacked blocks at lines 58 and 70–72.

- [ ] **Step 4: Add the language signal to the import**

Change line 3 of `src/features/live/ClassroomQuestionLayer.tsx` from:

```tsx
import { t } from "../../i18n";
```

to:

```tsx
import { lang, t } from "../../i18n";
```

- [ ] **Step 5: Derive `useSpanish` inside the component**

Immediately after the `const [isFullscreen, setIsFullscreen] = useState(false);` line, add:

```tsx
  const useSpanish = lang.value === "es";
```

- [ ] **Step 6: Render one language for the prompt**

Replace these two lines:

```tsx
        <h2>{round.text}</h2>
        {round.text_es ? <p class="classroom-question-es">{round.text_es}</p> : null}
```

with:

```tsx
        <h2>{(useSpanish && round.text_es) || round.text}</h2>
```

- [ ] **Step 7: Render one language for each option**

Replace this block:

```tsx
              <span>
                <span>{option.text}</span>
                {option.text_es ? (
                  <span class="classroom-question-option-es">{option.text_es}</span>
                ) : null}
              </span>
```

with:

```tsx
              <span>{(useSpanish && option.text_es) || option.text}</span>
```

- [ ] **Step 8: Run the verifier and the full suite**

```bash
cd ~/Documents/GitHub/"Tec Hub"/course-platform && node tools/verify-classroom-language.mjs && npm run typecheck
```

Expected: `classroom audience language verified`, then typecheck exits 0.

- [ ] **Step 9: Mutation-test the verifier**

Temporarily re-add `<p class="classroom-question-es">{round.text_es}</p>` after the `<h2>`, re-run `node tools/verify-classroom-language.mjs`, and confirm it **fails**. Then remove it again and confirm it passes. A verifier that cannot fail is not a test.

- [ ] **Step 10: Commit**

```bash
cd ~/Documents/GitHub/"Tec Hub"/course-platform
git add src/features/live/ClassroomQuestionLayer.tsx tools/verify-classroom-language.mjs
git commit -m "fix: show one language on the classroom question layer"
```

---

### Task 2: Deck engine renders one language

The deck renders its own copy of the audience layer for browser fullscreen (pitfall #46). It already holds a `lang` variable; it simply ignores it for the question text.

**Files:**
- Modify: `~/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/functions/_shared/templates/deck-script.js`
- Regenerate: `supabase/functions/course-generation-worker/deck-assets.ts`
- Create: `~/Documents/GitHub/Tec Hub/mzareei.github.io/tools/verify-classroom-language.mjs`

**Interfaces:**
- Consumes: the existing `lang` variable declared at `deck-script.js:32` (`var lang = read("tc-lang", "en")`).
- Produces: nothing other tasks depend on. **The bridge message shape is unchanged** — `prompt_es` and `text_es` are still sent, and the deck chooses.

- [ ] **Step 1: Write the failing verifier**

Create `~/Documents/GitHub/Tec Hub/mzareei.github.io/tools/verify-classroom-language.mjs`:

```javascript
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const script = await readFile(
  new URL("supabase/functions/_shared/templates/deck-script.js", root), "utf8"
);
const assets = await readFile(
  new URL("supabase/functions/course-generation-worker/deck-assets.ts", root), "utf8"
);

assert.match(
  script,
  /prompt\.textContent = \(lang === "es" && message\.prompt_es\) \|\| message\.prompt/,
  "the deck prompt must render exactly one language"
);
assert.match(
  script,
  /copy\.textContent = \(lang === "es" && option\.text_es\) \|\| option\.text/,
  "each deck option must render exactly one language"
);
assert.doesNotMatch(
  script, /classroom-question-es/, "the stacked Spanish prompt element must be gone"
);
assert.doesNotMatch(
  script, /classroom-question-option-es/, "the stacked Spanish option element must be gone"
);

assert.match(
  script,
  /if \(keys !== "checkpoint_key,options,prompt,prompt_es,type,version"\) return false;/,
  "the bridge message shape must NOT change — an older deck would reject an unknown key and show no question at all"
);

assert.ok(
  assets.includes('prompt.textContent = (lang === "es" && message.prompt_es) || message.prompt'),
  "deck-assets.ts is stale — run: node tools/build-deck-assets.mjs"
);

console.log("deck classroom language verified");
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd ~/Documents/GitHub/"Tec Hub"/mzareei.github.io && node tools/verify-classroom-language.mjs
```

Expected: `AssertionError` — the deck currently assigns `prompt.textContent = message.prompt` unconditionally.

- [ ] **Step 3: Render one language for the deck prompt**

In `supabase/functions/_shared/templates/deck-script.js`, replace:

```javascript
    var prompt = document.createElement("h1");
    prompt.textContent = message.prompt;
    shell.appendChild(kicker);
    shell.appendChild(prompt);
    if (message.prompt_es) {
      var promptEs = document.createElement("p");
      promptEs.className = "classroom-question-es";
      promptEs.textContent = message.prompt_es;
      shell.appendChild(promptEs);
    }
```

with:

```javascript
    var prompt = document.createElement("h1");
    prompt.textContent = (lang === "es" && message.prompt_es) || message.prompt;
    shell.appendChild(kicker);
    shell.appendChild(prompt);
```

- [ ] **Step 4: Render one language for each deck option**

Replace:

```javascript
      var copy = document.createElement("span");
      copy.textContent = option.text;
      if (option.text_es) {
        var copyEs = document.createElement("span");
        copyEs.className = "classroom-question-option-es";
        copyEs.textContent = option.text_es;
        copy.appendChild(copyEs);
      }
```

with:

```javascript
      var copy = document.createElement("span");
      copy.textContent = (lang === "es" && option.text_es) || option.text;
```

- [ ] **Step 5: Rebuild the embedded asset**

`deck-assets.ts` is generated. Never hand-edit it.

```bash
cd ~/Documents/GitHub/"Tec Hub"/mzareei.github.io && node tools/build-deck-assets.mjs
```

- [ ] **Step 6: Verify, including the existing parity and protocol verifiers**

```bash
cd ~/Documents/GitHub/"Tec Hub"/mzareei.github.io \
  && node tools/verify-classroom-language.mjs \
  && node tools/verify-slide-checkpoints.mjs \
  && node tools/verify-live-checkpoint-security.mjs
```

Expected: all three pass. Then from the frontend, confirm the bridge contract is untouched:

```bash
cd ~/Documents/GitHub/"Tec Hub"/course-platform && node tools/verify-deck-protocol.mjs
```

Expected: passes unchanged. If it fails, you altered the message shape — revert and re-read Step 3.

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/GitHub/"Tec Hub"/mzareei.github.io
git add supabase/functions/_shared/templates/deck-script.js \
        supabase/functions/course-generation-worker/deck-assets.ts \
        tools/verify-classroom-language.mjs
git commit -m "fix: show one language in the deck question layer"
```

**Note for deployment (Task 7):** existing generated decks in storage were built with the old script. They keep the old stacked behaviour until **Refresh lecture deck** is run for their bank. That is a degradation, not a breakage, and is deliberate — see the spec.

---

### Task 3: Question file parser

A pure module. No Preact, no fetch, no DOM — so the verifier can execute it directly.

**Files:**
- Create: `src/features/import/questionFile.ts`
- Create: `tools/verify-content-import.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces, for Tasks 4 and 5:
  - `PROMPT_MAX = 4000`, `OPTION_MAX = 2000`
  - `parseQuestionFile(text: string): ParsedBank`
  - `questionIsImportable(question: NormalizedQuestion): boolean`
  - `bankIsImportable(bank: ParsedBank): boolean`
  - `groupBySlide(questions: NormalizedQuestion[]): SlideGroup[]`
  - types `ParsedBank`, `NormalizedQuestion`, `NormalizedOption`, `QuestionProblem`, `SlideGroup`

- [ ] **Step 1: Write the failing verifier**

Create `tools/verify-content-import.mjs`:

```javascript
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

console.log("content import parser verified");
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd ~/Documents/GitHub/"Tec Hub"/course-platform && node tools/verify-content-import.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` / `ENOENT` for `src/features/import/questionFile.ts`.

- [ ] **Step 3: Implement the parser**

Create `src/features/import/questionFile.ts`:

```typescript
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
```

- [ ] **Step 4: Run the verifier and typecheck**

```bash
cd ~/Documents/GitHub/"Tec Hub"/course-platform && node tools/verify-content-import.mjs && npm run typecheck
```

Expected: `content import parser verified`, then typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/GitHub/"Tec Hub"/course-platform
git add src/features/import/questionFile.ts tools/verify-content-import.mjs
git commit -m "feat: parse externally authored question files"
```

---

### Task 4: Deck validator and the import edge function

**Files:**
- Create: `~/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/functions/_shared/deck-validation.ts`
- Create: `~/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/functions/course-content-import/index.ts`
- Modify: `~/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/config.toml`
- Create: `~/Documents/GitHub/Tec Hub/mzareei.github.io/tools/verify-content-import-security.mjs`

**Interfaces:**
- Consumes: `adminClient` from `../_shared/client.ts`, `handleOptions`/`json` from `../_shared/cors.ts`, the same instructor-role loading pattern used in `course-question-bank/index.ts`.
- Produces, for Task 5:
  - `POST course-content-import` with body `{ action: "import_content", course_id?, bank?, deck? }`
  - response `{ bank: { ok: boolean; question_bank_id?: string; error?: string }, deck: { ok: boolean; content_item_id?: string; problems?: DeckProblem[] } }`
  - `DeckProblem = { kind: "relative" | "forbidden_host" | "undeclared_host" | "no_title"; reference?: string; host?: string }`

- [ ] **Step 1: Write the failing verifier**

Create `~/Documents/GitHub/Tec Hub/mzareei.github.io/tools/verify-content-import-security.mjs`:

```javascript
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [validation, fn, config] = await Promise.all([
  read("supabase/functions/_shared/deck-validation.ts"),
  read("supabase/functions/course-content-import/index.ts"),
  read("supabase/config.toml")
]);

const compiledPath = new URL("supabase/functions/_shared/deck-validation.ts", root);
const ts = (await import("typescript")).default;
const compiled = ts.transpileModule(await readFile(compiledPath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const mod = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const opts = {
  allowedHosts: ["amiunique.org"],
  forbiddenHosts: ["mzareei.github.io"]
};
const page = (body) => `<html><head><title>Deck</title></head><body>${body}</body></html>`;

assert.deepEqual(mod.validateDeckHtml(page("<p>hello</p>"), opts), []);

const relative = mod.validateDeckHtml(page('<img src="diagram.png">'), opts);
assert.equal(relative.length, 1);
assert.equal(relative[0].kind, "relative");
assert.equal(
  relative[0].reference, "diagram.png",
  "a surviving relative reference 404s from behind the gate — it must name the reference"
);

const forbidden = mod.validateDeckHtml(
  page('<a href="https://mzareei.github.io/week-05/">Lecture</a>'), opts
);
assert.equal(forbidden[0].kind, "forbidden_host", "pitfall #57: a link from inside the gate to the ungated copy");

const undeclared = mod.validateDeckHtml(
  page('<script src="https://evil.example.com/beacon.js"></script>'), opts
);
assert.equal(
  undeclared[0].kind, "undeclared_host",
  "an undeclared host is the anti-exfiltration control — a beacon needs a host"
);
assert.equal(undeclared[0].host, "evil.example.com");

assert.deepEqual(
  mod.validateDeckHtml(page('<a href="https://amiunique.org/">Try it</a>'), opts), [],
  "a declared teaching host is allowed"
);
assert.deepEqual(
  mod.validateDeckHtml(page('<a href="#slide-3">Next</a><a href="mailto:x@y.z">Mail</a>'), opts), [],
  "fragments and mailto are not references to anywhere"
);
assert.equal(
  mod.validateDeckHtml("<html><body><p>no title</p></body></html>", opts)[0].kind, "no_title"
);

assert.match(fn, /case "import_content"/);
assert.match(fn, /validateDeckHtml/);
assert.match(
  fn, /platform_owner|instructor/,
  "the commit endpoint must be instructor-gated — the browser never writes directly"
);
assert.doesNotMatch(
  fn, /anthropic|ANTHROPIC/i,
  "the import path must make no model call"
);
assert.match(config, /\[functions\.course-content-import\]/);

assert.match(
  fn, /from\("audit_log"\)/,
  "the audit table is audit_log — audit_events does not exist"
);
assert.match(fn, /target_type:/, "audit_log.target_type is NOT NULL");
assert.match(fn, /action:/, "audit_log.action is NOT NULL");
assert.match(fn, /metadata:/, "audit_log.metadata must be a JSON object");

console.log("content import security verified");
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd ~/Documents/GitHub/"Tec Hub"/mzareei.github.io && node tools/verify-content-import-security.mjs
```

Expected: `ENOENT` for `deck-validation.ts`.

- [ ] **Step 3: Port the validator to Deno**

Create `supabase/functions/_shared/deck-validation.ts`. This is `course-content/lib/validate.mjs`'s reference logic, minus the filesystem and metadata parts:

```typescript
// The outbound-link gate for an uploaded deck.
//
// A gate is only as good as the links inside what it serves. Phase 2 rewrote
// every relative link to an absolute public URL, and nine of twelve missions
// ended up linking to the public copy of their own lecture — a student inside
// /content?t=… was one click outside it. Nobody noticed for months, because
// nothing errors: the links simply work, and take the student somewhere they
// should not be able to reach. See pitfall #57.
//
// Ported from course-content/lib/validate.mjs, which validates the same
// property for hand-authored material.

export interface DeckProblem {
  kind: "relative" | "forbidden_host" | "undeclared_host" | "no_title";
  reference?: string;
  host?: string;
}

export interface DeckValidationOptions {
  allowedHosts: string[];
  forbiddenHosts: string[];
}

/** Every href/src in the document. */
function references(html: string): string[] {
  return [...html.matchAll(/(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)]
    .map((match) => String(match[1] ?? match[2] ?? "").trim())
    .filter(Boolean);
}

function hostOf(reference: string): string | null {
  if (/^(?:data|mailto|tel):/i.test(reference)) return null;
  if (reference.startsWith("#")) return null;
  if (!/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(reference)) return "";
  try {
    return new URL(reference, "https://placeholder.invalid/").hostname.toLowerCase();
  } catch {
    return "invalid";
  }
}

export function validateDeckHtml(
  html: string, options: DeckValidationOptions
): DeckProblem[] {
  const problems: DeckProblem[] = [];
  if (!/<title>[^<]+<\/title>/i.test(html)) problems.push({ kind: "no_title" });

  const allowed = new Set(options.allowedHosts.map((host) => host.toLowerCase()));
  const forbidden = new Set(options.forbiddenHosts.map((host) => host.toLowerCase()));

  for (const reference of references(html)) {
    const host = hostOf(reference);
    if (host === null) continue;
    if (host === "invalid") {
      problems.push({ kind: "undeclared_host", reference });
      continue;
    }
    if (host === "") {
      // The published artifact is a single self-contained file. A surviving
      // relative reference is an asset that was never inlined, and it will 404
      // from behind the gate where there is no sibling file to find.
      problems.push({ kind: "relative", reference });
      continue;
    }
    if (forbidden.has(host)) {
      problems.push({ kind: "forbidden_host", reference, host });
      continue;
    }
    if (!allowed.has(host)) {
      problems.push({ kind: "undeclared_host", reference, host });
    }
  }
  return problems;
}
```

- [ ] **Step 4: Write the edge function**

Create `supabase/functions/course-content-import/index.ts`. Model the auth block on `course-question-bank/index.ts` lines 41–54; read that file first and copy its `bearerToken`, `cleanCourseId`, `loadProfileForToken`, and `loadRoles` helpers verbatim rather than inventing new ones.

```typescript
// Content authored outside the platform.
//
// The professor's own AI is the author; this function is the single door
// through which its output enters. It makes no model call. It authorizes the
// caller, re-checks the structural facts the class depends on at runtime, and
// writes both halves — so a client that skips the preview cannot push
// unvalidated content into private storage.
//
// The two halves fail independently: a bad deck must never block a question
// import, and vice versa.
import { adminClient } from "../_shared/client.ts";
import { handleOptions, json } from "../_shared/cors.ts";
import { validateDeckHtml, type DeckProblem } from "../_shared/deck-validation.ts";

const instructorRoles = ["platform_owner", "instructor"];
const PROMPT_MAX = 4000;
const OPTION_MAX = 2000;
const DIFFICULTIES = ["easy", "medium", "hard"];

interface OptionPayload {
  option_text: string;
  option_text_es: string | null;
  is_correct: boolean;
  position: number;
}
interface QuestionPayload {
  prompt: string;
  prompt_es: string | null;
  difficulty: string;
  topic: string | null;
  topic_tags: string[];
  covers_up_to_slide: number | null;
  options: OptionPayload[];
}

/** The same structural facts the preview enforces, re-checked server-side.
 *  Not a judgment about the question — a statement about whether it can be
 *  displayed and graded at all. */
function questionFault(question: QuestionPayload, index: number): string | null {
  const at = `Question ${index + 1}`;
  if (!question.prompt?.trim()) return `${at} has no text.`;
  if (question.prompt.length > PROMPT_MAX) return `${at} is longer than ${PROMPT_MAX} characters.`;
  if (question.prompt_es && question.prompt_es.length > PROMPT_MAX) {
    return `${at} (Spanish) is longer than ${PROMPT_MAX} characters.`;
  }
  if (!DIFFICULTIES.includes(question.difficulty)) return `${at} has an unknown difficulty.`;
  if (!Array.isArray(question.options) || question.options.length !== 4) {
    return `${at} does not have four options.`;
  }
  if (question.options.filter((option) => option.is_correct).length !== 1) {
    return `${at} does not have exactly one correct answer.`;
  }
  for (const option of question.options) {
    if (!option.option_text?.trim()) return `${at} has an empty option.`;
    if (option.option_text.length > OPTION_MAX) {
      return `${at} has an option longer than ${OPTION_MAX} characters.`;
    }
    if (option.option_text_es && option.option_text_es.length > OPTION_MAX) {
      return `${at} has a Spanish option longer than ${OPTION_MAX} characters.`;
    }
  }
  return null;
}

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== "POST") return json({ error: "Method not allowed." }, { status: 405 });

  try {
    const token = bearerToken(request.headers.get("Authorization"));
    if (!token) return json({ error: "Sign in is required." }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    if (body.action !== "import_content") return json({ error: "Unknown action" }, { status: 400 });

    const db = adminClient();
    const courseId = cleanCourseId(body.course_id) || "tc2007b";
    const profile = await loadProfileForToken(db, token);
    const roles = await loadRoles(db, courseId, String(profile.id));
    if (!roles.some((role) => instructorRoles.includes(role))) {
      return json({ error: "This action is restricted to an instructor." }, { status: 403 });
    }

    const result: Record<string, unknown> = {
      bank: { ok: false },
      deck: { ok: false }
    };

    if (body.bank) {
      try {
        const questions = (body.bank.questions ?? []) as QuestionPayload[];
        if (!questions.length) throw new Error("The file contains no questions.");
        for (const [index, question] of questions.entries()) {
          const fault = questionFault(question, index);
          if (fault) throw new Error(fault);
        }
        const bankId = await writeBank(db, courseId, String(profile.id), body.bank, questions);
        result.bank = { ok: true, question_bank_id: bankId };
      } catch (error) {
        result.bank = { ok: false, error: message(error) };
      }
    }

    if (body.deck) {
      try {
        const problems: DeckProblem[] = validateDeckHtml(String(body.deck.html ?? ""), {
          allowedHosts: Array.isArray(body.deck.external_links) ? body.deck.external_links : [],
          forbiddenHosts: ["mzareei.github.io"]
        });
        if (problems.length) {
          result.deck = { ok: false, problems };
        } else {
          const itemId = await writeDeck(db, courseId, String(profile.id), body.deck);
          result.deck = { ok: true, content_item_id: itemId };
        }
      } catch (error) {
        result.deck = { ok: false, error: message(error) };
      }
    }

    // Table is audit_log, not audit_events. Columns verified against
    // 0006_gradebook_foundation.sql and the existing insert at
    // course-question-bank/index.ts:293 — target_type and action are NOT NULL
    // with length checks, and metadata must be a JSON object.
    await db.from("audit_log").insert({
      course_id: courseId,
      actor_profile_id: profile.id,
      target_type: "content_import",
      target_id: null,
      action: "content_imported",
      metadata: result
    });

    return json(result);
  } catch (error) {
    return json({ error: message(error) }, { status: 400 });
  }
});

function message(error: unknown) {
  if (error instanceof Error) return error.message;
  const detail = (error as { message?: unknown })?.message;
  return typeof detail === "string" ? detail : "Unable to import this content.";
}
```

`writeBank`, `writeDeck`, `bearerToken`, `cleanCourseId`, `loadProfileForToken`, and `loadRoles`: copy the helper implementations from `course-question-bank/index.ts` and `course-content-upload/index.ts`. **Read the actual `return json({...})` and insert shapes in those files before writing yours** — a field-name mismatch across this boundary is invisible to the compiler and has shipped several times (pitfall #3). `writeBank` must reuse the existing `(bank, generation_key)` idempotency so re-importing replaces a bank's own questions instead of duplicating them, and must not overwrite questions marked `generated_edited`.

- [ ] **Step 5: Register the function**

Append to `supabase/config.toml`:

```toml
[functions.course-content-import]
verify_jwt = false
```

- [ ] **Step 6: Verify**

```bash
cd ~/Documents/GitHub/"Tec Hub"/mzareei.github.io \
  && node tools/verify-content-import-security.mjs \
  && deno check supabase/functions/_shared/deck-validation.ts \
  && deno check supabase/functions/course-content-import/index.ts
```

Expected: `content import security verified`, both `deno check` clean.

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/GitHub/"Tec Hub"/mzareei.github.io
git add supabase/functions/_shared/deck-validation.ts \
        supabase/functions/course-content-import/index.ts \
        supabase/config.toml tools/verify-content-import-security.mjs
git commit -m "feat: accept externally authored decks and question banks"
```

---

### Task 5: Import screen

**Files:**
- Create: `src/api/contentImport.ts`
- Create: `src/components/ImportPreview.tsx`
- Modify: `src/screens/instructor/Content.tsx`
- Modify: `src/i18n/strings.ts`
- Modify: `tools/verify-content-import.mjs`

**Interfaces:**
- Consumes: everything `src/features/import/questionFile.ts` produces (Task 3); the `course-content-import` contract (Task 4).
- Produces: `importContent(input): Promise<ImportResult>` in `src/api/contentImport.ts`.

- [ ] **Step 1: Extend the verifier with failing UI assertions**

Append to `tools/verify-content-import.mjs`, before the final `console.log`:

```javascript
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
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd ~/Documents/GitHub/"Tec Hub"/course-platform && node tools/verify-content-import.mjs
```

Expected: `ENOENT` for `src/api/contentImport.ts`.

- [ ] **Step 3: Add the typed API wrapper**

Create `src/api/contentImport.ts`, following the shape of the other wrappers in `src/api/` (read `src/api/generation.ts` first for the `callFn` convention):

```typescript
import { callFn } from "./client";
import type { NormalizedQuestion } from "../features/import/questionFile";

export interface DeckProblem {
  kind: "relative" | "forbidden_host" | "undeclared_host" | "no_title";
  reference?: string;
  host?: string;
}

export interface ImportResult {
  bank: { ok: boolean; question_bank_id?: string; error?: string };
  deck: { ok: boolean; content_item_id?: string; error?: string; problems?: DeckProblem[] };
}

export async function importContent(input: {
  course_id?: string;
  bank?: {
    content_slug: string;
    title: string;
    title_es: string | null;
    questions: NormalizedQuestion[];
  };
  deck?: {
    slug: string;
    title: string;
    title_es: string | null;
    html: string;
    external_links: string[];
  };
}): Promise<ImportResult> {
  return callFn("course-content-import", { action: "import_content", ...input });
}
```

- [ ] **Step 4: Build the preview component**

Create `src/components/ImportPreview.tsx`. It must:

- accept `{ bank: ParsedBank; onChange(next: ParsedBank): void; onCommit(): void }`;
- render `groupBySlide(bank.questions)`, one section per group, headed with `t("import.group.upToSlide", { slide })` or `t("import.group.noSlide")`;
- within a group, show each question with its difficulty badge, its topic, its four options, and a check on the correct one;
- render every entry of `question.problems` inline on that question, using `t(problem.messageKey, { detail: problem.detail ?? "" })`;
- show a "defaulted" marker where `difficulty_defaulted` is true;
- make prompt, options, correct answer, and difficulty editable, calling `onChange` with an updated `ParsedBank` — **re-run the same problem detection after every edit** by re-parsing, so a repair clears its own flag;
- disable the commit button while `bankIsImportable(bank)` is false, and say why;
- state plainly, near the deck upload, that an imported deck does not auto-cue questions at checkpoints and the professor selects each one from Run Class.

Define the component at module scope. Never inside another component — pitfall #4: Preact sees a new component type each render and unmounts the subtree, and this screen re-renders on every keystroke.

- [ ] **Step 5: Add the bilingual strings**

Add to `src/i18n/strings.ts`, in a new `import` section:

```typescript
  // --------------------------------------------------------------- import
  "import.title": ["Import a lecture", "Importar una clase"],
  "import.chooseFile": ["Choose a file", "Elegir un archivo"],
  "import.paste": ["Or paste the file contents", "O pega el contenido del archivo"],
  "import.group.upToSlide": ["Covers up to slide {slide}", "Cubre hasta la diapositiva {slide}"],
  "import.group.noSlide": ["No slide given", "Sin diapositiva indicada"],
  "import.difficultyDefaulted": ["Difficulty not given — set to medium", "Sin dificultad — se asignó media"],
  "import.commit": ["Save to the course", "Guardar en el curso"],
  "import.fixFirst": ["Fix the flagged questions first", "Corrige primero las preguntas marcadas"],
  "import.noAutoCue": [
    "An imported deck does not stop at questions on its own. You choose each question from Run Class.",
    "Una presentación importada no se detiene sola en las preguntas. Tú eliges cada pregunta desde Dar clase."
  ],
  "import.problem.promptEmpty": ["This question has no text", "Esta pregunta no tiene texto"],
  "import.problem.promptTooLong": ["Question is too long ({detail} characters)", "La pregunta es demasiado larga ({detail} caracteres)"],
  "import.problem.optionEmpty": ["This option is empty", "Esta opción está vacía"],
  "import.problem.optionTooLong": ["Option is too long ({detail} characters)", "La opción es demasiado larga ({detail} caracteres)"],
  "import.problem.optionCount": ["Needs exactly four options — found {detail}", "Se requieren exactamente cuatro opciones — hay {detail}"],
  "import.problem.correctCount": ["Needs exactly one correct answer — found {detail}", "Se requiere exactamente una respuesta correcta — hay {detail}"],
  "import.problem.missingSpanish": ["Spanish text is missing", "Falta el texto en español"],
  "import.deck.relative": ["The deck refers to a file that will not exist once uploaded: {detail}", "La presentación usa un archivo que no existirá al subirla: {detail}"],
  "import.deck.forbiddenHost": ["The deck links to the public site: {detail}", "La presentación enlaza al sitio público: {detail}"],
  "import.deck.undeclaredHost": ["The deck links to an unexpected site: {detail}", "La presentación enlaza a un sitio inesperado: {detail}"],
  "import.deck.noTitle": ["The deck has no title", "La presentación no tiene título"],
```

- [ ] **Step 6: Mount it on the Content screen**

Add an **Import** entry point to `src/screens/instructor/Content.tsx` alongside the existing controls. It must be reachable by clicking from the Content screen — never only by typing a URL. Pitfall #1 is the single most expensive lesson in this codebase: a feature reachable only by URL shipped a live class students could not join.

- [ ] **Step 7: Verify**

```bash
cd ~/Documents/GitHub/"Tec Hub"/course-platform \
  && node tools/verify-content-import.mjs \
  && npm run typecheck \
  && COURSE_PLATFORM_BACKEND_ROOT=~/Documents/GitHub/"Tec Hub"/mzareei.github.io npm run verify \
  && npm run build
```

Expected: all pass, including `verify-i18n`.

- [ ] **Step 8: Commit**

```bash
cd ~/Documents/GitHub/"Tec Hub"/course-platform
git add src/api/contentImport.ts src/components/ImportPreview.tsx \
        src/screens/instructor/Content.tsx src/i18n/strings.ts tools/verify-content-import.mjs
git commit -m "feat: preview and repair an imported question bank"
```

---

### Task 6: The prompt page

**This task has a review checkpoint. Do not proceed past Step 2 without the professor's sign-off on the prompt text.** The prompt is the product; the code around it is scaffolding.

**Files:**
- Create: `src/components/ImportPromptCard.tsx`
- Modify: `src/screens/instructor/Content.tsx`
- Modify: `src/i18n/strings.ts`
- Modify: `tools/verify-content-import.mjs`

**Interfaces:**
- Consumes: the file contract from Task 3.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Draft the prompt**

Write a draft covering, at minimum:

- the attached PDF is the complete source of truth, and the lecture title is a display label only — never a source of subject matter (this is pitfall #65 restated as instruction to the professor's AI, since the platform no longer enforces it);
- the exact JSON shape from the spec, with a filled example;
- exactly four options, exactly one correct;
- both languages, or one consistently — never Spanish text under an `en` key;
- `covers_up_to_slide` refers to the professor's own slide numbering;
- character ceilings: 4000 for a question, 2000 for an option;
- output as a single JSON code block with no commentary around it.

- [ ] **Step 2: Review checkpoint — show the professor**

Present the draft prompt and ask for corrections. He knows what a good TC2007B question looks like and will catch pedagogy problems that no verifier can. **Stop here until he responds.**

- [ ] **Step 3: Test the approved prompt against three models**

Run the approved prompt with a real lecture PDF through ChatGPT, Claude, and Gemini. Feed each output through `parseQuestionFile` and record how many questions come back importable with no problems.

If any model reliably produces unusable output, fix the prompt — not the parser. The parser's leniency is for edge cases, not for absorbing a badly specified contract.

- [ ] **Step 4: Build the card**

Create `src/components/ImportPromptCard.tsx` at module scope: renders the prompt in a `<pre>`, a copy-to-clipboard button with a confirmation state, and a one-line note on what to attach. Bilingual chrome; the prompt body itself stays in one language since it is instructions to a model, not to a person.

- [ ] **Step 5: Add strings, verify, commit**

```bash
cd ~/Documents/GitHub/"Tec Hub"/course-platform \
  && node tools/verify-content-import.mjs \
  && npm run typecheck \
  && COURSE_PLATFORM_BACKEND_ROOT=~/Documents/GitHub/"Tec Hub"/mzareei.github.io npm run verify \
  && npm run build
git add src/components/ImportPromptCard.tsx src/screens/instructor/Content.tsx \
        src/i18n/strings.ts tools/verify-content-import.mjs
git commit -m "feat: give professors the authoring prompt"
```

---

### Task 7: Deploy and verify through the real user paths

**Files:** none changed unless a defect is found.

**Interfaces:** consumes every prior task.

- [ ] **Step 1: Full local verification, both repos**

```bash
cd ~/Documents/GitHub/"Tec Hub"/mzareei.github.io \
  && node tools/verify-classroom-language.mjs \
  && node tools/verify-content-import-security.mjs \
  && node tools/verify-slide-checkpoints.mjs \
  && node tools/verify-live-checkpoint-security.mjs

cd ~/Documents/GitHub/"Tec Hub"/course-platform \
  && npm run typecheck \
  && COURSE_PLATFORM_BACKEND_ROOT=~/Documents/GitHub/"Tec Hub"/mzareei.github.io npm run verify \
  && npm run build
```

Expected: every command exits 0. Treat any verifier failure as a build failure.

- [ ] **Step 2: Confirm no migration is pending**

```bash
cd ~/Documents/GitHub/"Tec Hub"/mzareei.github.io && npx supabase migration list --linked
```

Expected: nothing new pending from this work. This feature adds no migration; if one appears, stop — something was built that the design did not call for.

- [ ] **Step 3: Deploy the backend**

```bash
cd ~/Documents/GitHub/"Tec Hub"/mzareei.github.io
npx supabase functions deploy course-content-import --project-ref ojmbupftdikwmlqvibwt
npx supabase functions deploy course-generation-worker --project-ref ojmbupftdikwmlqvibwt
```

The worker redeploy carries the rebuilt `deck-assets.ts` from Task 2. A function deploy proves packaging, not behaviour.

- [ ] **Step 4: Deploy the frontend and confirm the bundle is live**

Push to `main`, then wait for the hash `vite build` printed:

```bash
until curl -s https://course-platform-3ko.pages.dev/ | grep -q "index-<HASH>"; do sleep 5; done; echo deployed
```

Testing against a stale bundle is a reliable way to waste an hour.

- [ ] **Step 5: Browser verification — instructor side**

Requires the professor signed in at `m.zareei@tec.mx` with an emailed code; test sign-in refuses instructors by design, so an agent cannot reach these screens alone. Start from Content and click through — never type an internal URL.

1. Import a questions-only file. Confirm the grouping matches the file's slide numbers and the difficulty badges are right.
2. Import a file with a deliberate three-option question. Confirm it is flagged on that question, the rest still preview, and commit is blocked with a reason.
3. Repair it inline. Confirm the flag clears and commit unblocks.
4. Save. Confirm the bank appears under Question banks.
5. Import a deck with a deliberate `<img src="diagram.png">`. Confirm the failure names `diagram.png`, and that the **questions still import**.
6. Import a clean deck. Open it through Run Class; confirm it renders in the gated iframe with `src="/content?t=…"` — never `srcdoc` or `blob:`.

- [ ] **Step 6: Browser verification — the language fix**

1. Set the platform to Spanish. Start a class with a generated deck whose bank has been refreshed. Send a question.
2. Confirm the room layer shows **Spanish only** — no stacked English.
3. Press the deck's fullscreen button and confirm the in-deck layer also shows Spanish only.
4. Switch to English and confirm the same, in English.
5. On a student phone, confirm the personal language toggle still works independently.

- [ ] **Step 7: Browser verification — a real class**

Build a class question plan from the imported bank, run a class, and confirm a pulse question reaches a student device and grades correctly. A successful database write is not evidence of a usable feature — pitfall #23.

- [ ] **Step 8: Refresh existing decks**

For each existing generated lecture with a ready bank, run **Refresh lecture deck** from Question banks so it picks up the language fix. Un-refreshed decks keep the old stacked behaviour. Do not batch blindly: refresh one, confirm it in the browser, then continue.

- [ ] **Step 9: Update the docs in the same change**

Update `docs/05-status.md`, `docs/PROJECT-HANDOFF.md`, and `docs/07-pitfalls.md` with what is now verified and what was learned. Add a decision entry to `docs/04-decisions.md` recording that imported decks reverse "the model never emits HTML", and why the trust boundary makes that acceptable.

```bash
cd ~/Documents/GitHub/"Tec Hub"/course-platform
git add docs/
git commit -m "docs: record external content import as deployed"
```

---

## Self-review

**Spec coverage.** Every spec section maps to a task: no-model-calls → Global Constraints + Task 4 verifier; two independent files → Tasks 3–5; editor-as-repair → Task 5 Step 4; HTML reversal → Task 4 + Task 7 Step 9; questions file schema → Task 3; deck file + no auto-cue → Task 5 Steps 4/6; language model and both copies of the defect → Tasks 1–2; four architecture components → Tasks 5, 5, 4, 4; error-handling table → Task 3 verifier + Task 4 `questionFault` + Task 5 strings; testing → each task's verifier plus Task 7.

**Placeholders.** Task 4 Step 4 and Task 5 Step 4 describe helper reuse and component behaviour rather than pasting full bodies. This is deliberate and bounded: both name the exact source files to copy from, and both are gated by a verifier that fails if the contract is not met. Task 6 Step 1 cannot contain final prompt text by design — the review checkpoint exists precisely because that text is the professor's call.

**Type consistency.** `NormalizedQuestion`, `ParsedBank`, `SlideGroup`, `DeckProblem`, `questionIsImportable`, `bankIsImportable`, and `groupBySlide` are used with identical names and shapes in Tasks 3, 4, and 5. `PROMPT_MAX`/`OPTION_MAX` (4000/2000) match the verified column constraints and the edge function's own constants.
