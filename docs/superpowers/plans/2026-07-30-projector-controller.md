# Projector and Controller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split Run Class into a private mobile controller and a synchronized read-only projector that cannot receive private instructor data.

**Architecture:** Add one presentation-state row per class and a role-gated edge function with distinct controller/projector response builders. Keep session, pulse, and quiz tables authoritative; presentation state carries only slide/phase revisions and last-seen metadata.

**Tech Stack:** Preact, TypeScript, deck `postMessage` bridge, Supabase Edge Functions/Deno, PostgreSQL, Cloudflare Pages.

## Global Constraints

- Projector privacy is enforced in server response shapes, not CSS.
- Both routes require instructor-capable authentication; only Controller writes.
- The deck always loads through `/content?t=...`.
- Revisions are monotonic and idempotent.
- Existing pulse recovery remains authoritative.
- All copy is English and Spanish.

---

### Task 1: Add presentation state

**Files:**
- Create: backend `supabase/migrations/0027_class_presentation_state.sql`
- Create: backend `tools/verify-projector-safety.mjs`

**Interfaces:**
- Produces: `class_presentation_state`
- Produces: one row per `class_session_id`

- [ ] **Step 1: Write the failing verifier**

Assert columns for revision, requested/acknowledged slide, phase, checkpoint,
and both last-seen timestamps; assert RLS/revokes and numeric checks.

- [ ] **Step 2: Run RED**

Run: `node tools/verify-projector-safety.mjs`

- [ ] **Step 3: Create migration**

```sql
create table public.class_presentation_state (
  class_session_id uuid primary key references public.class_sessions(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  requested_slide int not null default 1 check (requested_slide >= 1),
  acknowledged_slide int not null default 1 check (acknowledged_slide >= 1),
  phase text not null default 'lecture'
    check (phase in ('lecture','pulse','quiz','podium','reflection','closed')),
  checkpoint_key text,
  checkpoint_after_slide int check (checkpoint_after_slide is null or checkpoint_after_slide >= 1),
  projector_seen_at timestamptz,
  controller_seen_at timestamptz,
  updated_at timestamptz not null default now()
);
```

- [ ] **Step 4: Run GREEN and commit**

```bash
node tools/verify-projector-safety.mjs
git add supabase/migrations/0027_class_presentation_state.sql tools/verify-projector-safety.mjs
git commit -m "feat: add synchronized presentation state"
```

### Task 2: Implement the presentation edge function

**Files:**
- Create: backend `supabase/functions/course-presentation/index.ts`
- Modify: backend `tools/verify-projector-safety.mjs`

**Interfaces:**
- Produces actions: `controller_current`, `projector_current`,
  `request_slide`, `acknowledge_slide`, `checkpoint_reached`, `set_phase`,
  `heartbeat`

- [ ] **Step 1: Add failing response-shape assertions**

Require separate `controllerView()` and `projectorView()` builders. Reject these
keys in projector JSON: `is_correct`, `correct_option`, `student_name`,
`score`, `reflection`, `note`.

- [ ] **Step 2: Run RED**

Run: `node tools/verify-projector-safety.mjs`

- [ ] **Step 3: Implement authorization and revision writes**

All actions require teacher role; only instructor/platform owner may write.
`request_slide` atomically increments revision. `acknowledge_slide` accepts only
the current-or-newer requested revision and never changes the target.
`projector_current` returns:

```ts
{
  session_id: string;
  revision: number;
  requested_slide: number;
  phase: PresentationPhase;
  checkpoint: { key: string; after_slide: number } | null;
  pulse: { prompt: string; options: PublicOption[]; state: "open" | "revealed"; submitted: number; eligible: number } | null;
}
```

Correct option/explanation are appended only when pulse state is `revealed`.

- [ ] **Step 4: Bundle, verify, commit**

```bash
deno check supabase/functions/course-presentation/index.ts
node tools/verify-projector-safety.mjs
git add supabase/functions/course-presentation/index.ts tools/verify-projector-safety.mjs
git commit -m "feat: expose safe presentation synchronization"
```

### Task 3: Extend the deck bridge for remote navigation

**Files:**
- Modify: `src/features/deck/protocol.ts`
- Modify: `src/features/deck/useDeckBridge.ts`
- Modify: backend deck sources used by `course-generation` and `course-checkpoint-backfill`
- Modify: `tools/verify-deck-protocol.mjs`
- Modify: backend `tools/verify-checkpoint-decks.mjs`

**Interfaces:**
- Produces parent message: `{type:"course-platform:goto-slide", teachingSlide:number, revision:number}`
- Produces deck acknowledgement carrying teaching slide and revision

- [ ] **Step 1: Add failing protocol tests**

Require origin/source validation, positive integer slide/revision, duplicate
revision suppression, and acknowledgement after navigation.

- [ ] **Step 2: Run RED**

Run frontend and backend deck verifiers.

- [ ] **Step 3: Implement minimal protocol**

Expose `goToTeachingSlide(slide, revision)` from `useDeckBridge`. The deck maps
teaching-slide numbering to actual section indexes, navigates once, and emits
the existing position message plus `appliedRevision`.

- [ ] **Step 4: Run GREEN and commit in both repositories**

Run all deck verifiers, then commit backend deck engine and frontend bridge
separately with matching protocol comments.

### Task 4: Build presentation API and state reducer

**Files:**
- Create: `src/api/presentation.ts`
- Create: `src/features/presentation/state.ts`
- Create: `tools/verify-presentation-state.mjs`

**Interfaces:**
- Produces typed controller/projector calls
- Produces `shouldApplyRevision(current, incoming): boolean`
- Produces `projectorIsStale(seenAt, now, thresholdMs): boolean`

- [ ] **Step 1: Write failing pure-state tests**

Test stale revisions, equal retries, forward revisions, missing last-seen, and
the 10-second stale threshold.

- [ ] **Step 2: Run RED**

Run: `npm run verify`

- [ ] **Step 3: Implement the API and pure helpers**

All browser calls use `callFn("course-presentation", ...)`. Do not add table
queries or persist presentation state in local storage.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm run typecheck
npm run verify
git add src/api/presentation.ts src/features/presentation/state.ts tools/verify-presentation-state.mjs
git commit -m "feat: add presentation synchronization client"
```

### Task 5: Build the read-only projector route

**Files:**
- Create: `src/screens/instructor/Projector.tsx`
- Create: `src/features/presentation/ProjectorPulse.tsx`
- Modify: `src/App.tsx`
- Modify: `src/i18n/strings.ts`
- Modify: `src/styles/app.css`
- Modify: `tools/verify-app-shell.mjs`
- Modify: `tools/verify-projector-safety.mjs`

**Interfaces:**
- Consumes: `projector_current`, `InstructorDeck`, remote deck bridge
- Produces route `/teach/run/:sessionId/projector`

- [ ] **Step 1: Add failing route/privacy assertions**

Require no `InstructorNav`, no write buttons, no private result components, and
no Controller API call from the projector module.

- [ ] **Step 2: Run RED**

Run: `npm run verify`

- [ ] **Step 3: Implement Projector**

Poll safe state every 2 seconds, heartbeat every 5 seconds, apply newer slide
revisions, acknowledge them, and report checkpoints. Render prompt/options
without correctness until server state is revealed.

- [ ] **Step 4: Verify and commit**

```bash
npm run typecheck
npm run verify
npm run build
git add src/screens/instructor/Projector.tsx src/features/presentation/ProjectorPulse.tsx src/App.tsx src/i18n/strings.ts src/styles/app.css tools/verify-app-shell.mjs tools/verify-projector-safety.mjs
git commit -m "feat: add safe classroom projector"
```

### Task 6: Convert Run Class into the private controller

**Files:**
- Create: `src/features/presentation/ControllerNavigation.tsx`
- Modify: `src/screens/instructor/RunClass.tsx`
- Modify: `src/i18n/strings.ts`
- Modify: `src/styles/app.css`
- Modify: `tools/verify-app-shell.mjs`

**Interfaces:**
- Consumes: controller presentation API
- Produces remote slide controls, projector QR, connection indicator

- [ ] **Step 1: Add failing controller assertions**

Require Open projector view, controller QR, previous/next requests, stale
projector warning, and explicit Reveal to class.

- [ ] **Step 2: Run RED**

Run: `npm run verify`

- [ ] **Step 3: Implement Controller**

The controller requests slides rather than directly owning the projected
iframe. Retain a private preview only when no projector heartbeat exists.
Checkpoint actions continue through the existing pulse endpoints. Update phase
on quiz/reflection/end transitions.

- [ ] **Step 4: Verify and commit**

```bash
npm run typecheck
npm run verify
npm run build
git add src/features/presentation/ControllerNavigation.tsx src/screens/instructor/RunClass.tsx src/i18n/strings.ts src/styles/app.css tools/verify-app-shell.mjs
git commit -m "feat: control the projector privately"
```

### Task 7: Deploy and rehearse projector/controller

**Files:**
- Modify: `docs/04-decisions.md`
- Modify: `docs/05-status.md`
- Modify: `docs/06-runbook.md`
- Modify: `docs/07-pitfalls.md`

- [ ] **Step 1: Run all frontend/backend verification**

Run typecheck, all frontend verifiers, production build, Deno check, projector
safety verifier, and both deck verifiers.

- [ ] **Step 2: Apply migration 0027 and deploy**

Deploy `course-presentation` and both deck-producing functions. Push frontend
only after backend responses are live.

- [ ] **Step 3: Rehearse with three browser sessions**

Use controller at 390px, projector at 1440px, and student from Today. Verify
remote navigation, checkpoint send/reveal/close, reload recovery, offline
warning, and absence of correctness/names/scores/reflections/notes in projector
DOM and network JSON.

- [ ] **Step 4: Record evidence and commit**

Update the four docs with exact deployment ids and observed behavior, then
commit `docs: record projector controller rehearsal`.
