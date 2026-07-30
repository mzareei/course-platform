# Coherent Class Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make scheduling, lecture delivery, slide-aware pulse questions, the
live-only final quiz, reflection, and review one coherent class lifecycle.

**Architecture:** Class sessions become independent from content releases and
carry their selected lecture. Questions gain source-slide/checkpoint metadata.
The existing same-origin deck reports checkpoint navigation to a unified Run
Class cockpit through a validated `postMessage` protocol, while all graded
actions continue through the existing edge functions and polling loop.

**Tech Stack:** Preact 10, TypeScript 5.6, Vite 6, Supabase Edge Functions
(Deno), PostgreSQL migrations, private Supabase Storage, Cloudflare Pages
Functions, Node verifier scripts.

## Global Constraints

- Work in both repositories:
  - SPA: `/Users/mzareei/Documents/GitHub/course-platform`
  - Backend: `/Users/mzareei/Documents/GitHub/mzareei.github.io`
- Every user-facing string is English and Spanish in
  `src/i18n/strings.ts`.
- The browser never queries tables; edge functions remain the only data door.
- Never use `srcdoc` or `blob:` for a deck. Use `/content?t=<token>`.
- Questions are generated; the professor never writes one.
- The final quiz remains sequential at 20/30/45 seconds by difficulty.
- Polling remains the live transport.
- Existing public first-generation apps remain frozen.
- Test through Home, Classes, Today, QR join, and Review—not direct internal
  routes.
- Update `docs/05-status.md` and `docs/07-pitfalls.md` with each completed
  lifecycle increment.

## File Map

### SPA files created

- `src/api/contentVisibility.ts` — one pure classification for student-openable
  material.
- `src/api/classes.ts` — class-day, lecture-association, and start-session API.
- `src/api/join.ts` — resolve/join calls and join-route types.
- `src/api/checkpoints.ts` — bank coverage and checkpoint question calls.
- `src/features/auth/returnPath.ts` — safe same-origin authentication return.
- `src/features/deck/protocol.ts` — deck message schemas and guards.
- `src/features/deck/useDeckBridge.ts` — parent-window message lifecycle.
- `src/features/deck/InstructorDeck.tsx` — gated instructor iframe.
- `src/features/live/CheckpointPanel.tsx` — checkpoint state controls.
- `src/screens/instructor/Classes.tsx` — groups and class calendar.
- `src/screens/student/JoinClass.tsx` — QR landing and recovery.
- `src/components/QuestionBanks.tsx` — professor-only readiness/backfill.
- `tools/verify-content-semantics.mjs` — release-control regression checks.
- `tools/verify-class-sessions.mjs` — session/release separation checks.
- `tools/verify-deck-protocol.mjs` — message and checkpoint model checks.

### SPA files modified

- `src/api/types.ts`
- `src/api/schedule.ts`
- `src/api/session.ts`
- `src/api/content.ts`
- `src/api/pulse.ts`
- `src/auth/auth.ts`
- `src/state/session.ts`
- `src/app.tsx`
- `src/components/ContentLibrary.tsx`
- `src/components/Schedule.tsx`
- `src/components/Sections.tsx`
- `src/screens/SignIn.tsx`
- `src/screens/student/Today.tsx`
- `src/screens/student/Review.tsx`
- `src/screens/student/Live.tsx`
- `src/screens/instructor/Home.tsx`
- `src/screens/instructor/People.tsx`
- `src/screens/instructor/Content.tsx`
- `src/screens/instructor/RunClass.tsx`
- `src/screens/instructor/EndOfClass.tsx`
- `src/i18n/strings.ts`
- `src/styles/app.css`
- `package.json`

### Backend files created

- `supabase/migrations/0020_class_session_content.sql`
- `supabase/migrations/0021_slide_checkpoints.sql`
- `supabase/functions/course-session-join/index.ts`
- `supabase/functions/course-checkpoint-backfill/index.ts`
- `supabase/functions/_shared/checkpoints.ts`
- `supabase/functions/_shared/checkpoint-deck.ts`
- `tools/verify-checkpoint-decks.mjs`

### Backend files modified

- `supabase/config.toml`
- `supabase/functions/course-auth-context/index.ts`
- `supabase/functions/course-session-management/index.ts`
- `supabase/functions/course-content-access/index.ts`
- `supabase/functions/course-question-bank/index.ts`
- `supabase/functions/course-pulse/index.ts`
- `supabase/functions/course-generation/index.ts`
- `supabase/functions/course-generation-worker/index.ts`
- `supabase/functions/course-generation-worker/schemas.ts`
- `supabase/functions/course-generation-worker/deck.ts`
- `supabase/functions/_shared/templates/deck-skeleton.html`
- `supabase/functions/_shared/templates/deck-script.js`
- `supabase/functions/_shared/templates/deck-style.css`
- `supabase/functions/course-generation-worker/deck-assets.ts` (generated)

---

### Task 1: Make availability mean “students can actually open this”

**Files:**

- Create: `src/api/contentVisibility.ts`
- Create: `tools/verify-content-semantics.mjs`
- Modify: `src/api/content.ts`
- Modify: `src/components/ContentLibrary.tsx`
- Modify: `src/screens/student/Today.tsx`
- Modify: `src/screens/student/Review.tsx`
- Modify: `src/screens/instructor/Content.tsx`
- Modify: `src/i18n/strings.ts`
- Modify: `docs/05-status.md`

**Interfaces:**

- Produces:

```ts
export type StudentDelivery = "viewer" | "external" | "live_only" | "internal";
export function studentDelivery(item: {
  content_type: string;
  source_kind: string;
  source_ref?: string | null;
}): StudentDelivery;
export function canReleaseToReview(item: {
  content_type: string;
  source_kind: string;
  source_ref?: string | null;
}): boolean;
```

- Consumers: `ContentLibraryView`, `Today`, and `Review`.

- [ ] **Step 1: Write the failing semantic verifier**

Create `tools/verify-content-semantics.mjs`:

```js
import assert from "node:assert/strict";
import { canReleaseToReview, studentDelivery } from "../src/api/contentVisibility.ts";

assert.equal(studentDelivery({ content_type: "lecture", source_kind: "storage_object" }), "viewer");
assert.equal(studentDelivery({ content_type: "mission", source_kind: "storage_object" }), "viewer");
assert.equal(studentDelivery({ content_type: "resource", source_kind: "external_url" }), "external");
assert.equal(studentDelivery({ content_type: "activity", source_kind: "supabase_record" }), "live_only");
assert.equal(studentDelivery({ content_type: "quiz_bank", source_kind: "supabase_record" }), "live_only");
assert.equal(studentDelivery({ content_type: "internal", source_kind: "supabase_record" }), "internal");
assert.equal(canReleaseToReview({ content_type: "activity", source_kind: "supabase_record" }), false);
assert.equal(canReleaseToReview({ content_type: "lecture", source_kind: "storage_object" }), true);

console.log("verify-content-semantics: OK");
```

- [ ] **Step 2: Run the verifier and confirm the missing-module failure**

Run from `course-platform`:

```bash
node tools/verify-content-semantics.mjs
```

Expected: FAIL because `src/api/contentVisibility.ts` does not exist.

- [ ] **Step 3: Implement the pure classification**

Create `src/api/contentVisibility.ts`:

```ts
const REVIEW_TYPES = new Set(["lecture", "mission", "case_file", "resource"]);

export type StudentDelivery = "viewer" | "external" | "live_only" | "internal";

export function studentDelivery(item: {
  content_type: string;
  source_kind: string;
  source_ref?: string | null;
}): StudentDelivery {
  if (["activity", "quiz_bank"].includes(item.content_type) || item.source_kind === "supabase_record") {
    return ["activity", "quiz_bank"].includes(item.content_type) ? "live_only" : "internal";
  }
  if (item.source_kind === "storage_object" && REVIEW_TYPES.has(item.content_type)) return "viewer";
  if (item.source_kind === "external_url" && REVIEW_TYPES.has(item.content_type)) return "external";
  return "internal";
}

export function canReleaseToReview(item: {
  content_type: string;
  source_kind: string;
  source_ref?: string | null;
}) {
  return ["viewer", "external"].includes(studentDelivery(item));
}
```

- [ ] **Step 4: Apply the classification to every producer and consumer**

In `ContentLibrary.tsx`, filter `library.content_items` with
`canReleaseToReview(item)` before counts, filters, and cards. Delete the
component-local assumption that every content item can be released.

In `Today.tsx`, stop listing global content releases; Task 2 will make Today
session-driven. Until then, show only releases with `class_session_id`.

In `Review.tsx`, replace the legacy activity-specific filter with:

```ts
.filter((release) => canReleaseToReview(release))
```

In `Content.tsx`, add a `banks` tab placeholder that says question-bank
readiness is professor-only. Task 4 replaces it with `QuestionBanks`.

- [ ] **Step 5: Add bilingual copy**

Add paired strings for Materials, Question banks, “Questions are used only
during a live class,” and the corrected empty states. Remove copy promising
that “everything in this course” can be opened.

- [ ] **Step 6: Verify**

Run:

```bash
npm run typecheck
npm run verify
npm run build
```

Expected: semantic verifier and all existing verifiers pass; the build succeeds.

- [ ] **Step 7: Commit the frontend increment**

```bash
git add src/api/contentVisibility.ts src/api/content.ts \
  src/components/ContentLibrary.tsx src/screens/student/Today.tsx \
  src/screens/student/Review.tsx src/screens/instructor/Content.tsx \
  src/i18n/strings.ts tools/verify-content-semantics.mjs docs/05-status.md
git commit -m "fix: separate live questions from review content"
```

---

### Task 2: Make class sessions first-class and add the Classes screen

**Files:**

- Create: `supabase/migrations/0020_class_session_content.sql`
- Modify: `supabase/functions/course-auth-context/index.ts`
- Modify: `supabase/functions/course-session-management/index.ts`
- Create: `src/api/classes.ts`
- Create: `src/screens/instructor/Classes.tsx`
- Create: `tools/verify-class-sessions.mjs`
- Modify: `src/api/types.ts`
- Modify: `src/api/schedule.ts`
- Modify: `src/api/session.ts`
- Modify: `src/components/Schedule.tsx`
- Modify: `src/screens/instructor/People.tsx`
- Modify: `src/screens/instructor/Home.tsx`
- Modify: `src/screens/student/Today.tsx`
- Modify: `src/screens/student/Live.tsx`
- Modify: `src/app.tsx`
- Modify: `src/i18n/strings.ts`
- Modify: `src/styles/app.css`
- Modify: `docs/05-status.md`
- Modify: `docs/07-pitfalls.md`

**Interfaces:**

- Backend returns:

```ts
type StudentSession = {
  session_id: string;
  section_id: string;
  section_code: string;
  title: string;
  planned_date: string;
  state: string;
  join_code: string;
  content_item_id: string | null;
  content_slug: string | null;
  content_title: string | null;
};
```

- `CourseContext` gains `student_sessions: StudentSession[]`.
- `ClassSession` gains `join_code`, `content_item_id`, `content_slug`,
  `content_title`, `source_kind`, and `source_ref`.

- [ ] **Step 1: Extend the failing verifier**

Create `tools/verify-class-sessions.mjs` to read source files and assert:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const types = readFileSync("src/api/types.ts", "utf8");
const today = readFileSync("src/screens/student/Today.tsx", "utf8");
const live = readFileSync("src/screens/student/Live.tsx", "utf8");
const app = readFileSync("src/app.tsx", "utf8");

assert.match(types, /student_sessions\??:\s*StudentSession\[\]/);
assert.match(today, /ctx\.student_sessions/);
assert.doesNotMatch(today, /sessionIsLive = allReleases/);
assert.match(live, /ctx\?\.student_sessions/);
assert.match(app, /path="\/teach\/classes"/);
console.log("verify-class-sessions: OK");
```

Run `node tools/verify-class-sessions.mjs`; expect FAIL.

- [ ] **Step 2: Add the additive migration**

Create backend `supabase/migrations/0020_class_session_content.sql`:

```sql
alter table class_sessions
  add column if not exists content_item_id uuid
  references content_items(id) on delete set null;

create index if not exists class_sessions_content_item_idx
  on class_sessions(content_item_id);
```

- [ ] **Step 3: Return student sessions independently**

In `course-auth-context/index.ts`, add:

```ts
const studentSessions = isTeacherContext(memberships, sections)
  ? []
  : await loadStudentSessions(db, courseId, profile.id, sections);
```

Return `student_sessions: studentSessions` beside `releases`.

`loadStudentSessions` queries `class_sessions` by the student's active section
IDs, keeps `planned | open | live | paused | continued`, joins the optional
`content_item_id`, and returns the exact `StudentSession` shape above. Select
`join_code` directly from `class_sessions`; do not derive session state from a
release.

- [ ] **Step 4: Associate lectures when creating a class**

Change `create_session` to accept `content_item_id?: uuid`. Validate that it is
a `lecture` in the same course before insert. Include `join_code` in the create,
start, and list selects, and include these columns in `listSessions`:

```ts
content_item_id: session.content_item_id || null,
content_slug: item.slug || null,
content_title: item.title || null,
source_kind: item.source_kind || null,
source_ref: item.source_ref || null
```

Add `start_session`. It accepts `planned | open | continued`, writes `state:
"live"` and `actual_start_at` atomically, and records one
`session_state_changed` audit event. Return `{ session }`.

- [ ] **Step 5: Implement the frontend types and API**

Create `src/api/classes.ts` with:

```ts
export function startClassSession(sessionId: string) {
  return callFn<{ session: ClassSession }>("course-session-management", {
    action: "start_session",
    session_id: sessionId
  });
}

export function createClass(input: {
  section_id: string;
  title: string;
  planned_date: string;
  content_item_id?: string;
}) {
  return callFn<{ session: ClassSession; sessions: ClassSession[] }>(
    "course-session-management",
    { action: "create_session", ...input }
  );
}
```

Add exact `StudentSession` and expanded `ClassSession` types.

- [ ] **Step 6: Build Classes and simplify People**

Move `<Sections />` and `<Schedule />` from `People.tsx` into new
`Classes.tsx`. Extend `Schedule`'s add form with a lecture select sourced from
`contentLibrary().content_items.filter(canReleaseToReview)` and pass
`content_item_id` to `createClass`.

Add `/teach/classes` and **Classes** to `InstructorNav`.

Home's no-session state uses:

```tsx
<a class="btn primary" href="/teach/classes">{t("classes.schedule")}</a>
```

- [ ] **Step 7: Make Today and Live session-driven**

Today selects today's live session first, then the next planned session. It
renders no global release cards.

Live resolves `sessionId` from `ctx.student_sessions`, preferring
`live | paused`, then a joined session stored by Task 3. Remove both release
searches.

- [ ] **Step 8: Verify both repositories**

Backend:

```bash
npx supabase db push --include-all
npx supabase functions serve
```

Frontend:

```bash
npm run typecheck
npm run verify
npm run build
```

Use curl with a student token to confirm `student_sessions` exists even when
the session has no release. Use an instructor token to confirm `start_session`
returns `state: "live"`.

- [ ] **Step 9: Commit**

Backend:

```bash
git add supabase/migrations/0020_class_session_content.sql \
  supabase/functions/course-auth-context/index.ts \
  supabase/functions/course-session-management/index.ts
git commit -m "feat: make class sessions independent of releases"
```

Frontend:

```bash
git add src/api/classes.ts src/api/types.ts src/api/schedule.ts src/api/session.ts \
  src/screens/instructor/Classes.tsx src/screens/instructor/Home.tsx \
  src/screens/instructor/People.tsx src/screens/student/Today.tsx \
  src/screens/student/Live.tsx src/components/Schedule.tsx src/app.tsx \
  src/i18n/strings.ts src/styles/app.css tools/verify-class-sessions.mjs \
  docs/05-status.md docs/07-pitfalls.md
git commit -m "feat: add a first-class class calendar"
```

---

### Task 3: Add QR joining with authentication return

**Files:**

- Create: `supabase/functions/course-session-join/index.ts`
- Modify: `supabase/config.toml`
- Create: `src/api/join.ts`
- Create: `src/features/auth/returnPath.ts`
- Create: `src/screens/student/JoinClass.tsx`
- Modify: `src/auth/auth.ts`
- Modify: `src/screens/SignIn.tsx`
- Modify: `src/screens/instructor/RunClass.tsx`
- Modify: `src/state/session.ts`
- Modify: `src/app.tsx`
- Modify: `src/i18n/strings.ts`
- Modify: `package.json`
- Test: `tools/verify-class-sessions.mjs`

**Interfaces:**

```ts
export type JoinClassResult = {
  session_id: string;
  title: string;
  section_code: string;
  state: string;
  joined: true;
};

export function resolveJoinCode(joinCode: string): Promise<JoinClassResult>;
export function saveAuthReturnPath(path: string): void;
export function consumeAuthReturnPath(): string | null;
```

- [ ] **Step 1: Add failing return-path tests**

Extend `verify-class-sessions.mjs`:

```js
import {
  normalizeReturnPath
} from "../src/features/auth/returnPath.ts";

assert.equal(normalizeReturnPath("/join/K7P4"), "/join/K7P4");
assert.equal(normalizeReturnPath("https://evil.example/"), null);
assert.equal(normalizeReturnPath("//evil.example/"), null);
assert.equal(normalizeReturnPath("/teach"), null);
```

Run the verifier; expect missing-module failure.

- [ ] **Step 2: Implement safe return-path storage**

`normalizeReturnPath` accepts only `/join/<A-Z0-9 code>` and stores it under
`cp.auth-return`. `consumeAuthReturnPath` removes the key after reading so an old
join never hijacks a later sign-in.

- [ ] **Step 3: Implement the join edge function**

`course-session-join` accepts authenticated POST:

```json
{ "action": "join", "join_code": "K7P4" }
```

It:

1. loads the active profile for the JWT;
2. uppercases and validates a 4–12-character alphanumeric code;
3. selects `class_sessions` by `join_code`;
4. rejects `cancelled | closed`;
5. verifies an active student `section_enrollments` row for the session section;
6. returns the exact `JoinClassResult`.

It writes no enrollment and does not weaken roster authorization.

- [ ] **Step 4: Implement JoinClass and auth recovery**

If signed out, `JoinClass` stores the current `/join/<code>` route and renders
SignIn. After OTP/test sign-in, `finishSignIn()` consumes the route and assigns
`location.href`.

If signed in, call `resolveJoinCode`, store the returned `session_id` under
`cp.joined-session`, refresh context, and navigate to `/live`.

Add `/join/:joinCode` to both signed-out and student routers.

- [ ] **Step 5: Render a real QR**

Install:

```bash
npm install qrcode
npm install --save-dev @types/qrcode
```

Run Class builds the URL with:

```ts
const joinUrl = `${location.origin}/join/${session.join_code}`;
const qrDataUrl = await QRCode.toDataURL(joinUrl, {
  errorCorrectionLevel: "M",
  margin: 1,
  width: 240
});
```

Show the QR before and during the class. Never encode a question ID.

- [ ] **Step 6: Verify**

Test these browser cases from the QR URL:

- signed-in enrolled student → `/live`;
- signed-out student → SignIn → same join URL → `/live`;
- signed-in unenrolled account → access explanation;
- invalid code → invalid-code explanation;
- closed session → closed-class explanation.

Then run `npm run verify && npm run build`.

- [ ] **Step 7: Deploy and commit**

Backend:

```bash
npx supabase functions deploy course-session-join
git add supabase/functions/course-session-join/index.ts supabase/config.toml
git commit -m "feat: join class sessions by QR code"
```

Frontend:

```bash
git add package.json package-lock.json src/api/join.ts \
  src/features/auth/returnPath.ts src/screens/student/JoinClass.tsx \
  src/auth/auth.ts src/screens/SignIn.tsx src/screens/instructor/RunClass.tsx \
  src/state/session.ts src/app.tsx src/i18n/strings.ts \
  tools/verify-class-sessions.mjs
git commit -m "feat: add QR class joining"
```

---

### Task 4: Add slide/checkpoint metadata to generated banks

**Files:**

- Create: `supabase/migrations/0021_slide_checkpoints.sql`
- Create: `supabase/functions/_shared/checkpoints.ts`
- Modify: `supabase/functions/course-generation-worker/schemas.ts`
- Modify: `supabase/functions/course-generation-worker/index.ts`
- Modify: `supabase/functions/course-generation-worker/deck.ts`
- Modify: `supabase/functions/course-question-bank/index.ts`
- Modify: `supabase/functions/course-generation/index.ts`
- Create: `src/api/checkpoints.ts`
- Create: `src/components/QuestionBanks.tsx`
- Create: `tools/verify-deck-protocol.mjs`
- Modify: `src/screens/instructor/Content.tsx`
- Modify: `src/i18n/strings.ts`

**Interfaces:**

```ts
export type CheckpointQuestion = {
  question_id: string;
  generation_key: string;
  difficulty: "easy" | "medium" | "hard";
  segment_key: string;
  source_slide_numbers: number[];
  source_slide_start: number;
  source_slide_end: number;
  checkpoint_after_slide: number;
  prompt: string;
  prompt_es: string | null;
  explanation: string | null;
  explanation_es: string | null;
  options: Array<{
    key: string;
    text: string;
    text_es: string | null;
    is_correct: boolean;
  }>;
};
```

- [ ] **Step 1: Add checkpoint invariants to the verifier**

Create `src/features/deck/protocol.ts` initially with exported types only, then
write `tools/verify-deck-protocol.mjs`:

```js
import assert from "node:assert/strict";
import {
  validateCheckpointQuestion
} from "../src/features/deck/protocol.ts";

const valid = {
  segment_key: "cia-triad",
  source_slide_numbers: [12, 13, 14, 15],
  source_slide_start: 12,
  source_slide_end: 15,
  checkpoint_after_slide: 15
};
assert.deepEqual(validateCheckpointQuestion(valid), []);
assert.match(
  validateCheckpointQuestion({ ...valid, source_slide_end: 16 })[0],
  /after its checkpoint/
);
assert.match(
  validateCheckpointQuestion({ ...valid, source_slide_numbers: [] })[0],
  /source slide/
);
console.log("verify-deck-protocol: OK");
```

Run it and confirm failure until validation exists.

- [ ] **Step 2: Create migration 0021**

Create `supabase/migrations/0021_slide_checkpoints.sql`:

```sql
alter table questions
  add column if not exists segment_key text,
  add column if not exists source_slide_numbers integer[] not null default '{}',
  add column if not exists source_slide_start integer,
  add column if not exists source_slide_end integer,
  add column if not exists checkpoint_after_slide integer;

alter table questions
  add constraint questions_slide_range_check
  check (
    (source_slide_start is null and source_slide_end is null and checkpoint_after_slide is null)
    or (
      source_slide_start >= 1
      and source_slide_end >= source_slide_start
      and checkpoint_after_slide >= source_slide_end
    )
  );

create index if not exists questions_checkpoint_idx
  on questions(question_bank_id, checkpoint_after_slide)
  where checkpoint_after_slide is not null and status = 'active';
```

This partial index is for lookup only, never an `ON CONFLICT` target.

- [ ] **Step 3: Extend model schemas**

Add `slide_number` to every generated slide and require it to be sequential.
Add these required question properties to `QUESTIONS_SCHEMA`:

```ts
segment_key: { type: "string" },
source_slide_numbers: { type: "array", items: { type: "integer" } },
source_slide_start: { type: "integer" },
source_slide_end: { type: "integer" },
checkpoint_after_slide: { type: "integer" }
```

Change the question prompt to receive the finalized slide JSON and require:

- exactly 18 questions;
- exactly 6 per difficulty;
- 3–5 concept checkpoints for a normal 18–50-slide lecture;
- at least 2 candidates per checkpoint;
- every cited slide at or before the checkpoint;
- no facts outside the cited slides.

- [ ] **Step 4: Centralize backend validation**

In `_shared/checkpoints.ts`, export:

```ts
export type CheckpointMetadata = {
  segmentKey: string;
  sourceSlideNumbers: number[];
  sourceSlideStart: number;
  sourceSlideEnd: number;
  checkpointAfterSlide: number;
};

export function validateCheckpointMetadata(
  value: CheckpointMetadata,
  teachingSlideCount: number
): string[];

export function checkpointCoverage(
  rows: Array<CheckpointMetadata & { difficulty: string }>
): Array<{
  segment_key: string;
  checkpoint_after_slide: number;
  candidate_count: number;
  difficulties: string[];
}>;
```

Use it in generation validation and `course-question-bank import_bank`.

- [ ] **Step 5: Persist and return metadata**

Update both question insert paths—the worker's direct insert and
`course-question-bank import_bank`—to write all five metadata fields.

Update `list_banks` to select them and return `checkpoint_coverage`.

Update `draw_question` to accept `checkpoint_after_slide` and require an exact
match when supplied. Return all metadata in `question`.

Update `review_bundle` so the Content review screen shows source slide range and
checkpoint.

- [ ] **Step 6: Build QuestionBanks**

`QuestionBanks.tsx` calls `listBanks()` and renders:

- total and 6/6/6 difficulty balance;
- checkpoint count;
- candidate count per checkpoint;
- invalid/missing checkpoint warning;
- **Prepare checkpoints** only for legacy banks without metadata (Task 6 wires
  the action).

No release action appears.

- [ ] **Step 7: Apply the migration and verify generated output**

Backend:

```bash
npx supabase db push --include-all
npx supabase functions deploy course-generation-worker
npx supabase functions deploy course-generation
npx supabase functions deploy course-question-bank
```

Generate one test lecture. Confirm 18 questions, 6/6/6 difficulty, 3–5
checkpoints, at least two candidates each, and no question with
`source_slide_end > checkpoint_after_slide`.

Frontend:

```bash
npm run verify
npm run build
```

- [ ] **Step 8: Commit**

Backend:

```bash
git add supabase/migrations/0021_slide_checkpoints.sql \
  supabase/functions/_shared/checkpoints.ts \
  supabase/functions/course-generation-worker/schemas.ts \
  supabase/functions/course-generation-worker/index.ts \
  supabase/functions/course-generation-worker/deck.ts \
  supabase/functions/course-question-bank/index.ts \
  supabase/functions/course-generation/index.ts
git commit -m "feat: map generated questions to slide checkpoints"
```

Frontend:

```bash
git add src/api/checkpoints.ts src/components/QuestionBanks.tsx \
  src/features/deck/protocol.ts src/screens/instructor/Content.tsx \
  src/i18n/strings.ts tools/verify-deck-protocol.mjs
git commit -m "feat: show question bank checkpoint readiness"
```

---

### Task 5: Insert checkpoint slides and implement the deck bridge

**Files:**

- Create: `supabase/functions/_shared/checkpoint-deck.ts`
- Modify: `supabase/functions/course-generation-worker/deck.ts`
- Modify: `supabase/functions/_shared/templates/deck-skeleton.html`
- Modify: `supabase/functions/_shared/templates/deck-script.js`
- Modify: `supabase/functions/_shared/templates/deck-style.css`
- Modify: `supabase/functions/course-generation-worker/deck-assets.ts`
- Modify: `src/features/deck/protocol.ts`
- Create: `src/features/deck/useDeckBridge.ts`
- Test: `tools/verify-deck-protocol.mjs`
- Test: `tools/verify-gated-content.mjs`

**Interfaces:**

```ts
export const DECK_PROTOCOL_VERSION = 1;

export type DeckToParentMessage =
  | { version: 1; type: "deck.ready"; slide: number }
  | { version: 1; type: "deck.slide_changed"; slide: number; teaching_slide: number | null }
  | { version: 1; type: "deck.checkpoint_entered"; checkpoint_key: string; after_slide: number }
  | { version: 1; type: "deck.checkpoint_skipped"; checkpoint_key: string }
  | { version: 1; type: "deck.checkpoint_action"; checkpoint_key: string };

export type ParentToDeckMessage =
  | { version: 1; type: "checkpoint.question_ready"; checkpoint_key: string }
  | { version: 1; type: "checkpoint.question_sent"; checkpoint_key: string }
  | { version: 1; type: "checkpoint.answer_revealed"; checkpoint_key: string }
  | { version: 1; type: "checkpoint.resume"; checkpoint_key: string };
```

- [ ] **Step 1: Extend the failing protocol verifier**

Assert exact-origin rejection, version rejection, required checkpoint fields,
and that `deck-script.js` contains `parent.postMessage` but no legacy course
URLs.

- [ ] **Step 2: Render checkpoint sections deterministically**

`assembleDeck` receives:

```ts
{
  title: string;
  slides: Slide[];
  checkpoints: Array<{
    key: string;
    after_slide: number;
    segment_key: string;
    source_slide_start: number;
    source_slide_end: number;
  }>;
}
```

After each matching teaching slide, insert:

```html
<section class="slide checkpoint-slide"
  data-checkpoint-key="cia-triad"
  data-after-slide="15"
  data-source-start="12"
  data-source-end="15">
  <div class="slide-inner checkpoint-inner">
    <span class="kicker">Quick check</span>
    <h1>Question ready</h1>
    <div class="checkpoint-slot" aria-live="polite"></div>
  </div>
</section>
```

Use bilingual `data-es` attributes for built-in checkpoint copy.

- [ ] **Step 3: Add the message bridge at `show()`**

In `deck-script.js`, immediately after `updateChrome()`:

```js
notifyParent({
  type: "deck.slide_changed",
  slide: current + 1,
  teaching_slide: Number(s.getAttribute("data-teaching-slide")) || null
});
var checkpointKey = s.getAttribute("data-checkpoint-key");
if (checkpointKey) {
  notifyParent({
    type: "deck.checkpoint_entered",
    checkpoint_key: checkpointKey,
    after_slide: Number(s.getAttribute("data-after-slide"))
  });
}
```

`notifyParent` posts only to `location.origin`. The deck listens for
parent-to-deck messages only when `event.origin === location.origin`,
`event.source === parent`, and `version === 1`.

At a checkpoint, Right Arrow emits `deck.checkpoint_skipped` before navigating.
Space emits the generic `deck.checkpoint_action` intent and does not advance.
The parent remains authoritative and decides whether that intent means Send or
Reveal from its current checkpoint state. Ordinary slides keep current keyboard
behavior.

- [ ] **Step 4: Add parent validation and hook**

`isDeckMessage(value, origin)` rejects wrong versions, origins, types, missing
keys, non-integer slides, and additional executable values.

`useDeckBridge(iframeRef)` owns one `message` listener and returns:

```ts
{
  deckReady: boolean;
  slide: number | null;
  teachingSlide: number | null;
  checkpoint: { key: string; afterSlide: number } | null;
  checkpointAction: { key: string; sequence: number } | null;
  send(message: ParentToDeckMessage): void;
  bridgeError: string | null;
}
```

- [ ] **Step 5: Rebuild embedded assets**

From backend:

```bash
node tools/build-deck-assets.mjs
```

Confirm `deck-assets.ts` changes and the source templates remain the editable
source of truth.

- [ ] **Step 6: Verify**

Run backend deck generation, open preview through `/content?t=…`, use arrows to
reach a checkpoint, and capture `deck.checkpoint_entered` in a parent harness.
Confirm ordinary slides, overview, fullscreen, language, theme, and fragments
still work.

Run frontend:

```bash
npm run verify
npm run build
```

- [ ] **Step 7: Commit**

Backend:

```bash
git add supabase/functions/_shared/checkpoint-deck.ts \
  supabase/functions/course-generation-worker/deck.ts \
  supabase/functions/_shared/templates/deck-skeleton.html \
  supabase/functions/_shared/templates/deck-script.js \
  supabase/functions/_shared/templates/deck-style.css \
  supabase/functions/course-generation-worker/deck-assets.ts
git commit -m "feat: embed slide checkpoints in generated decks"
```

Frontend:

```bash
git add src/features/deck/protocol.ts src/features/deck/useDeckBridge.ts \
  tools/verify-deck-protocol.mjs tools/verify-gated-content.mjs
git commit -m "feat: add a validated deck checkpoint bridge"
```

---

### Task 6: Prepare existing private decks and banks

**Files:**

- Create: `supabase/functions/course-checkpoint-backfill/index.ts`
- Modify: `supabase/config.toml`
- Modify: `supabase/functions/_shared/checkpoint-deck.ts`
- Create: `tools/verify-checkpoint-decks.mjs`
- Modify: `src/api/checkpoints.ts`
- Modify: `src/components/QuestionBanks.tsx`
- Modify: `src/i18n/strings.ts`
- Test: backend `tools/verify-checkpoint-decks.mjs`
- Modify: `docs/05-status.md`
- Modify: `docs/07-pitfalls.md`

**Interfaces:**

```ts
type BackfillResult = {
  content_item_id: string;
  question_bank_id: string;
  storage_path: string;
  teaching_slide_count: number;
  checkpoint_count: number;
  mapped_question_count: number;
};

export function prepareLegacyCheckpoints(contentItemId: string):
  Promise<BackfillResult>;
```

- [ ] **Step 1: Add a legacy-deck fixture test**

Create backend `tools/verify-checkpoint-decks.mjs` with an HTML fixture containing four
`<section class="slide">` elements and four obsolete anchors. Assert the pure
transformer:

- preserves four teaching slides;
- removes the four legacy destinations;
- inserts one checkpoint after slide 3;
- uses a function replacement, never a raw replacement string.

- [ ] **Step 2: Implement deterministic HTML transformation**

`_shared/checkpoint-deck.ts` exports:

```ts
export function extractTeachingSlides(html: string): Array<{
  number: number;
  text: string;
}>;

export function injectCheckpointSections(
  html: string,
  checkpoints: Array<{ key: string; afterSlide: number; sourceStart: number; sourceEnd: number }>
): string;

export function removeLegacyDeckNavigation(html: string): string;
```

`removeLegacyDeckNavigation` removes the old Home/Mission/Quiz/Exit anchors,
leaving language, theme, overview, help, fullscreen, and slide controls.

- [ ] **Step 3: Implement the authenticated backfill function**

`course-checkpoint-backfill { action: "prepare", content_item_id }`:

1. requires instructor role;
2. loads a `storage_object` lecture and its active bank;
3. downloads private HTML;
4. extracts ordered slide text;
5. loads the 18 existing questions and options;
6. makes one Claude tool call that maps each question to source slides and
   selects 3–5 checkpoint boundaries, without rewriting prompt/options;
7. validates at least two candidates per checkpoint;
8. updates only metadata columns on `questions`;
9. removes legacy navigation, injects checkpoints and current deck assets;
10. uploads to the same private storage path only after all validation passes;
11. returns `BackfillResult`.

The function imports `DECK_SCRIPT` and `DECK_STYLE` from
`../course-generation-worker/deck-assets.ts` and passes them into the pure
transformer; it does not keep a third copy of the deck engine.

Because the storage write is last, a failed model mapping leaves the working
deck untouched.

- [ ] **Step 4: Wire the Content action**

QuestionBanks shows **Prepare checkpoints** only when
`checkpoint_coverage.length === 0`. The resulting success card states the
number of checkpoints and mapped questions. Errors render inside that bank
card.

- [ ] **Step 5: Deploy and backfill one pilot**

```bash
npx supabase functions deploy course-checkpoint-backfill
```

Run Week 1 Lecture 1 first. Verify 45 teaching slides remain, checkpoint count
is 3–5, old links are absent, and arrows still navigate.

- [ ] **Step 6: Backfill the remaining lecture banks**

Use the Content UI one lecture at a time. Do not batch blindly. After each,
preview the deck, verify total teaching-slide count, and check question coverage.

- [ ] **Step 7: Commit**

Backend:

```bash
git add supabase/functions/course-checkpoint-backfill/index.ts \
  supabase/functions/_shared/checkpoint-deck.ts supabase/config.toml \
  tools/verify-checkpoint-decks.mjs
git commit -m "feat: prepare existing decks for live checkpoints"
```

Frontend:

```bash
git add src/api/checkpoints.ts src/components/QuestionBanks.tsx \
  src/i18n/strings.ts docs/05-status.md docs/07-pitfalls.md
git commit -m "feat: prepare legacy question banks from Content"
```

---

### Task 7: Build the unified Run Class cockpit

**Files:**

- Modify: `supabase/functions/course-content-access/index.ts`
- Modify: `supabase/functions/course-pulse/index.ts`
- Create: `src/features/deck/InstructorDeck.tsx`
- Create: `src/features/live/CheckpointPanel.tsx`
- Modify: `src/api/content.ts`
- Modify: `src/api/pulse.ts`
- Modify: `src/screens/instructor/RunClass.tsx`
- Modify: `src/screens/instructor/EndOfClass.tsx`
- Modify: `src/screens/student/Live.tsx`
- Modify: `src/i18n/strings.ts`
- Modify: `src/styles/app.css`
- Test: `tools/verify-app-shell.mjs`
- Test: `tools/verify-deck-protocol.mjs`

**Interfaces:**

```ts
export function requestInstructorContent(contentItemId: string): Promise<{
  token: string;
  expires_in: number;
  content: { id: string; title: string; slug: string };
}>;

export function drawCheckpointQuestion(input: {
  content_slug: string;
  checkpoint_after_slide: number;
  exclude_keys?: string[];
}): Promise<{ question: CheckpointQuestion; remaining: number }>;

export function pushBankQuestion(input: {
  class_session_id: string;
  question_id: string;
  checkpoint_after_slide: number;
  time_limit_seconds?: number;
  points?: number;
}): Promise<{ round: PulseRound }>;
```

- [ ] **Step 1: Add failing cockpit invariants**

Extend `verify-app-shell.mjs`:

```js
assert.match(runClassSource, /<InstructorDeck/);
assert.match(runClassSource, /<CheckpointPanel/);
assert.doesNotMatch(runClassSource, /<option value="hard">[^]*<option value="hard">/);
assert.match(runClassSource, /startClassSession/);
```

Extend protocol tests to assert that a checkpoint cannot push a question whose
`checkpoint_after_slide` differs.

- [ ] **Step 2: Add instructor-only deck access**

`course-content-access { action: "request_instructor_url", content_item_id }`
requires teacher role in the item's course, loads its private `storage_object`,
and mints the same short-lived content token used by the existing proxy.

It does not create a release or weaken student access.

- [ ] **Step 3: Enforce checkpoint identity in pulse push**

When `question_id` and `checkpoint_after_slide` are supplied, `course-pulse`
loads the question's bank, content item, and checkpoint metadata. Reject unless:

- session `content_item_id` matches the bank's content item;
- question `checkpoint_after_slide` equals the requested checkpoint;
- session is live.

Continue snapshotting prompt/options into `pulse_rounds`.

- [ ] **Step 4: Build InstructorDeck**

Reuse token refresh behavior from `Viewer`, but call instructor content access
by `content_item_id`. Render:

```tsx
<iframe
  ref={frameRef}
  class="run-deck-frame"
  src={`/content?t=${encodeURIComponent(token)}`}
  title={title}
  allow="fullscreen"
  sandbox="allow-scripts allow-same-origin"
/>
```

Do not add `allow-popups`; obsolete navigation has been removed.

- [ ] **Step 5: Build CheckpointPanel state transitions**

The panel states are:

```ts
type CheckpointUiState =
  | { type: "idle"; nextCheckpoint?: number }
  | { type: "loading"; checkpoint: number }
  | { type: "ready"; question: CheckpointQuestion }
  | { type: "open"; round: PulseRound; results: PulseResults | null }
  | { type: "revealed"; round: PulseRound; results: PulseResults }
  | { type: "error"; checkpoint: number; message: string };
```

At `deck.checkpoint_entered`, draw the exact checkpoint question. Send uses
`question_id`, not a client-authored snapshot. Reveal and close reuse existing
pulse actions. Skip sends `checkpoint.resume`.

If the bridge fails, expose a manual checkpoint select populated from bank
coverage.

- [ ] **Step 6: Restructure RunClass**

Before live: deck preview + QR + **Start class**.

Live: two-column cockpit with deck and panel. Keep EndOfClass collapsed until
the final teaching slide/checkpoint or an explicit **End-of-class quiz** action.

Remove the duplicated Hard option. Remove the “Which class are you teaching?”
bank selector because the scheduled session already supplies the lecture.

Keyboard handling:

- ordinary arrows remain inside the iframe;
- checkpoint Space arrives as `deck.checkpoint_action`; the parent sends or
  reveals according to its authoritative `CheckpointUiState`;
- checkpoint Right Arrow skips or resumes;
- Escape never ends a class.

- [ ] **Step 7: Verify the live loop**

In signed-in instructor Chrome and separate student browser:

1. Start planned session.
2. Student sees Join class without any session-bound release.
3. Advance deck to checkpoint.
4. Send by Space.
5. Student receives and answers.
6. Instructor sees count, reveals, continues.
7. Skip next checkpoint.
8. Start final quiz.
9. Close quiz and submit reflection.

Confirm console is clean and loaded bundle hash matches the deployed build.

- [ ] **Step 8: Deploy and commit**

Backend:

```bash
npx supabase functions deploy course-content-access
npx supabase functions deploy course-pulse
git add supabase/functions/course-content-access/index.ts \
  supabase/functions/course-pulse/index.ts
git commit -m "feat: authorize slide-aware live questions"
```

Frontend:

```bash
git add src/features/deck/InstructorDeck.tsx \
  src/features/live/CheckpointPanel.tsx src/api/content.ts src/api/pulse.ts \
  src/screens/instructor/RunClass.tsx src/screens/instructor/EndOfClass.tsx \
  src/screens/student/Live.tsx src/i18n/strings.ts src/styles/app.css \
  tools/verify-app-shell.mjs tools/verify-deck-protocol.mjs
git commit -m "feat: run the full class beside the lecture deck"
```

---

### Task 8: Make student preview faithful and complete lifecycle verification

**Files:**

- Modify: `src/app.tsx`
- Create: `src/components/StudentShell.tsx`
- Modify: `src/screens/instructor/Home.tsx`
- Modify: `src/screens/student/Today.tsx`
- Modify: `src/screens/student/Review.tsx`
- Modify: `src/screens/student/Grades.tsx`
- Modify: `src/i18n/strings.ts`
- Modify: `src/styles/app.css`
- Modify: `tools/verify-app-shell.mjs`
- Modify: `docs/01-project-overview.md`
- Modify: `docs/04-decisions.md`
- Modify: `docs/05-status.md`
- Modify: `docs/06-runbook.md`
- Modify: `docs/07-pitfalls.md`

**Interfaces:**

```tsx
export function StudentShell(props: {
  preview: boolean;
  children: ComponentChildren;
}): JSX.Element;
```

- [ ] **Step 1: Add failing shell assertions**

Assert in `verify-app-shell.mjs` that:

- student routes and `/student/*` preview routes both render `StudentShell`;
- preview has `/student`, `/student/review`, and `/student/grades`;
- `InstructorNav` is absent from the preview shell;
- Exit student preview links to `/teach`.

- [ ] **Step 2: Extract StudentShell**

Move bottom navigation into `StudentShell`. Prefix preview links with
`/student`; normal student links remain `/`, `/review`, `/grades`.

Add preview routes:

```tsx
<Route path="/student" component={StudentTodayPreview} />
<Route path="/student/review" component={StudentReviewPreview} />
<Route path="/student/grades" component={StudentGradesPreview} />
```

Each wrapper renders the same screen component used by a real student.

- [ ] **Step 3: Perform the full empty-state browser rehearsal**

Use the runbook flow, beginning with no future session:

1. Instructor Home → Schedule a class.
2. Classes → create group if needed → create class with Week 1 lecture.
3. Home → Run class → Start class.
4. Scan QR in a separate student browser.
5. Complete two checkpoints and skip one.
6. Complete final quiz and reflection.
7. End class.
8. Gradebook → Per class shows pulse distributions, quiz, reflection.
9. View as student shows real Today/Review/Grades navigation.
10. Review shows Week 1 lecture and never shows Week 1 Quiz.

Test phone widths 375×812 and 430×932, plus the instructor projector width
1440×900.

- [ ] **Step 4: Run all automated checks**

Frontend:

```bash
npm run typecheck
npm run verify
npm run build
```

Backend:

```bash
npx supabase db push --include-all
npx supabase functions deploy course-auth-context
npx supabase functions deploy course-session-management
npx supabase functions deploy course-session-join
npx supabase functions deploy course-question-bank
npx supabase functions deploy course-generation
npx supabase functions deploy course-generation-worker
npx supabase functions deploy course-checkpoint-backfill
npx supabase functions deploy course-content-access
npx supabase functions deploy course-pulse
```

Confirm each deployed endpoint rejects a student token for instructor-only
actions.

- [ ] **Step 5: Update handoff documentation with evidence**

Record exact browser steps, the test class/session, student devices, deck slide
count, checkpoints asked/skipped, quiz result, reflection result, deploy hash,
and anything newly learned in status/pitfalls/runbook.

Do not mark the real-phone dress rehearsal complete unless real students on
their own phones participated.

- [ ] **Step 6: Commit**

```bash
git add src/components/StudentShell.tsx src/app.tsx \
  src/screens/instructor/Home.tsx src/screens/student/Today.tsx \
  src/screens/student/Review.tsx src/screens/student/Grades.tsx \
  src/i18n/strings.ts src/styles/app.css tools/verify-app-shell.mjs \
  docs/01-project-overview.md docs/04-decisions.md docs/05-status.md \
  docs/06-runbook.md docs/07-pitfalls.md
git commit -m "feat: complete the coherent class lifecycle"
```

---

## Final Acceptance

The plan is complete only when all of these are demonstrated through real entry
points:

- A quiz or question bank cannot be made available as standalone content.
- Home teaches the professor how to schedule the first class.
- A scheduled class independently appears to its enrolled students.
- The QR survives first-time authentication and returns to the class.
- Checkpoint questions cite only already-presented slides.
- The professor sends/reveals/continues without leaving the deck.
- The final quiz covers the full lecture and reflection follows automatically.
- View as student is the actual student shell.
- Review contains only openable released materials.
- All verifiers, typecheck, and production build pass.
