# End-of-Class Quiz Piñata Race Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carry-over question timer, 60 s cushion, 40-word exit ticket, and a gamified "piñata race" projector layer with secret racer names, progress pings, and a cheer button — per the spec at `docs/superpowers/specs/2026-08-19-end-of-class-quiz-pinata-race-design.md`.

**Architecture:** Two repos. Backend = Supabase edge functions + SQL migrations in `~/Documents/GitHub/Tec Hub/mzareei.github.io` (Deno). Frontend = Preact SPA in `~/Documents/GitHub/Tec Hub/course-platform` (Vite + TypeScript, no test framework — the repo's tests are `tools/verify-*.mjs` Node scripts run by `npm run verify`; several import backend modules directly via `tools/lib/backend-root.mjs`). Pure logic goes in small importable modules (`_shared/racer-names.ts`, `_shared/pinata.ts`, `src/features/quiz/budget.ts`, `src/features/quiz/commentary.ts`) so verifiers execute it instead of grepping for it.

**Tech Stack:** Deno edge functions, Supabase (Postgres + RLS-locked tables, service-role access only), Preact + signals, `t()` i18n with EN/ES pairs in `src/i18n/strings.ts`.

## Global Constraints

- Backend repo root: `/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io`. Frontend repo root: `/Users/mzareei/Documents/GitHub/Tec Hub/course-platform`. They are **separate git repos** — commit each in its own repo.
- Frontend deploys on `git push` (Cloudflare Pages). Edge functions do NOT: each changed function needs `npx supabase functions deploy <name>` from the backend repo; migrations need `npx supabase db push`.
- Every user-facing string goes through `t()` with an EN + ES pair in `src/i18n/strings.ts`. Strings deliberately identical in both languages must be added to `allowedIdentical` in `tools/verify-i18n.mjs`.
- The client holds NO timing constants except the documented 30 s fallback in `Player.tsx` (`tools/verify-quiz-timing.mjs` asserts `!/\b(20|30|45)\s*\*\s*1000/` in Player).
- Commentary must never contain: slow, slowest, last, behind, late, lento, lenta, última, último, atrás, rezagado, tarde.
- The piñata burst threshold is 85, defined once in `_shared/pinata.ts`.
- New tables/columns keep the repo's RLS posture: RLS on, no policies, revoke from anon/authenticated.
- Never test against group 402 (holds ~26 real students). Manual testing uses empty groups 501/502.
- All tasks run `npm run verify` from the frontend repo (it imports backend files through `BACKEND_ROOT` auto-detection in `tools/lib/backend-root.mjs` — the sibling checkout at `../mzareei.github.io` relative to the Tec Hub folder is found automatically; if it skips, set `BACKEND_ROOT=/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io`).
- Commit messages follow the repos' sentence style, e.g. `Quiz race: racers get secret Spanish names`.

---

### Task 1: Cushion 120 → 60

**Files:**
- Modify: `mzareei.github.io/supabase/functions/_shared/question-timing.ts:21-22`
- Modify: `course-platform/tools/verify-quiz-timing.mjs:122`
- Modify: `course-platform/src/api/quiz.ts` (comment only, "two-minute cushion")

**Interfaces:**
- Produces: `CUSHION_SECONDS === 60` (imported by later verifier work and by both quiz edge functions — no signature change).

- [ ] **Step 1: Update the verifier assertion first (the failing test)**

In `course-platform/tools/verify-quiz-timing.mjs` replace:

```js
assert.equal(CUSHION_SECONDS, 120, "the cushion is the professor's two minutes");
```

with:

```js
assert.equal(CUSHION_SECONDS, 60, "the cushion is the professor's one minute");
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform" && node tools/verify-quiz-timing.mjs`
Expected: FAIL — cushion is still 120.

- [ ] **Step 3: Change the constant**

In `mzareei.github.io/supabase/functions/_shared/question-timing.ts` replace:

```ts
/** Slack on the whole quiz for the student whose phone was slow to open it. */
export const CUSHION_SECONDS = 120;
```

with:

```ts
/** Slack on the whole quiz for the student whose phone was slow to open it.
 *  Was 120; the first real class run showed two minutes of dead air at the
 *  end, so the professor cut it to one. */
export const CUSHION_SECONDS = 60;
```

- [ ] **Step 4: Fix the stale comment in the frontend API**

In `course-platform/src/api/quiz.ts`, the comment above `startClassQuiz`'s `time_limit_seconds` mentions "the professor's two-minute cushion" — change "two-minute" to "one-minute". (Comment only; no code change.)

- [ ] **Step 5: Run the verifier again**

Run: `node tools/verify-quiz-timing.mjs`
Expected: PASS.

- [ ] **Step 6: Commit both repos**

```bash
cd /Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io && git add supabase/functions/_shared/question-timing.ts && git commit -m "Quiz cushion: one minute, not two"
cd "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform" && git add tools/verify-quiz-timing.mjs src/api/quiz.ts && git commit -m "Quiz cushion: verifier expects one minute"
```

---

### Task 2: Exit ticket minimum 50 → 40 words

**Files:**
- Create: `mzareei.github.io/supabase/migrations/0055_reflection_min_words_40.sql`
- Modify: `mzareei.github.io/supabase/functions/course-exit-ticket/index.ts:124`
- Modify: `mzareei.github.io/supabase/functions/course-pulse/index.ts:947`
- Modify: `course-platform/src/features/reflection/Reflection.tsx:2` and `src/api/reflection.ts:2` (comments only)
- Create: `course-platform/tools/verify-quiz-race.mjs` (started here; later tasks extend it)

**Interfaces:**
- Produces: every open/planned class session and every new session has `reflection_min_words = 40`; closed sessions keep their historical value.

- [ ] **Step 1: Start the new verifier with the 40-word checks**

Create `course-platform/tools/verify-quiz-race.mjs`:

```js
// The piñata race, the carry-over timer, and the 40-word exit ticket.
// Pure modules are imported and executed; wiring is grepped. Sections are
// appended task by task — see docs/superpowers/plans/2026-08-19-end-of-class-quiz-pinata-race.md.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { backendPath, backendUrl, skipWithoutBackend } from "./lib/backend-root.mjs";

if (skipWithoutBackend("verify-quiz-race")) process.exit(0);

const fn = (name) => backendPath(`supabase/functions/${name}`);
const backend = (name) => backendUrl(`supabase/functions/${name}`);
const frontend = (rel) => new URL(`../${rel}`, import.meta.url);

// ------------------------------------------------- exit ticket: 40 words
{
  const migration = readFileSync(backendPath("supabase/migrations/0055_reflection_min_words_40.sql"), "utf8");
  assert.match(migration, /set default 40/, "the column default must become 40");
  assert.match(migration, /reflection_min_words = 40/, "open sessions must be moved to 40");
  assert.match(migration, /not in \('closed', 'cancelled'\)/, "closed sessions keep their historical minimum");

  const exitTicket = readFileSync(fn("course-exit-ticket/index.ts"), "utf8");
  assert.match(exitTicket, /defaultReflectionMinWords = 40/, "course-exit-ticket default must be 40");

  const pulse = readFileSync(fn("course-pulse/index.ts"), "utf8");
  assert.match(pulse, /reflection_min_words \?\? 40/, "course-pulse fallback must be 40");
}

console.log("verify-quiz-race passed");
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tools/verify-quiz-race.mjs`
Expected: FAIL — migration file does not exist.

- [ ] **Step 3: Write the migration**

Create `mzareei.github.io/supabase/migrations/0055_reflection_min_words_40.sql`:

```sql
-- The exit ticket asked for 50 words; the first real class run showed that is
-- a stretch in the last five minutes. New floor: 40. Classes already closed
-- keep the 50 they were graded under.
alter table public.class_sessions
  alter column reflection_min_words set default 40;

update public.class_sessions
  set reflection_min_words = 40
  where reflection_min_words = 50
    and state not in ('closed', 'cancelled');
```

- [ ] **Step 4: Update both function defaults**

In `course-exit-ticket/index.ts`: `const defaultReflectionMinWords = 50;` → `const defaultReflectionMinWords = 40;`
In `course-pulse/index.ts` (`loadReflectionStatus`): `min_words: session?.reflection_min_words ?? 50,` → `min_words: session?.reflection_min_words ?? 40,`

- [ ] **Step 5: Fix the two frontend comments**

`src/features/reflection/Reflection.tsx` line 2 and `src/api/reflection.ts` line 2 both say "(50-100 by default)" — change to "(40-100 by default)".

- [ ] **Step 6: Run the verifier**

Run: `node tools/verify-quiz-race.mjs`
Expected: PASS.

- [ ] **Step 7: Commit both repos**

```bash
cd /Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io && git add supabase/migrations/0055_reflection_min_words_40.sql supabase/functions/course-exit-ticket/index.ts supabase/functions/course-pulse/index.ts && git commit -m "Exit ticket: 40-word minimum for every class not yet finished"
cd "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform" && git add tools/verify-quiz-race.mjs src/features/reflection/Reflection.tsx src/api/reflection.ts && git commit -m "Exit ticket: verifier pins the 40-word minimum"
```

---

### Task 3: `_shared/racer-names.ts` — the secret name generator

**Files:**
- Create: `mzareei.github.io/supabase/functions/_shared/racer-names.ts`
- Modify: `course-platform/tools/verify-quiz-race.mjs` (append a section)

**Interfaces:**
- Produces: `ANIMALS: Array<{ name: string; emoji: string }>`, `ADJECTIVES: string[]`, `pickRacerName(used: string[], rng?: () => number): { name: string; emoji: string } | null` — `name` is `"{Animal} {Adjective}"`, null only when every combination is taken.

- [ ] **Step 1: Append the failing verifier section**

Append to `tools/verify-quiz-race.mjs` (before the final `console.log`):

```js
// ------------------------------------------------- racer names
{
  const { ANIMALS, ADJECTIVES, pickRacerName } = await import(backend("_shared/racer-names.ts").href);
  assert.ok(ANIMALS.length * ADJECTIVES.length >= 900, "at least 900 combinations");
  const names = new Set(ANIMALS.map((a) => a.name));
  assert.equal(names.size, ANIMALS.length, "animal names are unique");
  for (const a of ANIMALS) assert.ok(a.emoji && a.emoji.length > 0, `${a.name} has an emoji`);
  assert.equal(new Set(ADJECTIVES).size, ADJECTIVES.length, "adjectives are unique");

  // Exhaustion-safe and never repeats: draw 500 names, all distinct, none reused.
  const used = [];
  for (let i = 0; i < 500; i++) {
    const pick = pickRacerName(used);
    assert.ok(pick, `pick ${i} succeeded`);
    assert.ok(!used.includes(pick.name), "never returns a used name");
    assert.match(pick.name, /^\S+ \S+$/, "name is Animal Adjective");
    used.push(pick.name);
  }
  // A fully-used pool returns null rather than looping forever.
  const all = [];
  for (const a of ANIMALS) for (const adj of ADJECTIVES) all.push(`${a.name} ${adj}`);
  assert.equal(pickRacerName(all), null, "an exhausted pool yields null");
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tools/verify-quiz-race.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

Create `mzareei.github.io/supabase/functions/_shared/racer-names.ts`:

```ts
// Secret racer names for the end-of-class piñata race. Each attempt gets one:
// "{Animal} {Adjective}", plus the animal's emoji. Spanish on purpose, in both
// UI languages — the names are part of the fun.
//
// Every adjective is gender-invariant (Turbo, Veloz, Zen, …) so any pairing is
// correct Spanish. That fact is hand-curated and reviewed, not machine-checked:
// do not add adjectives that decline (rápido/rápida would break half the pairs).
//
// Pure on purpose: no Deno, no database. The frontend repo's verifier imports
// and executes this file.

export const ANIMALS: Array<{ name: string; emoji: string }> = [
  { name: "Ajolote", emoji: "🦎" }, { name: "Tlacuache", emoji: "🦝" },
  { name: "Jaguar", emoji: "🐆" }, { name: "Tecolote", emoji: "🦉" },
  { name: "Coyote", emoji: "🐺" }, { name: "Guacamaya", emoji: "🦜" },
  { name: "Tortuga", emoji: "🐢" }, { name: "Abeja", emoji: "🐝" },
  { name: "Águila", emoji: "🦅" }, { name: "Rana", emoji: "🐸" },
  { name: "Pulpo", emoji: "🐙" }, { name: "Flamenco", emoji: "🦩" },
  { name: "Caballo", emoji: "🐴" }, { name: "Alacrán", emoji: "🦂" },
  { name: "Delfín", emoji: "🐬" }, { name: "Ardilla", emoji: "🐿️" },
  { name: "Perezoso", emoji: "🦥" }, { name: "Erizo", emoji: "🦔" },
  { name: "Oso", emoji: "🐻" }, { name: "Zorro", emoji: "🦊" },
  { name: "Pingüino", emoji: "🐧" }, { name: "Pavorreal", emoji: "🦚" },
  { name: "Cocodrilo", emoji: "🐊" }, { name: "Mariposa", emoji: "🦋" },
  { name: "Borrego", emoji: "🐏" }, { name: "Conejo", emoji: "🐰" },
  { name: "Mono", emoji: "🐵" }, { name: "Tiburón", emoji: "🦈" },
  { name: "Ballena", emoji: "🐳" }, { name: "Llama", emoji: "🦙" },
  { name: "Cangrejo", emoji: "🦀" }, { name: "Caracol", emoji: "🐌" },
  { name: "Dinosaurio", emoji: "🦖" }, { name: "Dragón", emoji: "🐉" },
  { name: "Unicornio", emoji: "🦄" }
];

export const ADJECTIVES: string[] = [
  "Turbo", "Veloz", "Feroz", "Audaz", "Fugaz", "Sagaz", "Tenaz",
  "Picante", "Valiente", "Brillante", "Elegante", "Rebelde", "Salvaje",
  "Imparable", "Invencible", "Increíble", "Genial", "Fenomenal", "Radical",
  "Espacial", "Astral", "Digital", "Viral", "Ninja", "Zen",
  "Relámpago", "Fantasma", "Pirata", "Jedi", "Samurái"
];

/**
 * A random unused name, or null when every combination is taken (35 × 30 =
 * 1050 combinations, so a class never exhausts it; null is for correctness,
 * not for classrooms). `rng` exists so tests can seed it.
 */
export function pickRacerName(
  used: string[],
  rng: () => number = Math.random
): { name: string; emoji: string } | null {
  const taken = new Set(used);
  const free: Array<{ name: string; emoji: string }> = [];
  for (const animal of ANIMALS) {
    for (const adjective of ADJECTIVES) {
      const name = `${animal.name} ${adjective}`;
      if (!taken.has(name)) free.push({ name, emoji: animal.emoji });
    }
  }
  if (!free.length) return null;
  return free[Math.floor(rng() * free.length) % free.length];
}
```

- [ ] **Step 4: Run the verifier**

Run: `node tools/verify-quiz-race.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io && git add supabase/functions/_shared/racer-names.ts && git commit -m "Quiz race: secret Spanish racer names, gender-invariant by construction"
cd "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform" && git add tools/verify-quiz-race.mjs && git commit -m "Quiz race: verifier executes the racer-name generator"
```

---

### Task 4: `_shared/pinata.ts` — hits, percent, burst

**Files:**
- Create: `mzareei.github.io/supabase/functions/_shared/pinata.ts`
- Modify: `course-platform/tools/verify-quiz-race.mjs` (append a section)

**Interfaces:**
- Produces: `BURST_PERCENT = 85`; `pinataState(input: { hits: number; started: number; questionCount: number; closedReason?: string | null }): { hits: number; total: number; percent: number; burst: boolean }`.

- [ ] **Step 1: Append the failing verifier section**

```js
// ------------------------------------------------- piñata maths
{
  const { BURST_PERCENT, pinataState } = await import(backend("_shared/pinata.ts").href);
  assert.equal(BURST_PERCENT, 85, "the piñata bursts at 85%");
  assert.equal(pinataState({ hits: 0, started: 0, questionCount: 12 }).percent, 0, "nobody started → 0%");
  assert.equal(pinataState({ hits: 156, started: 26, questionCount: 12 }).percent, 50, "156 of 312 → 50%");
  assert.equal(pinataState({ hits: 500, started: 26, questionCount: 12 }).percent, 100, "clamped to 100");
  assert.equal(pinataState({ hits: 266, started: 26, questionCount: 12 }).burst, true, "85% bursts");
  assert.equal(pinataState({ hits: 262, started: 26, questionCount: 12 }).burst, false, "84% does not");
  assert.equal(
    pinataState({ hits: 100, started: 26, questionCount: 12, closedReason: "everyone" }).burst,
    true,
    "a room where everyone finished broke it, whatever the percent"
  );
  assert.equal(
    pinataState({ hits: 262, started: 26, questionCount: 12, closedReason: "time" }).burst,
    false,
    "closing by time does not burst below the threshold"
  );
}
```

- [ ] **Step 2: Run to verify it fails** — `node tools/verify-quiz-race.mjs`, expected: module not found.

- [ ] **Step 3: Write the module**

Create `mzareei.github.io/supabase/functions/_shared/pinata.ts`:

```ts
// How cracked the class piñata is. Pure on purpose: course-class-quiz (the
// room's screen) and course-pulse (each phone) both call it, and the frontend
// verifier executes it — one formula, one threshold, nowhere else.

/** Bursts before 100% so a couple of students who never start cannot keep the
 *  piñata whole for a room that did the work. */
export const BURST_PERCENT = 85;

export function pinataState(input: {
  hits: number;
  started: number;
  questionCount: number;
  closedReason?: string | null;
}) {
  const questionCount = Math.max(1, Math.floor(Number(input.questionCount) || 0) || 1);
  const started = Math.max(0, Math.floor(Number(input.started) || 0));
  const hits = Math.max(0, Math.floor(Number(input.hits) || 0));
  const total = Math.max(1, started) * questionCount;
  const percent = started === 0 ? 0 : Math.max(0, Math.min(100, Math.floor((100 * hits) / total)));
  const burst = percent >= BURST_PERCENT || input.closedReason === "everyone";
  return { hits, total, percent, burst };
}
```

- [ ] **Step 4: Run the verifier** — expected: PASS.

- [ ] **Step 5: Commit** (backend: `Quiz race: one piñata formula, bursts at 85`; frontend: `Quiz race: verifier executes the piñata maths`).

---

### Task 5: Migration 0056 — racer columns and `quiz_cheers`

**Files:**
- Create: `mzareei.github.io/supabase/migrations/0056_quiz_pinata_race.sql`
- Modify: `course-platform/tools/verify-quiz-race.mjs` (append a section)

**Interfaces:**
- Produces: `student_attempts.racer_name text`, `racer_emoji text`, `progress_position int default 0`, `progress_answered int default 0`; unique partial index on `(activity_instance_id, racer_name)`; table `public.quiz_cheers`.

- [ ] **Step 1: Append the failing verifier section**

```js
// ------------------------------------------------- migration 0056
{
  const migration = readFileSync(backendPath("supabase/migrations/0056_quiz_pinata_race.sql"), "utf8");
  for (const needle of [
    "racer_name text",
    "racer_emoji text",
    "progress_position int not null default 0",
    "progress_answered int not null default 0",
    "student_attempts_racer_name_key",
    "create table if not exists public.quiz_cheers",
    "alter table public.quiz_cheers enable row level security",
    "revoke all on public.quiz_cheers from anon, authenticated"
  ]) {
    assert.ok(migration.includes(needle), `0056 must contain: ${needle}`);
  }
}
```

- [ ] **Step 2: Run to verify it fails** — file does not exist.

- [ ] **Step 3: Write the migration**

Create `mzareei.github.io/supabase/migrations/0056_quiz_pinata_race.sql`:

```sql
-- The piñata race. Attempts carry a secret racer identity and two progress
-- integers (fed by fire-and-forget pings; grading never reads them), and
-- cheers from finished students to running ones get their own tiny table.

alter table public.student_attempts add column if not exists racer_name text;
alter table public.student_attempts add column if not exists racer_emoji text;
alter table public.student_attempts add column if not exists progress_position int not null default 0;
alter table public.student_attempts add column if not exists progress_answered int not null default 0;

-- Two students starting in the same second must not draw the same name; the
-- retry loop in course-activity-attempt leans on this index.
create unique index if not exists student_attempts_racer_name_key
  on public.student_attempts (activity_instance_id, racer_name)
  where racer_name is not null;

create table if not exists public.quiz_cheers (
  id uuid primary key default gen_random_uuid(),
  activity_instance_id uuid not null references public.activity_instances(id) on delete cascade,
  from_attempt_id uuid not null references public.student_attempts(id) on delete cascade,
  to_attempt_id uuid not null references public.student_attempts(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists quiz_cheers_instance_created_idx
  on public.quiz_cheers (activity_instance_id, created_at);

-- Same posture as every other table: RLS on, no policies, service role only.
alter table public.quiz_cheers enable row level security;
revoke all on public.quiz_cheers from anon, authenticated;
```

- [ ] **Step 4: Run the verifier** — expected: PASS.

- [ ] **Step 5: Commit** (backend: `Quiz race: racer identity, progress integers, and cheers`; frontend: `Quiz race: verifier pins migration 0056`).

---

### Task 6: `course-activity-attempt` — racer assignment, progress pings, cheer

**Files:**
- Modify: `mzareei.github.io/supabase/functions/course-activity-attempt/index.ts`
- Modify: `course-platform/tools/verify-quiz-race.mjs` (append a section)

**Interfaces:**
- Consumes: `pickRacerName` (Task 3).
- Produces, for the frontend:
  - `start_attempt` response: `attempt.racer_name: string | null`, `attempt.racer_emoji: string | null` (only set for live-class quizzes).
  - action `report_progress { attempt_id, position, answered }` → `{ ok: true }` always (or an error for a foreign attempt).
  - action `cheer { attempt_id }` → `{ ok: true, to: { racer_name, racer_emoji } }` | `{ ok: false, reason: "nobody_left" }`; a call inside 20 s throws `"Wait a moment before the next cheer."`.
- Produces, for Task 7/8: submitted attempts have `progress_answered` = number of responses and `progress_position` = the instance's `question_count`.

- [ ] **Step 1: Append the failing verifier section**

```js
// ------------------------------------------------- course-activity-attempt wiring
{
  const attempt = readFileSync(fn("course-activity-attempt/index.ts"), "utf8");
  assert.match(attempt, /from "\.\.\/_shared\/racer-names\.ts"/, "imports the racer-name generator");
  assert.match(attempt, /report_progress/, "has the report_progress action");
  assert.match(attempt, /"cheer"/, "has the cheer action");
  assert.match(attempt, /Wait a moment before the next cheer\./, "cheer enforces the cooldown server-side");
  assert.match(attempt, /nobody_left/, "cheer reports an empty room");
  assert.match(attempt, /progress_position: questionCount/, "submit stamps final progress position");
  assert.match(attempt, /racer_name, racer_emoji/, "attempt selects carry the racer identity");
  assert.match(attempt, /\.is\("racer_name", null\)/, "racer assignment cannot overwrite an existing name");
}
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement — five edits in `course-activity-attempt/index.ts`**

**(a) Import** — after the `question-timing.ts` import add:

```ts
import { pickRacerName } from "../_shared/racer-names.ts";
```

**(b) Widen every `student_attempts` select** — three places select the same column list (`findOrCreateAttempt`'s insert-select, `attemptLimitPolicy`, `loadAttempt`, and `submitAttempt`'s update-select). Append `, racer_name, racer_emoji, progress_position, progress_answered` to each `select("id, activity_instance_id, …")` string.

**(c) Racer assignment** — add after `findOrCreateAttempt` and call it from `startAttempt`. In `startAttempt`, replace:

```ts
  assertAttemptWithinTimeLimit(attemptPolicy.attempt, instance);
```

with:

```ts
  assertAttemptWithinTimeLimit(attemptPolicy.attempt, instance);
  attemptPolicy.attempt = await ensureRacerName(db, attemptPolicy.attempt, instance);
```

and add the function:

```ts
/**
 * A live-class quiz attempt gets a secret racer identity, once. The unique
 * partial index on (activity_instance_id, racer_name) is the real guard —
 * two phones starting in the same second race, one hits 23505, and retries
 * with another name. Standalone activities (no class session) get none.
 * Failing to name a racer never fails the quiz: after five collisions the
 * attempt simply stays unnamed.
 */
async function ensureRacerName(
  db: Db,
  attempt: Record<string, unknown>,
  instance: Record<string, unknown>
) {
  if (!instance.class_session_id || attempt.racer_name) return attempt;
  const { data: existing, error } = await db
    .from("student_attempts")
    .select("racer_name")
    .eq("activity_instance_id", String(instance.id))
    .not("racer_name", "is", null);
  if (error) throw error;
  const used = (existing || []).map((row) => String(row.racer_name));

  for (let round = 0; round < 5; round++) {
    const pick = pickRacerName(used);
    if (!pick) return attempt;
    const { data: updated, error: updateError } = await db
      .from("student_attempts")
      .update({ racer_name: pick.name, racer_emoji: pick.emoji })
      .eq("id", String(attempt.id))
      .is("racer_name", null)
      .select("id, activity_instance_id, profile_id, section_id, attempt_number, started_at, submitted_at, status, score_raw, score_percent, score_final, racer_name, racer_emoji, progress_position, progress_answered")
      .maybeSingle();
    if (!updateError && updated) return updated;
    if (updateError && String(updateError.code) !== "23505") throw updateError;
    used.push(pick.name);
  }
  return attempt;
}
```

**(d) Stamp final progress at submit** — in `submitAttempt`, the `.update({ submitted_at: submittedAt, status, … })` call gains two fields (insert after `status,`):

```ts
      progress_answered: graded.rows.length,
      progress_position: questionCount,
```

and just above that update add:

```ts
  const questionCount = Math.max(0, Number(instance.question_count || 0)) || graded.rows.length;
```

**(e) Two new actions** — in the `Deno.serve` router, after the `set_name_reveal` block add:

```ts
    if (body.action === "report_progress") {
      const result = await reportProgress(db, profile, {
        attemptId: cleanUuid(body.attempt_id, "attempt id"),
        position: Number(body.position),
        answered: Number(body.answered)
      });
      return json(result);
    }

    if (body.action === "cheer") {
      const result = await sendCheer(db, profile, cleanUuid(body.attempt_id, "attempt id"));
      return json(result);
    }
```

and add the two functions (near `setNameReveal`):

```ts
/**
 * The phone saying "I'm on question 5, answered 4" so the room's screen can
 * move a racer and crack the piñata. Fire-and-forget by contract: monotonic,
 * clamped, and every no-op answers { ok: true } — a dropped or stale ping
 * must never surface an error on a phone mid-quiz. Grading never reads these
 * two integers.
 */
async function reportProgress(
  db: Db,
  profile: Record<string, unknown>,
  input: { attemptId: string; position: number; answered: number }
) {
  const attempt = await loadAttempt(db, input.attemptId, String(profile.id));
  if (attempt.submitted_at || String(attempt.status) !== "started") return { ok: true };
  const instance = await loadActivityInstance(db, String(attempt.activity_instance_id));
  if (!openStates.includes(String(instance.state))) return { ok: true };

  const cap = Math.max(1, Number(instance.question_count || 0) || 100);
  const clamp = (value: number) =>
    Math.max(0, Math.min(cap, Math.trunc(Number.isFinite(value) ? value : 0)));
  const position = Math.max(clamp(input.position), Number(attempt.progress_position || 0));
  const answered = Math.max(clamp(input.answered), Number(attempt.progress_answered || 0));

  const { error } = await db
    .from("student_attempts")
    .update({ progress_position: position, progress_answered: answered, updated_at: new Date().toISOString() })
    .eq("id", input.attemptId);
  if (error) throw error;
  return { ok: true };
}

/** A finished student cheering someone still swinging. The server picks the
 *  target so it is never a pile-on, and enforces the 20-second cooldown so a
 *  bored phone cannot flood the room's screen. */
async function sendCheer(db: Db, profile: Record<string, unknown>, attemptId: string) {
  const attempt = await loadAttempt(db, attemptId, String(profile.id));
  if (!["submitted", "late"].includes(String(attempt.status))) {
    throw new Error("Finish the quiz before cheering.");
  }
  const instance = await loadActivityInstance(db, String(attempt.activity_instance_id));
  if (!openStates.includes(String(instance.state))) {
    throw new Error("The quiz is over — the cheering is too.");
  }

  const twentySecondsAgo = new Date(Date.now() - 20_000).toISOString();
  const { data: recent, error: recentError } = await db
    .from("quiz_cheers")
    .select("id")
    .eq("from_attempt_id", attemptId)
    .gte("created_at", twentySecondsAgo)
    .limit(1);
  if (recentError) throw recentError;
  if ((recent || []).length) throw new Error("Wait a moment before the next cheer.");

  const { data: running, error: runningError } = await db
    .from("student_attempts")
    .select("id, racer_name, racer_emoji")
    .eq("activity_instance_id", String(instance.id))
    .eq("status", "started")
    .is("submitted_at", null)
    .not("racer_name", "is", null);
  if (runningError) throw runningError;
  const candidates = (running || []).filter((row) => String(row.id) !== attemptId);
  if (!candidates.length) return { ok: false, reason: "nobody_left" };

  const target = candidates[Math.floor(Math.random() * candidates.length)];
  const { error: insertError } = await db.from("quiz_cheers").insert({
    activity_instance_id: String(instance.id),
    from_attempt_id: attemptId,
    to_attempt_id: String(target.id)
  });
  if (insertError) throw insertError;
  return { ok: true, to: { racer_name: target.racer_name, racer_emoji: target.racer_emoji } };
}
```

- [ ] **Step 4: Run the verifier** — expected: PASS. Also run `cd /Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io && deno check supabase/functions/course-activity-attempt/index.ts` — expected: no type errors.

- [ ] **Step 5: Commit** (backend: `Quiz race: racer identity at start, progress pings, and server-picked cheers`; frontend: `Quiz race: verifier pins the attempt-side wiring`).

---

### Task 7: `course-class-quiz` — the `race` action

**Files:**
- Modify: `mzareei.github.io/supabase/functions/course-class-quiz/index.ts`
- Modify: `course-platform/tools/verify-quiz-race.mjs` (append a section)

**Interfaces:**
- Consumes: `pinataState` (Task 4), `maybeAutoCloseInstance`/`closeReasonFor` (existing `_shared/quiz-close.ts`), `loadInstanceForActor` (existing).
- Produces, for the layer (Task 13):

```ts
// action "race" response
{
  instance_id: string; state: string; ends_at: string | null; question_count: number | null;
  present: number; started: number; submitted: number; closed_reason: "time" | "everyone" | null;
  pinata: { name: string; hits: number; total: number; percent: number; burst: boolean };
  racers: Array<{ racer_name: string; racer_emoji: string; position: number; answered: number; finished: boolean; finish_place: number | null }>;
  cheers: Array<{ from_name: string; from_emoji: string; to_name: string; to_emoji: string; at: string }>; // last 20s
  cheers_total: number;
}
```

- [ ] **Step 1: Append the failing verifier section**

```js
// ------------------------------------------------- course-class-quiz race action
{
  const quiz = readFileSync(fn("course-class-quiz/index.ts"), "utf8");
  assert.match(quiz, /case "race":/, "router exposes the race action");
  assert.match(quiz, /from "\.\.\/_shared\/pinata\.ts"/, "race uses the shared piñata formula");
  assert.match(quiz, /finish_place/, "race ranks finishers by submitted_at");
  assert.match(quiz, /🎒 Mochila/, "an unnamed attempt is labelled, never hidden");
}
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement**

**(a) Import** (top of file, next to the other `_shared` imports):

```ts
import { pinataState } from "../_shared/pinata.ts";
```

**(b) Router case** — after `case "status": {…}` add:

```ts
      case "race": {
        if (!isTeacher) throw new Error("Quiz status is not allowed for this role.");
        return json(await quizRace(db, courseId, body, isGlobalOwner, permittedSectionIds));
      }
```

**(c) Widen `loadInstanceForActor`'s select** so `race` can reach the template: change its `.select(...)` to

```ts
    .select("id, activity_template_id, section_id, class_session_id, state, starts_at, ends_at, question_count, course_sections!inner(course_id)")
```

(`quizStatus` and `closeQuiz` ignore the extra field.)

**(d) The action** — add next to `quizStatus`, mirroring its auto-close call:

```ts
/** Everything the room's piñata screen needs, in one call: the same
 *  auto-close check as `status`, then the racers by secret name only.
 *  Nothing here maps a racer to a student — that mapping never leaves the
 *  attempt rows. */
async function quizRace(
  db: Db,
  courseId: string,
  body: Record<string, unknown>,
  isGlobalOwner: boolean,
  permittedSectionIds: string[]
) {
  const instanceId = cleanUuid(body.activity_instance_id, "activity instance id");
  const instance = await loadInstanceForActor(db, courseId, instanceId, isGlobalOwner, permittedSectionIds);

  const closed = await maybeAutoCloseInstance(
    db,
    {
      id: String(instance.id),
      state: String(instance.state),
      starts_at: (instance as Record<string, unknown>).starts_at as string | null,
      ends_at: instance.ends_at as string | null,
      class_session_id: (instance as Record<string, unknown>).class_session_id as string | null
    },
    classDateFor
  );

  const { data: attempts, error: attemptError } = await db
    .from("student_attempts")
    .select("id, status, submitted_at, racer_name, racer_emoji, progress_position, progress_answered")
    .eq("activity_instance_id", instanceId);
  if (attemptError) throw attemptError;
  const rows = attempts || [];

  const submittedRows = rows
    .filter((row) => ["submitted", "late"].includes(String(row.status)))
    .sort((a, b) => String(a.submitted_at || "").localeCompare(String(b.submitted_at || "")));
  const placeByAttempt = new Map(submittedRows.map((row, index) => [String(row.id), index + 1]));

  const questionCount = Math.max(1, Number(instance.question_count || 0) || 1);
  const racers = rows.map((row) => {
    const finished = placeByAttempt.has(String(row.id));
    return {
      racer_name: String(row.racer_name || "🎒 Mochila"),
      racer_emoji: String(row.racer_emoji || "🎒"),
      position: Math.max(0, Math.min(questionCount, Number(row.progress_position || 0))),
      answered: Math.max(0, Number(row.progress_answered || 0)),
      finished,
      finish_place: placeByAttempt.get(String(row.id)) ?? null
    };
  });

  const closedReason = closed.state === "closed"
    ? (closed.closed_reason
       ?? closeReasonFor({ presentCount: closed.present, submittedCount: submittedRows.length }))
    : null;
  const hits = rows.reduce((sum, row) => sum + Math.max(0, Number(row.progress_answered || 0)), 0);
  const pinata = pinataState({
    hits,
    started: rows.length,
    questionCount,
    closedReason
  });

  // The piñata is named after the lecture: instance → template → content item.
  const { data: template } = await db
    .from("activity_templates")
    .select("content_item_id")
    .eq("id", (instance as Record<string, unknown>).activity_template_id)
    .maybeSingle();
  const { data: item } = template?.content_item_id
    ? await db.from("content_items").select("title").eq("id", template.content_item_id).maybeSingle()
    : { data: null };

  const twentySecondsAgo = new Date(Date.now() - 20_000).toISOString();
  const { data: cheerRows, error: cheerError } = await db
    .from("quiz_cheers")
    .select("from_attempt_id, to_attempt_id, created_at")
    .eq("activity_instance_id", instanceId)
    .gte("created_at", twentySecondsAgo)
    .order("created_at", { ascending: true });
  if (cheerError) throw cheerError;
  const { count: cheersTotal } = await db
    .from("quiz_cheers")
    .select("id", { count: "exact", head: true })
    .eq("activity_instance_id", instanceId);

  const byId = new Map(rows.map((row) => [String(row.id), row]));
  const cheers = (cheerRows || []).flatMap((cheer) => {
    const from = byId.get(String(cheer.from_attempt_id));
    const to = byId.get(String(cheer.to_attempt_id));
    if (!from || !to) return [];
    return [{
      from_name: String(from.racer_name || "🎒 Mochila"),
      from_emoji: String(from.racer_emoji || "🎒"),
      to_name: String(to.racer_name || "🎒 Mochila"),
      to_emoji: String(to.racer_emoji || "🎒"),
      at: String(cheer.created_at)
    }];
  });

  return {
    instance_id: instance.id,
    state: closed.state,
    ends_at: instance.ends_at,
    question_count: instance.question_count,
    present: closed.present,
    started: rows.length,
    submitted: submittedRows.length,
    closed_reason: closedReason,
    pinata: { name: String(item?.title || ""), ...pinata },
    racers,
    cheers,
    cheers_total: cheersTotal ?? 0
  };
}
```

- [ ] **Step 4: Run the verifier and `deno check supabase/functions/course-class-quiz/index.ts`** — expected: PASS / clean.

- [ ] **Step 5: Commit** (backend: `Quiz race: one call feeds the room's piñata screen`; frontend: `Quiz race: verifier pins the race action`).

---

### Task 8: `course-pulse` — `my_race` on the student poll

**Files:**
- Modify: `mzareei.github.io/supabase/functions/course-pulse/index.ts` (`loadCurrentQuiz`)
- Modify: `course-platform/tools/verify-quiz-race.mjs` (append a section)

**Interfaces:**
- Consumes: `pinataState` (Task 4).
- Produces, for `Live.tsx`/`PinataCard` (Tasks 10–11): `view.quiz.my_race` —

```ts
{ racer_name: string; racer_emoji: string; finished: boolean; finish_place: number | null;
  pinata: { percent: number; burst: boolean }; swinging: number } | null
```

`my_race` is non-null only while the instance is open AND this student has an attempt.

- [ ] **Step 1: Append the failing verifier section**

```js
// ------------------------------------------------- course-pulse my_race
{
  const pulse = readFileSync(fn("course-pulse/index.ts"), "utf8");
  assert.match(pulse, /my_race/, "the student poll carries my_race");
  assert.match(pulse, /from "\.\.\/_shared\/pinata\.ts"/, "the phone and the room share one piñata formula");
}
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement**

**(a) Import** (next to the `quiz-close.ts` import):

```ts
import { pinataState } from "../_shared/pinata.ts";
```

**(b)** In `loadCurrentQuiz`, change the empty return to include the field:

```ts
  if (!instance) return { instance_id: null, state: null, my_rank: null, my_race: null };
```

and change the final return to:

```ts
  return {
    instance_id: instance.id,
    state,
    ends_at: instance.ends_at,
    question_count: instance.question_count,
    my_rank: state === "closed"
      ? await loadMyRank(db, String(instance.id), profileId)
      : null,
    // The race card on a finished student's phone. Only while the quiz is
    // open — once it closes, the phone moves on to the reflection.
    my_race: OPEN_INSTANCE_STATES.includes(state)
      ? await loadMyRace(db, String(instance.id), profileId, Number(instance.question_count || 0))
      : null
  };
```

**(c)** Add below `loadMyRank`:

```ts
async function loadMyRace(db: Db, instanceId: string, profileId: string, questionCount: number) {
  const { data: attempts, error } = await db
    .from("student_attempts")
    .select("id, profile_id, status, submitted_at, racer_name, racer_emoji, progress_answered")
    .eq("activity_instance_id", instanceId);
  if (error) throw error;
  const rows = attempts || [];
  const mine = rows.find((row) => String(row.profile_id) === String(profileId));
  if (!mine) return null;

  const submittedRows = rows
    .filter((row) => ["submitted", "late"].includes(String(row.status)))
    .sort((a, b) => String(a.submitted_at || "").localeCompare(String(b.submitted_at || "")));
  const place = submittedRows.findIndex((row) => String(row.id) === String(mine.id));
  const hits = rows.reduce((sum, row) => sum + Math.max(0, Number(row.progress_answered || 0)), 0);
  const pinata = pinataState({ hits, started: rows.length, questionCount: Math.max(1, questionCount || 1) });

  return {
    racer_name: String(mine.racer_name || ""),
    racer_emoji: String(mine.racer_emoji || ""),
    finished: place >= 0,
    finish_place: place >= 0 ? place + 1 : null,
    pinata: { percent: pinata.percent, burst: pinata.burst },
    swinging: rows.filter((row) => String(row.status) === "started" && !row.submitted_at).length
  };
}
```

- [ ] **Step 4: Run the verifier and `deno check supabase/functions/course-pulse/index.ts`** — expected: PASS / clean.

- [ ] **Step 5: Commit** (backend: `Quiz race: the phone learns its racer, the piñata, and who is left`; frontend: `Quiz race: verifier pins my_race`).

---

### Task 9: `src/features/quiz/budget.ts` — the carry-over clock

**Files:**
- Create: `course-platform/src/features/quiz/budget.ts`
- Modify: `course-platform/tools/verify-quiz-race.mjs` (append a section)

**Interfaces:**
- Produces: `deadlines(seconds: number[], t0: number): number[]` (cumulative, ms) and `positionAt(deadlines: number[], now: number): number` (index of the question the student should be on; clamped to the last index).

- [ ] **Step 1: Append the failing verifier section**

```js
// ------------------------------------------------- the carry-over budget
{
  const { deadlines, positionAt } = await import(frontend("src/features/quiz/budget.ts").href);
  const t0 = 1_000_000;
  // 30/30/45/30: cumulative deadlines, so saved time visibly rolls forward.
  const dl = deadlines([30, 30, 45, 30], t0);
  assert.deepEqual(dl, [t0 + 30_000, t0 + 60_000, t0 + 105_000, t0 + 135_000], "deadlines are cumulative");
  // Answering Q1 at 25s leaves 35s on Q2 — the spec's example.
  assert.equal(dl[1] - (t0 + 25_000), 35_000, "25s on Q1 leaves 35s for Q2");
  assert.equal(positionAt(dl, t0 + 5_000), 0, "before the first deadline you are on Q1");
  assert.equal(positionAt(dl, t0 + 30_000), 1, "at the deadline you have moved on");
  // A phone asleep through three deadlines lands on the right question in one call.
  assert.equal(positionAt(dl, t0 + 110_000), 3, "skip-forward over missed questions");
  assert.equal(positionAt(dl, t0 + 999_000), 3, "clamped to the final question");
}
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Write the module**

Create `course-platform/src/features/quiz/budget.ts`:

```ts
// The carry-over clock. Each question is worth what the server said (30s, or
// 45s for a long read), but saved seconds roll forward: the deadline for
// question k is T0 plus the SUM of the first k+1 durations, so answering Q1
// in 25 seconds visibly leaves 35 on Q2. Pure — the verifier executes it.

/** Cumulative deadlines in ms, one per question, measured from t0. */
export function deadlines(seconds: number[], t0: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (const s of seconds) {
    sum += Math.max(0, Number(s) || 0) * 1000;
    out.push(t0 + sum);
  }
  return out;
}

/**
 * Which question the clock says the student should be on. A phone that slept
 * through three deadlines lands on the first question whose deadline is still
 * ahead — in one call, not one advance per tick. Clamped to the last index;
 * the caller decides what "past the last deadline" means (submit).
 */
export function positionAt(dl: number[], now: number): number {
  let index = 0;
  while (index < dl.length - 1 && now >= dl[index]) index += 1;
  return index;
}
```

- [ ] **Step 4: Run the verifier** — expected: PASS.

- [ ] **Step 5: Commit** (frontend: `Quiz race: the carry-over budget, pure and executed by the verifier`).

---

### Task 10: `Player.tsx` — splash, running budget, progress pings

**Files:**
- Modify: `course-platform/src/api/quiz.ts` (add `reportProgress`; `racer_name`/`racer_emoji` on `QuizAttempt`)
- Modify: `course-platform/src/features/quiz/Player.tsx`
- Modify: `course-platform/src/i18n/strings.ts`
- Modify: `course-platform/tools/verify-quiz-race.mjs` (append a section)

**Interfaces:**
- Consumes: `deadlines`, `positionAt` (Task 9); `report_progress` (Task 6).
- Produces: `QuizPlayer` gains an optional prop `myRace` (type `MyRace | null`, defined in Task 11's `api/pulse.ts` — until Task 11 lands, add the prop in Task 11, not here). This task changes only timing, splash, and pings.

- [ ] **Step 1: Append the failing verifier section**

```js
// ------------------------------------------------- the player
{
  const player = readFileSync(frontend("src/features/quiz/Player.tsx"), "utf8");
  assert.match(player, /from "\.\/budget"/, "the player uses the shared budget module");
  assert.match(player, /reportProgress\(/, "the player pings progress");
  assert.match(player, /quiz\.letsGo/, "the splash has a Let's go button");
  assert.ok(!/setQuestionDeadline/.test(player), "the per-question deadline state is gone — the budget rules");
}
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Add the API call and attempt fields**

In `src/api/quiz.ts`, add to `QuizAttempt`:

```ts
  /** Secret racer identity for the piñata race; null outside live-class quizzes. */
  racer_name?: string | null;
  racer_emoji?: string | null;
```

and add below `submitQuizAttempt`:

```ts
/** Fire-and-forget: "I'm on question `position`, answered `answered`." Moves
 *  this student's racer on the room's screen. Callers swallow failures — a
 *  dropped ping must never interrupt a student mid-quiz. */
export function reportProgress(input: { attempt_id: string; position: number; answered: number }) {
  return callFn<{ ok: boolean }>("course-activity-attempt", { action: "report_progress", ...input });
}
```

- [ ] **Step 4: Rework `Player.tsx`**

All edits inside `src/features/quiz/Player.tsx`:

**(a)** Imports: add `import { deadlines, positionAt } from "./budget";` and extend the api import with `reportProgress`.

**(b)** New state, replacing `questionDeadline`:

```ts
  const [t0, setT0] = useState<number | null>(null);
  const [racer, setRacer] = useState<{ name: string; emoji: string } | null>(null);
```

Delete `const [questionDeadline, setQuestionDeadline] = useState<number | null>(null);`.

**(c)** In the load effect's `.then`, replace the `else if (res.questions.length)` branch (which set the first deadline) with:

```ts
        } else if (res.questions.length) {
          if (res.attempt.racer_name) {
            // The splash owns the clock: T0 is set when the student taps.
            setRacer({ name: res.attempt.racer_name, emoji: res.attempt.racer_emoji || "🎒" });
          } else {
            // Stale server without racer names — no splash, clock starts now.
            setT0(Date.now());
          }
        }
```

**(d)** A ping helper and the splash handler, next to `advance()`:

```ts
  function ping(position: number) {
    if (!attemptId) return;
    const answered = Object.keys(stateRef.current.answers).length;
    reportProgress({ attempt_id: attemptId, position, answered }).catch(() => {
      /* fire-and-forget: the race is cosmetic, the quiz is not */
    });
  }

  function onLetsGo() {
    setT0(Date.now());
    ping(0);
  }
```

**(e)** Deadlines are derived, not stored — above the render return:

```ts
  const dl = questions && t0 !== null ? deadlines(questions.map(secondsFor), t0) : null;
```

**(f)** Replace the whole per-question auto-advance effect (the one keyed on `[now, questionDeadline]`) with a budget-driven one:

```ts
  // The budget clock. One effect owns both moves: skip forward to wherever
  // the running budget says the student should be (a phone asleep through
  // three questions lands on the right one in a single tick), and submit
  // when the final deadline passes.
  useEffect(() => {
    const { index: i, questions: qs, answers: a, busy: isBusy, result: hasResult, resumed: hasResumed, error: hasError } = stateRef.current;
    if (!dl || !qs || hasResult || hasResumed || isBusy || hasError) return;
    if (now >= dl[dl.length - 1] && i >= qs.length - 1) {
      if (Object.keys(a).length === 0) {
        setResumed({ percent: null });
        return;
      }
      void submitNow(a);
      return;
    }
    const target = positionAt(dl, now);
    if (target > i) {
      setIndex(target);
      ping(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, dl === null]);
```

**(g)** `advance()` keeps its shape but pings and no longer sets a deadline — replace its tail:

```ts
    const nextIndex = i + 1;
    setIndex(nextIndex);
    ping(nextIndex);
```

(delete the `setQuestionDeadline(...)` line).

**(h)** The splash, rendered before the question view. After the `if (!questions) return …` line add:

```ts
  // The racer splash: the identity is secret, so it shows once, full screen,
  // and the clock does not run until the student says go.
  if (racer && t0 === null && !resumed && !result) {
    return (
      <div class="stack quiz-splash">
        <p class="eyebrow">{t("quiz.splashEyebrow")}</p>
        <p class="quiz-splash-racer"><span aria-hidden="true">{racer.emoji}</span> {racer.name}</p>
        <p class="hint">{t("quiz.splashHint")}</p>
        <button class="btn primary" type="button" onClick={onLetsGo}>{t("quiz.letsGo")}</button>
      </div>
    );
  }
```

**(i)** The remaining-time pill: replace `const remaining = questionDeadline ? … : null;` with:

```ts
  const remaining = dl ? Math.max(0, Math.round((dl[index] - now) / 1000)) : null;
```

**(j)** The `quizClosed` splash edge: the existing `quizClosed` effect already submits what the student has; a student still on the splash has no answers, so it lands in the "finished with nothing to grade" branch — no change needed, but verify the effect does not depend on the deleted state (it does not).

- [ ] **Step 5: Add the strings**

In `src/i18n/strings.ts`, next to the other `quiz.*` keys:

```ts
  "quiz.splashEyebrow": ["Today you are", "Hoy eres"],
  "quiz.splashHint": ["Only you know — find yourself on the big screen.", "Solo tú lo sabes — búscate en la pantalla."],
  "quiz.letsGo": ["Let's go!", "¡Vamos!"],
```

- [ ] **Step 6: Minimal splash CSS**

In `src/styles/app.css` (near the quiz styles):

```css
/* The racer splash: one identity, one button, nothing to study. */
.quiz-splash { align-items: center; text-align: center; padding: 1.5rem 0; }
.quiz-splash-racer { font-size: 1.8rem; font-weight: 800; }
```

- [ ] **Step 7: Run the checks**

Run: `node tools/verify-quiz-race.mjs && node tools/verify-quiz-timing.mjs && npm run typecheck`
Expected: all pass (verify-quiz-timing's Player checks still hold: no timing constants beyond the fallback).

- [ ] **Step 8: Commit** (frontend: `Quiz race: splash, carry-over clock, and progress pings on the phone`).

---

### Task 11: `PinataCard` on the done screen + `my_race` through `Live.tsx`

**Files:**
- Modify: `course-platform/src/api/pulse.ts` (the `MyRace` type on `StudentPulseView`)
- Modify: `course-platform/src/api/quiz.ts` (add `cheerRacer`)
- Create: `course-platform/src/features/quiz/PinataCard.tsx`
- Modify: `course-platform/src/features/quiz/Player.tsx` (prop + render under done states)
- Modify: `course-platform/src/screens/student/Live.tsx` (pass the prop)
- Modify: `course-platform/src/i18n/strings.ts`, `tools/verify-i18n.mjs` (allowlist), `tools/verify-quiz-race.mjs`

**Interfaces:**
- Consumes: `my_race` (Task 8), `cheer` (Task 6).
- Produces: `export interface MyRace` in `src/api/pulse.ts`:

```ts
export interface MyRace {
  racer_name: string;
  racer_emoji: string;
  finished: boolean;
  finish_place: number | null;
  pinata: { percent: number; burst: boolean };
  swinging: number;
}
```

and `QuizPlayer` prop `myRace?: MyRace | null`.

- [ ] **Step 1: Append the failing verifier section**

```js
// ------------------------------------------------- the phone's done card
{
  const card = readFileSync(frontend("src/features/quiz/PinataCard.tsx"), "utf8");
  assert.match(card, /pinata\.cheerButton/, "the card has the cheer button");
  assert.match(card, /cheerRacer\(/, "the button calls the cheer action");
  const live = readFileSync(frontend("src/screens/student/Live.tsx"), "utf8");
  assert.match(live, /myRace=\{/, "Live hands my_race to the player");
}
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Types and API**

In `src/api/pulse.ts` add the `MyRace` interface (exact shape above) and extend `StudentPulseView["quiz"]` with:

```ts
    /** The race card for a finished student's phone; null once the quiz closes. */
    my_race?: MyRace | null;
```

In `src/api/quiz.ts` add:

```ts
/** One cheer from a finished student. The server picks who receives it and
 *  enforces a 20-second cooldown. */
export function cheerRacer(input: { attempt_id: string }) {
  return callFn<{ ok: boolean; reason?: string; to?: { racer_name: string; racer_emoji: string } }>(
    "course-activity-attempt",
    { action: "cheer", ...input }
  );
}
```

- [ ] **Step 4: Write the card**

Create `course-platform/src/features/quiz/PinataCard.tsx`:

```tsx
// The finished student's window into the race: the piñata's crack, their
// candy, their secret racer, and one button to cheer someone still swinging.
// Everything here is decoration around a quiz that is already submitted —
// no state in this file can affect a grade.
import { useEffect, useRef, useState } from "preact/hooks";
import type { MyRace } from "../../api/pulse";
import { cheerRacer } from "../../api/quiz";
import { t } from "../../i18n";

const COOLDOWN_SECONDS = 20;

export function PinataCard({ race, attemptId }: { race: MyRace; attemptId: string }) {
  const [cooldown, setCooldown] = useState(0);
  const [lastCheer, setLastCheer] = useState<{ name: string; emoji: string } | null>(null);
  const [nobodyLeft, setNobodyLeft] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => clearInterval(timer.current), []);

  async function onCheer() {
    try {
      const res = await cheerRacer({ attempt_id: attemptId });
      if (!res.ok) {
        setNobodyLeft(true);
        return;
      }
      if (res.to) setLastCheer({ name: res.to.racer_name, emoji: res.to.racer_emoji });
      setCooldown(COOLDOWN_SECONDS);
      clearInterval(timer.current);
      timer.current = setInterval(() => {
        setCooldown((s) => {
          if (s <= 1) clearInterval(timer.current);
          return Math.max(0, s - 1);
        });
      }, 1000) as unknown as number;
    } catch {
      // The server said "wait" (or the quiz just closed). Either way the
      // student loses nothing — show the cooldown and move on.
      setCooldown(COOLDOWN_SECONDS);
    }
  }

  const everyoneDone = nobodyLeft || race.swinging === 0;

  return (
    <div class="card muted pinata-card" data-testid="pinata-card">
      <p class="pinata-card-bar-label">
        {race.pinata.burst ? t("pinata.burst") : t("pinata.cardTitle", { percent: race.pinata.percent })}
      </p>
      <div class="pinata-bar"><i style={`width:${race.pinata.percent}%`} /></div>
      {race.finished ? <p>{t("pinata.gotCandy")}</p> : null}
      {race.racer_name ? (
        <p>
          {race.finish_place !== null
            ? t("pinata.yourRacer", { emoji: race.racer_emoji, name: race.racer_name, place: race.finish_place })
            : t("pinata.yourRacerNoPlace", { emoji: race.racer_emoji, name: race.racer_name })}
        </p>
      ) : null}
      {everyoneDone ? (
        <p class="hint">{t("pinata.nobodyLeft")}</p>
      ) : (
        <>
          <button class="btn" type="button" disabled={cooldown > 0} onClick={onCheer}>
            {cooldown > 0 ? t("pinata.cheerCooldown", { seconds: cooldown }) : t("pinata.cheerButton")}
          </button>
          {lastCheer ? <p class="hint">{t("pinata.youCheered", { emoji: lastCheer.emoji, name: lastCheer.name })}</p> : null}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Render it under the player's done states**

In `Player.tsx`:
- add the prop: `myRace` (`myRace?: MyRace | null` — import the type from `../../api/pulse`).
- in the `if (resumed)` return, before the closing `</div>`, add:

```tsx
        {myRace && attemptId ? <PinataCard race={myRace} attemptId={attemptId} /> : null}
```

- same addition in the `if (result)` return.
- import: `import { PinataCard } from "./PinataCard";`

In `Live.tsx`, the branch-2 `<QuizPlayer …>` gains:

```tsx
            myRace={view?.quiz.my_race ?? null}
```

- [ ] **Step 6: Strings + allowlist**

Add to `src/i18n/strings.ts`:

```ts
  "pinata.cardTitle": ["🪅 Piñata: {percent}% cracked", "🪅 Piñata: {percent}% quebrada"],
  "pinata.burst": ["¡SE ROMPIÓ! 🪅💥", "¡SE ROMPIÓ! 🪅💥"],
  "pinata.gotCandy": ["🍬 You grabbed a candy", "🍬 Agarraste un dulce"],
  "pinata.yourRacer": ["You were {emoji} {name} — #{place} across the line", "Fuiste {emoji} {name} — #{place} en llegar"],
  "pinata.yourRacerNoPlace": ["You were {emoji} {name}", "Fuiste {emoji} {name}"],
  "pinata.cheerButton": ["📣 Cheer someone on!", "📣 ¡Échale porra!"],
  "pinata.cheerCooldown": ["Next cheer in {seconds}s", "Siguiente porra en {seconds}s"],
  "pinata.youCheered": ["📣 You cheered for {emoji} {name}!", "📣 ¡Le echaste porra a {emoji} {name}!"],
  "pinata.nobodyLeft": ["Everyone's done — watch the piñata!", "Ya terminaron todos — ¡mira la piñata!"],
```

In `tools/verify-i18n.mjs`, add to `allowedIdentical`:

```js
  "pinata.burst",
```

- [ ] **Step 7: Card CSS**

In `src/styles/app.css`:

```css
/* The done-screen race card and its crack bar. */
.pinata-card { display: grid; gap: 0.5rem; }
.pinata-bar { height: 10px; border-radius: 999px; background: color-mix(in srgb, var(--text) 12%, transparent); overflow: hidden; }
.pinata-bar i { display: block; height: 100%; background: linear-gradient(90deg, #ff6ec7, #ffd166, #6ee7ff); transition: width 400ms ease; }
```

- [ ] **Step 8: Run the checks** — `node tools/verify-quiz-race.mjs && node tools/verify-i18n.mjs && npm run typecheck`. Expected: pass.

- [ ] **Step 9: Commit** (frontend: `Quiz race: the finished phone gets the piñata, its candy, and a cheer button`).

---

### Task 12: `commentary.ts` — the calm announcer

**Files:**
- Create: `course-platform/src/features/quiz/commentary.ts`
- Modify: `course-platform/tools/verify-quiz-race.mjs` (append a section)

**Interfaces:**
- Produces (consumed by the layer in Task 13):

```ts
export type Lang = "en" | "es";
export interface RacerView { racer_name: string; racer_emoji: string; position: number; answered: number; finished: boolean; finish_place: number | null }
export interface CheerView { from_name: string; from_emoji: string; to_name: string; to_emoji: string; at: string }
export interface RaceSnap { percent: number; burst: boolean; closed_reason: "time" | "everyone" | null; state: string; racers: RacerView[]; cheers: CheerView[] }
export const SONG_25: string; export const SONG_50: string; export const SONG_75: string; export const BURST_LINE: string;
export const BANNED_WORDS: string[];
export function raceEvents(prev: RaceSnap | null, curr: RaceSnap, lang: Lang): string[];
export function chantLine(curr: RaceSnap, lastTarget: string | null, rng?: () => number): { line: string; target: string } | null;
```

- [ ] **Step 1: Append the failing verifier section**

```js
// ------------------------------------------------- the announcer
{
  const c = await import(frontend("src/features/quiz/commentary.ts").href);
  assert.equal(c.SONG_25, "🎶 Dale, dale, dale…");
  assert.equal(c.SONG_50, "🎶 …no pierdas el tino…");
  assert.equal(c.SONG_75, "🎶 …porque si lo pierdes…");
  assert.equal(c.BURST_LINE, "🎶 …¡pierdes el camino! — ¡SE ROMPIÓ! 🪅💥");

  const racer = (name, emoji, position, finished = false, place = null) =>
    ({ racer_name: name, racer_emoji: emoji, position, answered: position, finished, finish_place: place });
  const snap = (percent, racers, extra = {}) =>
    ({ percent, burst: false, closed_reason: null, state: "live", racers, cheers: [], ...extra });

  const pack = [
    racer("Perezoso Zen", "🦥", 0), racer("Ardilla Turbo", "🐿️", 1), racer("Delfín Zen", "🐬", 2),
    racer("Caballo Épico", "🐴", 4), racer("Pulpo Ninja", "🐙", 5), racer("Rana Viral", "🐸", 5),
    racer("Águila Jedi", "🦅", 6), racer("Abeja Zen", "🐝", 6), racer("Coyote Astral", "🐺", 7),
    racer("Oso Genial", "🐻", 8), racer("Ajolote Veloz", "🦎", 11, true, 1), racer("Jaguar Audaz", "🐆", 11, true, 2)
  ];

  // Milestones fire once each, in order, on crossings.
  let events = c.raceEvents(snap(20, pack), snap(55, pack), "en");
  assert.ok(events.includes(c.SONG_25) && events.includes(c.SONG_50), "crossed milestones sing");
  // A new finisher gets a candy line; a new cheer gets a porra line.
  const before = snap(50, pack);
  const after = snap(52, pack.map((r) => r.racer_name === "Oso Genial" ? { ...r, finished: true, finish_place: 3 } : r),
    { cheers: [{ from_name: "Ajolote Veloz", from_emoji: "🦎", to_name: "Perezoso Zen", to_emoji: "🦥", at: "x" }] });
  events = c.raceEvents(before, after, "en");
  assert.ok(events.some((l) => l.includes("Oso Genial") && l.includes("🍬")), "finisher line");
  assert.ok(events.some((l) => l.includes("cheers for")), "cheer line");
  // Closing by time without a burst is a near-miss, never a defeat-shame.
  events = c.raceEvents(snap(71, pack), snap(71, pack, { state: "closed", closed_reason: "time" }), "en");
  assert.ok(events.some((l) => l.includes("¡Casi!")), "the time close says casi");

  // 10,000 chants: never a banned word, never the same target twice running.
  let seed = 42;
  const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  let lastTarget = null;
  for (let i = 0; i < 10000; i++) {
    const chant = c.chantLine(snap(40, pack), lastTarget, rng);
    assert.ok(chant, "a live pack always has someone to cheer");
    for (const word of c.BANNED_WORDS) {
      assert.ok(!chant.line.toLowerCase().includes(word), `banned word "${word}" in: ${chant.line}`);
    }
    assert.notEqual(chant.target, lastTarget, "never the same racer twice in a row");
    lastTarget = chant.target;
  }
  // Every event template is also banned-word-free.
  for (const line of events) {
    for (const word of c.BANNED_WORDS) assert.ok(!line.toLowerCase().includes(word), `banned word in event: ${line}`);
  }
}
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Write the module**

Create `course-platform/src/features/quiz/commentary.ts`:

```ts
// The room's announcer. Pure — the verifier runs it ten thousand times.
//
// Templates live HERE, not in strings.ts: the module must import cleanly in
// Node without the app's i18n, and the chants are deliberately Spanish in
// both languages anyway. `lang` picks the wording for the few lines that do
// translate (finishers, cheers, the near-miss).
//
// One rule outranks all others: cheer, never shame. No line may say slow,
// last, or behind, in either language — the verifier enforces the list.

export type Lang = "en" | "es";

export interface RacerView {
  racer_name: string;
  racer_emoji: string;
  position: number;
  answered: number;
  finished: boolean;
  finish_place: number | null;
}

export interface CheerView {
  from_name: string;
  from_emoji: string;
  to_name: string;
  to_emoji: string;
  at: string;
}

export interface RaceSnap {
  percent: number;
  burst: boolean;
  closed_reason: "time" | "everyone" | null;
  state: string;
  racers: RacerView[];
  cheers: CheerView[];
}

export const SONG_25 = "🎶 Dale, dale, dale…";
export const SONG_50 = "🎶 …no pierdas el tino…";
export const SONG_75 = "🎶 …porque si lo pierdes…";
export const BURST_LINE = "🎶 …¡pierdes el camino! — ¡SE ROMPIÓ! 🪅💥";

export const BANNED_WORDS = [
  "slow", "slowest", "last", "behind", "late",
  "lento", "lenta", "última", "último", "atrás", "rezagado", "tarde"
];

const CHANTS: Array<(name: string, animal: string) => string> = [
  (_name, animal) => `📣 ¡${animal}, ${animal}, ra ra raaa!`,
  (name) => `📣 ¡Vamos ${name}, tú puedes!`,
  (name) => `📣 ¡${name}, la porra está contigo!`,
  (name) => `📣 ¡Échale ganas, ${name}!`,
  (name) => `📣 ¡Sí se puede, ${name}!`
];

const cheerKey = (cheer: CheerView) => `${cheer.from_name}→${cheer.to_name}@${cheer.at}`;

/** Everything that HAPPENED between two polls, oldest first: song milestones,
 *  new finishers, new cheers, the burst, the close. */
export function raceEvents(prev: RaceSnap | null, curr: RaceSnap, lang: Lang): string[] {
  const es = lang === "es";
  const lines: string[] = [];
  const prevPercent = prev?.percent ?? 0;

  for (const [mark, line] of [[25, SONG_25], [50, SONG_50], [75, SONG_75]] as Array<[number, string]>) {
    if (prevPercent < mark && curr.percent >= mark && !curr.burst) lines.push(line);
  }
  if (!prev?.burst && curr.burst) lines.push(BURST_LINE);

  const wasFinished = new Set((prev?.racers || []).filter((r) => r.finished).map((r) => r.racer_name));
  for (const racer of curr.racers) {
    if (racer.finished && !wasFinished.has(racer.racer_name)) {
      lines.push(es
        ? `🍬 ¡${racer.racer_emoji} ${racer.racer_name} agarró un dulce!`
        : `🍬 ${racer.racer_emoji} ${racer.racer_name} grabbed a candy!`);
    }
  }

  const seenCheers = new Set((prev?.cheers || []).map(cheerKey));
  for (const cheer of curr.cheers) {
    if (!seenCheers.has(cheerKey(cheer))) {
      lines.push(es
        ? `📣 ¡${cheer.from_emoji} ${cheer.from_name} le echa porra a ${cheer.to_emoji} ${cheer.to_name}!`
        : `📣 ${cheer.from_emoji} ${cheer.from_name} cheers for ${cheer.to_emoji} ${cheer.to_name}!`);
    }
  }

  if (prev?.state !== "closed" && curr.state === "closed" && curr.closed_reason === "time" && !curr.burst) {
    lines.push(es
      ? `¡Casi! ${curr.percent}% — la próxima clase cae`
      : `¡Casi! ${curr.percent}% — next class it falls`);
  }

  return lines;
}

/** A cheer for the back of the pack: a racer from the bottom third by
 *  position (started, not finished), never the same one twice in a row.
 *  Spanish in both languages — that is the joke. */
export function chantLine(
  curr: RaceSnap,
  lastTarget: string | null,
  rng: () => number = Math.random
): { line: string; target: string } | null {
  const running = curr.racers
    .filter((racer) => !racer.finished)
    .sort((a, b) => a.position - b.position);
  if (!running.length) return null;

  const backOfPack = running.slice(0, Math.max(1, Math.ceil(running.length / 3)));
  const pool = backOfPack.filter((racer) => racer.racer_name !== lastTarget);
  const candidates = pool.length ? pool : running.filter((racer) => racer.racer_name !== lastTarget);
  if (!candidates.length) return null;

  const racer = candidates[Math.floor(rng() * candidates.length) % candidates.length];
  const template = CHANTS[Math.floor(rng() * CHANTS.length) % CHANTS.length];
  const animal = racer.racer_name.split(" ")[0];
  return { line: template(racer.racer_name, animal), target: racer.racer_name };
}
```

- [ ] **Step 4: Run the verifier** — expected: PASS.

- [ ] **Step 5: Commit** (frontend: `Quiz race: the announcer — song, candy, porra, and never a shaming word`).

---

### Task 13: `ClassroomPinataLayer` + End of Class wiring

**Files:**
- Modify: `course-platform/src/api/quiz.ts` (add `classQuizRace` + `RaceStatus` types)
- Create: `course-platform/src/features/live/ClassroomPinataLayer.tsx`
- Modify: `course-platform/src/screens/instructor/EndOfClass.tsx`
- Modify: `course-platform/src/i18n/strings.ts`, `tools/verify-i18n.mjs`, `src/styles/app.css`, `tools/verify-quiz-race.mjs`

**Interfaces:**
- Consumes: `race` action (Task 7), `raceEvents`/`chantLine`/`RaceSnap` (Task 12), existing `Podium`/`ClassroomPodiumLayer` handoff in EndOfClass.
- Produces: `<ClassroomPinataLayer instanceId podium onShowPodium onClose />`.

- [ ] **Step 1: Append the failing verifier section**

```js
// ------------------------------------------------- the room's screen
{
  const layer = readFileSync(frontend("src/features/live/ClassroomPinataLayer.tsx"), "utf8");
  assert.match(layer, /classQuizRace\(/, "the layer polls the race action");
  assert.match(layer, /raceEvents\(/, "poll diffs feed the announcer");
  assert.match(layer, /chantLine\(/, "idle time cheers the back of the pack");
  assert.match(layer, /Escape/, "Escape closes the layer");
  assert.match(layer, /prefers-reduced-motion|reducedMotion/, "candy rain respects reduced motion");
  const endOfClass = readFileSync(frontend("src/screens/instructor/EndOfClass.tsx"), "utf8");
  assert.match(endOfClass, /ClassroomPinataLayer/, "End of Class mounts the layer");
  assert.match(endOfClass, /setShowingPinata\(true\)/, "the layer opens on start/adopt");
}
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: API client**

In `src/api/quiz.ts` add:

```ts
export interface RaceRacer {
  racer_name: string;
  racer_emoji: string;
  position: number;
  answered: number;
  finished: boolean;
  finish_place: number | null;
}

export interface RaceCheer {
  from_name: string;
  from_emoji: string;
  to_name: string;
  to_emoji: string;
  at: string;
}

export interface RaceStatus {
  instance_id: string;
  state: string;
  ends_at: string | null;
  question_count: number | null;
  present: number;
  started: number;
  submitted: number;
  closed_reason: "time" | "everyone" | null;
  pinata: { name: string; hits: number; total: number; percent: number; burst: boolean };
  racers: RaceRacer[];
  cheers: RaceCheer[];
  cheers_total: number;
}

/** The room's screen, in one call: counts, racers by secret name, the piñata. */
export function classQuizRace(activityInstanceId: string) {
  return callFn<RaceStatus>("course-class-quiz", { action: "race", activity_instance_id: activityInstanceId });
}
```

- [ ] **Step 4: Write the layer**

Create `course-platform/src/features/live/ClassroomPinataLayer.tsx`:

```tsx
// The piñata race, on the screen the room is looking at.
//
// A fullscreen opaque layer inside Run Class — the ClassroomPodiumLayer
// pattern, for the reasons in the 2026-08-14 spec: Run Class is the only
// teaching display. It opens when the professor starts the quiz, polls the
// race every two seconds, and FREEZES when the quiz closes: final track,
// final percent, burst or ¡Casi!, and the button that hands over to the
// podium. Calm by construction: one commentary line, milestones are the only
// loud moments, and nothing on this screen ever names a student.
import { useEffect, useRef, useState } from "preact/hooks";
import { classQuizRace, type RaceStatus, type PodiumEntry } from "../../api/quiz";
import { clockText } from "../quiz/clock";
import { raceEvents, chantLine, type RaceSnap } from "../quiz/commentary";
import { t, lang } from "../../i18n";

const POLL_MS = 2000;
const LINE_MS = 4000;   // each event line holds at least this long
const CHANT_MS = 8000;  // idle time before a chant fills the silence

function toSnap(race: RaceStatus): RaceSnap {
  return {
    percent: race.pinata.percent,
    burst: race.pinata.burst,
    closed_reason: race.closed_reason,
    state: race.state,
    racers: race.racers,
    cheers: race.cheers
  };
}

export function ClassroomPinataLayer({
  instanceId,
  podium,
  onShowPodium,
  onClose
}: {
  instanceId: string;
  podium: PodiumEntry[];
  onShowPodium: () => void;
  onClose: () => void;
}) {
  const layerRef = useRef<HTMLElement | null>(null);
  const [race, setRace] = useState<RaceStatus | null>(null);
  const [line, setLine] = useState<string>("");
  const [raining, setRaining] = useState(false);
  const [now, setNow] = useState(Date.now());
  const prevSnap = useRef<RaceSnap | null>(null);
  const queue = useRef<string[]>([]);
  const lastLineAt = useRef(0);
  const lastChantTarget = useRef<string | null>(null);
  const frozen = useRef(false);
  const reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    layerRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // The race poll. Stops for good on the first closed payload — the freeze.
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (frozen.current) return;
      classQuizRace(instanceId)
        .then((res) => {
          if (cancelled) return;
          const snap = toSnap(res);
          const events = raceEvents(prevSnap.current, snap, lang.value === "es" ? "es" : "en");
          queue.current.push(...events);
          if (!prevSnap.current?.burst && snap.burst && !reducedMotion) {
            setRaining(true);
            setTimeout(() => setRaining(false), 3000);
          }
          prevSnap.current = snap;
          setRace(res);
          if (res.state === "closed") frozen.current = true;
        })
        .catch(() => { /* one missed poll is invisible; the next one catches up */ });
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [instanceId]);

  // The one commentary line: queued events first, chants to fill silence.
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, []);
  useEffect(() => {
    const elapsed = now - lastLineAt.current;
    if (queue.current.length && elapsed >= LINE_MS) {
      setLine(queue.current.shift() as string);
      lastLineAt.current = now;
      return;
    }
    if (!frozen.current && prevSnap.current && elapsed >= CHANT_MS) {
      const chant = chantLine(prevSnap.current, lastChantTarget.current);
      if (chant) {
        setLine(chant.line);
        lastChantTarget.current = chant.target;
        lastLineAt.current = now;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  const questionCount = Math.max(1, Number(race?.question_count || 0) || 1);
  const columns: RaceStatus["racers"][] = Array.from({ length: questionCount + 1 }, () => []);
  for (const racer of race?.racers || []) {
    if (!racer.finished) columns[Math.min(questionCount, racer.position)].push(racer);
  }
  const porra = (race?.racers || [])
    .filter((racer) => racer.finished)
    .sort((a, b) => (a.finish_place ?? 99) - (b.finish_place ?? 99));
  const remainingMs = race?.ends_at ? new Date(race.ends_at).getTime() - now : 0;
  const blindfolded = Math.max(0, (race?.present ?? 0) - (race?.started ?? 0));
  const closed = race?.state === "closed";

  return (
    <section ref={layerRef} class="classroom-pinata-layer" data-testid="classroom-pinata-layer" aria-live="off" tabindex={-1}>
      <header class="pinata-top">
        <div>
          <p class="pinata-clock" role="timer">{closed ? "🏁" : clockText(Math.max(0, remainingMs))}</p>
          <p class="pinata-line">{line}</p>
        </div>
        <div class="pinata-counts">
          <p><b>{t("pinata.swinging", { count: Math.max(0, (race?.started ?? 0) - (race?.submitted ?? 0)) })}</b> · <b>{t("pinata.candies", { count: race?.submitted ?? 0 })}</b></p>
          <p>{t("pinata.present", { count: race?.present ?? 0 })}{blindfolded > 0 ? <> · {t("pinata.blindfolded", { count: blindfolded })}</> : null}</p>
        </div>
      </header>

      <div class="pinata-main">
        <div class="pinata-track" style={`grid-template-columns: repeat(${questionCount + 1}, 1fr);`}>
          {columns.map((group, index) => (
            <div class="pinata-col" key={index}>
              <span class="pinata-col-label">{index === 0 ? t("pinata.start") : index}</span>
              {group.map((racer) => (
                <span class="pinata-racer" key={racer.racer_name} title={racer.racer_name}>
                  <span aria-hidden="true">{racer.racer_emoji}</span>
                  <small>{racer.racer_name}</small>
                </span>
              ))}
            </div>
          ))}
        </div>

        <aside class="pinata-side">
          <div class={`pinata-figure${race?.pinata.burst ? " burst" : ""}`} aria-hidden="true">🪅</div>
          <div class="pinata-bar"><i style={`width:${race?.pinata.percent ?? 0}%`} /></div>
          <p class="pinata-name">
            {race?.pinata.burst
              ? t("pinata.burst")
              : t("pinata.layerTitle", { title: race?.pinata.name || "" })}
            {" · "}{race?.pinata.percent ?? 0}%
          </p>
          {closed && !race?.pinata.burst ? (
            <p class="pinata-casi">{t("pinata.casi", { percent: race?.pinata.percent ?? 0 })}</p>
          ) : null}
          <div class="pinata-porra">
            <p>{t("pinata.porra", { count: porra.length })}</p>
            <p class="pinata-porra-row">
              {porra.map((racer) => (
                <span key={racer.racer_name} title={racer.racer_name}>
                  {(racer.finish_place ?? 4) <= 3 ? "👑" : ""}{racer.racer_emoji}
                </span>
              ))}
            </p>
          </div>
        </aside>
      </div>

      {raining ? (
        <div class="pinata-rain" aria-hidden="true">
          {"🍬🍭🍬🍫🍬🍭🍬🍭🍫🍬".split("").map((candy, index) => (
            <span key={index} style={`left:${(index * 9.7) % 100}%; animation-delay:${(index % 5) * 120}ms`}>{candy}</span>
          ))}
        </div>
      ) : null}

      <footer class="pinata-actions">
        {closed ? (
          <button class="btn primary" type="button" disabled={!podium.length} onClick={onShowPodium}>
            {t("podium.showToClass")}
          </button>
        ) : null}
        <button class="btn" type="button" onClick={onClose}>{t("podium.backToClass")}</button>
      </footer>
    </section>
  );
}
```

- [ ] **Step 5: Wire End of Class**

In `EndOfClass.tsx`:

**(a)** Import: `import { ClassroomPinataLayer } from "../../features/live/ClassroomPinataLayer";`

**(b)** New state next to `showingPodium`:

```ts
  // The race outlives the instance: EndOfClass clears `instanceId` when the
  // quiz closes, but the frozen final screen must survive that. Replaced on
  // the next start, not on close.
  const [raceInstanceId, setRaceInstanceId] = useState<string | null>(null);
  const [showingPinata, setShowingPinata] = useState(false);
```

**(c)** In `onStart`, after `setInstanceId(instance_id);` add:

```ts
      setRaceInstanceId(instance_id);
      setShowingPinata(true);
```

**(d)** In the mount-adopt effect, after `setInstanceId(res.instance_id);` add:

```ts
          setRaceInstanceId(res.instance_id);
          setShowingPinata(true);
```

**(e)** In the running branch of the JSX (next to the Close button) add a re-open control:

```tsx
          <button class="btn" type="button" onClick={() => setShowingPinata(true)}>
            {t("pinata.show")}
          </button>
```

**(f)** At the bottom, next to the podium layer conditional, add:

```tsx
      {showingPinata && raceInstanceId ? (
        <ClassroomPinataLayer
          instanceId={raceInstanceId}
          podium={podium}
          onShowPodium={() => { setShowingPinata(false); setShowingPodium(true); }}
          onClose={() => setShowingPinata(false)}
        />
      ) : null}
```

- [ ] **Step 6: Strings + allowlist**

Add to `src/i18n/strings.ts`:

```ts
  "pinata.layerTitle": ["🪅 Today's piñata: {title}", "🪅 La piñata de hoy: {title}"],
  "pinata.swinging": ["{count} swinging", "{count} dándole"],
  "pinata.candies": ["{count} got candy 🍬", "{count} con dulce 🍬"],
  "pinata.present": ["{count} present", "{count} presentes"],
  "pinata.blindfolded": ["{count} still blindfolded", "{count} con la venda puesta"],
  "pinata.start": ["start", "salida"],
  "pinata.porra": ["La porra ({count})", "La porra ({count})"],
  "pinata.casi": ["¡Casi! {percent}% — next class it falls", "¡Casi! {percent}% — la próxima clase cae"],
  "pinata.show": ["Show the piñata", "Mostrar la piñata"],
```

Add `"pinata.porra",` to `allowedIdentical` in `tools/verify-i18n.mjs`.

- [ ] **Step 7: Layer CSS**

Append to `src/styles/app.css`:

```css
/* The piñata race — the room's screen. Same posture as the podium layer:
   fixed, opaque, dark whatever the app theme, nothing translucent for the
   room to read the professor's screen through. */
.classroom-pinata-layer {
  position: fixed; inset: 0; z-index: 60; display: flex; flex-direction: column;
  gap: 1rem; padding: 1.5rem 2rem; background: #0f1420; color: #f4f6fb;
}
.pinata-top { display: flex; justify-content: space-between; align-items: flex-end; gap: 1rem; }
.pinata-clock { font-size: 3.2rem; font-weight: 800; line-height: 1; margin: 0; }
.pinata-line { min-height: 1.4em; color: #ffd166; font-size: 1.15rem; margin: 0.4rem 0 0; }
.pinata-counts { text-align: right; color: #aab3c5; }
.pinata-counts b { color: #fff; }
.pinata-main { flex: 1; display: grid; grid-template-columns: 1fr 22%; gap: 1.2rem; min-height: 0; }
.pinata-track { display: grid; gap: 4px; align-items: end; }
.pinata-col { display: flex; flex-direction: column-reverse; align-items: center; gap: 3px;
  min-height: 100%; border-left: 1px dashed rgba(255, 255, 255, 0.12); padding-bottom: 1.4rem; position: relative; }
.pinata-col-label { position: absolute; bottom: 0; font-size: 0.7rem; color: #6f7a90; }
.pinata-racer { font-size: 1.5rem; line-height: 1.1; text-align: center; transition: transform 400ms ease; }
.pinata-racer small { display: block; font-size: 0.55rem; color: #c9d1e0; max-width: 5.5rem;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pinata-side { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; text-align: center; }
.pinata-figure { font-size: 5rem; transform: rotate(-10deg); }
.pinata-figure.burst { transform: none; filter: drop-shadow(0 0 20px rgba(255, 209, 102, 0.7)); }
.pinata-side .pinata-bar { width: 100%; }
.pinata-name { color: #ffd166; font-size: 0.9rem; margin: 0; }
.pinata-casi { font-weight: 700; margin: 0; }
.pinata-porra { margin-top: auto; background: rgba(255, 255, 255, 0.06); border-radius: 10px;
  padding: 0.6rem; width: 100%; }
.pinata-porra p { margin: 0; font-size: 0.85rem; }
.pinata-porra-row { font-size: 1.3rem; letter-spacing: 0.1em; }
.pinata-rain { position: fixed; inset: 0; pointer-events: none; overflow: hidden; }
.pinata-rain span { position: absolute; top: -2rem; font-size: 2rem; animation: pinata-fall 2.6s ease-in forwards; }
@keyframes pinata-fall { to { transform: translateY(110vh) rotate(300deg); } }
@media (prefers-reduced-motion: reduce) {
  .pinata-rain { display: none; }
  .pinata-racer { transition: none; }
}
.pinata-actions { display: flex; justify-content: center; gap: 0.8rem; }
```

- [ ] **Step 8: Run everything**

Run: `node tools/verify-quiz-race.mjs && node tools/verify-i18n.mjs && npm run typecheck`
Expected: all pass.

- [ ] **Step 9: Commit** (frontend: `Quiz race: the room's piñata screen, frozen at the close, podium on demand`).

---

### Task 14: Full verify, docs, deploy

**Files:**
- Modify: `course-platform/docs/05-status.md` (status entry, repo convention: newest at top)
- Both repos: push; backend: migrations + function deploys.

- [ ] **Step 1: Full local gate**

Run: `cd "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform" && npm run verify && npm run build`
Expected: `All N verifiers passed.` and a clean build. Fix anything that fails before continuing (e.g. a missed i18n pair).

- [ ] **Step 2: Status entry**

Add a dated entry at the top of `docs/05-status.md` summarizing: carry-over timer, 60 s cushion, 40-word exit ticket, piñata race layer, racer names, cheers — pointing at the spec and this plan. Follow the file's existing entry format.

- [ ] **Step 3: Commit docs**

```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform" && git add docs/05-status.md && git commit -m "Docs: piñata race status entry"
```

- [ ] **Step 4: Deploy backend**

```bash
cd /Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io && npx supabase db push
npx supabase functions deploy course-activity-attempt
npx supabase functions deploy course-class-quiz
npx supabase functions deploy course-pulse
npx supabase functions deploy course-exit-ticket
git push
```

- [ ] **Step 5: Deploy frontend**

```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform" && git push
```

(Cloudflare Pages deploys on push.)

---

### Task 15: Manual run-through in an empty group

Never in 402 (real students). Use group 501 or 502 — check People first to confirm it is empty of real students.

- [ ] **Step 1:** As the professor, create/open a class session in group 501 with a lecture that has a question bank; start the class.
- [ ] **Step 2:** Check two test students in (QR/join code), open their Live screens in two browser profiles/tabs.
- [ ] **Step 3:** Start the quiz from End of Class. Confirm: the piñata layer opens by itself; both phones show the "Today you are …" splash; the layer shows 2 present/swinging once both tap Let's go.
- [ ] **Step 4:** On phone A answer a couple of questions fast — confirm the saved time appears on the next question's pill, the racer advances on the layer within ~2 s, the crack % moves.
- [ ] **Step 5:** Let phone B idle past a deadline — confirm it auto-advances; lock/unlock it for ~90 s — confirm it skips forward in one step.
- [ ] **Step 6:** Finish phone A. Confirm: candy line on the layer; A moves to la porra; A's phone shows the PinataCard; tap the cheer button — the cheer line names B's racer on the layer, and the button shows the 20 s cooldown.
- [ ] **Step 7:** Reload the Run Class tab mid-quiz — confirm the layer re-opens on its own.
- [ ] **Step 8:** Let the clock run out (or finish B for the "everyone" close). Confirm: the layer freezes (burst or ¡Casi!), Show the winners appears and opens the podium, Escape returns to Run Class.
- [ ] **Step 9:** On each phone confirm the exit ticket now says "need 40–100" and accepts a 40-word paragraph.
- [ ] **Step 10:** Close the class. If anything failed, fix before calling the feature done.
