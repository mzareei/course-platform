# Class Question Plan Auto-Generated Checkpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the slide/topic metadata a professor's imported JSON already carries, so a Class Question Plan builds its own checkpoints the moment it's created, and the live "which slide am I on" interaction during class is a single dropdown instead of a scrolling card list.

**Architecture:** Two informal, unvalidated columns (`suggested_slide_hint`, `suggested_topic`) are added to `questions`, separate from the strict deck-verified checkpoint columns. `course-content-import` starts writing them instead of discarding them. `course-class-question-plan`'s `create` action groups a bank's eligible questions by that hint and bulk-creates ordinary `PlanCheckpoint` rows in the same request. The frontend gains a fallback display for the new fields and a redesigned live picker in `ClassQuestionPlanBoard`.

**Tech Stack:** Vite + TypeScript + Preact (frontend, `course-platform`), Deno edge functions + Postgres/Supabase (backend, `mzareei.github.io`). No test framework beyond Node's `node:assert/strict` — this repo's tests are structural verifier scripts (`tools/verify-*.mjs`) that regex/parse real source files and are run directly with `node`.

## Global Constraints

- Every user-facing string is EN + ES, added in pairs to `src/i18n/strings.ts` — `tools/verify-i18n.mjs` and `tools/verify-class-question-plans.mjs` enforce this for plan-board copy.
- The browser never queries a table directly — all reads/writes to `questions`, `class_question_plans`, etc. go through the edge functions (`course-question-bank`, `course-class-question-plan`), never a client-side Supabase call.
- Two repos: frontend changes go in `~/Documents/GitHub/Tec Hub/course-platform`; backend (migrations, edge functions) go in `~/Documents/GitHub/Tec Hub/mzareei.github.io`. Frontend deploys on `git push`; edge functions and migrations require explicit deploy commands and do **not** deploy on push.
- Backend verifiers import some `.ts` files directly under Node's native type-stripping (no transpile) — this requires Node 22+; the local environment has v26, so this works as-is.
- Run `npm run verify` (frontend, runs every `tools/verify-*.mjs`) and `npm run typecheck` in `course-platform` before considering any frontend task done. Run each touched `node tools/verify-*.mjs` individually in `mzareei.github.io` (no aggregate script exists there) plus `deno check` on any edited `.ts` file under `supabase/functions/` before considering any backend task done.
- Never deploy a migration or edge function to the live Supabase project (`ojmbupftdikwmlqvibwt`) without the user's explicit go-ahead first — these are shared, hard-to-reverse infrastructure changes. Local verification (verifiers, `deno check`, reading the SQL) can proceed freely; `npx supabase db push` / `npx supabase functions deploy` cannot.

---

## Task 1: Persist and expose informal slide/topic hints

**Files:**
- Create: `supabase/migrations/0036_question_slide_hints.sql` (in `mzareei.github.io`)
- Create: `tools/verify-question-slide-hints.mjs` (in `mzareei.github.io`)
- Modify: `supabase/functions/course-content-import/index.ts:585-614` (in `mzareei.github.io`)
- Modify: `supabase/functions/course-question-bank/index.ts:406` (in `mzareei.github.io`)

**Interfaces:**
- Produces: two new nullable columns on `public.questions` — `suggested_slide_hint integer` (>= 1 or null, no other validation) and `suggested_topic text` (trimmed length <= 160 or null). Later tasks (2 and 3) read these by exact name.
- Produces: `course-question-bank`'s `list_questions` action now returns `suggested_slide_hint` and `suggested_topic` on every question row, alongside the existing `checkpoint_after_slide`.

- [ ] **Step 1: Write the failing verifier**

Create `/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io/tools/verify-question-slide-hints.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const [migration, importFn, bankFn] = await Promise.all([
  readFile(new URL("supabase/migrations/0036_question_slide_hints.sql", root), "utf8"),
  readFile(new URL("supabase/functions/course-content-import/index.ts", root), "utf8"),
  readFile(new URL("supabase/functions/course-question-bank/index.ts", root), "utf8")
]);

assert.match(migration, /alter table public\.questions/i);
assert.match(
  migration,
  /add column if not exists suggested_slide_hint integer\s*\n?\s*check\s*\(\s*suggested_slide_hint is null or suggested_slide_hint\s*>=\s*1\s*\)/i,
  "suggested_slide_hint must be nullable and, when set, a positive integer"
);
assert.match(
  migration,
  /add column if not exists suggested_topic text\s*\n?\s*check\s*\(\s*suggested_topic is null or length\(trim\(suggested_topic\)\)\s*<=\s*160\s*\)/i,
  "suggested_topic must be nullable and, when set, at most 160 trimmed characters"
);

assert.match(
  importFn,
  /suggested_slide_hint:\s*Number\.isInteger\(question\.covers_up_to_slide\)/,
  "the import write must carry covers_up_to_slide into suggested_slide_hint"
);
assert.match(
  importFn,
  /suggested_topic:\s*typeof question\.topic === "string"/,
  "the import write must carry topic into suggested_topic"
);

assert.match(
  bankFn,
  /suggested_slide_hint,\s*suggested_topic/,
  "list_questions must select the new informal hint columns"
);

console.log("question slide hints verified");
```

- [ ] **Step 2: Run the verifier and confirm it fails**

Run: `cd "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io" && node tools/verify-question-slide-hints.mjs`
Expected: FAIL — `ENOENT` on the missing migration file (thrown from the `readFile` call before any `assert` runs).

- [ ] **Step 3: Write the migration**

Create `/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/migrations/0036_question_slide_hints.sql`:

```sql
-- Informal, professor-authored hints carried from an imported JSON file's
-- covers_up_to_slide/topic. Deliberately separate from segment_key /
-- source_slide_start/end / checkpoint_after_slide, which stay reserved for
-- checkpoints verified against a real platform-generated deck. These two
-- columns are never validated against any deck — they exist so a Class
-- Question Plan can auto-build its checkpoints from a bank that has no deck
-- at all.
alter table public.questions
  add column if not exists suggested_slide_hint integer
    check (suggested_slide_hint is null or suggested_slide_hint >= 1),
  add column if not exists suggested_topic text
    check (suggested_topic is null or length(trim(suggested_topic)) <= 160);
```

- [ ] **Step 4: Run the verifier and confirm the migration assertions pass**

Run: `cd "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io" && node tools/verify-question-slide-hints.mjs`
Expected: FAIL — now on the `importFn` assertion (`suggested_slide_hint:` not found in `course-content-import/index.ts`), since the migration file now exists and its assertions pass.

- [ ] **Step 5: Update `course-content-import`'s question upsert**

In `/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/functions/course-content-import/index.ts`, replace the upsert body at lines 585-614 (the `questions.upsert(...)` call inside `writeBank`'s `for (const [index, question] of questions.entries())` loop):

Old:
```ts
    const { data: saved, error: saveError } = await db
      .from("questions")
      .upsert(
        {
          question_bank_id: bankId,
          generation_key: generationKey,
          prompt: question.prompt,
          prompt_es: question.prompt_es,
          question_type: "single_choice",
          difficulty: question.difficulty,
          topic_tags: Array.isArray(question.topic_tags)
            ? question.topic_tags.map((tag) => String(tag))
            : [],
          points: 1,
          status: "active",
          // Never "generated" or "imported" — "authored" is accurate (the
          // platform made no model call) and is the column's own default;
          // "imported" is not in the check constraint and would fail.
          source: "authored",
          updated_at: new Date().toISOString()
          // Checkpoint columns (segment_key, source_slide_start/end,
          // checkpoint_after_slide) are intentionally left unset — they stay
          // at their schema defaults, the honest state for content with no
          // checkpoint bridge. covers_up_to_slide from the payload is not a
          // real column and is accepted-but-ignored for the same reason.
        },
        { onConflict: "question_bank_id,generation_key" }
      )
      .select("id")
      .maybeSingle();
```

New:
```ts
    const { data: saved, error: saveError } = await db
      .from("questions")
      .upsert(
        {
          question_bank_id: bankId,
          generation_key: generationKey,
          prompt: question.prompt,
          prompt_es: question.prompt_es,
          question_type: "single_choice",
          difficulty: question.difficulty,
          topic_tags: Array.isArray(question.topic_tags)
            ? question.topic_tags.map((tag) => String(tag))
            : [],
          points: 1,
          status: "active",
          // Never "generated" or "imported" — "authored" is accurate (the
          // platform made no model call) and is the column's own default;
          // "imported" is not in the check constraint and would fail.
          source: "authored",
          // Informal hints carried straight from the file — a separate,
          // unvalidated concept from the strict checkpoint columns below.
          // They let a Class Question Plan auto-build itself later without
          // the professor retyping what the file already said.
          suggested_slide_hint: Number.isInteger(question.covers_up_to_slide) && question.covers_up_to_slide > 0
            ? question.covers_up_to_slide
            : null,
          suggested_topic: typeof question.topic === "string" && question.topic.trim()
            ? question.topic.trim().slice(0, 160)
            : null,
          updated_at: new Date().toISOString()
          // Checkpoint columns (segment_key, source_slide_start/end,
          // checkpoint_after_slide) are intentionally left unset — they stay
          // at their schema defaults, the honest state for content with no
          // checkpoint bridge.
        },
        { onConflict: "question_bank_id,generation_key" }
      )
      .select("id")
      .maybeSingle();
```

- [ ] **Step 6: Run the verifier and confirm it advances to the last assertion**

Run: `cd "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io" && node tools/verify-question-slide-hints.mjs`
Expected: FAIL — now on the `bankFn` assertion (`suggested_slide_hint, suggested_topic` not found in `course-question-bank/index.ts`).

- [ ] **Step 7: Update `course-question-bank`'s `list_questions` select**

In `/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/functions/course-question-bank/index.ts`, line 406, change:

Old:
```ts
    .select("id, generation_key, prompt, prompt_es, explanation, explanation_es, difficulty, segment_key, source_pdf_pages, source_slide_numbers, source_slide_start, source_slide_end, checkpoint_after_slide, status, source, updated_at, question_options(id, option_text, option_text_es, is_correct, position)")
```

New:
```ts
    .select("id, generation_key, prompt, prompt_es, explanation, explanation_es, difficulty, segment_key, source_pdf_pages, source_slide_numbers, source_slide_start, source_slide_end, checkpoint_after_slide, suggested_slide_hint, suggested_topic, status, source, updated_at, question_options(id, option_text, option_text_es, is_correct, position)")
```

- [ ] **Step 8: Run the verifier and confirm it passes**

Run: `cd "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io" && node tools/verify-question-slide-hints.mjs`
Expected: PASS — prints `question slide hints verified`.

- [ ] **Step 9: Run the existing related verifiers and `deno check` to confirm no regressions**

Run:
```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io"
node tools/verify-content-import-security.mjs
node tools/verify-slide-checkpoints.mjs
deno check supabase/functions/course-content-import/index.ts
deno check supabase/functions/course-question-bank/index.ts
```
Expected: all four commands exit 0.

- [ ] **Step 10: Commit**

```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io"
git add supabase/migrations/0036_question_slide_hints.sql supabase/functions/course-content-import/index.ts supabase/functions/course-question-bank/index.ts tools/verify-question-slide-hints.mjs
git commit -m "feat: persist imported slide/topic hints instead of discarding them"
```

- [ ] **Step 11: Deploy — ask the user before running**

This step touches the live Supabase project. Confirm with the user before running:

```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io"
npx supabase db push --include-all
npx supabase functions deploy course-content-import
npx supabase functions deploy course-question-bank
```

---

## Task 2: Surface the informal slide hint in the Question Banks review screen

**Files:**
- Create: `tools/verify-question-bank-review-hints.mjs` (in `course-platform`)
- Modify: `src/api/checkpoints.ts:55` (in `course-platform`)
- Modify: `src/components/QuestionBankReview.tsx:199-203` (in `course-platform`)

**Interfaces:**
- Consumes: `suggested_slide_hint`/`suggested_topic` now returned by `list_questions` (Task 1).
- Produces: `BankQuestion` (frontend type, `src/api/checkpoints.ts`) gains `suggested_slide_hint: number | null` and `suggested_topic: string | null`, consumed by Task 4's live picker.

- [ ] **Step 1: Write the failing verifier**

Create `/Users/mzareei/Documents/GitHub/Tec Hub/course-platform/tools/verify-question-bank-review-hints.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const [checkpointsApi, review] = await Promise.all([
  readFile(new URL("src/api/checkpoints.ts", root), "utf8"),
  readFile(new URL("src/components/QuestionBankReview.tsx", root), "utf8")
]);

assert.match(
  checkpointsApi,
  /suggested_slide_hint:\s*number\s*\|\s*null;/,
  "BankQuestion must expose the informal slide hint"
);
assert.match(
  checkpointsApi,
  /suggested_topic:\s*string\s*\|\s*null;/,
  "BankQuestion must expose the informal topic"
);
assert.match(
  review,
  /question\.checkpoint_after_slide !== null \? \([\s\S]{0,400}?\) : question\.suggested_slide_hint !== null \? \(/,
  "the During class pill must fall back to suggested_slide_hint when checkpoint_after_slide is unset"
);

console.log("question bank review hints verified");
```

- [ ] **Step 2: Run the verifier and confirm it fails**

Run: `cd "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform" && node tools/verify-question-bank-review-hints.mjs`
Expected: FAIL — `suggested_slide_hint` assertion fails against `src/api/checkpoints.ts` (field doesn't exist yet).

- [ ] **Step 3: Extend the `BankQuestion` type**

In `/Users/mzareei/Documents/GitHub/Tec Hub/course-platform/src/api/checkpoints.ts`, line 55, change:

Old:
```ts
  checkpoint_after_slide: number | null;
  status: string;
```

New:
```ts
  checkpoint_after_slide: number | null;
  suggested_slide_hint: number | null;
  suggested_topic: string | null;
  status: string;
```

- [ ] **Step 4: Run the verifier and confirm it advances**

Run: `cd "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform" && node tools/verify-question-bank-review-hints.mjs`
Expected: FAIL — now on the `review` assertion (`QuestionBankReview.tsx` doesn't have the fallback branch yet).

- [ ] **Step 5: Add the pill fallback**

In `/Users/mzareei/Documents/GitHub/Tec Hub/course-platform/src/components/QuestionBankReview.tsx`, lines 199-203, change:

Old:
```tsx
            {question.checkpoint_after_slide !== null ? (
              <span class="pill live">
                {t("content.banks.duringClass")} · {t("content.banks.afterSlide", { slide: question.checkpoint_after_slide })}
              </span>
            ) : null}
```

New:
```tsx
            {question.checkpoint_after_slide !== null ? (
              <span class="pill live">
                {t("content.banks.duringClass")} · {t("content.banks.afterSlide", { slide: question.checkpoint_after_slide })}
              </span>
            ) : question.suggested_slide_hint !== null ? (
              <span class="pill live">
                {t("content.banks.duringClass")} · {t("content.banks.afterSlide", { slide: question.suggested_slide_hint })}
              </span>
            ) : null}
```

- [ ] **Step 6: Run the verifier and confirm it passes**

Run: `cd "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform" && node tools/verify-question-bank-review-hints.mjs`
Expected: PASS — prints `question bank review hints verified`.

- [ ] **Step 7: Typecheck and full verify sweep**

Run:
```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform"
npm run typecheck
npm run verify
```
Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform"
git add src/api/checkpoints.ts src/components/QuestionBankReview.tsx tools/verify-question-bank-review-hints.mjs
git commit -m "feat: show imported slide coverage in the question bank review screen"
```

---

## Task 3: Auto-generate checkpoints when a plan is created

**Files:**
- Modify: `supabase/functions/course-class-question-plan/index.ts` (in `mzareei.github.io`) — add a new function and one call site inside `createPlan` (currently lines 381-413)
- Modify: `tools/verify-class-question-plans.mjs` (in `mzareei.github.io`)

**Interfaces:**
- Consumes: `questions.suggested_slide_hint` / `questions.suggested_topic` (Task 1), the existing `createPlan` function, `PlanRecord` type, `class_question_plan_checkpoints` / `class_question_plan_candidates` tables (existing schema from migration `0034`).
- Produces: after `create` succeeds, the returned plan's `checkpoints` array is pre-populated — no new API shape, `serializePlan`'s existing output format is unchanged. Frontend Task 4 relies on the checkpoints simply already being there after `createClassQuestionPlan()` resolves.

- [ ] **Step 1: Write the failing verifier assertions**

In `/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io/tools/verify-class-question-plans.mjs`, add these assertions right after the existing block that checks the eight `action` cases (the `for (const action of [...])` loop, just above the `assert.match(planFunction, /assertSectionAllowed\s*\(/);` line):

```js
assert.match(
  planFunction,
  /async function autoGenerateCheckpoints\s*\(/,
  "createPlan must auto-generate checkpoints from the bank's suggested slide hints"
);
assert.match(
  planFunction,
  /await autoGenerateCheckpoints\(db,\s*String\(\(created as PlanRecord\)\.id\),\s*questionBankId,\s*actorProfileId\)/,
  "createPlan must call auto-generation before returning the serialized plan"
);
assert.match(
  planFunction,
  /\.not\("suggested_slide_hint",\s*"is",\s*null\)/,
  "checkpoint auto-generation must only use questions carrying a suggested slide hint"
);
assert.match(
  planFunction,
  /tags\.length === 1 && tags\[0\] === "final"/,
  "checkpoint auto-generation must exclude questions tagged final-only"
);
assert.match(
  planFunction,
  /function pickCheckpointTopic\s*\(/,
  "checkpoint topics must be derived from the bank's suggested topics, with a Slide N fallback"
);
assert.match(
  planFunction,
  /`Slide \$\{slide\}`/,
  "a slide group with no suggested topic at all must fall back to a Slide N label"
);
```

- [ ] **Step 2: Run the verifier and confirm it fails**

Run: `cd "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io" && node tools/verify-class-question-plans.mjs`
Expected: FAIL — on the first new assertion (`autoGenerateCheckpoints` function not found).

- [ ] **Step 3: Add `autoGenerateCheckpoints` and its helpers**

In `/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/functions/course-class-question-plan/index.ts`, add this new code directly above `async function createPlan(` (currently line 381):

```ts
type EligibleQuestionRow = {
  id: string;
  generation_key: string;
  topic_tags: unknown;
  suggested_slide_hint: number | null;
  suggested_topic: string | null;
};

function isCheckpointEligible(row: EligibleQuestionRow): boolean {
  const tags = Array.isArray(row.topic_tags) ? row.topic_tags.map(String) : [];
  return !(tags.length === 1 && tags[0] === "final");
}

function pickCheckpointTopic(rows: EligibleQuestionRow[], slide: number): string {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const topic = String(row.suggested_topic || "").trim();
    if (!topic) continue;
    counts.set(topic, (counts.get(topic) || 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const row of rows) {
    const topic = String(row.suggested_topic || "").trim();
    if (!topic) continue;
    const count = counts.get(topic) || 0;
    if (count > bestCount) {
      best = topic;
      bestCount = count;
    }
  }
  return (best || `Slide ${slide}`).slice(0, 160);
}

/** Groups a bank's checkpoint-eligible questions by their informal slide
 *  hint and bulk-creates one ordinary planned checkpoint per distinct slide,
 *  with every question in that group as a candidate. Runs once, right after
 *  a brand new plan is inserted — never on `copy`, which already carries
 *  checkpoints forward from its source plan. A bank with no
 *  suggested_slide_hint data anywhere (hand-typed, or imported before this
 *  feature existed) creates zero checkpoints here, exactly as before. */
async function autoGenerateCheckpoints(
  db: Db,
  planId: string,
  questionBankId: string,
  actorProfileId: string
) {
  const { data: rows, error } = await db
    .from("questions")
    .select("id, generation_key, topic_tags, suggested_slide_hint, suggested_topic")
    .eq("question_bank_id", questionBankId)
    .eq("status", "active")
    .not("suggested_slide_hint", "is", null)
    .order("generation_key", { ascending: true });
  if (error) throw error;

  const eligible = (rows || []).filter(isCheckpointEligible) as EligibleQuestionRow[];
  if (!eligible.length) return;

  const bySlide = new Map<number, EligibleQuestionRow[]>();
  for (const row of eligible) {
    const slide = Number(row.suggested_slide_hint);
    const bucket = bySlide.get(slide);
    if (bucket) bucket.push(row);
    else bySlide.set(slide, [row]);
  }
  const slides = [...bySlide.keys()].sort((a, b) => a - b);

  const { data: createdCheckpoints, error: checkpointError } = await db
    .from("class_question_plan_checkpoints")
    .insert(
      slides.map((slide, index) => ({
        plan_id: planId,
        position: index + 1,
        topic: pickCheckpointTopic(bySlide.get(slide)!, slide),
        slide_hint: slide,
        state: "planned",
        updated_by: actorProfileId
      }))
    )
    .select("id, position");
  if (checkpointError) throw checkpointError;

  const checkpointIdByPosition = new Map(
    (createdCheckpoints || []).map((row) => [Number(row.position), String(row.id)])
  );
  const candidateRows = slides.flatMap((slide, index) => {
    const checkpointId = checkpointIdByPosition.get(index + 1);
    if (!checkpointId) return [];
    return (bySlide.get(slide) || []).map((row, candidateIndex) => ({
      checkpoint_id: checkpointId,
      question_bank_id: questionBankId,
      question_id: row.id,
      position: candidateIndex + 1,
      updated_by: actorProfileId
    }));
  });
  if (candidateRows.length) {
    const { error: candidateError } = await db
      .from("class_question_plan_candidates")
      .insert(candidateRows);
    if (candidateError) throw candidateError;
  }
}

```

- [ ] **Step 4: Run the verifier and confirm it advances**

Run: `cd "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io" && node tools/verify-class-question-plans.mjs`
Expected: FAIL — on the `await autoGenerateCheckpoints(db, String((created as PlanRecord).id), ...)` assertion (not called from `createPlan` yet).

- [ ] **Step 5: Call `autoGenerateCheckpoints` from `createPlan`**

In `/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/functions/course-class-question-plan/index.ts`, inside `createPlan` (now shifted later in the file by the Step 3 insertion), change:

Old:
```ts
  if (error) {
    if (String(error.code) === "23505") throw new Error("class_question_plan_exists");
    throw error;
  }
  return await serializePlan(db, created as PlanRecord);
}

async function copyPlan(
```

New:
```ts
  if (error) {
    if (String(error.code) === "23505") throw new Error("class_question_plan_exists");
    throw error;
  }
  await autoGenerateCheckpoints(db, String((created as PlanRecord).id), questionBankId, actorProfileId);
  return await serializePlan(db, created as PlanRecord);
}

async function copyPlan(
```

- [ ] **Step 6: Run the verifier and confirm it passes**

Run: `cd "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io" && node tools/verify-class-question-plans.mjs`
Expected: PASS — prints `verify-class-question-plans: ok`.

- [ ] **Step 7: `deno check` and no-regression sweep**

Run:
```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io"
deno check supabase/functions/course-class-question-plan/index.ts
node tools/verify-live-checkpoint-security.mjs
```
Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io"
git add supabase/functions/course-class-question-plan/index.ts tools/verify-class-question-plans.mjs
git commit -m "feat: auto-generate class question plan checkpoints from a bank's suggested slide hints"
```

- [ ] **Step 9: Deploy — ask the user before running**

```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io"
npx supabase functions deploy course-class-question-plan
```

---

## Task 4: Slide-first live picker in the Class Question Plan board

**Files:**
- Modify: `src/i18n/strings.ts:862` (in `course-platform`)
- Modify: `src/components/ClassQuestionPlanBoard.tsx` (in `course-platform`)
- Modify: `tools/verify-class-question-plans.mjs` (in `course-platform`)

**Interfaces:**
- Consumes: `PlanCheckpoint` (`src/api/classQuestionPlans.ts`, unchanged), `plan.checkpoints` array (now often pre-populated by Task 3), `BankQuestion` (Task 2).
- Produces: no new exported API — this is a self-contained rendering change inside `ClassQuestionPlanBoard`.

- [ ] **Step 1: Write the failing verifier assertions**

In `/Users/mzareei/Documents/GitHub/Tec Hub/course-platform/tools/verify-class-question-plans.mjs`, add these assertions right after the existing `assert.match(board, /pushPlanQuestion\(/);` line (and before the `assert.doesNotMatch(board, /cause instanceof Error && cause\.message/, ...)` block):

```js
assert.match(board, /function sortedPlannedCheckpoints\s*\(/);
assert.match(board, /function checkpointLabel\s*\(/);
assert.match(board, /t\("run\.plan\.pickSlideLabel"\)/);
assert.match(board, /t\("run\.plan\.slideOption",/);
assert.match(board, /t\("run\.plan\.noUpcoming"\)/);
assert.match(board, /t\("run\.plan\.history"\)/);
assert.doesNotMatch(
  board,
  /t\("run\.plan\.checkpointNumber"/,
  "the per-checkpoint numbered heading was removed by the slide-first redesign"
);
```

Also add the four new keys to the existing `copyKeys` array in the same file (replace the line `"run.plan.staleCandidates"` with the block below, keeping it as the last entry):

```js
  "run.plan.staleCandidates",
  "run.plan.pickSlideLabel",
  "run.plan.slideOption",
  "run.plan.noUpcoming",
  "run.plan.history"
```

- [ ] **Step 2: Run the verifier and confirm it fails**

Run: `cd "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform" && node tools/verify-class-question-plans.mjs`
Expected: FAIL — on `sortedPlannedCheckpoints` not found in `ClassQuestionPlanBoard.tsx`, and on the missing bilingual copy for `run.plan.pickSlideLabel` etc.

- [ ] **Step 3: Add the new i18n strings**

In `/Users/mzareei/Documents/GitHub/Tec Hub/course-platform/src/i18n/strings.ts`, line 862, change:

Old:
```ts
  "run.plan.checkpointNumber": ["Checkpoint {number}", "Punto de control {number}"],
```

New:
```ts
  "run.plan.pickSlideLabel": ["Which slide are you on?", "¿En qué diapositiva estás?"],
  "run.plan.slideOption": [
    "Slide {slide} — {topic}",
    "Diapositiva {slide} — {topic}"
  ],
  "run.plan.noUpcoming": [
    "No upcoming checkpoints. Add one to get started.",
    "No hay puntos de control pendientes. Agrega uno para empezar."
  ],
  "run.plan.history": ["Asked so far", "Preguntado hasta ahora"],
```

(`run.plan.checkpointNumber` is deleted outright — after Step 5 it has no remaining caller.)

- [ ] **Step 4: Run the verifier and confirm it advances**

Run: `cd "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform" && node tools/verify-class-question-plans.mjs`
Expected: FAIL — now only on the `board`-side assertions (`sortedPlannedCheckpoints`, `checkpointLabel`, the `t("run.plan.pickSlideLabel")` etc. calls, and the `doesNotMatch` on `checkpointNumber` — this one currently still fails because the old heading is still in the component).

- [ ] **Step 5: Add state, helpers, and the live-picker effect**

In `/Users/mzareei/Documents/GitHub/Tec Hub/course-platform/src/components/ClassQuestionPlanBoard.tsx`:

**5a.** Add two module-scope helper functions. Insert them directly after the `localizedPlanError` function (currently lines 72-75, right before `export function ClassQuestionPlanBoard({`):

```ts
function sortedPlannedCheckpoints(checkpoints: PlanCheckpoint[]): PlanCheckpoint[] {
  return checkpoints
    .filter((checkpoint) => checkpoint.state === "planned")
    .slice()
    .sort((a, b) => {
      if (a.slide_hint === null && b.slide_hint === null) return a.position - b.position;
      if (a.slide_hint === null) return 1;
      if (b.slide_hint === null) return -1;
      return a.slide_hint - b.slide_hint;
    });
}

function checkpointLabel(checkpoint: PlanCheckpoint): string {
  return checkpoint.slide_hint !== null
    ? t("run.plan.slideOption", { slide: checkpoint.slide_hint, topic: checkpoint.topic })
    : checkpoint.topic;
}
```

**5b.** Add new state. In the component body, right after the existing line `const [notice, setNotice] = useState<string | null>(null);` (currently line 96), add:

```ts
  const [selectedCheckpointId, setSelectedCheckpointId] = useState("");
```

**5c.** Add the selection-sync effect. Right after the questions-loading `useEffect` block (the one that ends with the `return () => { cancelled = true; };` / closing `}, [activeBankId]);` — currently lines 145-175), insert:

```ts
  useEffect(() => {
    const planned = sortedPlannedCheckpoints(plan?.checkpoints || []);
    setSelectedCheckpointId((current) =>
      planned.some((checkpoint) => checkpoint.id === current) ? current : (planned[0]?.id || "")
    );
  }, [plan]);
```

- [ ] **Step 6: Run the verifier**

Run: `cd "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform" && node tools/verify-class-question-plans.mjs`
Expected: FAIL — still on `t("run.plan.pickSlideLabel")` / `checkpointLabel` usage and the `checkpointNumber` removal, since the render section hasn't changed yet (Step 5 only added helpers/state, not JSX).

- [ ] **Step 7: Compute the picker's derived values**

Still in `ClassQuestionPlanBoard.tsx`, right after the `candidateQuestions` function (currently lines 307-311, ending `}`) and before the `return (` that starts the JSX (currently line 313), insert:

```ts
  const plannedCheckpoints = sortedPlannedCheckpoints(plan?.checkpoints || []);
  const historyCheckpoints = (plan?.checkpoints || []).filter(
    (checkpoint) => checkpoint.state === "sent" || checkpoint.state === "skipped"
  );
  const selectedCheckpoint = plannedCheckpoints.find((checkpoint) => checkpoint.id === selectedCheckpointId) || null;
  const resolvedCandidateQuestions = selectedCheckpoint ? candidateQuestions(selectedCheckpoint) : [];
  const selectedCandidateId = selectedCheckpoint
    ? selectedCandidateIds[selectedCheckpoint.id] || resolvedCandidateQuestions[0]?.id || ""
    : "";
  const selectedQuestion = resolvedCandidateQuestions.find((question) => question.id === selectedCandidateId)
    || resolvedCandidateQuestions[0]
    || null;
  const selectedHasStaleCandidates = selectedCheckpoint
    ? selectedCheckpoint.candidate_question_ids.length > resolvedCandidateQuestions.length
    : false;
```

- [ ] **Step 8: Replace the checkpoint-list rendering with the slide-first picker**

Still in `ClassQuestionPlanBoard.tsx`, replace the block that currently starts at `{plan.checkpoints.length ? (` and ends at the matching `)}` right before the closing `</div>\n      )}\n    </div>\n  );` of the component (currently lines 397-511 — everything from the ternary on `plan.checkpoints.length` through its `noPlan`/`empty` fallback):

Old (lines 397-511):
```tsx
          {plan.checkpoints.length ? (
            <div class="stack">
              {plan.checkpoints.map((checkpoint) => {
                const editing = editor?.mode === "edit" && editor.checkpointId === checkpoint.id;
                const resolvedCandidateQuestions = candidateQuestions(checkpoint);
                const selectedCandidateId = selectedCandidateIds[checkpoint.id] || resolvedCandidateQuestions[0]?.id || "";
                const selectedQuestion = resolvedCandidateQuestions.find(
                  (question) => question.id === selectedCandidateId
                ) || resolvedCandidateQuestions[0] || null;
                const isHistorical = checkpoint.state === "sent" || checkpoint.state === "skipped";
                const hasStaleCandidates =
                  checkpoint.candidate_question_ids.length > resolvedCandidateQuestions.length;

                return (
                  <article class="card stack" key={checkpoint.id}>
                    <div class="row" style="justify-content: space-between; align-items: flex-start;">
                      <div>
                        <p class="eyebrow">{t("run.plan.checkpointNumber", { number: checkpoint.position })}</p>
                        <h3 style="margin: 0.2rem 0 0;">{checkpoint.topic}</h3>
                        {checkpoint.slide_hint !== null ? (
                          <p class="hint">{t("run.plan.afterSlide", { slide: checkpoint.slide_hint })}</p>
                        ) : null}
                        {checkpoint.notes ? <p class="hint">{checkpoint.notes}</p> : null}
                      </div>
                      {checkpoint.state === "sent" ? (
                        <span class="pill live">{t("run.plan.alreadyAsked")}</span>
                      ) : checkpoint.state === "skipped" ? (
                        <span class="pill hidden">{t("run.plan.skipped")}</span>
                      ) : !editing ? (
                        <div class="row">
                          <button
                            class="btn quiet"
                            type="button"
                            disabled={busy}
                            onClick={() => setEditor({ mode: "edit", checkpointId: checkpoint.id, draft: toDraft(checkpoint) })}
                          >
                            {t("run.plan.edit")}
                          </button>
                          <button
                            class="btn quiet"
                            type="button"
                            disabled={busy}
                            onClick={() => void handleRemoveCheckpoint(checkpoint)}
                          >
                            {t("run.plan.remove")}
                          </button>
                        </div>
                      ) : null}
                    </div>

                    {editing ? (
                      <CheckpointEditor
                        draft={editor.draft}
                        questions={questions || []}
                        busy={busy}
                        onDraft={updateDraft}
                        onToggleCandidate={toggleDraftCandidate}
                        onCancel={() => setEditor(null)}
                        onSave={() => void handleSaveCheckpoint()}
                      />
                    ) : isHistorical ? null : (
                      <div class="stack">
                        {resolvedCandidateQuestions.length ? (
                          <>
                            <label class="field">
                              {t("run.plan.candidatesLabel")}
                              <select
                                value={selectedCandidateId}
                                onChange={(event) =>
                                  setSelectedCandidateIds((current) => ({
                                    ...current,
                                    [checkpoint.id]: (event.target as HTMLSelectElement).value
                                  }))}
                              >
                                {resolvedCandidateQuestions.map((question) => (
                                  <option key={question.id} value={question.id}>
                                    {question.prompt}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {hasStaleCandidates ? (
                              <p class="hint">{t("run.plan.staleCandidates")}</p>
                            ) : null}
                            {selectedQuestion?.prompt_es ? (
                              <p class="hint">{selectedQuestion.prompt_es}</p>
                            ) : null}
                          </>
                        ) : (
                          <p class="hint">
                            {hasStaleCandidates ? t("run.plan.staleCandidates") : t("run.plan.noCandidates")}
                          </p>
                        )}

                        {!isHistorical ? (
                          <div class="row" style="justify-content: flex-end;">
                            <button
                              class="btn"
                              type="button"
                              disabled={busy || !isLive || !selectedQuestion}
                              onClick={() => selectedQuestion ? void handleAskNow(checkpoint, selectedQuestion.id) : undefined}
                            >
                              {t("run.plan.askNow")}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <p class="hint">{t("run.plan.empty")}</p>
          )}
```

New:
```tsx
          {plannedCheckpoints.length ? (
            <div class="stack">
              <label class="field">
                {t("run.plan.pickSlideLabel")}
                <select
                  value={selectedCheckpointId}
                  onChange={(event) => setSelectedCheckpointId((event.target as HTMLSelectElement).value)}
                >
                  {plannedCheckpoints.map((checkpoint) => (
                    <option key={checkpoint.id} value={checkpoint.id}>
                      {checkpointLabel(checkpoint)}
                    </option>
                  ))}
                </select>
              </label>

              {selectedCheckpoint ? (
                editor?.mode === "edit" && editor.checkpointId === selectedCheckpoint.id ? (
                  <CheckpointEditor
                    draft={editor.draft}
                    questions={questions || []}
                    busy={busy}
                    onDraft={updateDraft}
                    onToggleCandidate={toggleDraftCandidate}
                    onCancel={() => setEditor(null)}
                    onSave={() => void handleSaveCheckpoint()}
                  />
                ) : (
                  <article class="card stack" key={selectedCheckpoint.id}>
                    <div class="row" style="justify-content: space-between; align-items: flex-start;">
                      <div>
                        {selectedCheckpoint.slide_hint !== null ? (
                          <p class="hint">{t("run.plan.afterSlide", { slide: selectedCheckpoint.slide_hint })}</p>
                        ) : null}
                        {selectedCheckpoint.notes ? <p class="hint">{selectedCheckpoint.notes}</p> : null}
                      </div>
                      <div class="row">
                        <button
                          class="btn quiet"
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            setEditor({ mode: "edit", checkpointId: selectedCheckpoint.id, draft: toDraft(selectedCheckpoint) })
                          }
                        >
                          {t("run.plan.edit")}
                        </button>
                        <button
                          class="btn quiet"
                          type="button"
                          disabled={busy}
                          onClick={() => void handleRemoveCheckpoint(selectedCheckpoint)}
                        >
                          {t("run.plan.remove")}
                        </button>
                      </div>
                    </div>

                    {resolvedCandidateQuestions.length ? (
                      <>
                        <label class="field">
                          {t("run.plan.candidatesLabel")}
                          <select
                            value={selectedCandidateId}
                            onChange={(event) =>
                              setSelectedCandidateIds((current) => ({
                                ...current,
                                [selectedCheckpoint.id]: (event.target as HTMLSelectElement).value
                              }))}
                          >
                            {resolvedCandidateQuestions.map((question) => (
                              <option key={question.id} value={question.id}>
                                {question.prompt}
                              </option>
                            ))}
                          </select>
                        </label>
                        {selectedHasStaleCandidates ? (
                          <p class="hint">{t("run.plan.staleCandidates")}</p>
                        ) : null}
                        {selectedQuestion?.prompt_es ? (
                          <p class="hint">{selectedQuestion.prompt_es}</p>
                        ) : null}
                      </>
                    ) : (
                      <p class="hint">
                        {selectedHasStaleCandidates ? t("run.plan.staleCandidates") : t("run.plan.noCandidates")}
                      </p>
                    )}

                    <div class="row" style="justify-content: flex-end;">
                      <button
                        class="btn"
                        type="button"
                        disabled={busy || !isLive || !selectedQuestion}
                        onClick={() => selectedQuestion ? void handleAskNow(selectedCheckpoint, selectedQuestion.id) : undefined}
                      >
                        {t("run.plan.askNow")}
                      </button>
                    </div>
                  </article>
                )
              ) : null}
            </div>
          ) : (
            <p class="hint">{t("run.plan.noUpcoming")}</p>
          )}

          {historyCheckpoints.length ? (
            <details class="card muted">
              <summary>{t("run.plan.history")}</summary>
              <div class="stack">
                {historyCheckpoints.map((checkpoint) => (
                  <div class="row" style="justify-content: space-between; align-items: center;" key={checkpoint.id}>
                    <span>{checkpointLabel(checkpoint)}</span>
                    <span class={`pill ${checkpoint.state === "sent" ? "live" : "hidden"}`}>
                      {checkpoint.state === "sent" ? t("run.plan.alreadyAsked") : t("run.plan.skipped")}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
```

- [ ] **Step 9: Run the verifier and confirm it passes**

Run: `cd "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform" && node tools/verify-class-question-plans.mjs`
Expected: PASS — prints `verify-class-question-plans: OK`.

- [ ] **Step 10: Typecheck and full verify sweep**

Run:
```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform"
npm run typecheck
npm run verify
```
Expected: both exit 0. If `typecheck` flags `selectedCheckpoint` as possibly `null` inside the `article` block (Preact/TS may not narrow across the `editor?.mode === "edit" ...` ternary the same way the old per-item closure did), change every remaining `selectedCheckpoint.` access inside that branch to use a local `const checkpoint = selectedCheckpoint;` right after the `) : (` that opens the `<article>` branch, and reference `checkpoint` instead — this is a narrowing fix only, not a behavior change.

- [ ] **Step 11: Browser-verify through the real entry point**

Per this repo's first rule ("test through the real entry points"), this cannot be claimed done from typecheck/verify alone. With a real instructor session: open a class session's Run Class screen, start the class, confirm the "Which slide are you on?" dropdown lists checkpoints in ascending slide order (auto-generated ones from Task 3 mixed with any manually-added ones), picking one shows its candidate question(s) and an enabled Ask now button, sending moves it into the "Asked so far" history strip and the dropdown auto-advances to the next planned checkpoint.

- [ ] **Step 12: Commit**

```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform"
git add src/i18n/strings.ts src/components/ClassQuestionPlanBoard.tsx tools/verify-class-question-plans.mjs
git commit -m "feat: slide-first live picker for the class question plan board"
```

---

## Self-Review Notes

- **Spec coverage:** every section of `docs/superpowers/specs/2026-08-10-class-question-plan-auto-checkpoints-design.md` maps to a task — two new columns (Task 1), Question Banks screen fallback (Task 2), auto-generation on `create` (Task 3), slide-first live picker (Task 4). The "out of scope" items (multi-bank plans, real deck-bridge automation, quick-question composer, attendance tabs) are deliberately untouched by every task above.
- **Type/name consistency checked across tasks:** `suggested_slide_hint` / `suggested_topic` are spelled identically in the migration (Task 1), `course-content-import` (Task 1), `course-question-bank` (Task 1), `BankQuestion` (Task 2), and `autoGenerateCheckpoints` (Task 3). `resolvedCandidateQuestions` is deliberately kept as the variable name in Task 4 (not renamed to something like `selectedResolvedCandidates`) so the pre-existing structural assertion `assert.match(board, /resolvedCandidateQuestions/)` in `verify-class-question-plans.mjs` keeps passing without modification. `historyCheckpoints`'s filter is written as the literal `checkpoint.state === "sent" || checkpoint.state === "skipped"` (not the equivalent `!== "planned"`) for the same reason — it's the exact substring the existing verifier already asserts on.
- **No placeholders:** every step above shows complete, exact code — no "add error handling" or "similar to Task N" instructions.
