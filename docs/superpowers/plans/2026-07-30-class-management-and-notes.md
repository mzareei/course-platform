# Class Management and Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let instructors edit unstarted classes and groups, assign lectures from either management surface, release a lecture to the correct group when class ends, and keep private per-class student notes.

**Architecture:** Extend the existing session and section edge functions rather than adding competing management paths. Add one notes table/function and one atomic close-and-release RPC. Frontend entry points share the same APIs and refresh the existing auth context after writes.

**Tech Stack:** Preact, TypeScript, Vite, Supabase Edge Functions/Deno, PostgreSQL migrations, Node verifier scripts.

## Global Constraints

- Only `planned | open | continued` sessions with `actual_start_at is null` are editable.
- A session lecture must be a reviewable `lecture` from the same course.
- Ending class releases the lecture only to that session's group.
- Notes are instructor/platform-owner only and never enter student/projector responses.
- Every user-facing string is English and Spanish.
- The browser never queries tables directly.
- Update `docs/05-status.md` and `docs/07-pitfalls.md` with verified evidence.

---

### Task 1: Add persistence and atomic lifecycle functions

**Files:**
- Create: backend `supabase/migrations/0024_class_management_and_notes.sql`
- Create: backend `tools/verify-class-management.mjs`

**Interfaces:**
- Produces: `class_student_notes`
- Produces: `public.close_class_session_with_review(uuid,text,uuid,text)`

- [ ] **Step 1: Write the failing verifier**

Assert that migration 0024 creates an RLS-protected notes table, a unique
session-scoped Review release index, and an atomic close function that locks the
session and inserts or reopens a group-scoped `review_only` release.

```js
assert.match(sql, /create table[^;]+class_student_notes/is);
assert.match(sql, /needs_follow_up boolean not null default false/i);
assert.match(sql, /enable row level security/i);
assert.match(sql, /close_class_session_with_review/i);
assert.match(sql, /for update/i);
assert.match(sql, /section_id[\s\S]+review_only/i);
```

- [ ] **Step 2: Run the verifier and confirm RED**

Run: `node tools/verify-class-management.mjs`  
Expected: FAIL because migration 0024 does not exist.

- [ ] **Step 3: Create migration 0024**

Use this table contract:

```sql
create table public.class_student_notes (
  id uuid primary key default gen_random_uuid(),
  course_id text not null references public.courses(id) on delete cascade,
  class_session_id uuid not null references public.class_sessions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  author_profile_id uuid references public.profiles(id) on delete set null,
  note_text text not null check (length(note_text) between 1 and 4000),
  needs_follow_up boolean not null default false,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((resolved_at is null) = (resolved_by is null))
);
```

The atomic function must set `actual_end_at`, set state `closed`, create or
reopen a `review_only` release scoped by `section_id`, and write both audit and
release events in one transaction. Add RLS, revoke `anon/authenticated`, and
grant RPC execution only to `service_role`.

- [ ] **Step 4: Run the verifier and confirm GREEN**

Run: `node tools/verify-class-management.mjs`  
Expected: `verify-class-management: OK`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0024_class_management_and_notes.sql tools/verify-class-management.mjs
git commit -m "feat: add atomic class review release and notes"
```

### Task 2: Add session editing and atomic close to the backend

**Files:**
- Modify: backend `supabase/functions/course-session-management/index.ts`
- Modify: backend `tools/verify-class-management.mjs`

**Interfaces:**
- Consumes: `close_class_session_with_review`
- Produces: action `update_session`
- Produces: existing `update_session_state` closes through the atomic RPC

- [ ] **Step 1: Extend the verifier with the contract**

```js
assert.match(fn, /body\.action === "update_session"/);
assert.match(fn, /actual_start_at/);
assert.match(fn, /content_type[^;]+lecture/s);
assert.match(fn, /close_class_session_with_review/);
```

- [ ] **Step 2: Run and confirm RED**

Run: `node tools/verify-class-management.mjs`  
Expected: FAIL on missing `update_session`.

- [ ] **Step 3: Implement `update_session`**

Accept:

```ts
{
  action: "update_session";
  session_id: string;
  section_id: string;
  title: string;
  planned_date: string;
  content_item_id: string | null;
}
```

Load and lock the session, refuse started/non-editable rows, validate the group
and optional lecture belong to the course, update all four editable fields,
insert an audit row with `before` and `after`, then return the same normalized
session shape as `list_sessions`.

When `update_session_state` receives `next_state: "closed"`, call the atomic RPC
instead of issuing a plain update.

- [ ] **Step 4: Bundle and verify**

Run:

```bash
deno check supabase/functions/course-session-management/index.ts
node tools/verify-class-management.mjs
```

Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/course-session-management/index.ts tools/verify-class-management.mjs
git commit -m "feat: edit planned class sessions"
```

### Task 3: Add the instructor-only notes function

**Files:**
- Create: backend `supabase/functions/course-student-notes/index.ts`
- Modify: backend `tools/verify-class-management.mjs`

**Interfaces:**
- Produces: actions `list_session`, `list_student`, `create`, `resolve`
- Returns: `{ notes: ClassStudentNote[] }`

- [ ] **Step 1: Add failing authorization assertions**

Assert the function checks an active profile, limits roles to
`platform_owner | instructor`, verifies the student belongs to the session
group, and never exposes a student action.

- [ ] **Step 2: Run and confirm RED**

Run: `node tools/verify-class-management.mjs`  
Expected: FAIL because `course-student-notes` is missing.

- [ ] **Step 3: Implement the four actions**

Use this response shape:

```ts
type ClassStudentNote = {
  id: string;
  class_session_id: string;
  profile_id: string;
  student_name: string;
  session_title: string;
  planned_date: string;
  author_name: string | null;
  note_text: string;
  needs_follow_up: boolean;
  resolved_at: string | null;
  created_at: string;
};
```

`create` inserts without updating older notes. `resolve` may only set
`resolved_at/resolved_by`; it cannot rewrite `note_text`. Audit both writes.

- [ ] **Step 4: Bundle and verify**

Run:

```bash
deno check supabase/functions/course-student-notes/index.ts
node tools/verify-class-management.mjs
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/course-student-notes/index.ts tools/verify-class-management.mjs
git commit -m "feat: record private class student notes"
```

### Task 4: Build shared frontend management APIs

**Files:**
- Modify: `src/api/schedule.ts`
- Modify: `src/api/classes.ts`
- Create: `src/api/studentNotes.ts`
- Modify: `tools/verify-class-sessions.mjs`

**Interfaces:**
- Produces: `updateClass(input): Promise<{session: ClassSession}>`
- Produces: `listSessionNotes`, `listStudentNotes`, `createStudentNote`, `resolveStudentNote`

- [ ] **Step 1: Write failing verifier assertions**

Require `updateClass` to call `course-session-management` with
`action: "update_session"` and require all note calls to use
`course-student-notes`.

- [ ] **Step 2: Run and confirm RED**

Run: `npm run verify`  
Expected: class-session verifier fails.

- [ ] **Step 3: Implement typed API functions**

```ts
export type UpdateClassInput = {
  session_id: string;
  section_id: string;
  title: string;
  planned_date: string;
  content_item_id: string | null;
};
```

Keep `ClassSession` as the single network type. Do not duplicate it in a screen.

- [ ] **Step 4: Run and confirm GREEN**

Run: `npm run typecheck && npm run verify`

- [ ] **Step 5: Commit**

```bash
git add src/api/schedule.ts src/api/classes.ts src/api/studentNotes.ts tools/verify-class-sessions.mjs
git commit -m "feat: add class editing and notes APIs"
```

### Task 5: Add class and group editing interfaces

**Files:**
- Create: `src/components/SessionEditor.tsx`
- Create: `src/components/SectionEditor.tsx`
- Modify: `src/components/Schedule.tsx`
- Modify: `src/components/Sections.tsx`
- Modify: `src/screens/instructor/People.tsx`
- Modify: `src/i18n/strings.ts`
- Modify: `tools/verify-class-sessions.mjs`

**Interfaces:**
- Consumes: `updateClass`, `saveSection`
- Produces: reusable inline editors with `onSaved(): void`

- [ ] **Step 1: Add failing UI verifier assertions**

Require Edit only for unstarted sessions, lecture replacement, full-field group
save, and `/teach/people?group=<uuid>` for Manage members.

- [ ] **Step 2: Run and confirm RED**

Run: `npm run verify`

- [ ] **Step 3: Implement the editors**

`SessionEditor` initializes from the selected row and submits every editable
field. `SectionEditor` echoes code, name, meeting pattern, campus, and status.
After save, reload lists and call `refreshContext()`.

People reads the strict UUID `group` query parameter, filters enrollments, and
shows a clear “Viewing Group X” chip with a remove-filter action.

- [ ] **Step 4: Verify bilingual UI**

Run: `npm run typecheck && npm run verify`

- [ ] **Step 5: Commit**

```bash
git add src/components/SessionEditor.tsx src/components/SectionEditor.tsx src/components/Schedule.tsx src/components/Sections.tsx src/screens/instructor/People.tsx src/i18n/strings.ts tools/verify-class-sessions.mjs
git commit -m "feat: edit classes and groups"
```

### Task 6: Assign lectures from Content and clarify Review

**Files:**
- Modify: `src/components/ContentLibrary.tsx`
- Modify: `src/i18n/strings.ts`
- Modify: `tools/verify-content-semantics.mjs`

**Interfaces:**
- Consumes: `listSessions`, `updateClass`
- Produces: one assignment path shared with Classes

- [ ] **Step 1: Add failing semantic assertions**

Require the new copy “Make available now,” the Assign to a class control, only
unstarted sessions in its selector, and planned assignment/group Review labels.

- [ ] **Step 2: Run and confirm RED**

Run: `npm run verify`

- [ ] **Step 3: Implement the card workflow**

Load sessions alongside content/releases. On assignment, call `updateClass`
with the session's unchanged section/title/date and the card's lecture id.
Render effective Review scopes from release rows; do not infer access from the
assignment alone. Render **Remove from Review** beside each effective
group-scoped or whole-course release so the instructor chooses the exact scope
to close; never close every release because one scope was selected.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run verify && npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/components/ContentLibrary.tsx src/i18n/strings.ts tools/verify-content-semantics.mjs
git commit -m "feat: assign lectures from Content"
```

### Task 7: Add notes to per-class gradebook and student history

**Files:**
- Create: `src/components/StudentNoteComposer.tsx`
- Create: `src/components/StudentNoteHistory.tsx`
- Modify: `src/screens/instructor/Gradebook.tsx`
- Modify: `src/screens/instructor/People.tsx`
- Modify: `src/i18n/strings.ts`
- Create: `tools/verify-student-notes.mjs`

**Interfaces:**
- Consumes: note API from Task 4
- Produces: append/resolve UI without note rewriting

- [ ] **Step 1: Write the failing verifier**

Require per-class Notes actions, student-history loading, follow-up resolution,
and absence of note APIs from student screens.

- [ ] **Step 2: Run and confirm RED**

Run: `npm run verify`

- [ ] **Step 3: Implement composer and history**

The composer requires non-empty text and optionally checks Needs follow-up.
History displays author/time/session and a Resolve action only on open
follow-ups. People opens the same history for the selected profile.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run verify && npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/components/StudentNoteComposer.tsx src/components/StudentNoteHistory.tsx src/screens/instructor/Gradebook.tsx src/screens/instructor/People.tsx src/i18n/strings.ts tools/verify-student-notes.mjs
git commit -m "feat: review private notes by class and student"
```

### Task 8: Deploy and rehearse management

**Files:**
- Modify: `docs/04-decisions.md`
- Modify: `docs/05-status.md`
- Modify: `docs/06-runbook.md`
- Modify: `docs/07-pitfalls.md`

- [ ] **Step 1: Run complete local verification**

Frontend:

```bash
npm run typecheck
npm run verify
npm run build
```

Backend:

```bash
node tools/verify-class-management.mjs
deno check supabase/functions/course-session-management/index.ts
deno check supabase/functions/course-student-notes/index.ts
```

- [ ] **Step 2: Apply and deploy backend**

Apply migration 0024, then deploy `course-session-management` and
`course-student-notes`.

- [ ] **Step 3: Push frontend and inspect Cloudflare**

Push the verified frontend commit to `main`; wait for Cloudflare Pages status
`success` and record the deployment id.

- [ ] **Step 4: Rehearse through the UI**

Create a class without a lecture, attach/replace it, edit a group, start class,
confirm edit refusal, end class, verify group-only Review access, create/resolve
a note, and verify no student response contains notes.

- [ ] **Step 5: Document evidence and commit**

```bash
git add docs/04-decisions.md docs/05-status.md docs/06-runbook.md docs/07-pitfalls.md
git commit -m "docs: record class management production rehearsal"
```
