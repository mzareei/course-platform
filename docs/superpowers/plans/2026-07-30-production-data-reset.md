# Production Data Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every historical or QA course-operation record from production while preserving TC2007B teaching assets, the platform owner, and four clean semester groups.

**Architecture:** Migration 0030 installs a locked SQL reset function whose preview mode is read-only and whose execute mode validates one retained owner, fingerprints reusable assets, deletes personal and operational data, recreates the clean group structure, and asserts the final state. After all application QA is complete, migration 0031 invokes that function once and drops it in the same migration transaction; a failed assertion rolls back the reset.

**Tech Stack:** PostgreSQL/Supabase migrations, Node verifier scripts, Supabase CLI, Vite + Preact production browser rehearsal.

## Global Constraints

- Preserve course id `tc2007b`; normalize code to `TC2007B`, title to `Information Security`, and term label to `Current semester`.
- Preserve content items, storage objects, activity templates, current question banks/questions/options, content uploads/generation jobs, and the legacy lecture/question library.
- Preserve exactly one active platform-owner profile and its authentication account.
- Deliver exactly Groups 401, 402, 501, and 502; Group 401 is Active with the owner as instructor, and the other three groups are Planned with no staff or students.
- Delete every student/QA identity and authentication account plus all classes, releases, assessment activity, grades, reflections, notes, roster/import, external-access, and audit history.
- Run the destructive reset only after all feature deployment and signed-in QA are complete.
- Never print or export personal row contents; use counts and fingerprints only.
- Any failed reset precondition or postcondition must roll back the entire migration.

---

### Task 1: Guarded reset function and verifier

**Files:**
- Create: backend `supabase/migrations/0030_prepare_clean_platform_reset.sql`
- Create: backend `tools/verify-clean-platform-reset.mjs`
- Modify: frontend `docs/06-runbook.md`
- Modify: frontend `docs/07-pitfalls.md`

**Interfaces:**
- Produces: `public.clean_tc2007b_platform(p_execute boolean) returns jsonb`
- Preview contract: `select public.clean_tc2007b_platform(false)` returns count-only preflight JSON and performs no DML.
- Execute contract: `select public.clean_tc2007b_platform(true)` returns count-only retained/deleted postconditions or raises an exception, rolling back the caller's transaction.
- Only the database owner/service role may execute the function.

- [ ] **Step 1: Write the failing verifier**

Create `tools/verify-clean-platform-reset.mjs`. It must read migration 0030 and
assert all of these literal contracts:

```js
assert.match(sql, /clean_tc2007b_platform\\(p_execute boolean\\)/i);
assert.match(sql, /p_execute is false/i);
assert.match(sql, /exactly one active TC2007B platform owner/i);
assert.match(sql, /delete from auth\\.users/i);
assert.match(sql, /where id <> owner_auth_user_id/i);
assert.match(sql, /'401'.*'Group 401'.*'active'/is);
assert.match(sql, /'402'.*'Group 402'.*'planned'/is);
assert.match(sql, /'501'.*'Group 501'.*'planned'/is);
assert.match(sql, /'502'.*'Group 502'.*'planned'/is);
assert.match(sql, /insert into public\\.course_memberships/is);
assert.match(sql, /'platform_owner'/i);
assert.match(sql, /'instructor'/i);
assert.match(sql, /insert into public\\.section_enrollments/is);
assert.match(sql, /retained asset fingerprint changed/i);
assert.match(sql, /historical rows remain after reset/i);
assert.match(sql, /revoke all on function public\\.clean_tc2007b_platform/i);
```

The verifier must also assert that the retained table list includes:

```text
content_items
activity_templates
question_banks
questions
question_options
content_uploads
generation_jobs
quiz_courses
quiz_lectures
quiz_questions
quiz_options
```

and that the zero-row list includes every operational table named in the
approved reset specification.

- [ ] **Step 2: Run the verifier and confirm RED**

Run:

```bash
node tools/verify-clean-platform-reset.mjs
```

Expected: failure because migration 0030 does not exist.

- [ ] **Step 3: Implement migration 0030**

Create a `security definer` PL/pgSQL function with:

```sql
create or replace function public.clean_tc2007b_platform(p_execute boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
```

Inside the function:

1. Resolve exactly one active `platform_owner` membership for course
   `tc2007b`; require a non-null linked `auth_user_id`.
2. Build a deterministic JSON fingerprint from counts plus MD5 hashes of
   ordered identifiers for all retained tables.
3. Return the owner count, auth-user count, operational counts, and retained
   fingerprint immediately when `p_execute is false`.
4. When executing, delete in foreign-key-safe order:

```text
quiz_answers → quiz_attempt_questions → quiz_attempts → quiz_sessions
grade_adjustments → gradebook_scores → gradebook_items → gradebook_categories
student_responses → student_attempts → activity_instances
pulse_answers → pulse_rounds
class_student_notes → exit_tickets → portfolio_entries
participation_events → release_events → content_releases
course_exit_tickets → course_portfolio_submissions
profile_identity_confirmations → external_access_grants → roster_imports
class_sessions → section_enrollments → course_sections
audit_log
```

5. Delete all course memberships, then all profiles except the retained owner.
6. Delete every `auth.users` row except the retained owner's auth user.
7. Normalize TC2007B and the legacy `quiz_courses` title to
   `TC2007B Question Library`; remove any other course row only after asserting
   no retained asset references another course.
8. Insert the owner's `platform_owner` and `instructor` memberships.
9. Insert Groups 401, 402, 501, and 502 with fresh UUIDs and the approved
   names/statuses, then enroll the owner as instructor in Group 401.
10. Recompute and compare the retained fingerprint.
11. Assert exact final counts: 1 course, 1 profile, 2 course memberships,
    4 groups, 1 section enrollment, and zero rows in every historical table.

End the migration with:

```sql
revoke all on function public.clean_tc2007b_platform(boolean)
  from public, anon, authenticated;
grant execute on function public.clean_tc2007b_platform(boolean)
  to service_role;
```

- [ ] **Step 4: Run focused verification**

Run:

```bash
node tools/verify-clean-platform-reset.mjs
npx --yes deno check supabase/functions/course-auth-context/index.ts
git diff --check
```

Expected: verifier prints `verify-clean-platform-reset: OK`; Deno and diff
checks exit 0.

- [ ] **Step 5: Document the staged safety procedure**

Add exact preview, execute, rollback-on-error, and post-count commands to
`docs/06-runbook.md`. Add a pitfall stating that deleting the TC2007B course
would cascade into retained content/question banks, so the technical course row
must be normalized rather than deleted.

- [ ] **Step 6: Commit**

Backend:

```bash
git add supabase/migrations/0030_prepare_clean_platform_reset.sql tools/verify-clean-platform-reset.mjs
git commit -m "feat: prepare guarded production data reset"
```

Frontend:

```bash
git add docs/06-runbook.md docs/07-pitfalls.md
git commit -m "docs: add clean platform reset runbook"
```

---

### Task 2: Stage, preview, and execute the final reset

**Files:**
- Create: backend `supabase/migrations/0031_execute_clean_platform_reset.sql`
- Modify: backend `tools/verify-clean-platform-reset.mjs`
- Create: frontend `.superpowers/sdd/2026-07-30-production-data-reset/reset-report.md` (git-ignored evidence)

**Interfaces:**
- Consumes: `public.clean_tc2007b_platform(boolean)` from Task 1.
- Produces: production migration history entry 0031 and no persistent reset function.

- [ ] **Step 1: Confirm all feature QA is finished**

Require written evidence that Plans 1–3 passed their whole-branch reviews,
Cloudflare and Supabase deployments, professor rehearsal, student Today → Join
class flow, projector/controller flow, question timing, combined grade, podium,
reflection, private notes, and cleanup checks. Stop if any feature QA remains.

- [ ] **Step 2: Capture count-only pre-reset evidence**

Run the exact public-table count query from the reset runbook and record only
table names/counts in `reset-report.md`. Record retained fingerprint/counts from:

```sql
select public.clean_tc2007b_platform(false);
```

Do not record names, emails, student identifiers, answers, grades, or notes.

- [ ] **Step 3: Write the failing execution-migration assertions**

Extend the verifier to require migration 0031 to contain:

```js
assert.match(executeSql, /select public\\.clean_tc2007b_platform\\(true\\)/i);
assert.match(executeSql, /drop function public\\.clean_tc2007b_platform\\(boolean\\)/i);
```

Run the verifier and confirm it fails because migration 0031 is absent.

- [ ] **Step 4: Create migration 0031**

Create:

```sql
do $$
declare
  reset_result jsonb;
begin
  select public.clean_tc2007b_platform(true) into reset_result;
  raise notice 'TC2007B clean reset complete: %', reset_result;
end
$$;

drop function public.clean_tc2007b_platform(boolean);
```

The migration runner's transaction makes the reset and function removal atomic.

- [ ] **Step 5: Verify and commit migration 0031**

Run:

```bash
node tools/verify-clean-platform-reset.mjs
git diff --check
git add supabase/migrations/0031_execute_clean_platform_reset.sql tools/verify-clean-platform-reset.mjs
git commit -m "ops: execute clean production data reset"
```

- [ ] **Step 6: Push migration 0030 only and preview**

Before migration 0031 exists on the pushed branch, apply 0030:

```bash
npx supabase db push --include-all --yes
npx supabase db query --linked "select public.clean_tc2007b_platform(false);"
```

Compare the returned retained counts/fingerprint with Step 2. Stop if the owner
count is not exactly one or any retained table is unexpectedly empty.

- [ ] **Step 7: Apply migration 0031**

Push the reviewed backend commit and run:

```bash
npx supabase db push --include-all --yes
```

Expected: migration 0031 applies and emits the count-only completion notice.
Record the exact output in `reset-report.md`.

- [ ] **Step 8: Prove database postconditions**

Run count-only queries and require:

```text
courses=1
profiles=1
course_memberships=2
course_sections=4
section_enrollments=1
auth.users=1
```

Require zero in every operational/history table from Task 1. Require retained
asset counts and identifier fingerprints to match the pre-reset result.

---

### Task 3: Signed-in clean-state rehearsal and durable handoff

**Files:**
- Modify: frontend `docs/04-decisions.md`
- Modify: frontend `docs/05-status.md`
- Modify: frontend `docs/06-runbook.md`
- Modify: frontend `docs/07-pitfalls.md`
- Modify: frontend `.superpowers/sdd/2026-07-30-production-data-reset/reset-report.md`

**Interfaces:**
- Consumes: clean production database from Task 2.
- Produces: verified clean live platform and durable count-only evidence.

- [ ] **Step 1: Verify professor access through the real entry point**

Sign in at the production alias as the retained professor. Verify TC2007B
loads without a testing-mode bypass and the instructor shell opens.

- [ ] **Step 2: Verify clean groups and empty operational screens**

Verify Classes shows exactly Groups 401, 402, 501, and 502 with approved
statuses. Verify:

```text
401: owner assigned, no students, no classes
402: no staff, no students, no classes
501: no staff, no students, no classes
502: no staff, no students, no classes
```

People must show no students. Gradebook must show no grade history, attempts, or
notes. Content must show no Review release. Today must show no scheduled class.

- [ ] **Step 3: Verify retained assets through real UI paths**

From Content, open at least one retained lecture preview through the real gated
content route and confirm deck navigation works. Open the question-bank surface
used by Run Class and confirm retained banks/questions are available without
creating a class, release, attempt, or grade.

- [ ] **Step 4: Verify removed-account denial**

Use one removed QA/student credential in a separate clean browser origin. It
must receive no course profile/membership and must not reach Today, Review,
Grades, or Live course data.

- [ ] **Step 5: Re-run count postconditions**

Repeat Task 2's count-only query after browser verification. The browser checks
must not have recreated student, class, release, attempt, grade, or note rows.

- [ ] **Step 6: Update durable docs**

Record only verified facts and count-only evidence. State clearly that teaching
assets and one owner were retained, all historical personal/operational data
was destroyed, four clean groups were created, and the operation is not
recoverable from the live database.

- [ ] **Step 7: Run final repository gates and commit**

Frontend:

```bash
npm run typecheck
COURSE_PLATFORM_BACKEND_ROOT=/private/tmp/mzareei-coherent-lifecycle npm run verify
npm run build
git diff --check
git add docs/04-decisions.md docs/05-status.md docs/06-runbook.md docs/07-pitfalls.md
git commit -m "docs: record clean production delivery"
```

Backend:

```bash
node tools/verify-clean-platform-reset.mjs
npx --yes deno check supabase/functions/course-auth-context/index.ts
git diff --check
```
