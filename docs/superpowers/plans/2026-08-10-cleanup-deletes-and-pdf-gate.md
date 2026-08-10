# Cleanup Deletes and PDF-Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the "Generate from a PDF" entry point, and add real (hard) delete actions for class sessions, question banks, and content items — currently missing at every layer — for clearing accumulated test/QA data, while refusing (with a clear message) whenever the schema's own constraints show real recorded activity.

**Architecture:** One frontend-only change (remove a tab link). Three delete features, each split into a backend task (new SQL/edge-function action) and a frontend task (new API export + UI + i18n) — session and bank deletes need a new atomic SQL RPC to pre-clear a blocking `class_question_plans` row before the real delete; content-item delete does not, since nothing has a plain "no action" FK against `content_items`.

**Tech Stack:** Vite + TypeScript + Preact (frontend, `course-platform`), Deno edge functions + Postgres/Supabase (backend, `mzareei.github.io`).

## Global Constraints

- Every user-facing string is EN + ES, added in pairs to `src/i18n/strings.ts` — `tools/verify-i18n.mjs` enforces this.
- The browser never queries a table directly — all reads/writes go through edge functions.
- Two repos: frontend in `~/Documents/GitHub/Tec Hub/course-platform`, backend in `~/Documents/GitHub/Tec Hub/mzareei.github.io`. Working directly on `main` in both is correct (explicit user consent already given for this whole effort) — no branch/worktree.
- Run `npm run typecheck` and `npm run verify` in `course-platform` before any frontend task is done. Run each touched `node tools/verify-*.mjs` and `deno check` on every edited `.ts` file in `mzareei.github.io` before any backend task is done.
- Never run `npx supabase db push` or `npx supabase functions deploy` without the user's explicit go-ahead — deploy commands are documented per task but must not be run automatically.
- Match each file's own existing error-handling convention exactly — `course-session-management` and `course-question-bank` throw plain English `Error` messages (no stable codes) and the frontend falls back to `e.message`; `course-content-library` throws stable string codes (`content_item_not_owned`, etc.) mapped to bilingual strings on the frontend. Do not introduce a new convention into a file that doesn't already use it.
- A class session can only be deleted in state `planned`, `cancelled`, or `closed` — never `open`/`live`/`paused`/`continued`. This is checked in both the edge function (friendly error) and the SQL function (safety net under lock).
- Never bypass an existing restrict-FK or trigger (`student_responses.question_id restrict`, `pulse_rounds.plan_checkpoint_id restrict`, `guard_content_item_delete`) — catch the resulting error and translate it, never work around it.

---

## Task 1: Hide the "Generate from a PDF" tab

**Files:**
- Modify: `src/screens/instructor/Content.tsx:127-130` (in `course-platform`)

**Interfaces:**
- Produces: nothing new. `Content.tsx`'s `tab` state can no longer become `"generate"` via any UI action.

- [ ] **Step 1: Confirm there is no other path to `tab === "generate"`**

Run: `grep -rn 'setTab(' /Users/mzareei/Documents/GitHub/Tec\ Hub/course-platform/src/screens/instructor/Content.tsx`
Expected: only the four tab-link `onClick` handlers (`library`, `banks`, `generate`, `import`) — confirming that removing the `generate` link's `onClick` is the only trigger, so the render branch for `tab === "generate"` (further down in the same file) becomes unreachable without needing to touch it, and nothing else in the component (state, handlers, `JobCard`, `ReviewPanel`) becomes unused — `noUnusedLocals`/`noUnusedParameters` are both `true` in `tsconfig.json`, so anything actually orphaned would fail `npm run typecheck`. If this grep turns up any other `setTab("generate")` call, stop and report it — the removal is not this simple.

- [ ] **Step 2: Remove the tab link**

In `/Users/mzareei/Documents/GitHub/Tec Hub/course-platform/src/screens/instructor/Content.tsx`, lines 127-130, delete:

```tsx
          <a href="#" role="tab" aria-current={tab === "generate" ? "page" : undefined}
             onClick={(e) => { e.preventDefault(); setTab("generate"); }}>
            {t("content.tab.generate")}
          </a>
```

(Leave the `"library"`, `"banks"`, and `"import"` tab links immediately before/after it untouched, and leave the `content.tab.generate` i18n string, the `ContentTab` type's `"generate"` member, and the entire generate-mode render branch/state/handlers alone — this step only removes the one clickable link.)

- [ ] **Step 3: Typecheck and verify**

Run:
```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform"
npm run typecheck
npm run verify
```
Expected: both exit 0 — nothing becomes unused, since `tab === "generate"` is still a valid (just unreachable) comparison against the unchanged `ContentTab` union.

- [ ] **Step 4: Commit**

```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform"
git add src/screens/instructor/Content.tsx
git commit -m "feat: hide the Generate-from-a-PDF tab for now"
```

---

## Task 2: Delete a class session — backend

**Files:**
- Create: `supabase/migrations/0037_delete_class_sessions_and_question_banks.sql` (in `mzareei.github.io`) — this task adds only the session-delete RPC; Task 4 appends the bank-delete RPC to the same file.
- Modify: `supabase/functions/course-session-management/index.ts` (in `mzareei.github.io`)

**Interfaces:**
- Consumes: `assertSectionAllowed`, `insertAudit`, `requireInstructor`/`permissions` shape, `errorMessage` — all already defined in `course-session-management/index.ts`.
- Produces: a new `delete_class_session_atomic(p_session_id uuid, p_course_id text) returns void` SQL function, and a new `delete_session` edge-function action returning `{ deleted: true, sessions: ClassSession[] }` on success. Task 3 (frontend) calls this action by name.

- [ ] **Step 1: Write the migration**

Create `/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/migrations/0037_delete_class_sessions_and_question_banks.sql`:

```sql
-- Real hard-delete actions for clearing accumulated test/QA data. Both
-- functions here run under `for update` locks and re-check state before
-- deleting, then let Postgres's own restrict-FK constraints do the real
-- safety checking: a foreign_key_violation (23503) means the target has
-- real recorded activity and the whole delete is refused, not partially
-- applied — the calling edge function translates that into a clear message.

create or replace function public.delete_class_session_atomic(
  p_session_id uuid,
  p_course_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_state text;
begin
  select state
    into locked_state
    from public.class_sessions
    where id = p_session_id
      and course_id = p_course_id
    for update;

  if not found then
    raise exception 'class_session_not_found';
  end if;

  if locked_state not in ('planned', 'cancelled', 'closed') then
    raise exception 'class_session_delete_state_invalid';
  end if;

  -- class_question_plans has no ON DELETE clause against class_sessions
  -- (defaults to NO ACTION), so it must go first. This cascades to its own
  -- checkpoints and candidates. If any checkpoint here was ever actually
  -- sent live (pulse_rounds.plan_checkpoint_id is ON DELETE RESTRICT), this
  -- statement itself raises a real foreign_key_violation and the whole
  -- transaction rolls back — deliberately not caught here.
  delete from public.class_question_plans
    where class_session_id = p_session_id;

  -- Cascades: pulse_rounds, class_student_notes, class_presentation_state.
  -- Sets null: content_releases, activity_instances, participation_events,
  -- exit_tickets, and any class_sessions.continued_from_session_id pointing
  -- at this row — all per the existing schema, untouched by this function.
  delete from public.class_sessions
    where id = p_session_id;
end;
$$;

revoke all on function public.delete_class_session_atomic(uuid, text)
  from public, anon, authenticated;
grant execute on function public.delete_class_session_atomic(uuid, text)
  to service_role;
```

- [ ] **Step 2: Add the `delete_session` action to the dispatcher**

In `/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/functions/course-session-management/index.ts`, find the `if (body.action === "extend_activity_window")` block (the last action before the fallback `list_sessions` response) and add a new block immediately after its closing `}`:

```ts
    if (body.action === "delete_session") {
      await deleteSession(db, courseId, {
        sessionId: cleanUuid(body.session_id, "A valid session id is required."),
        actorProfileId: profile.id,
        permissions
      });
      const sessions = await listSessions(db, courseId, permissions);
      return json({ deleted: true, sessions });
    }
```

- [ ] **Step 3: Add the `deleteSession` function**

In the same file, add this function near `updateSessionState` (e.g. directly above it):

```ts
async function deleteSession(db: ReturnType<typeof adminClient>, courseId: string, input: {
  sessionId: string;
  actorProfileId: string;
  permissions: {
    isCourseInstructor: boolean;
    permittedSectionIds: string[];
  };
}) {
  const { data: session, error } = await db
    .from("class_sessions")
    .select("id, state, course_id, section_id, title")
    .eq("id", input.sessionId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (error) throw error;
  if (!session) throw new Error("Class session not found.");
  assertSectionAllowed(input.permissions, session.section_id);

  if (!["planned", "cancelled", "closed"].includes(String(session.state || ""))) {
    throw new Error("Only a planned, cancelled, or closed class day can be deleted.");
  }

  const { error: deleteError } = await db.rpc("delete_class_session_atomic", {
    p_session_id: input.sessionId,
    p_course_id: courseId
  });
  if (deleteError) {
    if (String(deleteError.code) === "23503") {
      throw new Error("This class day has live question history and can't be deleted.");
    }
    throw deleteError;
  }

  await insertAudit(db, {
    courseId,
    actorProfileId: input.actorProfileId,
    targetType: "class_session",
    targetId: session.id,
    action: "class_session_deleted",
    metadata: { title: session.title, state: session.state }
  });
}
```

- [ ] **Step 4: Confirm `assertSectionAllowed` already exists in this file**

Run: `grep -n "^function assertSectionAllowed" "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/functions/course-session-management/index.ts"`
Expected: one match — `updateSessionState` (above `deleteSession` in the file) already calls it, so it must already be defined. If this grep finds nothing, stop and report — the function name differs from what this brief assumes, and `deleteSession` needs to call whatever the real helper is named instead.

- [ ] **Step 5: `deno check` and existing-verifier sweep**

Run:
```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io"
deno check supabase/functions/course-session-management/index.ts
node tools/verify-class-management.mjs
```
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io"
git add supabase/migrations/0037_delete_class_sessions_and_question_banks.sql supabase/functions/course-session-management/index.ts
git commit -m "feat: add delete_session action for planned/cancelled/closed class days"
```

- [ ] **Step 7: Deploy — ask the user before running**

```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io"
npx supabase db push --include-all
npx supabase functions deploy course-session-management
```

---

## Task 3: Delete a class session — frontend

**Files:**
- Modify: `src/api/schedule.ts` (in `course-platform`)
- Modify: `src/components/Schedule.tsx` (in `course-platform`)
- Modify: `src/i18n/strings.ts` (in `course-platform`)

**Interfaces:**
- Consumes: the `delete_session` action from Task 2, returning `{ deleted: true, sessions: ClassSession[] }`.
- Produces: `deleteSession(sessionId: string): Promise<{ deleted: true; sessions: ClassSession[] }>` exported from `src/api/schedule.ts`.

- [ ] **Step 1: Add the new i18n strings**

In `/Users/mzareei/Documents/GitHub/Tec Hub/course-platform/src/i18n/strings.ts`, find the existing `"schedule.cancelled"` entry and add these four new keys directly after it:

```ts
  "schedule.delete": ["Delete", "Eliminar"],
  "schedule.deleteConfirm": [
    "Permanently delete \"{title}\"? This also removes its pulse-question history and any notes recorded for it. Related grade records will be unlinked, not deleted.",
    "¿Eliminar permanentemente \"{title}\"? Esto también borra su historial de preguntas en vivo y las notas registradas. Los registros de calificación relacionados se desvincularán, no se eliminarán."
  ],
  "schedule.deleted": ["\"{title}\" was deleted.", "\"{title}\" fue eliminado."],
  "schedule.deleteFailed": ["Could not delete this class day.", "No se pudo eliminar este día de clase."],
```

- [ ] **Step 2: Add the `deleteSession` API export**

In `/Users/mzareei/Documents/GitHub/Tec Hub/course-platform/src/api/schedule.ts`, add this function at the end of the file, after `cancelSession`:

```ts
export function deleteSession(sessionId: string) {
  return callFn<{ deleted: true; sessions: ClassSession[] }>("course-session-management", {
    action: "delete_session",
    session_id: sessionId
  });
}
```

- [ ] **Step 3: Show cancelled sessions in the list too**

`Schedule.tsx` currently filters cancelled sessions out entirely (`const visible = sessions.filter((s) => s.state !== "cancelled");`), which would make a cancelled session permanently unreachable for deletion. In `/Users/mzareei/Documents/GitHub/Tec Hub/course-platform/src/components/Schedule.tsx`, change:

Old:
```ts
  const visible = sessions.filter((s) => s.state !== "cancelled");
```

New:
```ts
  const visible = sessions;
```

(Cancelled rows already render correctly with the existing `RUNNABLE`/`EDITABLE_SESSION_STATES` checks — neither list includes `"cancelled"`, so a cancelled row already shows no Run/Edit button, just its `StatusPill`. This step only stops hiding the row itself.)

- [ ] **Step 4: Add delete state and handler**

In the same file, add a new state declaration right after `const [busy, setBusy] = useState<string | null>(null);` (import `deleteSession` alongside the existing `listSessions, cancelSession, listSections` import at the top of the file):

```ts
import {
  listSessions, cancelSession, deleteSession, listSections,
  type ClassSession, type CourseSection
} from "../api/schedule";
```

Add the handler function right after the existing `onCancel` function:

```ts
  async function onDelete(session: ClassSession) {
    if (!confirm(t("schedule.deleteConfirm", { title: session.title }))) return;
    setError(null);
    setNotice(null);
    setBusy(session.session_id);
    try {
      await deleteSession(session.session_id);
      setNotice(t("schedule.deleted", { title: session.title }));
      await load();
      await refreshContext();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("schedule.deleteFailed"));
    } finally {
      setBusy(null);
    }
  }
```

- [ ] **Step 5: Add the Delete button**

Still in `Schedule.tsx`, in the actions cell (the `<div class="row" style="gap: 0.3rem;">` block that already renders Run/Edit/Cancel), add a Delete button after the existing Cancel button:

Old:
```tsx
                          {session.state === "planned" ? (
                            <button
                              class="btn quiet"
                              type="button"
                              disabled={busy === session.session_id}
                              onClick={() => void onCancel(session)}
                            >
                              {t("schedule.cancel")}
                            </button>
                          ) : null}
                        </div>
```

New:
```tsx
                          {session.state === "planned" ? (
                            <button
                              class="btn quiet"
                              type="button"
                              disabled={busy === session.session_id}
                              onClick={() => void onCancel(session)}
                            >
                              {t("schedule.cancel")}
                            </button>
                          ) : null}
                          {["planned", "cancelled", "closed"].includes(session.state) ? (
                            <button
                              class="btn quiet"
                              type="button"
                              disabled={busy === session.session_id}
                              onClick={() => void onDelete(session)}
                            >
                              {t("schedule.delete")}
                            </button>
                          ) : null}
                        </div>
```

- [ ] **Step 6: Typecheck and verify**

Run:
```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform"
npm run typecheck
npm run verify
```
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform"
git add src/api/schedule.ts src/components/Schedule.tsx src/i18n/strings.ts
git commit -m "feat: allow deleting a class day (planned, cancelled, or closed)"
```

---

## Task 4: Delete a question bank — backend

**Files:**
- Modify: `supabase/migrations/0037_delete_class_sessions_and_question_banks.sql` (in `mzareei.github.io`) — append the second RPC to the file Task 2 created.
- Modify: `supabase/functions/course-question-bank/index.ts` (in `mzareei.github.io`)

**Interfaces:**
- Produces: `delete_question_bank_atomic(p_bank_id uuid, p_course_id text) returns void`, and a new `delete_bank` action on `course-question-bank` returning `{ question_bank_id: string; deleted: true }`. Task 5 (frontend) calls this action by name.

- [ ] **Step 1: Append the second RPC to the Task 2 migration**

In `/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/migrations/0037_delete_class_sessions_and_question_banks.sql`, append at the end of the file:

```sql

create or replace function public.delete_question_bank_atomic(
  p_bank_id uuid,
  p_course_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1
    from public.question_banks
    where id = p_bank_id
      and course_id = p_course_id
    for update;

  if not found then
    raise exception 'question_bank_not_found';
  end if;

  -- class_question_plans/class_question_plan_candidates have no ON DELETE
  -- clause against question_banks (defaults to NO ACTION), so any plan
  -- built from this bank goes first. Same as the session delete: a
  -- checkpoint that was ever actually sent live raises a real
  -- foreign_key_violation here and the whole transaction rolls back.
  delete from public.class_question_plans
    where question_bank_id = p_bank_id;

  -- Cascades to questions, which cascades to question_options. If any
  -- question here was ever answered by a student, student_responses'
  -- ON DELETE RESTRICT blocks the cascade at that question and this
  -- statement raises a real foreign_key_violation — deliberately not
  -- caught here.
  delete from public.question_banks
    where id = p_bank_id;
end;
$$;

revoke all on function public.delete_question_bank_atomic(uuid, text)
  from public, anon, authenticated;
grant execute on function public.delete_question_bank_atomic(uuid, text)
  to service_role;
```

- [ ] **Step 2: Add the `delete_bank` case to the dispatcher**

In `/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/functions/course-question-bank/index.ts`, find the `switch (body.action)` block and add a new case right after `case "delete_question":`:

```ts
      case "delete_bank": {
        if (!isInstructor) throw new Error("Deleting a question bank is not allowed for this role.");
        return json(await deleteBank(db, courseId, String(profile.id), body));
      }
```

- [ ] **Step 3: Add the `deleteBank` function**

In the same file, add this function directly after `deleteQuestion`:

```ts
async function deleteBank(db: Db, courseId: string, actorProfileId: string, body: Record<string, unknown>) {
  const bankId = cleanUuid(body.question_bank_id, "question bank id");
  const { data: bank, error } = await db
    .from("question_banks")
    .select("id, title, course_id")
    .eq("id", bankId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (error) throw error;
  if (!bank) throw new Error("Question bank not found.");

  const { error: deleteError } = await db.rpc("delete_question_bank_atomic", {
    p_bank_id: bankId,
    p_course_id: courseId
  });
  if (deleteError) {
    if (String(deleteError.code) === "23503") {
      throw new Error("This bank has recorded student answers or live question history and can't be deleted.");
    }
    throw deleteError;
  }

  await db.from("audit_log").insert({
    course_id: courseId,
    actor_profile_id: actorProfileId,
    target_type: "question_bank",
    target_id: bank.id,
    action: "question_bank_deleted",
    metadata: { title: bank.title }
  });

  return { question_bank_id: bank.id, deleted: true };
}
```

(`cleanUuid` is already defined in this file — used by `deleteQuestion`/`loadQuestionForEdit` above.)

- [ ] **Step 4: `deno check` and existing-verifier sweep**

Run:
```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io"
deno check supabase/functions/course-question-bank/index.ts
node tools/verify-slide-checkpoints.mjs
```
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io"
git add supabase/migrations/0037_delete_class_sessions_and_question_banks.sql supabase/functions/course-question-bank/index.ts
git commit -m "feat: add delete_bank action for question banks with no recorded activity"
```

- [ ] **Step 6: Deploy — ask the user before running**

If Task 2's migration hasn't been pushed yet, this step also carries it (the file now has both functions):
```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io"
npx supabase db push --include-all
npx supabase functions deploy course-question-bank
```

---

## Task 5: Delete a question bank — frontend

**Files:**
- Modify: `src/api/checkpoints.ts` (in `course-platform`)
- Modify: `src/components/QuestionBanks.tsx` (in `course-platform`)
- Modify: `src/i18n/strings.ts` (in `course-platform`)

**Interfaces:**
- Consumes: the `delete_bank` action from Task 4.
- Produces: `deleteBank(questionBankId: string): Promise<{ question_bank_id: string; deleted: true }>` exported from `src/api/checkpoints.ts`.

- [ ] **Step 1: Add the new i18n strings**

In `/Users/mzareei/Documents/GitHub/Tec Hub/course-platform/src/i18n/strings.ts`, find the existing `"content.banks.deleteConfirm"` entry (used today for deleting a single question) and add these four new, distinctly-named keys directly after it — do not reuse `content.banks.deleteConfirm` itself, since that string already means "delete this one question":

```ts
  "content.banks.deleteBank": ["Delete bank", "Eliminar banco"],
  "content.banks.deleteBankConfirm": [
    "Permanently delete \"{title}\" and all {count} of its questions? This cannot be undone.",
    "¿Eliminar permanentemente \"{title}\" y sus {count} preguntas? Esto no se puede deshacer."
  ],
  "content.banks.bankDeleted": ["\"{title}\" was deleted.", "\"{title}\" fue eliminado."],
  "content.banks.deleteBankFailed": ["Could not delete this question bank.", "No se pudo eliminar este banco de preguntas."],
```

- [ ] **Step 2: Add the `deleteBank` API export**

In `/Users/mzareei/Documents/GitHub/Tec Hub/course-platform/src/api/checkpoints.ts`, add this function directly after `deleteQuestion`:

```ts
export function deleteBank(questionBankId: string) {
  return callFn<{ question_bank_id: string; deleted: boolean }>(
    "course-question-bank",
    { action: "delete_bank", question_bank_id: questionBankId }
  );
}
```

- [ ] **Step 3: Add delete state and handler to `QuestionBanks`**

In `/Users/mzareei/Documents/GitHub/Tec Hub/course-platform/src/components/QuestionBanks.tsx`, update the import line to add `deleteBank`:

Old:
```ts
import {
  listBanks,
  prepareLegacyCheckpoints,
  type BackfillResult,
  type CheckpointBankSummary,
  type CheckpointCoverage
} from "../api/checkpoints";
```

New:
```ts
import {
  deleteBank,
  listBanks,
  prepareLegacyCheckpoints,
  type BackfillResult,
  type CheckpointBankSummary,
  type CheckpointCoverage
} from "../api/checkpoints";
```

Inside `QuestionBankCard`, add a `deleting`/`deleteError` state pair next to the existing `preparing`/`prepareError` state, and a handler, right after the `prepare()` function:

```ts
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function remove() {
    if (!confirm(t("content.banks.deleteBankConfirm", { title: bank.content_title || bank.title, count: bank.total }))) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteBank(bank.bank_id);
      await onRefresh();
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : t("content.banks.deleteBankFailed"));
      setDeleting(false);
    }
  }
```

(No `finally { setDeleting(false) }` on the success path deliberately — after `onRefresh()` succeeds, this card's props update from the parent and the component re-renders with the bank gone; only the failure path needs to reset `deleting` so the button becomes clickable again.)

- [ ] **Step 4: Add the Delete button and error line**

Still in `QuestionBankCard`'s render, add a Delete button next to the "Review questions" button (in the `{instructorCanPrepare ? (...) : null}` block) and render `deleteError` near the existing `prepareError` line:

Old:
```tsx
      {instructorCanPrepare ? (
        <button
          class="btn"
          type="button"
          onClick={() => setReviewOpen((open) => !open)}
        >
          {reviewOpen
            ? t("content.banks.closeReview")
            : t("content.banks.reviewQuestions")}
        </button>
      ) : null}
```

New:
```tsx
      {instructorCanPrepare ? (
        <div class="row">
          <button
            class="btn"
            type="button"
            onClick={() => setReviewOpen((open) => !open)}
          >
            {reviewOpen
              ? t("content.banks.closeReview")
              : t("content.banks.reviewQuestions")}
          </button>
          <button
            class="btn quiet"
            type="button"
            disabled={deleting}
            onClick={() => void remove()}
          >
            {deleting ? t("content.banks.working") : t("content.banks.deleteBank")}
          </button>
        </div>
      ) : null}
```

(`content.banks.working` already exists — confirm with `grep -n '"content.banks.working"' src/i18n/strings.ts` before relying on it; if it doesn't exist, use `t("content.banks.deleteBank")` for both states instead of adding a new key.)

Add the error line right after the existing `{prepareError ? (...) : null}` block:

```tsx
      {deleteError ? (
        <p class="error-text" role="alert">{deleteError}</p>
      ) : null}
```

- [ ] **Step 5: Typecheck and verify**

Run:
```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform"
npm run typecheck
npm run verify
```
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform"
git add src/api/checkpoints.ts src/components/QuestionBanks.tsx src/i18n/strings.ts
git commit -m "feat: allow deleting a question bank with no recorded activity"
```

---

## Task 6: Delete a content item — backend

**Files:**
- Modify: `supabase/functions/course-content-library/index.ts` (in `mzareei.github.io`)

**Interfaces:**
- Consumes: `canEditContentItem`, `insertAudit`, `ContentPermissions`, `cleanOptionalUuid` — all already defined in this file.
- Produces: a new `delete_content_item` action returning `{ content_item_id: string; deleted: true }` on success, or one of the stable error codes `content_item_not_found` / `content_item_not_owned` / `content_item_has_active_release` / `content_item_has_active_bank` on failure. Task 7 (frontend) maps these codes to bilingual strings.

- [ ] **Step 1: Confirm the release-state enum**

Run: `grep -n "state text not null default 'draft' check" "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/migrations/0004_authenticated_course_platform.sql"`
Expected: `state in ('draft', 'scheduled', 'released', 'live', 'paused', 'review_only', 'closed', 'archived')`. The states that mean "a student could currently or soon see this" are `scheduled`, `released`, `live`, `paused`, `review_only` — matching `STUDENT_VISIBLE_STATES` already defined in `course-platform/src/api/content.ts`. If the enum found here differs from this, use the real one instead of what's written below.

- [ ] **Step 2: Add the `delete_content_item` case to the dispatcher**

In `/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/functions/course-content-library/index.ts`, find the `if (body.action === "save_content_item")` block and add a new block immediately after its closing `}`:

```ts
    if (body.action === "delete_content_item") {
      const itemId = cleanOptionalUuid(body.content_item_id);
      if (!itemId) throw new Error("content_item_id_required");
      const result = await deleteContentItem(db, courseId, {
        itemId,
        actorProfileId: String(profile.id),
        permissions
      });
      return json(result);
    }
```

- [ ] **Step 3: Add the `deleteContentItem` function**

In the same file, add this function directly after `saveContentItem`:

```ts
async function deleteContentItem(db: Db, courseId: string, input: {
  itemId: string;
  actorProfileId: string;
  permissions: ContentPermissions;
}) {
  const { data: existing, error } = await db
    .from("content_items")
    .select("id, course_id, title, owner_profile_id")
    .eq("id", input.itemId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (error) throw error;
  if (!existing) throw new Error("content_item_not_found");
  if (!canEditContentItem(existing, input.permissions)) {
    throw new Error("content_item_not_owned");
  }

  const { count: blockingReleaseCount, error: releaseError } = await db
    .from("content_releases")
    .select("id", { count: "exact", head: true })
    .eq("content_item_id", existing.id)
    .in("state", ["scheduled", "released", "live", "paused", "review_only"]);
  if (releaseError) throw releaseError;
  if ((blockingReleaseCount || 0) > 0) {
    throw new Error("content_item_has_active_release");
  }

  const { error: deleteError } = await db
    .from("content_items")
    .delete()
    .eq("id", existing.id)
    .eq("course_id", courseId);
  if (deleteError) {
    // The guard_content_item_delete trigger (migration 0032) raises with
    // errcode 'restrict_violation' (SQLSTATE 23001) when an active question
    // bank still points at this item — a distinct code from the standard
    // foreign-key-violation 23503 used elsewhere in this codebase.
    if (String(deleteError.code) === "23001") {
      throw new Error("content_item_has_active_bank");
    }
    throw deleteError;
  }

  await insertAudit(db, {
    courseId,
    actorProfileId: input.actorProfileId,
    targetType: "content_item",
    targetId: existing.id,
    action: "content_item_deleted",
    metadata: { title: existing.title }
  });

  return { content_item_id: existing.id, deleted: true };
}
```

- [ ] **Step 4: Add the new error codes to the status-mapping block**

Find the `catch (error)` block at the bottom of `Deno.serve(...)` that maps `content_item_not_owned` / `content_item_not_visible` / `content_share_target_invalid` to status codes, and extend it:

Old:
```ts
    if (
      message === "content_item_not_owned"
      || message === "content_item_not_visible"
      || message === "content_share_target_invalid"
    ) {
      const status = message === "content_share_target_invalid" ? 400 : 403;
      return json({ error: message, error_code: message }, { status });
```

New:
```ts
    if (
      message === "content_item_not_owned"
      || message === "content_item_not_visible"
      || message === "content_share_target_invalid"
      || message === "content_item_not_found"
      || message === "content_item_has_active_release"
      || message === "content_item_has_active_bank"
      || message === "content_item_id_required"
    ) {
      const status = message === "content_item_not_found"
        ? 404
        : message === "content_item_has_active_release" || message === "content_item_has_active_bank"
          ? 409
          : message === "content_share_target_invalid" || message === "content_item_id_required"
            ? 400
            : 403;
      return json({ error: message, error_code: message }, { status });
```

(Read the actual surrounding code first — the exact shape of this `catch` block, and whatever comes after this `if`, may not match verbatim; preserve everything else in the block, only widen this one condition and its status logic.)

- [ ] **Step 5: `deno check`**

Run: `cd "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io" && deno check supabase/functions/course-content-library/index.ts`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io"
git add supabase/functions/course-content-library/index.ts
git commit -m "feat: add delete_content_item action, refusing active banks and current releases"
```

- [ ] **Step 7: Deploy — ask the user before running**

```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io"
npx supabase functions deploy course-content-library
```

---

## Task 7: Delete a content item — frontend

**Files:**
- Modify: `src/api/content.ts` (in `course-platform`)
- Modify: `src/components/ContentLibrary.tsx` (in `course-platform`)
- Modify: `src/i18n/strings.ts` (in `course-platform`)

**Interfaces:**
- Consumes: the `delete_content_item` action from Task 6, and its four stable error codes.
- Produces: `deleteContentItem(contentItemId: string): Promise<{ content_item_id: string; deleted: true }>` and `contentItemDeleteErrorKey(code?: string | null): StringKey | null` exported from `src/api/content.ts`.

- [ ] **Step 1: Add the new i18n strings**

In `/Users/mzareei/Documents/GitHub/Tec Hub/course-platform/src/i18n/strings.ts`, find the existing `"content.library.revoked"` entry and add these seven new keys directly after it:

```ts
  "content.library.delete": ["Delete", "Eliminar"],
  "content.library.deleteConfirm": [
    "Permanently delete \"{title}\"? This cannot be undone.",
    "¿Eliminar permanentemente \"{title}\"? Esto no se puede deshacer."
  ],
  "content.library.deleted": ["\"{title}\" was deleted.", "\"{title}\" fue eliminado."],
  "content.library.deleteFailed": ["Could not delete this material.", "No se pudo eliminar este material."],
  "content.library.content_item_not_found": [
    "This item could not be found.",
    "No se encontró este material."
  ],
  "content.library.content_item_not_owned": [
    "You don't have permission to delete this item.",
    "No tienes permiso para eliminar este material."
  ],
  "content.library.content_item_has_active_release": [
    "This item is currently available to students and can't be deleted. Remove it from Review first.",
    "Este material está disponible actualmente para los estudiantes y no se puede eliminar. Quítalo de Revisión primero."
  ],
  "content.library.content_item_has_active_bank": [
    "This item still has an active question bank. Delete the bank first, then this item.",
    "Este material todavía tiene un banco de preguntas activo. Elimina el banco primero y luego este material."
  ],
```

- [ ] **Step 2: Add the `deleteContentItem` API export and error-key mapper**

In `/Users/mzareei/Documents/GitHub/Tec Hub/course-platform/src/api/content.ts`, add `type StringKey` to the imports at the top of the file:

Old:
```ts
import { callFn } from "./client";
import { canReleaseToReview } from "./contentVisibility";
```

New:
```ts
import { callFn } from "./client";
import { canReleaseToReview } from "./contentVisibility";
import type { StringKey } from "../i18n/strings";
```

Add these two functions at the end of the file:

```ts
export function deleteContentItem(contentItemId: string) {
  return callFn<{ content_item_id: string; deleted: boolean }>("course-content-library", {
    action: "delete_content_item",
    content_item_id: contentItemId
  });
}

const CONTENT_ITEM_DELETE_ERROR_KEYS = new Set<StringKey>([
  "content.library.content_item_not_found",
  "content.library.content_item_not_owned",
  "content.library.content_item_has_active_release",
  "content.library.content_item_has_active_bank"
]);

export function contentItemDeleteErrorKey(code?: string | null): StringKey | null {
  const next = `content.library.${String(code || "").trim()}` as StringKey;
  return CONTENT_ITEM_DELETE_ERROR_KEYS.has(next) ? next : null;
}
```

- [ ] **Step 3: Confirm how `callFn` surfaces `error_code`**

Run: `grep -n "error_code\|class ApiError" "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform/src/api/client.ts"`
Expected: an `ApiError` class (or similar) that carries the response's `error_code` field on a thrown error object — this exact pattern is already relied on by `classQuestionPlanErrorKey` in `src/api/classQuestionPlans.ts` (`cause instanceof ApiError ? cause.code : ...`). Model `deleteContentItem`'s caller in Step 5 on that same pattern: catch the thrown error, read its code the same way `classQuestionPlanErrorMessage` does, and only fall back to `e.message`/a generic string if the code isn't one of the four above.

- [ ] **Step 4: Add delete state and handler to `ContentLibraryView`**

In `/Users/mzareei/Documents/GitHub/Tec Hub/course-platform/src/components/ContentLibrary.tsx`, update the import to add the two new functions:

Old:
```ts
import {
  contentLibrary, listReleases, updateReleaseState, makeAvailable, studentsCanOpen, ContentNotReviewableError,
  syncContentFromRepository,
  copyContentItem, shareContentItem, unshareContentItem,
  type ContentItem, type ContentLibrary as Library, type ReleaseRow
} from "../api/content";
```

New:
```ts
import {
  contentLibrary, listReleases, updateReleaseState, makeAvailable, studentsCanOpen, ContentNotReviewableError,
  syncContentFromRepository,
  copyContentItem, shareContentItem, unshareContentItem,
  deleteContentItem, contentItemDeleteErrorKey,
  type ContentItem, type ContentLibrary as Library, type ReleaseRow
} from "../api/content";
import { t as translate } from "../i18n";
```

(`t as translate` is only needed if `t` isn't already imported under that exact name in this file — check the existing `import { t, formatDay } from "../i18n";` line first; if `t` is already imported, skip adding this second import and just use `t` directly below instead of `translate`.)

Inside `ContentLibraryView`'s body, the existing `run(itemId, work, failureMessage)` helper already does exactly what a delete action needs (busy state, per-item error, reload on success) — reuse it rather than adding new state. Add the handler logic inline at the call site in Step 5, using `run`.

- [ ] **Step 5: Add the Delete button**

Still in `ContentLibrary.tsx`, in the per-item action row (the `<div class="row" style="flex: 0 0 auto;">` block that already renders Make available/Sync/Share), add a Delete button as the last item in that row, only for an item the caller can edit and that is not shared-with-me:

Old (the closing of that action row):
```tsx
                {canEdit && !item.is_shared_with_me ? (
                  <button
                    class="btn quiet"
                    type="button"
                    disabled={busy === item.id}
                    onClick={() => {
                      setSharingItemId(sharingItemId === item.id ? null : item.id);
                      setShareTarget("");
                    }}
                  >
                    {t("content.library.share")}
                  </button>
                ) : null}
              </div>
```

New:
```tsx
                {canEdit && !item.is_shared_with_me ? (
                  <button
                    class="btn quiet"
                    type="button"
                    disabled={busy === item.id}
                    onClick={() => {
                      setSharingItemId(sharingItemId === item.id ? null : item.id);
                      setShareTarget("");
                    }}
                  >
                    {t("content.library.share")}
                  </button>
                ) : null}
                {canEdit && !item.is_shared_with_me ? (
                  <button
                    class="btn quiet"
                    type="button"
                    disabled={busy === item.id}
                    onClick={() => {
                      if (!confirm(t("content.library.deleteConfirm", { title: item.title }))) return;
                      void run(item.id, async () => {
                        await deleteContentItem(item.id);
                        setNotice(t("content.library.deleted", { title: item.title }));
                      }, t("content.library.deleteFailed"));
                    }}
                  >
                    {busy === item.id ? t("content.library.working") : t("content.library.delete")}
                  </button>
                ) : null}
              </div>
```

(`t("content.library.working")` already exists — confirm with `grep -n '"content.library.working"' src/i18n/strings.ts` before relying on it; if missing, use `t("content.library.delete")` for both states.)

- [ ] **Step 6: Surface the specific stable-code message instead of the generic fallback**

The `run` helper's `catch` block currently does:
```ts
setItemError((current) => ({
  ...current,
  [itemId]: e instanceof ContentNotReviewableError
    ? t("content.library.notReviewable")
    : e instanceof Error ? e.message : failureMessage
}));
```
This shows `e.message` (raw, likely English/generic) for anything that isn't a `ContentNotReviewableError`. Extend it so a delete failure with one of the four known stable codes shows its specific bilingual message instead. Change to:
```ts
setItemError((current) => ({
  ...current,
  [itemId]: e instanceof ContentNotReviewableError
    ? t("content.library.notReviewable")
    : contentItemDeleteErrorKey((e as { code?: string } | null)?.code) !== null
      ? t(contentItemDeleteErrorKey((e as { code?: string })?.code) as StringKey)
      : e instanceof Error ? e.message : failureMessage
}));
```
(Adjust `(e as { code?: string } | null)?.code` to match however `ApiError` actually exposes the code, per Step 3's finding — it may be `e.code`, `e.error_code`, or something else; use the real property name, not this placeholder guess.) Import `type { StringKey } from "../i18n/strings";` at the top of the file if not already present.

- [ ] **Step 7: Typecheck and verify**

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
git add src/api/content.ts src/components/ContentLibrary.tsx src/i18n/strings.ts
git commit -m "feat: allow deleting a content item with no active bank or release"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers the design's "1. Disable Generate from a PDF" section. Tasks 2-3 cover "2. Delete a class session." Tasks 4-5 cover "3. Delete a question bank." Tasks 6-7 cover "4. Delete a content item." The spec's shared conventions (permissions, error translation, audit logging, confirm-with-consequences, refusal-not-silent-loss) are followed per-file, matching each file's own existing convention rather than inventing one.
- **Type/name consistency checked across tasks:** `delete_class_session_atomic`/`delete_question_bank_atomic` are spelled identically between the migration (Tasks 2, 4) and the `.rpc(...)` calls in `course-session-management`/`course-question-bank`. `deleteSession`/`deleteBank`/`deleteContentItem` (frontend API exports, Tasks 3/5/7) match the exact action names (`delete_session`/`delete_bank`/`delete_content_item`) their Task 2/4/6 backend counterparts dispatch on.
- **Two tasks (2 and 4) intentionally write to the same migration file** — Task 4's Step 1 appends rather than creating a new file, since both are "delete RPCs added in this plan" and there's no reason to spend a second migration number on a thematically identical addition landing in the same work.
- **No placeholders:** every step shows complete, exact code. The two spots that explicitly say "read the actual code first" (Task 6 Step 4, the `catch` block's exact surrounding shape; Task 7 Step 6, `ApiError`'s real code property name) are genuine unknowns this plan couldn't resolve without guessing at a file that wasn't fully read during planning — both are called out explicitly as verify-before-applying steps, not silently assumed.
