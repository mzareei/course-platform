# Class Question Plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-class-session, professor-controlled question plan and manual checkpoint board without changing the existing deck-driven checkpoint flow.

**Architecture:** Store a plan, its future checkpoint cards, and their approved bank-question candidates separately from the reusable question bank and lecture HTML. A new authenticated Edge Function owns plan editing and candidate validation; `course-pulse` receives one narrow extension that permits a selected plan candidate to be sent without pretending it belongs to the deck's authored slide checkpoint. The Run Class screen renders the new board beside the existing controls, with the existing deck bridge unchanged.

**Tech Stack:** Preact/TypeScript, Supabase Postgres migrations and Edge Functions (Deno), existing `course-pulse` live-question protocol, Node verifier scripts.

## Global Constraints

- Preserve existing `course-pulse` behavior when `plan_checkpoint_id` is absent.
- Never mutate `questions`, `question_banks`, deck HTML, or existing checkpoint metadata while editing a class plan.
- A regular instructor may manage only plans for sections they teach; `platform_owner` retains course-wide access.
- A checkpoint with a sent pulse round is historical and cannot be deleted or have its candidates changed.
- The manual board must work when `class_sessions.content_item_id` is null; slide hints are optional reminders.
- All new interface text has English and Spanish entries in `src/i18n/strings.ts`.
- No attendance, grade, quick-question, PDF-generation, or deck-reassembly changes belong in this plan.

---

## File structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/0034_class_question_plans.sql` | Plan/checkpoint/candidate tables, constraints, indexes, and RLS. |
| `supabase/functions/_shared/class-question-plan.ts` | Shared input validation and plan candidate/immutability helpers. |
| `supabase/functions/course-class-question-plan/index.ts` | Instructor-authorized CRUD, copy, and read API for plans. |
| `supabase/functions/course-pulse/index.ts` | Validate `plan_checkpoint_id` and record it on a sent pulse round. |
| `supabase/config.toml` | Register the new function with JWT verification. |
| `tools/verify-class-question-plans.mjs` | Backend contract verifier for migration/function/pulse integration. |
| `src/api/classQuestionPlans.ts` | Typed browser API for plan CRUD and plan-candidate sending. |
| `src/components/ClassQuestionPlanBoard.tsx` | Editable professor board and manual question selection UI. |
| `src/screens/instructor/RunClass.tsx` | Mount the board without removing the current checkpoint panel. |
| `src/i18n/strings.ts` | EN/ES labels, errors, and empty states. |
| `tools/verify-class-question-plans.mjs` | Frontend contract verifier for the board and safe coexistence. |

## Data contracts

```ts
export type PlanCheckpoint = {
  id: string;
  position: number;
  topic: string;
  slide_hint: number | null;
  notes: string | null;
  state: "planned" | "sent" | "skipped";
  candidate_question_ids: string[];
};

export type ClassQuestionPlan = {
  id: string;
  class_session_id: string;
  question_bank_id: string;
  final_quiz_question_count: number;
  notes: string | null;
  copied_from_plan_id: string | null;
  checkpoints: PlanCheckpoint[];
};

// course-pulse extension; existing calls omit plan_checkpoint_id.
type PushPlanQuestion = {
  class_session_id: string;
  question_id: string;
  plan_checkpoint_id: string;
  time_limit_seconds?: number;
  points?: number;
};
```

### Task 1: Persist plans safely

**Files:**
- Create: `mzareei.github.io/supabase/migrations/0034_class_question_plans.sql`
- Create: `mzareei.github.io/supabase/functions/_shared/class-question-plan.ts`
- Create: `mzareei.github.io/tools/verify-class-question-plans.mjs`

**Interfaces:**
- Produces: `class_question_plans`, `class_question_plan_checkpoints`, and `class_question_plan_candidates`.
- Produces: `validateCheckpointDraft()` and `assertMutableCheckpoint()` for the Edge Function.

- [ ] **Step 1: Write a failing migration contract verifier**

Create `tools/verify-class-question-plans.mjs` that reads migration `0034` and asserts the three table names, a unique `class_session_id` plan constraint, `position >= 1`, nullable `slide_hint`, candidate uniqueness, RLS enablement, and indexes for `class_session_id` and `checkpoint_id`.

```js
assert.match(sql, /create table if not exists public\.class_question_plans/i);
assert.match(sql, /unique\s*\(class_session_id\)/i);
assert.match(sql, /position\s+int[^;]*check\s*\(position\s*>=\s*1\)/i);
assert.match(sql, /enable row level security/i);
```

- [ ] **Step 2: Run the verifier to prove it fails**

Run: `node tools/verify-class-question-plans.mjs`

Expected: failure because migration `0034_class_question_plans.sql` does not exist.

- [ ] **Step 3: Add the additive migration**

Create the three tables with foreign keys to `class_sessions`, `question_banks`, `questions`, and the plan/checkpoint parents. Use `on delete cascade` only for plan-owned rows; do not cascade from a question-bank question into a historical checkpoint candidate. Add `state check (state in ('planned','sent','skipped'))`, timestamps, and `updated_by` references. Enable RLS with no public policies, matching the existing service-role Edge Function pattern.

```sql
create table if not exists public.class_question_plan_checkpoints (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.class_question_plans(id) on delete cascade,
  position int not null check (position >= 1),
  topic text not null check (length(trim(topic)) between 1 and 160),
  slide_hint int check (slide_hint is null or slide_hint >= 1),
  notes text check (notes is null or length(notes) <= 1000),
  state text not null default 'planned' check (state in ('planned','sent','skipped')),
  unique (plan_id, position)
);
```

- [ ] **Step 4: Add pure validation helpers**

Create `_shared/class-question-plan.ts` with exact helper behavior:

```ts
export function validateCheckpointDraft(input: Record<string, unknown>) {
  const topic = String(input.topic || "").trim().slice(0, 160);
  const slideHint = input.slide_hint == null || input.slide_hint === ""
    ? null : Number(input.slide_hint);
  if (!topic) throw new Error("A checkpoint topic is required.");
  if (slideHint !== null && (!Number.isInteger(slideHint) || slideHint < 1)) {
    throw new Error("The slide hint must be a positive whole number.");
  }
  return { topic, slideHint, notes: String(input.notes || "").trim().slice(0, 1000) || null };
}

export function assertMutableCheckpoint(state: string, sentRoundCount: number) {
  if (state !== "planned" || sentRoundCount > 0) {
    throw new Error("A checkpoint that has been used in class cannot be changed.");
  }
}
```

- [ ] **Step 5: Run the backend verifier**

Run: `node tools/verify-class-question-plans.mjs`

Expected: exit 0.

- [ ] **Step 6: Commit the schema foundation**

```bash
git add supabase/migrations/0034_class_question_plans.sql \
  supabase/functions/_shared/class-question-plan.ts \
  tools/verify-class-question-plans.mjs
git commit -m "feat: add class question plan schema"
```

### Task 2: Add the plan Edge Function

**Files:**
- Create: `mzareei.github.io/supabase/functions/course-class-question-plan/index.ts`
- Modify: `mzareei.github.io/supabase/config.toml`
- Modify: `mzareei.github.io/tools/verify-class-question-plans.mjs`

**Interfaces:**
- Consumes: Task 1 tables and validation helpers.
- Produces actions: `get`, `create`, `copy`, `add_checkpoint`, `update_checkpoint`, `remove_checkpoint`, `set_candidates`, and `mark_skipped`.

- [ ] **Step 1: Extend the verifier with failing function assertions**

Assert each action name occurs in the new function, that teacher permissions are section-scoped, candidates are checked against the plan bank, and sent checkpoints use `assertMutableCheckpoint` before mutation.

- [ ] **Step 2: Run the verifier to prove it fails**

Run: `node tools/verify-class-question-plans.mjs`

Expected: failure because the Edge Function is absent.

- [ ] **Step 3: Implement authorization and reads**

Follow `course-pulse/index.ts` for token/profile/role/section authorization. `get` accepts a class session id and returns `null` when no plan exists. It must load checkpoints in ascending `position`, candidates in deterministic position order, and never expose answer correctness to a student-facing route.

- [ ] **Step 4: Implement mutations with server-side invariants**

`create` requires a live or planned session and an active question bank in the same course. `copy` copies only `planned` checkpoints and candidate links from an earlier plan into a target session. `set_candidates` accepts distinct UUIDs, verifies each question belongs to the plan's active bank, and refuses to change a checkpoint with a linked `pulse_rounds` row. `remove_checkpoint` and `update_checkpoint` apply the same immutability rule.

- [ ] **Step 5: Register the function**

Add:

```toml
[functions.course-class-question-plan]
verify_jwt = true
```

- [ ] **Step 6: Run the verifier**

Run: `node tools/verify-class-question-plans.mjs`

Expected: exit 0 and an explicit success message.

- [ ] **Step 7: Commit the API**

```bash
git add supabase/functions/course-class-question-plan/index.ts supabase/config.toml tools/verify-class-question-plans.mjs
git commit -m "feat: manage per-class question plans"
```

### Task 3: Permit selected plan candidates to become pulse rounds

**Files:**
- Modify: `mzareei.github.io/supabase/migrations/0034_class_question_plans.sql`
- Modify: `mzareei.github.io/supabase/functions/course-pulse/index.ts`
- Modify: `mzareei.github.io/tools/verify-class-question-plans.mjs`

**Interfaces:**
- Consumes: `plan_checkpoint_id` supplied by the frontend and Task 2 candidate links.
- Produces: `pulse_rounds.plan_checkpoint_id` and a validated manual-send path.

- [ ] **Step 1: Add failing pulse integration assertions**

Assert the migration adds nullable `plan_checkpoint_id` to `pulse_rounds`, and the pulse function has an explicit `loadPlanCandidate` branch. Assert the legacy call to `assertCheckpointPushMatches` stays guarded by `!planCheckpointId`.

- [ ] **Step 2: Run the verifier to prove it fails**

Run: `node tools/verify-class-question-plans.mjs`

Expected: failure because `plan_checkpoint_id` is not implemented.

- [ ] **Step 3: Add the round provenance column**

Add `plan_checkpoint_id uuid references public.class_question_plan_checkpoints(id) on delete restrict` plus an index. The `restrict` rule preserves an auditable link from a sent round to its class plan.

- [ ] **Step 4: Implement the manual plan-candidate branch**

In `pushRound`, reject payloads that mix `plan_checkpoint_id` and `checkpoint_after_slide`. When `plan_checkpoint_id` is supplied, load the plan checkpoint, confirm its plan belongs to the requested class session, confirm it is `planned`, and confirm the requested `question_id` is a candidate. Use the same bank-question snapshot code as the legacy path, write `plan_checkpoint_id` into `pulse_rounds`, then mark the plan checkpoint `sent` only after the round insert succeeds.

```ts
if (planCheckpointId) {
  const selected = await loadPlanCandidate(db, courseId, sessionId, planCheckpointId, questionId);
  bankQuestion = selected.bankQuestion;
} else if (bankQuestion) {
  assertCheckpointPushMatches({
    sessionState: session.state,
    sessionContentItemId: session.content_item_id,
    bankContentItemId: bankQuestion.bankContentItemId,
    questionCheckpoint: bankQuestion.checkpointAfterSlide,
    requestedCheckpoint
  });
}
```

- [ ] **Step 5: Verify the legacy path remains intact**

Run: `node tools/verify-live-checkpoint-security.mjs`

Expected: exit 0; legacy deck checkpoint authorization remains enforced.

- [ ] **Step 6: Run the plan verifier**

Run: `node tools/verify-class-question-plans.mjs`

Expected: exit 0.

- [ ] **Step 7: Commit the pulse integration**

```bash
git add supabase/migrations/0034_class_question_plans.sql supabase/functions/course-pulse/index.ts tools/verify-class-question-plans.mjs
git commit -m "feat: send selected class-plan questions"
```

### Task 4: Build the typed client and professor board

**Files:**
- Create: `course-platform/src/api/classQuestionPlans.ts`
- Create: `course-platform/src/components/ClassQuestionPlanBoard.tsx`
- Modify: `course-platform/src/api/pulse.ts`
- Modify: `course-platform/src/i18n/strings.ts`
- Create: `course-platform/tools/verify-class-question-plans.mjs`

**Interfaces:**
- Consumes: Task 2 plan API and Task 3 `pushPlanQuestion` contract.
- Produces: `<ClassQuestionPlanBoard classSessionId={...} isLive={...} />`.

- [ ] **Step 1: Write a failing frontend verifier**

Assert the API module exports `getClassQuestionPlan`, `createClassQuestionPlan`, `saveCheckpointCandidates`, and `pushPlanQuestion`; assert the board renders topic, optional slide hint, candidate selection, `Ask now`, and a disabled/historical representation for a sent checkpoint. Assert every board copy key appears in both language arrays.

- [ ] **Step 2: Run the frontend verifier to prove it fails**

Run: `node tools/verify-class-question-plans.mjs`

Expected: failure because the frontend module and component are absent.

- [ ] **Step 3: Add the typed API module**

Use `callFn` and the exact interfaces in this plan. `pushPlanQuestion` must call the existing `course-pulse` endpoint with `question_id` and `plan_checkpoint_id`, never `checkpoint_after_slide`.

- [ ] **Step 4: Implement the focused board component**

The component loads the session plan and active banks. If no plan exists, offer an instructor-only bank selector and **Create plan**. For each future card, render topic, optional “After slide N” hint, candidate question prompts, **Ask now**, and edit/remove controls. A sent card renders its topic and “Already asked” with no edit/remove controls. The screen can show a plan while the class is not live, but **Ask now** is disabled until live.

- [ ] **Step 5: Add bilingual copy**

Add only the keys used by the board, including `run.plan.title`, `run.plan.create`, `run.plan.askNow`, `run.plan.afterSlide`, `run.plan.alreadyAsked`, `run.plan.noPlan`, `run.plan.noCandidates`, and errors for invalid/mutated checkpoints. Add matching English and Spanish strings.

- [ ] **Step 6: Run frontend verification**

Run: `node tools/verify-class-question-plans.mjs`

Expected: exit 0.

- [ ] **Step 7: Commit the board**

```bash
git add src/api/classQuestionPlans.ts src/api/pulse.ts src/components/ClassQuestionPlanBoard.tsx src/i18n/strings.ts tools/verify-class-question-plans.mjs
git commit -m "feat: add class question plan board"
```

### Task 5: Integrate the board without replacing the deck controls

**Files:**
- Modify: `course-platform/src/screens/instructor/RunClass.tsx`
- Modify: `course-platform/tools/verify-class-question-plans.mjs`

**Interfaces:**
- Consumes: `ClassQuestionPlanBoard` from Task 4.
- Produces: a manual question path for any live class, including classes without a platform deck.

- [ ] **Step 1: Extend the verifier with coexistence assertions**

Assert `RunClass.tsx` imports and renders `ClassQuestionPlanBoard`, while still retaining `CheckpointPanel`, `pushBankQuestion`, and the bridge-driven `loadQuestion` path.

- [ ] **Step 2: Run the verifier to prove it fails**

Run: `node tools/verify-class-question-plans.mjs`

Expected: failure because the board is not mounted in Run Class.

- [ ] **Step 3: Mount the board below the existing checkpoint controls**

Pass `sessionId`, `isLive`, and a refresh callback. Do not alter `CheckpointPanel` state transitions, deck bridge messages, QR join card, end-of-class quiz, or the `content_item_id` requirement for the legacy deck path. The board remains useful even when `bank` is null.

- [ ] **Step 4: Run focused verification**

Run: `node tools/verify-class-question-plans.mjs`

Expected: exit 0.

- [ ] **Step 5: Run regression verification**

Run: `node tools/verify-live-checkpoint-security.mjs`

Expected: exit 0.

- [ ] **Step 6: Commit integration**

```bash
git add src/screens/instructor/RunClass.tsx tools/verify-class-question-plans.mjs
git commit -m "feat: show manual question plans in class"
```

### Task 6: Deploy and verify the first release end to end

**Files:**
- Modify: `mzareei.github.io/docs/05-status.md`

**Interfaces:**
- Consumes: completed Tasks 1–5.
- Produces: deployed Edge Functions and evidence that legacy and manual flows coexist.

- [ ] **Step 1: Run all local verifiers**

Run:

```bash
node tools/verify-class-question-plans.mjs
node tools/verify-live-checkpoint-security.mjs
```

Run each command in its owning repository. Expected: both exit 0.

- [ ] **Step 2: Deploy database migration and functions**

Apply migration `0034`, then deploy `course-class-question-plan` and `course-pulse` to project `ojmbupftdikwmlqvibwt`. Do not deploy unrelated functions.

- [ ] **Step 3: Deploy the frontend**

Publish the frontend using the existing project deployment route after a production build succeeds.

- [ ] **Step 4: Perform two live smoke tests**

1. Platform-deck class: verify a legacy authored checkpoint still stops, draws, sends, reveals, and continues normally.
2. External-deck class: create a plan, select a candidate, send it with **Ask now**, and confirm the corresponding card becomes historical.

- [ ] **Step 5: Record status and commit it**

Document deployed function names, migration number, verifier output, and the two smoke-test outcomes in `docs/05-status.md`.

```bash
git add docs/05-status.md
git commit -m "docs: record class question plan deployment"
```

## Deferred follow-up plans

After this release, write separate plans for:

1. **Quick question composer:** class-only polls/graded questions and post-class save-to-bank.
2. **Attendance and class results:** QR check-in, engagement, final-submission status, policy snapshots, calculated grades, and professor overrides.
3. **PDF planning and generation privacy:** structured teaching-plan input, plan proposal, and creator-scoped generation jobs/PDFs/previews.
