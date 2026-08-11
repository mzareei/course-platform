# Unmanaged Items and Force-Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show bank-only imported content items (currently invisible in the Content Library screen) in a delete-only section, and add a type-to-confirm force-delete path that bypasses only historical-activity refusals — never a currently-live/currently-released guard, and never the active-bank trigger.

**Architecture:** One frontend-only bug fix (Task 1). Three backend tasks add a `p_force`/`force` parameter to the existing delete paths, explicitly pre-clearing only the rows a real restrict-FK protects (Tasks 2-4). One new shared frontend component implements the "type DELETE to confirm" UI once (Task 5). Three frontend tasks wire each entity's Delete button to detect a historical-activity refusal and offer the shared force-delete control (Tasks 6-8).

**Tech Stack:** Vite + TypeScript + Preact (frontend, `course-platform`), Deno edge functions + Postgres/Supabase (backend, `mzareei.github.io`).

## Global Constraints

- Every user-facing string is EN + ES, added in pairs to `src/i18n/strings.ts`.
- Working directly on `main` in both repos is correct — explicit user consent already given for this whole effort. No branch/worktree.
- Run `npm run typecheck` and `npm run verify` in `course-platform` before any frontend task is done. Run each touched `node tools/verify-*.mjs` and `deno check` on every edited `.ts` file in `mzareei.github.io` before any backend task is done.
- Never run `npx supabase db push` or `npx supabase functions deploy` without the user's explicit go-ahead.
- **Force never bypasses a "this is happening right now" guard**: session state must still be `planned`/`cancelled`/`closed`; a bank still in use by a `open`/`live`/`paused`/`continued` class is still refused; a currently-released content item is still refused; the `guard_content_item_delete` trigger (active question bank) is never touched or bypassed by any of this work. Force only ever bypasses a refusal about *past* recorded activity (pulse rounds, student responses, quiz attempts).
- Match each backend file's own existing error-handling convention exactly — `course-session-management`/`course-question-bank` throw plain English `Error` messages; `course-content-library` throws stable string codes. Do not introduce a new convention into either.
- `create or replace function` with a different parameter list creates a new Postgres overload, not a replacement — every SQL function whose signature changes in this plan must have its old signature explicitly `drop function if exists`-ed first.

---

## Task 1: Unmanaged items section (Content Library)

**Files:**
- Modify: `src/components/ContentLibrary.tsx` (in `course-platform`)
- Modify: `src/i18n/strings.ts` (in `course-platform`)

**Interfaces:**
- Consumes: `library.content_items` (already loaded), `canReleaseToReview` (existing, unchanged), `releasesByItem` (existing map, already keyed across *all* items not just reviewable ones), `deleteContentItem`/`run`/`contentItemDeleteErrorKey` (all existing, unchanged).
- Produces: no new exports. Purely a rendering addition inside `ContentLibraryView`.

- [ ] **Step 1: Add the two new i18n strings**

In `/Users/mzareei/Documents/GitHub/Tec Hub/course-platform/src/i18n/strings.ts`, find the `"content.library.emptyBody"` entry and add these two new keys directly after its closing `],`:

```ts
  "content.library.unmanagedTitle": ["Other items", "Otros elementos"],
  "content.library.unmanagedHint": [
    "These aren't shown to students in Review and have no availability controls here — for example, a question-bank-only import with no lecture deck. Delete is available if you no longer need one.",
    "Estos no se muestran a los estudiantes en Revisión y no tienen controles de disponibilidad aquí — por ejemplo, una importación de solo banco de preguntas sin diapositivas. Puedes eliminarlo si ya no lo necesitas."
  ],
```

- [ ] **Step 2: Compute the unmanaged-items list and fix the empty-state gate**

In `/Users/mzareei/Documents/GitHub/Tec Hub/course-platform/src/components/ContentLibrary.tsx`, change:

Old:
```tsx
  const reviewableItems = library.content_items.filter((item) => canReleaseToReview(item));

  if (!reviewableItems.length) {
    return (
      <div class="empty-state card">
        <h3>{t("content.library.emptyTitle")}</h3>
        <p>{t("content.library.emptyBody")}</p>
      </div>
    );
  }
```

New:
```tsx
  const reviewableItems = library.content_items.filter((item) => canReleaseToReview(item));
  // Anything canReleaseToReview excludes (e.g. a bank-only import with no
  // deck: content_type "quiz_bank", source_kind "supabase_record") never
  // gets a card in the loop below and previously had no way to be reached
  // at all — the row existed in the database with no Delete button anywhere
  // in the app. This section is delete-only: none of Make available / Sync
  // / Share / Assign apply to something with no student-facing form.
  const unmanagedItems = library.content_items.filter((item) =>
    !canReleaseToReview(item) && item.can_edit !== false && !item.is_shared_with_me
  );

  if (!reviewableItems.length && !unmanagedItems.length) {
    return (
      <div class="empty-state card">
        <h3>{t("content.library.emptyTitle")}</h3>
        <p>{t("content.library.emptyBody")}</p>
      </div>
    );
  }
```

- [ ] **Step 3: Guard the reviewable-items rendering and add the unmanaged section**

Still in `ContentLibrary.tsx`, the component currently computes `releasesByItem`, `isAvailable`, `items`, `availableCount`, `assignableSessions` unconditionally after the empty-state check, then returns one big `<div class="stack">` containing the lede, filter tabs, and `items.map(...)`. Since `reviewableItems` can now legitimately be empty while `unmanagedItems` is not, wrap the existing reviewable-items block (the `<PublicLinkCleanup />` through the closing `{items.map((item) => { ... })}` block, i.e. everything currently inside the returned `<div class="stack">` except the final closing tags) in `{reviewableItems.length ? (...) : null}`, and add the new unmanaged section as a sibling after it, still inside the outer `<div class="stack">`. The overall return becomes:

```tsx
  return (
    <div class="stack">
      {reviewableItems.length ? (
        <>
          <p class="hint">{t("content.library.lede")}</p>

          {/* Renders nothing once every stored file is clean, so this one-time
              job does not leave a permanent maintenance card behind. */}
          <PublicLinkCleanup />

          <div class="row" style="justify-content: space-between; align-items: center;">
            <span class="hint">
              {t("content.library.countAvailable", {
                available: availableCount,
                total: reviewableItems.length
              })}
            </span>
            <div class="nav-tabs" role="tablist" style="flex: 0 0 auto;">
              {(["all", "available", "hidden"] as Filter[]).map((value) => (
                <a href="#" role="tab" aria-current={filter === value ? "page" : undefined}
                   onClick={(e) => { e.preventDefault(); setFilter(value); }}>
                  {value === "all"
                    ? t("content.library.filterAll")
                    : value === "available"
                      ? t("content.library.filterAvailable")
                      : t("content.library.filterHidden")}
                </a>
              ))}
            </div>
          </div>

          {notice ? <p class="hint" role="status">{notice}</p> : null}

          {items.map((item) => {
            /* ...unchanged, exact existing card body... */
          })}
        </>
      ) : null}

      {unmanagedItems.length ? (
        <div class="stack">
          <div>
            <h3>{t("content.library.unmanagedTitle")}</h3>
            <p class="hint">{t("content.library.unmanagedHint")}</p>
          </div>
          {unmanagedItems.map((item) => {
            const itemReleases = releasesByItem.get(item.id) ?? [];
            const failure = itemError[item.id];
            return (
              <div class="card row" style="justify-content: space-between; align-items: center;">
                <span>{item.title}</span>
                <div class="stack" style="align-items: flex-end; gap: 0.3rem;">
                  <button
                    class="btn quiet"
                    type="button"
                    disabled={busy === item.id}
                    onClick={() => {
                      if (!confirm(t("content.library.deleteConfirm", { title: item.title, releases: itemReleases.length }))) return;
                      void run(item.id, async () => {
                        await deleteContentItem(item.id);
                        setNotice(t("content.library.deleted", { title: item.title }));
                        await refreshContext();
                      }, t("content.library.deleteFailed"));
                    }}
                  >
                    {busy === item.id ? t("content.library.working") : t("content.library.delete")}
                  </button>
                  {failure ? <p class="error-text" role="alert">{failure}</p> : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
```

`releasesByItem` must move above this new usage if it isn't already computed before the `reviewableItems.length ? (...)` branch — read the current file to confirm; if `releasesByItem`/`isAvailable`/`items`/`availableCount`/`assignableSessions` are currently computed *after* the (now-removed) early-return, they're already in the right place relative to this new code, since the early return only fired when `reviewableItems` was empty and none of those computations depend on that emptiness. No change needed to where those `const`s are declared — only to what wraps the JSX that uses them.

- [ ] **Step 4: Typecheck and verify**

Run:
```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform"
npm run typecheck
npm run verify
```
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform"
git add src/components/ContentLibrary.tsx src/i18n/strings.ts
git commit -m "feat: show bank-only imported items as a delete-only unmanaged section"
```

---

## Task 2: Force-delete backend — class session

**Files:**
- Create: `supabase/migrations/0038_force_delete.sql` (in `mzareei.github.io`) — this task adds only the session RPC; Task 3 appends the bank RPC to the same file.
- Modify: `supabase/functions/course-session-management/index.ts` (in `mzareei.github.io`)

**Interfaces:**
- Produces: `delete_class_session_atomic(p_session_id uuid, p_course_id text, p_force boolean default false) returns void` (replaces the 2-arg version from migration 0037 — the old signature is explicitly dropped). `deleteSession`'s `input` type gains `force: boolean`; the `delete_session` dispatcher reads `Boolean(body.force)`.

- [ ] **Step 1: Write the migration**

Create `/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/migrations/0038_force_delete.sql`:

```sql
-- Force-delete support: bypass ONLY the historical-activity refusals added
-- in 0037 (recorded pulse activity for a session; recorded student answers
-- or live-sent checkpoints for a bank), gated behind an explicit p_force
-- flag the edge functions only set after the instructor types "DELETE" to
-- confirm on the frontend. Never bypasses a "this is happening right now"
-- guard (session/bank state, live-class usage) — those keep refusing
-- regardless of p_force.
--
-- Both functions below change their parameter list, which Postgres treats
-- as a new overload rather than a replacement — the old 2-arg signature is
-- dropped explicitly so it doesn't linger as dead, callable code.

drop function if exists public.delete_class_session_atomic(uuid, text);

create or replace function public.delete_class_session_atomic(
  p_session_id uuid,
  p_course_id text,
  p_force boolean default false
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

  if not p_force then
    if exists (
      select 1 from public.pulse_rounds where class_session_id = p_session_id
    ) then
      raise exception 'class_session_has_pulse_activity';
    end if;
  else
    -- Force mode: explicitly clear pulse_rounds first. Deleting
    -- class_question_plans below cascades to its checkpoints, and
    -- pulse_rounds.plan_checkpoint_id is ON DELETE RESTRICT — if this
    -- session's own pulse rounds weren't already gone, that restrict would
    -- still fire even though those very rows are about to be removed a step
    -- later by the session's own cascade. This permanently destroys the
    -- session's recorded live-question activity.
    delete from public.pulse_rounds where class_session_id = p_session_id;
  end if;

  delete from public.class_question_plans
    where class_session_id = p_session_id;

  delete from public.class_sessions
    where id = p_session_id;
end;
$$;

revoke all on function public.delete_class_session_atomic(uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.delete_class_session_atomic(uuid, text, boolean)
  to service_role;
```

- [ ] **Step 2: Extend `deleteSession`'s input type and pass `p_force`**

In `/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/functions/course-session-management/index.ts`, change:

Old:
```ts
async function deleteSession(db: ReturnType<typeof adminClient>, courseId: string, input: {
  sessionId: string;
  actorProfileId: string;
  permissions: {
    isCourseInstructor: boolean;
    permittedSectionIds: string[];
  };
}) {
```

New:
```ts
async function deleteSession(db: ReturnType<typeof adminClient>, courseId: string, input: {
  sessionId: string;
  actorProfileId: string;
  force: boolean;
  permissions: {
    isCourseInstructor: boolean;
    permittedSectionIds: string[];
  };
}) {
```

Then, in the same function, change the RPC call:

Old:
```ts
  const { error: deleteError } = await db.rpc("delete_class_session_atomic", {
    p_session_id: input.sessionId,
    p_course_id: courseId
  });
```

New:
```ts
  const { error: deleteError } = await db.rpc("delete_class_session_atomic", {
    p_session_id: input.sessionId,
    p_course_id: courseId,
    p_force: input.force
  });
```

Leave the rest of the function (the `if (deleteError) { ... }` block, the audit insert) exactly as-is — it already handles every exception this RPC can raise; force mode simply means `class_session_has_pulse_activity` no longer fires.

- [ ] **Step 3: Pass `force` from the dispatcher**

In the same file, change the `delete_session` dispatcher block:

Old:
```ts
    if (body.action === "delete_session") {
      await deleteSession(db, courseId, {
        sessionId: cleanUuid(body.session_id, "A valid session id is required."),
        actorProfileId: profile.id,
        permissions
      });
```

New:
```ts
    if (body.action === "delete_session") {
      await deleteSession(db, courseId, {
        sessionId: cleanUuid(body.session_id, "A valid session id is required."),
        actorProfileId: profile.id,
        force: Boolean(body.force),
        permissions
      });
```

- [ ] **Step 4: `deno check` and verifier sweep**

Run:
```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io"
deno check supabase/functions/course-session-management/index.ts
node tools/verify-class-management.mjs
```
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io"
git add supabase/migrations/0038_force_delete.sql supabase/functions/course-session-management/index.ts
git commit -m "feat: add force-delete for a class session's recorded pulse activity"
```

- [ ] **Step 6: Deploy — ask the user before running**

```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io"
npx supabase db push --include-all
npx supabase functions deploy course-session-management
```

---

## Task 3: Force-delete backend — question bank

**Files:**
- Modify: `supabase/migrations/0038_force_delete.sql` (in `mzareei.github.io`) — append the bank RPC to the file Task 2 created.
- Modify: `supabase/functions/course-question-bank/index.ts` (in `mzareei.github.io`)

**Interfaces:**
- Produces: `delete_question_bank_atomic(p_bank_id uuid, p_course_id text, p_force boolean default false) returns void` (replaces the 2-arg version, old signature dropped). `deleteBank` reads `force` straight off the existing `body` parameter it already receives.

- [ ] **Step 1: Append the bank RPC to the Task 2 migration**

In `/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/migrations/0038_force_delete.sql`, append at the end of the file:

```sql

drop function if exists public.delete_question_bank_atomic(uuid, text);

create or replace function public.delete_question_bank_atomic(
  p_bank_id uuid,
  p_course_id text,
  p_force boolean default false
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

  -- Liveness guard stays absolute — force never bypasses "this bank is in
  -- use by a class happening right now".
  if exists (
    select 1
    from public.class_question_plans plan
    join public.class_sessions session on session.id = plan.class_session_id
    where plan.question_bank_id = p_bank_id
      and session.state in ('open', 'live', 'paused', 'continued')
  ) then
    raise exception 'question_bank_in_use_by_live_class';
  end if;

  if p_force then
    -- Force mode: explicitly clear the two sets of rows genuinely protected
    -- by a real ON DELETE RESTRICT — student_responses against this bank's
    -- questions, and any pulse_rounds pointing at a checkpoint belonging to
    -- a plan built from this bank. Both are permanently, irreversibly
    -- destroyed by this branch.
    delete from public.pulse_rounds
      where plan_checkpoint_id in (
        select checkpoint.id
        from public.class_question_plan_checkpoints checkpoint
        join public.class_question_plans plan on plan.id = checkpoint.plan_id
        where plan.question_bank_id = p_bank_id
      );
    delete from public.student_responses
      where question_id in (
        select id from public.questions where question_bank_id = p_bank_id
      );
  end if;

  delete from public.class_question_plans
    where question_bank_id = p_bank_id;

  delete from public.question_banks
    where id = p_bank_id;
end;
$$;

revoke all on function public.delete_question_bank_atomic(uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.delete_question_bank_atomic(uuid, text, boolean)
  to service_role;
```

- [ ] **Step 2: Pass `p_force` from `deleteBank`**

In `/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/functions/course-question-bank/index.ts`, find `deleteBank`'s RPC call and change it:

Old:
```ts
  const { error: deleteError } = await db.rpc("delete_question_bank_atomic", {
    p_bank_id: bankId,
    p_course_id: courseId
  });
```

New:
```ts
  const { error: deleteError } = await db.rpc("delete_question_bank_atomic", {
    p_bank_id: bankId,
    p_course_id: courseId,
    p_force: Boolean(body.force)
  });
```

(`deleteBank` already receives `body: Record<string, unknown>` directly as a parameter — no signature change needed, unlike the session case.)

- [ ] **Step 3: `deno check` and verifier sweep**

Run:
```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io"
deno check supabase/functions/course-question-bank/index.ts
node tools/verify-slide-checkpoints.mjs
```
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io"
git add supabase/migrations/0038_force_delete.sql supabase/functions/course-question-bank/index.ts
git commit -m "feat: add force-delete for a question bank's recorded student answers"
```

- [ ] **Step 5: Deploy — ask the user before running**

```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io"
npx supabase db push --include-all
npx supabase functions deploy course-question-bank
```

---

## Task 4: Force-delete backend — content item

**Files:**
- Modify: `supabase/functions/course-content-library/index.ts` (in `mzareei.github.io`)

**Interfaces:**
- Produces: `deleteContentItem`'s `input` type gains `force: boolean`; when `force` is true, the activity-history check is skipped. No SQL migration — nothing in this path is protected by a real Postgres restrict constraint (the check being skipped is application-level), and the release-visibility guard plus the `guard_content_item_delete` trigger are both untouched regardless of `force`.

- [ ] **Step 1: Extend `deleteContentItem`'s input type**

In `/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io/supabase/functions/course-content-library/index.ts`, change:

Old:
```ts
async function deleteContentItem(db: Db, courseId: string, input: {
  itemId: string;
  actorProfileId: string;
  permissions: ContentPermissions;
}) {
```

New:
```ts
async function deleteContentItem(db: Db, courseId: string, input: {
  itemId: string;
  actorProfileId: string;
  force: boolean;
  permissions: ContentPermissions;
}) {
```

- [ ] **Step 2: Skip the activity-history check when `force`**

Still in `deleteContentItem`, change:

Old:
```ts
  // course-class-quiz's ensureTemplateAndItem creates/reuses an
  // activity_templates row for this content item every time an end-of-class
  // quiz runs against it — the live, primary end-of-class quiz path, not
  // dead schema. A lecture taught weeks ago with its release long since
  // closed can still have real graded activity_instances (and, beneath
  // them, student_attempts/student_responses) sitting behind it. All four
  // cascade ON DELETE CASCADE from content_items, so without this guard the
  // delete above would silently wipe graded quiz history. Refuse on ANY
  // activity_instances at all, regardless of the instance's own state —
  // same blanket-refusal shape as the pulse_rounds guard on session delete.
  const { data: templates, error: templatesError } = await db
    .from("activity_templates")
    .select("id")
    .eq("content_item_id", existing.id);
  if (templatesError) throw templatesError;

  if ((templates || []).length) {
    const { count: instanceCount, error: instanceError } = await db
      .from("activity_instances")
      .select("id", { count: "exact", head: true })
      .in("activity_template_id", templates.map((template) => template.id));
    if (instanceError) throw instanceError;
    if ((instanceCount || 0) > 0) {
      throw new Error("content_item_has_activity_history");
    }
  }
```

New:
```ts
  // course-class-quiz's ensureTemplateAndItem creates/reuses an
  // activity_templates row for this content item every time an end-of-class
  // quiz runs against it — the live, primary end-of-class quiz path, not
  // dead schema. A lecture taught weeks ago with its release long since
  // closed can still have real graded activity_instances (and, beneath
  // them, student_attempts/student_responses) sitting behind it. All four
  // cascade ON DELETE CASCADE from content_items — none of this is a real
  // Postgres restrict, so force mode simply skips the check below and lets
  // the existing cascade run; nothing extra needs pre-deleting first (unlike
  // the bank force-delete path, which has a real restrict to clear).
  if (!input.force) {
    const { data: templates, error: templatesError } = await db
      .from("activity_templates")
      .select("id")
      .eq("content_item_id", existing.id);
    if (templatesError) throw templatesError;

    if ((templates || []).length) {
      const { count: instanceCount, error: instanceError } = await db
        .from("activity_instances")
        .select("id", { count: "exact", head: true })
        .in("activity_template_id", templates.map((template) => template.id));
      if (instanceError) throw instanceError;
      if ((instanceCount || 0) > 0) {
        throw new Error("content_item_has_activity_history");
      }
    }
  }
```

- [ ] **Step 3: Pass `force` from the dispatcher**

In the same file, change the `delete_content_item` dispatcher block:

Old:
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

New:
```ts
    if (body.action === "delete_content_item") {
      const itemId = cleanOptionalUuid(body.content_item_id);
      if (!itemId) throw new Error("content_item_id_required");
      const result = await deleteContentItem(db, courseId, {
        itemId,
        actorProfileId: String(profile.id),
        force: Boolean(body.force),
        permissions
      });
      return json(result);
    }
```

- [ ] **Step 4: `deno check`**

Run: `cd "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io" && deno check supabase/functions/course-content-library/index.ts`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io"
git add supabase/functions/course-content-library/index.ts
git commit -m "feat: add force-delete for a content item's recorded quiz history"
```

- [ ] **Step 6: Deploy — ask the user before running**

```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/mzareei.github.io"
npx supabase functions deploy course-content-library
```

---

## Task 5: Shared force-delete UI component

**Files:**
- Create: `src/components/ForceDeleteControl.tsx` (in `course-platform`)
- Modify: `src/i18n/strings.ts` (in `course-platform`)

**Interfaces:**
- Produces: `ForceDeleteControl({ busy, warningKey, onConfirm }: { busy: boolean; warningKey: StringKey; onConfirm: () => void })` — a self-contained, closed/open toggle: closed shows a "Delete anyway" trigger button; open shows the warning text, a text input, and a `btn danger` confirm button disabled until the typed value case-insensitively equals `DELETE`. Consumed by Tasks 6, 7, 8.

- [ ] **Step 1: Add the shared i18n strings**

In `/Users/mzareei/Documents/GitHub/Tec Hub/course-platform/src/i18n/strings.ts`, find the `"content.cancel"` entry and add these four new keys directly after it:

```ts
  "forceDelete.trigger": ["Delete anyway", "Eliminar de todos modos"],
  "forceDelete.placeholder": ["Type DELETE to confirm", "Escribe DELETE para confirmar"],
  "forceDelete.confirm": ["Permanently delete", "Eliminar permanentemente"],
  "forceDelete.cancel": ["Cancel", "Cancelar"],
```

- [ ] **Step 2: Write the component**

Create `/Users/mzareei/Documents/GitHub/Tec Hub/course-platform/src/components/ForceDeleteControl.tsx`:

```tsx
// A deliberately heavy-friction confirm step for bypassing a
// historical-activity delete refusal. Never rendered for any other kind of
// refusal (currently-live, currently-released, active bank, wrong state,
// not found, not owned) — callers only show this when the failure they just
// saw is specifically the "has real recorded activity" kind for that entity.
import { useState } from "preact/hooks";
import { t } from "../i18n";
import type { StringKey } from "../i18n/strings";

export function ForceDeleteControl({
  busy,
  warningKey,
  onConfirm
}: {
  busy: boolean;
  warningKey: StringKey;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const ready = value.trim().toUpperCase() === "DELETE";

  if (!open) {
    return (
      <button
        class="btn quiet"
        type="button"
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        {t("forceDelete.trigger")}
      </button>
    );
  }

  return (
    <div class="stack" style="gap: 0.4rem;">
      <p class="error-text" role="alert">{t(warningKey)}</p>
      <input
        type="text"
        value={value}
        placeholder={t("forceDelete.placeholder")}
        onInput={(event) => setValue((event.target as HTMLInputElement).value)}
      />
      <div class="row">
        <button
          class="btn danger"
          type="button"
          disabled={busy || !ready}
          onClick={() => {
            setOpen(false);
            setValue("");
            onConfirm();
          }}
        >
          {t("forceDelete.confirm")}
        </button>
        <button
          class="btn quiet"
          type="button"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setValue("");
          }}
        >
          {t("forceDelete.cancel")}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck and verify**

Run:
```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform"
npm run typecheck
npm run verify
```
Expected: both exit 0. (No verifier currently references this new component; this step is confirming it compiles cleanly and doesn't break i18n coverage, not exercising its logic — Tasks 6-8 wire it into a real screen.)

- [ ] **Step 4: Commit**

```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform"
git add src/components/ForceDeleteControl.tsx src/i18n/strings.ts
git commit -m "feat: add shared type-DELETE-to-confirm force-delete control"
```

---

## Task 6: Force-delete frontend — class session

**Files:**
- Modify: `src/api/schedule.ts` (in `course-platform`)
- Modify: `src/components/Schedule.tsx` (in `course-platform`)
- Modify: `src/i18n/strings.ts` (in `course-platform`)

**Interfaces:**
- Consumes: `delete_session`'s `force` support (Task 2), `ForceDeleteControl` (Task 5).
- Produces: `deleteSession(sessionId, options?: { force?: boolean })` — a source-compatible signature change (existing single-argument call sites keep working, since the second parameter is optional).

- [ ] **Step 1: Add the warning string**

In `/Users/mzareei/Documents/GitHub/Tec Hub/course-platform/src/i18n/strings.ts`, find `"schedule.deleteFailed"` and add this key directly after it:

```ts
  "schedule.forceDeleteWarning": [
    "This will also permanently delete every recorded pulse-question round and answer for this class. There is no undo.",
    "Esto también eliminará permanentemente cada ronda y respuesta de preguntas en vivo registrada para esta clase. No hay forma de deshacerlo."
  ],
```

- [ ] **Step 2: Extend `deleteSession`'s signature**

In `/Users/mzareei/Documents/GitHub/Tec Hub/course-platform/src/api/schedule.ts`, change:

Old:
```ts
export function deleteSession(sessionId: string) {
  return callFn<{ deleted: true; sessions: ClassSession[] }>("course-session-management", {
    action: "delete_session",
    session_id: sessionId
  });
}
```

New:
```ts
export function deleteSession(sessionId: string, options: { force?: boolean } = {}) {
  return callFn<{ deleted: true; sessions: ClassSession[] }>("course-session-management", {
    action: "delete_session",
    session_id: sessionId,
    force: Boolean(options.force)
  });
}
```

- [ ] **Step 3: Track which session's last delete failed for the activity-history reason, and let `onDelete` take a force flag**

In `/Users/mzareei/Documents/GitHub/Tec Hub/course-platform/src/components/Schedule.tsx`, add the import:

Old:
```tsx
import { ClassSession } from "./StatusPill";
```
(That import doesn't actually exist verbatim — instead, find the existing `import { StatusPill } from "./StatusPill";` line and add the new component import right after it:)

```tsx
import { StatusPill } from "./StatusPill";
import { ForceDeleteControl } from "./ForceDeleteControl";
```

Add a new state declaration right after `const [busy, setBusy] = useState<string | null>(null);`:

```ts
  const [forceDeleteSessionId, setForceDeleteSessionId] = useState<string | null>(null);
```

Change `onDelete`:

Old:
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

New:
```ts
  async function onDelete(session: ClassSession, force = false) {
    if (!force && !confirm(t("schedule.deleteConfirm", { title: session.title }))) return;
    setError(null);
    setNotice(null);
    setBusy(session.session_id);
    try {
      await deleteSession(session.session_id, { force });
      setNotice(t("schedule.deleted", { title: session.title }));
      setForceDeleteSessionId(null);
      await load();
      await refreshContext();
    } catch (e) {
      const message = e instanceof Error ? e.message : t("schedule.deleteFailed");
      setError(message);
      setForceDeleteSessionId(
        message.includes("recorded live-question activity") ? session.session_id : null
      );
    } finally {
      setBusy(null);
    }
  }
```

- [ ] **Step 4: Render the force-delete control**

Still in `Schedule.tsx`, the table currently renders an extra `<tr>` for `SessionEditor` when `editingSessionId === session.session_id`, right after the main row. Add a second, similar conditional extra row for the force-delete control, right after that existing block:

Old:
```tsx
                    {editingSessionId === session.session_id ? (
                      <tr>
                        <td colSpan={6}>
                          <SessionEditor
                            session={session}
                            sections={sections}
                            lectures={lectures}
                            onSaved={(saved) => void onSessionSaved(saved)}
                            onCancel={() => setEditingSessionId(null)}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </>
                );
              })}
```

New:
```tsx
                    {editingSessionId === session.session_id ? (
                      <tr>
                        <td colSpan={6}>
                          <SessionEditor
                            session={session}
                            sections={sections}
                            lectures={lectures}
                            onSaved={(saved) => void onSessionSaved(saved)}
                            onCancel={() => setEditingSessionId(null)}
                          />
                        </td>
                      </tr>
                    ) : null}
                    {forceDeleteSessionId === session.session_id ? (
                      <tr>
                        <td colSpan={6}>
                          <ForceDeleteControl
                            busy={busy === session.session_id}
                            warningKey="schedule.forceDeleteWarning"
                            onConfirm={() => void onDelete(session, true)}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </>
                );
              })}
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
git add src/api/schedule.ts src/components/Schedule.tsx src/i18n/strings.ts
git commit -m "feat: offer force-delete when a class day's normal delete is refused for pulse activity"
```

---

## Task 7: Force-delete frontend — question bank

**Files:**
- Modify: `src/api/checkpoints.ts` (in `course-platform`)
- Modify: `src/components/QuestionBanks.tsx` (in `course-platform`)
- Modify: `src/i18n/strings.ts` (in `course-platform`)

**Interfaces:**
- Consumes: `delete_bank`'s `force` support (Task 3), `ForceDeleteControl` (Task 5).
- Produces: `deleteBank(questionBankId, options?: { force?: boolean })` — source-compatible signature change.

- [ ] **Step 1: Add the warning string**

In `/Users/mzareei/Documents/GitHub/Tec Hub/course-platform/src/i18n/strings.ts`, find `"content.banks.deleteBankFailed"` and add this key directly after it:

```ts
  "content.banks.forceDeleteWarning": [
    "This will also permanently delete every recorded student answer for this bank's questions. There is no undo.",
    "Esto también eliminará permanentemente cada respuesta de estudiante registrada para las preguntas de este banco. No hay forma de deshacerlo."
  ],
```

- [ ] **Step 2: Extend `deleteBank`'s signature**

In `/Users/mzareei/Documents/GitHub/Tec Hub/course-platform/src/api/checkpoints.ts`, change:

Old:
```ts
export function deleteBank(questionBankId: string) {
  return callFn<{ question_bank_id: string; deleted: boolean }>(
    "course-question-bank",
    { action: "delete_bank", question_bank_id: questionBankId }
  );
}
```

New:
```ts
export function deleteBank(questionBankId: string, options: { force?: boolean } = {}) {
  return callFn<{ question_bank_id: string; deleted: boolean }>(
    "course-question-bank",
    { action: "delete_bank", question_bank_id: questionBankId, force: Boolean(options.force) }
  );
}
```

- [ ] **Step 3: Let `remove` take a force flag and track whether to offer force-delete**

In `/Users/mzareei/Documents/GitHub/Tec Hub/course-platform/src/components/QuestionBanks.tsx`, add the import:

Old:
```tsx
import { QuestionBankReview } from "./QuestionBankReview";
```

New:
```tsx
import { QuestionBankReview } from "./QuestionBankReview";
import { ForceDeleteControl } from "./ForceDeleteControl";
```

Add a new state declaration in `QuestionBankCard`, right after `const [deleteError, setDeleteError] = useState<string | null>(null);`:

```ts
  const [forceDelete, setForceDelete] = useState(false);
```

Change `remove`:

Old:
```ts
  async function remove() {
    if (!confirm(t("content.banks.deleteBankConfirm", { title: bank.content_title || bank.title, count: bank.total }))) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteBank(bank.bank_id);
      try {
        await onRefresh();
      } catch {
        // The bank is already deleted server-side; refresh is best effort.
      }
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : t("content.banks.deleteBankFailed"));
      setDeleting(false);
    }
  }
```

New:
```ts
  async function remove(force = false) {
    if (!force && !confirm(t("content.banks.deleteBankConfirm", { title: bank.content_title || bank.title, count: bank.total }))) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteBank(bank.bank_id, { force });
      setForceDelete(false);
      try {
        await onRefresh();
      } catch {
        // The bank is already deleted server-side; refresh is best effort.
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t("content.banks.deleteBankFailed");
      setDeleteError(message);
      setForceDelete(message.includes("recorded student answers or live question history"));
      setDeleting(false);
    }
  }
```

- [ ] **Step 4: Render the force-delete control**

Still in `QuestionBanks.tsx`, find where `deleteError` is rendered:

Old:
```tsx
      {deleteError ? (
        <p class="error-text" role="alert">{deleteError}</p>
      ) : null}
```

New:
```tsx
      {deleteError ? (
        <p class="error-text" role="alert">{deleteError}</p>
      ) : null}

      {forceDelete ? (
        <ForceDeleteControl
          busy={deleting}
          warningKey="content.banks.forceDeleteWarning"
          onConfirm={() => void remove(true)}
        />
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
git commit -m "feat: offer force-delete when a bank's normal delete is refused for recorded answers"
```

---

## Task 8: Force-delete frontend — content item

**Files:**
- Modify: `src/api/content.ts` (in `course-platform`)
- Modify: `src/components/ContentLibrary.tsx` (in `course-platform`)
- Modify: `src/i18n/strings.ts` (in `course-platform`)

**Interfaces:**
- Consumes: `delete_content_item`'s `force` support (Task 4), `ForceDeleteControl` (Task 5), `content_item_has_activity_history`'s existing translated message (already present from earlier work — no new detection plumbing needed, see Step 3).
- Produces: `deleteContentItem(contentItemId, options?: { force?: boolean })` — source-compatible signature change.

- [ ] **Step 1: Add the warning string**

In `/Users/mzareei/Documents/GitHub/Tec Hub/course-platform/src/i18n/strings.ts`, find `"content.library.content_item_has_activity_history"` and add this key directly after its closing `],`:

```ts
  "content.library.forceDeleteWarning": [
    "This will also permanently delete every recorded end-of-class quiz attempt and answer for this item. There is no undo.",
    "Esto también eliminará permanentemente cada intento y respuesta del cuestionario de fin de clase registrado para este material. No hay forma de deshacerlo."
  ],
```

- [ ] **Step 2: Extend `deleteContentItem`'s signature**

In `/Users/mzareei/Documents/GitHub/Tec Hub/course-platform/src/api/content.ts`, change:

Old:
```ts
export function deleteContentItem(contentItemId: string) {
  return callFn<{ content_item_id: string; deleted: boolean }>("course-content-library", {
    action: "delete_content_item",
    content_item_id: contentItemId
  });
}
```

New:
```ts
export function deleteContentItem(contentItemId: string, options: { force?: boolean } = {}) {
  return callFn<{ content_item_id: string; deleted: boolean }>("course-content-library", {
    action: "delete_content_item",
    content_item_id: contentItemId,
    force: Boolean(options.force)
  });
}
```

- [ ] **Step 3: Detect the activity-history failure and add the force-delete control — both card locations**

`ContentLibrary.tsx` has two places a content item's Delete button appears after Task 1: the reviewable-items card loop, and the new unmanaged-items section. Both already compute a `failure` variable from `itemError[item.id]` (the reviewable loop calls it `failure`; the unmanaged loop from Task 1 also calls it `failure` — read the current file to confirm both names, they should already match since Task 1 was written to mirror the existing pattern). In both places, `run()` already resolves a `content_item_has_activity_history` `ApiError` to the exact string `t("content.library.content_item_has_activity_history")` before storing it in `itemError` — so detecting this specific failure needs no new state, just a comparison against that same translated string.

Import `ForceDeleteControl` in `ContentLibrary.tsx`:

Old:
```tsx
import { PublicLinkCleanup } from "./PublicLinkCleanup";
```

New:
```tsx
import { PublicLinkCleanup } from "./PublicLinkCleanup";
import { ForceDeleteControl } from "./ForceDeleteControl";
```

**In the reviewable-items card loop**, find where `failure` is rendered at the end of each card:

Old:
```tsx
            {failure ? <p class="error-text" role="alert">{failure}</p> : null}
          </div>
        );
      })}
```

New:
```tsx
            {failure ? <p class="error-text" role="alert">{failure}</p> : null}
            {failure === t("content.library.content_item_has_activity_history") ? (
              <ForceDeleteControl
                busy={busy === item.id}
                warningKey="content.library.forceDeleteWarning"
                onConfirm={() => void run(item.id, async () => {
                  await deleteContentItem(item.id, { force: true });
                  setNotice(t("content.library.deleted", { title: item.title }));
                  await refreshContext();
                }, t("content.library.deleteFailed"))}
              />
            ) : null}
          </div>
        );
      })}
```

**In the unmanaged-items section added by Task 1**, apply the same pattern to its own `failure` rendering:

Old (from Task 1's Step 3):
```tsx
                  {failure ? <p class="error-text" role="alert">{failure}</p> : null}
                </div>
              </div>
            );
          })}
```

New:
```tsx
                  {failure ? <p class="error-text" role="alert">{failure}</p> : null}
                  {failure === t("content.library.content_item_has_activity_history") ? (
                    <ForceDeleteControl
                      busy={busy === item.id}
                      warningKey="content.library.forceDeleteWarning"
                      onConfirm={() => void run(item.id, async () => {
                        await deleteContentItem(item.id, { force: true });
                        setNotice(t("content.library.deleted", { title: item.title }));
                        await refreshContext();
                      }, t("content.library.deleteFailed"))}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
```

- [ ] **Step 4: Typecheck and verify**

Run:
```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform"
npm run typecheck
npm run verify
```
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
cd "/Users/mzareei/Documents/GitHub/Tec Hub/course-platform"
git add src/api/content.ts src/components/ContentLibrary.tsx src/i18n/strings.ts
git commit -m "feat: offer force-delete when a content item's normal delete is refused for quiz history"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers the design's "Unmanaged items section" in full. Tasks 2-4 cover each entity's backend force-delete semantics, including the explicit "force bypasses history, never bypasses right-now" table from the spec — confirmed no task touches a currently-live/currently-released guard or the `guard_content_item_delete` trigger. Tasks 5-8 cover the shared UI and its three wire-ups, including the spec's exact confirmation copy per entity.
- **Type/name consistency checked across tasks:** `p_force`/`force` spelled identically across every migration, RPC call, and API export. `ForceDeleteControl`'s `warningKey` prop values (`schedule.forceDeleteWarning`, `content.banks.forceDeleteWarning`, `content.library.forceDeleteWarning`) match the exact i18n keys each task adds. The activity-detection substrings in Tasks 6-7 (`"recorded live-question activity"`, `"recorded student answers or live question history"`) are copied verbatim from the existing, already-shipped backend messages in `course-session-management`/`course-question-bank` — not re-invented.
- **Task 8 depends on Task 1's exact output**, since both touch `ContentLibrary.tsx` and Task 8's Step 3 edits code Task 1's Step 3 introduces (the unmanaged section's `failure` rendering). Execute in numeric order for this reason, not just for the general backend-before-frontend dependency each entity already has.
- **No placeholders:** every step shows complete, exact code.
