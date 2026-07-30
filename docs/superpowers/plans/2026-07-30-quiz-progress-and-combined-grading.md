# Quiz Progress and Combined Grading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add anonymous live quiz progress, consent-based podium recognition, 30/45-second reading-load timing, and one capped combined score per class.

**Architecture:** Store minimal attempt progress and consent, compute aliases server-side, and branch grading by a session grading version so historical results remain untouched. Student submission and quiz close both run the same idempotent combined-grade helper.

**Tech Stack:** Preact, TypeScript, Supabase Edge Functions/Deno, PostgreSQL, existing activity/gradebook engine.

## Global Constraints

- Existing sessions remain `legacy_v1`; newly created sessions use `combined_v2`.
- Progress never contains answer selections or correctness.
- Public progress never contains profile ids, real names, or scores.
- Public real names require the student's opt-in at reveal time.
- Combined grades cap at 100 and ignore speed bonus.
- Question timers are only 30 or 45 seconds.
- The actual instance question count is the denominator.
- Scientist aliases use a dedicated `COURSE_ALIAS_SECRET`; do not reuse deck
  token or content-delivery secrets.

---

### Task 1: Add progress, consent, and grade-version persistence

**Files:**
- Create: backend `supabase/migrations/0029_quiz_progress_and_combined_grades.sql`
- Create: backend `tools/verify-combined-grading.mjs`

**Interfaces:**
- Produces: `quiz_attempt_progress`
- Produces: `profiles.public_podium_name_opt_in`
- Produces: `class_sessions.grading_version`
- Produces: `class_session_gradebook_items`

- [ ] **Step 1: Write the failing verifier**

Assert RLS/revokes, unique attempt progress, unique session gradebook mapping,
consent default false, and legacy backfill before the new default.

- [ ] **Step 2: Run RED**

Run: `node tools/verify-combined-grading.mjs`

- [ ] **Step 3: Create migration 0029**

```sql
alter table public.profiles
  add column public_podium_name_opt_in boolean not null default false;

alter table public.class_sessions add column grading_version text;
update public.class_sessions set grading_version = 'legacy_v1' where grading_version is null;
alter table public.class_sessions alter column grading_version set default 'combined_v2';
alter table public.class_sessions alter column grading_version set not null;
alter table public.class_sessions add check (grading_version in ('legacy_v1','combined_v2'));

create table public.quiz_attempt_progress (
  student_attempt_id uuid primary key references public.student_attempts(id) on delete cascade,
  answered_count int not null check (answered_count >= 0),
  total_count int not null check (total_count > 0),
  current_position int not null check (current_position >= 0),
  submitted_at timestamptz,
  last_seen_at timestamptz not null default now(),
  check (answered_count <= total_count)
);
```

Add `class_session_gradebook_items(class_session_id unique, gradebook_item_id
unique)`, RLS, revokes, and indexes.

- [ ] **Step 4: Run GREEN and commit**

Run verifier, then commit migration and verifier.

### Task 2: Return server-authored 30/45-second budgets

**Files:**
- Modify: backend `supabase/functions/course-activity-attempt/index.ts`
- Create: backend `supabase/functions/_shared/question-timing.ts`
- Modify: backend `tools/verify-combined-grading.mjs`
- Modify: `src/features/quiz/Player.tsx`
- Create: `tools/verify-question-timing.mjs`

**Interfaces:**
- Produces: `questionSeconds(prompt, promptEs, options): 30 | 45`
- Adds: `time_limit_seconds: 30 | 45` to every delivered question

- [ ] **Step 1: Write failing boundary tests**

Test exactly 60/61 total words, 35/36 prompt words, 15/16 option words,
multiline text, code-like preformatted text, and Spanish being longer than
English.

- [ ] **Step 2: Run RED**

Run backend combined verifier and frontend verifier.

- [ ] **Step 3: Implement the classifier**

Return 45 when either language exceeds any approved threshold; otherwise 30.
Include options in both languages. Add the budget to the authenticated question
response. Delete `SECONDS_BY_DIFFICULTY` and let Player consume only the server
budget, refusing values outside `30 | 45`.

- [ ] **Step 4: Run GREEN and commit in each repository**

Run Deno check, backend verifier, frontend typecheck/verifiers/build, then commit
backend and frontend changes separately.

### Task 3: Add student progress heartbeat and consent actions

**Files:**
- Modify: backend `supabase/functions/course-activity-attempt/index.ts`
- Modify: backend `supabase/functions/course-class-quiz/index.ts`
- Create: backend `supabase/functions/_shared/scientist-alias.ts`
- Modify: backend `tools/verify-combined-grading.mjs`

**Interfaces:**
- Produces activity action: `progress`
- Produces quiz actions: `progress_private`, `progress_projector`,
  `get_podium_consent`, `set_podium_consent`

- [ ] **Step 1: Add failing authorization/privacy tests**

Require the attempt owner check, monotonic bounded counts, student-only consent
write, and explicit projector-key deny list.

- [ ] **Step 2: Run RED**

Run: `node tools/verify-combined-grading.mjs`

- [ ] **Step 3: Implement progress and aliases**

`progress` upserts only the caller's attempt. `progress_private` joins enrolled
students, attempts, and progress with real names. `progress_projector` returns:

```ts
{
  alias: string;
  avatar_key: string;
  answered_count: number;
  total_count: number;
  state: "in_progress" | "submitted";
  stale: boolean;
}
```

Generate alias/avatar from an HMAC of session id + profile id using a
`COURSE_ALIAS_SECRET`; never return the input profile id. Add a startup guard
that refuses alias generation when the secret is absent or shorter than 32
characters.

- [ ] **Step 4: Bundle, verify, commit**

Run Deno checks and the verifier, then commit the two functions and shared
helper.

### Task 4: Implement combined session grading

**Files:**
- Create: backend `supabase/functions/_shared/session-grade.ts`
- Modify: backend `supabase/functions/course-activity-attempt/index.ts`
- Modify: backend `supabase/functions/course-class-quiz/index.ts`
- Modify: backend `supabase/functions/course-pulse/index.ts`
- Modify: backend `tools/verify-combined-grading.mjs`

**Interfaces:**
- Produces: `recomputeSessionGrade(db, attemptId): CombinedGrade`
- Returns: `{ final_correct, pulse_correct, question_count, combined_percent }`

- [ ] **Step 1: Add failing formula/idempotency assertions**

Cover 10+2 of 12 = 100, 8+3 = 91.7, 12+4 capped at 100, 9+0 = 75,
duplicate recalculation, and `legacy_v1` unchanged.

- [ ] **Step 2: Run RED**

Run combined verifier.

- [ ] **Step 3: Implement the helper**

For `combined_v2`, count correct `student_responses`, count distinct correct
pulse rounds for the same profile/session, calculate:

```ts
const combinedCorrect = Math.min(questionCount, finalCorrect + pulseCorrect);
const combinedPercent = Math.round((1000 * combinedCorrect) / questionCount) / 10;
```

Ensure one session-specific gradebook item and upsert its score. Do not post the
legacy lecture quiz item for combined sessions. On student submit, call the
helper for immediate feedback; on quiz close, call it for every submitted
attempt. For combined sessions, pulse answers remain in `pulse_answers` but do
not add weighted `participation_events`.

- [ ] **Step 4: Bundle, verify, commit**

Run Deno check for all three functions and combined verifier, then commit.

### Task 5: Add student heartbeat and podium consent UI

**Files:**
- Modify: `src/api/quiz.ts`
- Modify: `src/features/quiz/Player.tsx`
- Create: `src/components/PodiumConsent.tsx`
- Modify: `src/screens/student/Grades.tsx`
- Modify: `src/i18n/strings.ts`
- Modify: `tools/verify-question-timing.mjs`

**Interfaces:**
- Consumes: progress/consent actions from Task 3
- Produces: non-blocking heartbeat and student preference

- [ ] **Step 1: Add failing frontend verifier assertions**

Require heartbeat at start/transition/recovery/submission, swallowed heartbeat
errors, and consent default-off copy.

- [ ] **Step 2: Run RED**

Run: `npm run verify`

- [ ] **Step 3: Implement**

Heartbeat failures update no quiz state. Send answered count derived from the
player's local response map and total from the delivered quiz. Grades includes
the preference control and confirms the saved state.

- [ ] **Step 4: Verify and commit**

Run typecheck, all verifiers, build, then commit.

### Task 6: Add private progress and public quiz board

**Files:**
- Create: `src/features/quiz/PrivateQuizProgress.tsx`
- Create: `src/features/quiz/ProjectorQuizProgress.tsx`
- Create: `src/features/quiz/Podium.tsx`
- Modify: `src/screens/instructor/EndOfClass.tsx`
- Modify: `src/screens/instructor/Projector.tsx`
- Modify: `src/api/quiz.ts`
- Modify: `src/i18n/strings.ts`
- Modify: `src/styles/app.css`
- Create: `tools/verify-quiz-projector.mjs`

**Interfaces:**
- Consumes: private/projector progress and projector phase from the projector plan
- Produces: explicit `Show podium`

- [ ] **Step 1: Write failing privacy/UI verifier**

Require aliases/progress in Projector, real names only in Private progress, no
scores in Podium, and Show podium disabled until quiz closed.

- [ ] **Step 2: Run RED**

Run: `npm run verify`

- [ ] **Step 3: Implement progress and podium**

Projector shows only started participants, class completion, anonymous progress,
and animations respecting reduced-motion. Controller shows real names,
last-seen warnings, and final combined scores. Podium uses combined score,
final correctness, then completion time; show preferred/full name only when
consent is true, otherwise alias. If fewer than three submit, show only
available places.

- [ ] **Step 4: Verify and commit**

Run typecheck, verifiers, build, then commit all listed files.

### Task 7: Deploy and rehearse grading/progress

**Files:**
- Modify: `docs/04-decisions.md`
- Modify: `docs/05-status.md`
- Modify: `docs/06-runbook.md`
- Modify: `docs/07-pitfalls.md`
- Modify: `docs/HANDOFF-PROMPT.md`

- [ ] **Step 1: Run complete verification**

Run all frontend checks, Deno checks for activity/quiz/pulse, combined verifier,
projector safety verifier, and `git diff --check` in both repositories.

- [ ] **Step 2: Apply migration 0029 and deploy backend**

Deploy activity attempt, class quiz, and pulse functions. Verify old sessions
report `legacy_v1` and a newly created session reports `combined_v2`.
Create `COURSE_ALIAS_SECRET` through `supabase secrets set` without printing or
committing its value, then confirm the class-quiz function reports a controlled
configuration error when tested in an environment where the secret is absent.

- [ ] **Step 3: Push frontend and confirm Cloudflare success**

Record commit, deployment id, bundle hash, and successful build log.

- [ ] **Step 4: Rehearse with multiple students**

Exercise both timer lengths, progress/reconnect, private names, anonymous
projector, opt-in/anonymous podium winners, combined-grade examples, cap at 100,
no separate participation weight, reflection, and reload recovery through real
Today → Join class entry points.

- [ ] **Step 5: Document and commit**

Record only observed evidence and commit
`docs: record combined class grading rehearsal`.
