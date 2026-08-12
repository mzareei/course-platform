# Pause, Resume, and Day-Based Attendance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the professor pause a class he could not finish and resume it in the next session, with attendance recorded per day and engagement and grades still calculated per class.

**Architecture:** The session state machine already supports `live → paused → live`, and only `closed` creates the review release and posts the grade — so a paused class is already absent from Review and already ungraded. The work is a migration that lets `class_attendance` hold one row per student **per day** rather than per class, the five call sites that assume the old shape, and the buttons and student-facing screens that never existed.

**Tech Stack:** Postgres migrations via `npx supabase db push`, Supabase Edge Functions in Deno, Vite + TypeScript + Preact SPA, Node 26 verifier scripts.

**Source spec:** `docs/superpowers/specs/2026-08-12-first-class-session-fixes-design.md`, section 6.

**Run after:** `docs/superpowers/plans/2026-08-12-first-class-session-bug-fixes.md`. That plan fixes defects the next class needs; this one adds a capability. Task 3 there also edits `course-auth-context`'s `loadStudentSessions`, which Task 5 here reads.

## Global Constraints

- **Two repos.** SPA: `~/Documents/GitHub/Tec Hub/course-platform`. Backend: `~/Documents/GitHub/Tec Hub/mzareei.github.io`. Paths are SPA-relative unless stated.
- **Migration before function.** Apply the migration with `npx supabase db push` and confirm with `npx supabase migration list --linked` **before** deploying any edge function that depends on it. A successful function deploy proves packaging, not that its database contract exists (pitfall #39).
- **Never rewrite a migration that reached production.** `0041` is deployed history. Change it with a new migration.
- **Every user-facing string is EN + ES** in `src/i18n/strings.ts`. `tools/verify-i18n.mjs` enforces it.
- **Class timezone is `America/Monterrey`.** "Which day was this" is always that zone, never the server's UTC and never the browser's.
- **The browser never queries a table.** Edge functions only.
- **`npm run typecheck && npm run verify` before every SPA commit.**

## Product rules this plan implements

Stated by the professor on 2026-08-12:

- **Attendance is per day.** A class taught across two days produces two attendance records for a student who came both days, and one for a student who came to either.
- **Engagement and grading stay per class.** They already key on `class_session_id`, which a pause does not change.
- **A resumed half and a brand-new lecture can share one day.**
- **Students rescan on the resumed day** — that scan is what records presence for that day.

---

### Task 1: `class_attendance` can hold a student twice, on different days

Its unique constraint is `(class_session_id, profile_id)` — one row per student per class, which cannot express "present on both days". Everything else in this plan depends on this.

**Files (backend repo):**
- Create: `supabase/migrations/0048_attendance_by_day.sql`

**Interfaces:**
- Produces: `class_attendance.attendance_date date not null`, and the unique constraint `class_attendance_session_profile_day_key (class_session_id, profile_id, attendance_date)`. The old `(class_session_id, profile_id)` unique is gone; **every `onConflict` string naming those two columns breaks until Task 2**, which is why Task 2 must land before anything is deployed.

- [ ] **Step 1: Confirm the constraint's real name before dropping it**

```bash
cd ~/Documents/GitHub/Tec\ Hub/mzareei.github.io
grep -n "unique (class_session_id, profile_id)" supabase/migrations/0041_class_attendance_and_grading.sql
```

The constraint is declared inline, so Postgres named it `class_attendance_class_session_id_profile_id_key`. The migration below drops it by that name with `if exists`, and fails loudly rather than silently if reality differs.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/0048_attendance_by_day.sql`:

```sql
-- Attendance is a day, not a class.
--
-- A lecture the professor pauses today and finishes next week is one class with
-- one grade, but two days in a room. 0041 keyed attendance one row per student
-- per class, which cannot say that: the second day's scan hit the unique
-- constraint and was discarded as a duplicate of the first.
--
-- Engagement and grading are unaffected and stay per class — they key on
-- class_session_id, which a pause does not change.
--
-- The date is written by the caller rather than generated, because
-- `timestamptz at time zone 'America/Monterrey'` is STABLE, not IMMUTABLE, and
-- a generated column requires IMMUTABLE. The default covers any writer that
-- forgets; every real writer sets it explicitly from the same shared helper.

alter table public.class_attendance
  add column if not exists attendance_date date;

alter table public.class_attendance
  alter column attendance_date
  set default (now() at time zone 'America/Monterrey')::date;

-- Every existing row keeps exactly the meaning it already had: the day it was
-- actually scanned, in the timezone the class happens in.
update public.class_attendance
   set attendance_date = (checked_in_at at time zone 'America/Monterrey')::date
 where attendance_date is null;

alter table public.class_attendance
  alter column attendance_date set not null;

-- 0041's inline `unique (class_session_id, profile_id)`. Dropping it is what
-- allows a second day; the replacement keeps every other guarantee it gave.
alter table public.class_attendance
  drop constraint if exists class_attendance_class_session_id_profile_id_key;

-- First scan of the day still wins: a re-scan after a page reload collides here
-- and is discarded, so the recorded arrival time cannot drift later in the hour.
-- A scan on a different day is a different row, which is the whole point.
alter table public.class_attendance
  add constraint class_attendance_session_profile_day_key
  unique (class_session_id, profile_id, attendance_date);

create index if not exists class_attendance_session_day_idx
  on public.class_attendance (class_session_id, attendance_date);
```

- [ ] **Step 3: Apply it**

```bash
cd ~/Documents/GitHub/Tec\ Hub/mzareei.github.io && npx supabase db push
```

- [ ] **Step 4: Confirm it actually landed remotely**

```bash
npx supabase migration list --linked
```

Expected: `0048` appears on **both** the local and remote side. A local-only ledger entry is exactly the failure that produced pitfall #39.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0048_attendance_by_day.sql
git commit -m "Attendance is a day, so a class taught over two days records both"
```

---

### Task 2: Every reader and writer of attendance understands days

Five call sites assume one row per student per class. Left alone, `loadCheckInAt`'s `.maybeSingle()` throws on a student present twice, the `present` denominator double-counts them so auto-reveal's "everyone answered" can never fire, and both writers' `onConflict` strings name a constraint that no longer exists. This is pitfall #69's rule applied forward: find every path into the table, not just the one being changed.

**Files (backend repo):**
- Modify: `supabase/functions/_shared/attendance.ts`
- Modify: `supabase/functions/course-session-join/index.ts` (`recordCheckIn`, lines 94–125)
- Modify: `supabase/functions/course-class-record/index.ts` (`loadAttendance` ~line 297, and the `markPresent` upsert ~line 583)
- Modify: `supabase/functions/course-pulse/index.ts` (the `present` count, ~line 574)

**Interfaces:**
- Consumes: the constraint `class_attendance_session_profile_day_key` from Task 1.
- Produces, all from `_shared/attendance.ts`:
  - `CLASS_TIME_ZONE = "America/Monterrey"`
  - `classDateFor(iso?: string | Date): string` — the `YYYY-MM-DD` class day of an instant, in `CLASS_TIME_ZONE`. Defaults to now.
  - `loadCheckInAt(db, classSessionId, profileId): Promise<string | null>` — unchanged signature, now returns the **earliest** check-in across days.
  - `loadAttendanceDays(db, classSessionId, profileId): Promise<string[]>` — ascending dates.
  - `assertCheckedIn(db, classSessionId, profileId)` — unchanged signature and meaning.

- [ ] **Step 1: Add the day helper and fix the shared reader**

In `supabase/functions/_shared/attendance.ts`, add at the top after the existing header comment:

```ts
/**
 * Class days are Monterrey days. Not the server's UTC — a 7pm class is already
 * "tomorrow" in UTC, which would file an evening lecture under the wrong date —
 * and not the browser's, because a professor travelling must not relabel a day
 * the room already lived through.
 */
export const CLASS_TIME_ZONE = "America/Monterrey";

/** The `YYYY-MM-DD` class day an instant belongs to. */
export function classDateFor(iso?: string | Date): string {
  const at = iso ? new Date(iso) : new Date();
  // 'en-CA' formats as YYYY-MM-DD, which is the shape the date column wants.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CLASS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(at);
}
```

Replace the body of `loadCheckInAt` with:

```ts
export async function loadCheckInAt(
  // deno-lint-ignore no-explicit-any
  db: any,
  classSessionId: string,
  profileId: string
): Promise<string | null> {
  // A class taught over two days has two rows for a student who came to both,
  // so this can no longer be a maybeSingle() — that would throw on exactly the
  // student who attended most. The earliest scan is the one that answers
  // "when did they first join this class", which is what lateness is measured
  // from and what the live-screen gate needs.
  const { data, error } = await db
    .from("class_attendance")
    .select("checked_in_at")
    .eq("class_session_id", classSessionId)
    .eq("profile_id", profileId)
    .order("checked_in_at", { ascending: true })
    .limit(1);
  if (error) throw error;
  const first = (data || [])[0];
  return first ? String(first.checked_in_at) : null;
}

/** Every day this student was in the room for this class, ascending. */
export async function loadAttendanceDays(
  // deno-lint-ignore no-explicit-any
  db: any,
  classSessionId: string,
  profileId: string
): Promise<string[]> {
  const { data, error } = await db
    .from("class_attendance")
    .select("attendance_date")
    .eq("class_session_id", classSessionId)
    .eq("profile_id", profileId)
    .order("attendance_date", { ascending: true });
  if (error) throw error;
  return (data || []).map((row: { attendance_date: string }) => String(row.attendance_date));
}
```

`assertCheckedIn` is unchanged — it only asks whether *any* check-in exists, which is still the right gate.

- [ ] **Step 2: Fix the QR writer**

In `supabase/functions/course-session-join/index.ts`, add to the imports:

```ts
import { classDateFor } from "../_shared/attendance.ts";
```

In `recordCheckIn`, replace the existing-row lookup and the upsert with:

```ts
    const today = classDateFor();
    const { data: existing } = await db
      .from("class_attendance")
      .select("checked_in_at")
      .eq("class_session_id", session.id)
      .eq("profile_id", profileId)
      .eq("attendance_date", today)
      .maybeSingle();
    if (existing) return String(existing.checked_in_at);

    const checkedInAt = new Date().toISOString();
    const { error } = await db.from("class_attendance").upsert(
      {
        course_id: session.course_id,
        class_session_id: session.id,
        section_id: session.section_id,
        profile_id: profileId,
        checked_in_at: checkedInAt,
        attendance_date: today,
        source: "qr"
      },
      {
        onConflict: "class_session_id,profile_id,attendance_date",
        ignoreDuplicates: true
      }
    );
```

The `.maybeSingle()` here is now correct rather than dangerous: the new unique constraint guarantees at most one row per session, profile, **and day**.

Update this function's header comment — it currently says "one check-in per class". Replace that sentence with:

```
 * one check-in per class *day*: a student who re-scans after a page reload
 * keeps the arrival time they actually arrived at, and a class resumed on a
 * later day records that day separately.
```

- [ ] **Step 3: Fix the class record's reader and its Mark-present writer**

In `supabase/functions/course-class-record/index.ts`, add the import:

```ts
import { classDateFor } from "../_shared/attendance.ts";
```

Replace `loadAttendance` (~line 297) with:

```ts
// One entry per student, folding however many days they attended into the
// facts the table needs: when they first arrived, how they were recorded, and
// which days they were in the room.
async function loadAttendance(db: Db, sessionId: string) {
  const { data, error } = await db
    .from("class_attendance")
    .select("profile_id, checked_in_at, attendance_date, source, note")
    .eq("class_session_id", sessionId)
    .order("checked_in_at", { ascending: true });
  if (error) throw error;

  const byProfile = new Map<string, {
    checked_in_at: string;
    source: string;
    note: string | null;
    days: string[];
  }>();
  for (const row of data || []) {
    const key = String(row.profile_id);
    const existing = byProfile.get(key);
    if (existing) {
      existing.days.push(String(row.attendance_date));
      continue;
    }
    byProfile.set(key, {
      // Rows arrive oldest first, so the first one seen is the first arrival —
      // which is what lateness is measured against.
      checked_in_at: String(row.checked_in_at),
      source: String(row.source),
      note: row.note ? String(row.note) : null,
      days: [String(row.attendance_date)]
    });
  }
  return byProfile;
}
```

In the row builder inside `attendanceTable`, add after `check_in_note`:

```ts
      attendance_days: record?.days ?? [],
```

In `markPresent` (~line 583), replace the upsert with:

```ts
  const today = classDateFor();
  const { error } = await db.from("class_attendance").upsert(
    {
      course_id: session.course_id,
      class_session_id: session.id,
      section_id: session.section_id,
      profile_id: profileId,
      checked_in_at: new Date().toISOString(),
      attendance_date: today,
      source: "instructor",
      marked_by_profile_id: actorProfileId,
      note
    },
    {
      onConflict: "class_session_id,profile_id,attendance_date",
      ignoreDuplicates: true
    }
  );
```

- [ ] **Step 4: Fix the `present` denominator**

In `supabase/functions/course-pulse/index.ts`, add the import:

```ts
import { classDateFor, loadCheckInAt } from "../_shared/attendance.ts";
```

(`loadCheckInAt` is already imported — merge, do not duplicate the import line.)

Replace the `present` count (~line 574) with:

```ts
  // How many are in the room *today*. A class resumed on a second day has two
  // attendance rows for anyone who came to both, and counting them all would
  // make "everyone has answered" unreachable — which is the condition that
  // reveals a question without the professor leaving fullscreen.
  const { count: present } = await db
    .from("class_attendance")
    .select("id", { count: "exact", head: true })
    .eq("class_session_id", round.class_session_id)
    .eq("attendance_date", classDateFor());
```

- [ ] **Step 5: Prove no other path was missed**

```bash
cd ~/Documents/GitHub/Tec\ Hub/mzareei.github.io
grep -rn "class_attendance" supabase/functions/
grep -rn "class_session_id,profile_id" supabase/functions/
```

Expected: the second command returns **nothing**. Every remaining `class_attendance` hit must be one of the sites edited above, or the two `course-reset` counters (which count and delete by `course_id` and are unaffected).

- [ ] **Step 6: Deploy, in this order**

The migration is already applied (Task 1). Now:

```bash
cd ~/Documents/GitHub/Tec\ Hub/mzareei.github.io
npx supabase functions deploy course-session-join
npx supabase functions deploy course-class-record
npx supabase functions deploy course-pulse
```

- [ ] **Step 7: Exercise the real paths**

Do not conclude from a successful deploy.

1. Scan into a live class as a student. Confirm the attendance row appears on the class record.
2. Scan again immediately. Confirm the recorded time did **not** move — first scan of the day still wins.
3. In the class record, use **Mark present** on a different student. Confirm it succeeds (this is the path whose `onConflict` string changed).
4. Push a poll and confirm the cockpit's "answered of present" count matches the number of people actually in the room.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/_shared/attendance.ts supabase/functions/course-session-join/index.ts supabase/functions/course-class-record/index.ts supabase/functions/course-pulse/index.ts
git commit -m "Every door into attendance counts a day, not a class"
```

---

### Task 3: The class record shows which days a student came

**Files:**
- Modify: `src/api/classRecord.ts` (`AttendanceRow`)
- Modify: `src/components/AttendanceEngagementTable.tsx`
- Modify: `src/i18n/strings.ts`

**Interfaces:**
- Consumes: `attendance_days: string[]` from `course-class-record`'s attendance table (Task 2).
- Produces: nothing other tasks consume.

- [ ] **Step 1: Confirm the field actually arrives**

Open a class record in the app, then DevTools → Network → the `course-class-record` response, and confirm each attendance row carries `attendance_days`. Read the response, not the interface (pitfall #3).

- [ ] **Step 2: Add the type**

In `src/api/classRecord.ts`, add to `AttendanceRow` after `check_in_note`:

```ts
  /** Every day this student was in the room for this class, ascending. */
  attendance_days: string[];
```

- [ ] **Step 3: Add the string**

In `src/i18n/strings.ts`, near the other class-record strings:

```ts
  "classRecord.attendedDays": ["Days attended: {days}", "Días asistidos: {days}"],
```

- [ ] **Step 4: Show the days when there is more than one**

In `src/components/AttendanceEngagementTable.tsx`, the check-in cell renders `{timeOf(row.checked_in_at)}` at line 175. Add directly beneath that expression, inside the same cell:

```tsx
                  {row.attendance_days.length > 1 ? (
                    <span class="hint">
                      {t("classRecord.attendedDays", {
                        days: row.attendance_days
                          .map((day) => formatDay(day, { month: "short", day: "numeric" }))
                          .join(" · ")
                      })}
                    </span>
                  ) : null}
```

`formatDay` is already imported in this file (line 7) alongside `t` and `locale`, so no import change is needed. **Use `formatDay`, never `new Date(day)`** — a date-only string parses as UTC midnight and renders as the previous day west of Greenwich (pitfall #19).

One day shows nothing extra: the existing check-in time already says everything, and a "Days attended: Aug 12" line under every single row would be noise on a table the professor reads at a glance.

- [ ] **Step 5: Verify**

```bash
npm run typecheck && npm run verify
```

- [ ] **Step 6: Commit**

```bash
git add src/api/classRecord.ts src/components/AttendanceEngagementTable.tsx src/i18n/strings.ts
git commit -m "The class record says which days a student was in the room"
```

---

### Task 4: Pause and resume, from Run Class

`course-session-management` already allows `live → paused` and `paused → live`, and already pauses the session's `activity_instances` on the way in. Only `closed` runs `close_class_session_with_review`, so a paused class writes no review release and posts no grade. Nothing server-side is missing; the buttons are.

**Files:**
- Modify: `src/api/session.ts`
- Modify: `src/screens/instructor/RunClass.tsx`
- Modify: `src/i18n/strings.ts`
- Create: `tools/verify-pause-resume.mjs`

**Interfaces:**
- Consumes: `closePulse(roundId)` from `src/api/pulse.ts`, already imported by RunClass.
- Produces: `pauseClassSession(sessionId: string)` and `resumeClassSession(sessionId: string)` from `src/api/session.ts`, both returning `Promise<{ session: { id: string; state: string } }>`.

- [ ] **Step 1: Write the failing test**

Create `tools/verify-pause-resume.mjs`:

```js
// Pausing is how a class that ran out of time survives to the next session
// without being concluded: no review release, no grade, no "this class is
// over" on thirty phones. These assertions hold the two rules that make it
// safe — it must not strand an open question, and it must not be reachable
// from a state the server would refuse.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const api = readFileSync(path.join(root, "src/api/session.ts"), "utf8");
const runClass = readFileSync(
  path.join(root, "src/screens/instructor/RunClass.tsx"),
  "utf8"
);

assert.match(
  api,
  /next_state: "paused"/,
  "pausing must ask the server for the paused state"
);
assert.match(
  api,
  /export function resumeClassSession/,
  "a paused class must have a way back — every state needs one (pitfall #16)"
);
assert.match(
  api,
  /next_state: "live"/,
  "resuming must go straight back to live, which the server allows from paused"
);

assert.match(
  runClass,
  /isPaused/,
  "Run Class must distinguish a paused session from one that never started"
);
assert.match(
  runClass,
  /await closePulse\(activeRound\.round_id\)/,
  "pausing must not leave a question open on thirty phones nobody will ever reveal"
);
assert.match(
  runClass,
  /t\("run\.pause"\)/,
  "the pause control must be translated"
);
assert.match(
  runClass,
  /t\("run\.resume"\)/,
  "the resume control must be translated"
);
// End class is irreversible in a way pause is not, so it keeps its confirm step
// and pause must not be given the same weight — or the professor will hesitate
// over the safe one.
assert.match(
  runClass,
  /class="btn danger"[\s\S]{0,200}onClick=\{onEndClass\}/,
  "End class must remain the dangerous-looking action"
);

console.log("verify-pause-resume: OK");
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node tools/verify-pause-resume.mjs
```

Expected: FAIL — `next_state: "paused"` is not in `src/api/session.ts`.

- [ ] **Step 3: Add the API calls**

Append to `src/api/session.ts`:

```ts
/**
 * Stop for today without concluding the class.
 *
 * The difference that matters is what pausing does *not* do: closing runs
 * `close_class_session_with_review`, which publishes the lecture to Review and
 * posts every student's grade for the day. A class that ran out of time has not
 * earned either of those. Pausing leaves the session standing so the same
 * class — same polls, same lecture, same grade — can finish next week.
 */
export function pauseClassSession(sessionId: string) {
  return callFn<{ session: { id: string; state: string } }>(
    "course-session-management",
    { action: "update_session_state", session_id: sessionId, next_state: "paused" }
  );
}

/** Back to live. One hop: the server allows paused → live directly. */
export function resumeClassSession(sessionId: string) {
  return callFn<{ session: { id: string; state: string } }>(
    "course-session-management",
    { action: "update_session_state", session_id: sessionId, next_state: "live" }
  );
}
```

- [ ] **Step 4: Add the strings**

In `src/i18n/strings.ts`, beside the existing `run.endClass` entries:

```ts
  "run.pause": ["Pause class", "Pausar la clase"],
  "run.pausing": ["Pausing…", "Pausando…"],
  "run.pauseFailed": [
    "The class could not be paused. Try again.",
    "No se pudo pausar la clase. Inténtalo de nuevo."
  ],
  "run.resume": ["Resume class", "Reanudar la clase"],
  "run.resuming": ["Resuming…", "Reanudando…"],
  "run.resumeFailed": [
    "The class could not be resumed. Try again.",
    "No se pudo reanudar la clase. Inténtalo de nuevo."
  ],
  "run.paused": ["Class paused", "Clase pausada"],
  "run.pausedBody": [
    "Nothing has been graded and students still see this class as theirs. Resume it whenever you are ready — today or next session.",
    "Nada se ha calificado y los estudiantes siguen viendo esta clase como suya. Reanúdala cuando quieras, hoy o en la próxima sesión."
  ],
```

- [ ] **Step 5: Wire Run Class**

In `src/screens/instructor/RunClass.tsx`:

Extend the session API import:

```ts
import {
  endClassSession,
  pauseClassSession,
  reopenClassSession,
  resetClassSession,
  resumeClassSession,
  type ClassResetSummary
} from "../../api/session";
```

Add beside the existing `isLive` / `ended` declarations:

```ts
  const isPaused = session?.state === "paused";
```

Add the two handlers directly after `onEndClass`:

```tsx
  async function onPauseClass() {
    setBusy(true);
    setError(null);
    try {
      // The same courtesy End class already performs: a question left open is a
      // question thirty students sit staring at until it times out.
      const activeRound =
        checkpointState.type === "open" || checkpointState.type === "revealed"
          ? checkpointState.round
          : null;
      if (activeRound) await closePulse(activeRound.round_id).catch(() => {});
      await pauseClassSession(sessionId!);
      await refreshContext();
    } catch {
      setError(t("run.pauseFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onResumeClass() {
    setBusy(true);
    setError(null);
    try {
      await resumeClassSession(sessionId!);
      await refreshContext();
    } catch {
      setError(t("run.resumeFailed"));
    } finally {
      setBusy(false);
    }
  }
```

In the header's live-only block, add Pause **before** End class so the safe action is reached first:

```tsx
          {isLive ? (
            <>
              <button
                class="btn"
                type="button"
                disabled={busy}
                onClick={() => void onPauseClass()}
              >
                {busy ? t("run.pausing") : t("run.pause")}
              </button>
              <button
                class="btn danger"
                type="button"
                disabled={busy}
                onClick={onEndClass}
              >
                {endConfirming ? t("run.endConfirmAction") : t("run.endClass")}
              </button>
              {endConfirming ? (
                <p class="hint run-end-confirm">{t("run.endConfirm")}</p>
              ) : null}
            </>
          ) : null}
```

Pause deliberately has **no** confirm step. It is reversible in one click and creates nothing; making it look as heavy as End class would push the professor toward the irreversible action (design rule: consequences, not ceremony).

In the pre-live panel's `<section class="card stack">`, change the heading and body to account for a paused session, and add the Resume button:

```tsx
              <h2>
                {isPaused
                  ? t("run.paused")
                  : ended
                    ? t("run.ended")
                    : t("run.start.title")}
              </h2>
              <p class="hint">
                {isPaused
                  ? t("run.pausedBody")
                  : ended
                    ? t("run.endedBody")
                    : canStart
                      ? t("run.start.body")
                      : t("run.start.unavailable")}
              </p>
              {isPaused ? (
                <button
                  class="btn primary"
                  type="button"
                  disabled={busy}
                  onClick={() => void onResumeClass()}
                >
                  {busy ? t("run.resuming") : t("run.resume")}
                </button>
              ) : null}
```

Leave the existing `canStart` and `ended` buttons exactly as they are — `canStart` is false for a paused session, so they cannot both appear.

- [ ] **Step 6: Confirm `StatusPill` already knows `paused`**

```bash
grep -n "paused" src/components/StatusPill.tsx src/i18n/strings.ts | head
```

`StatusPill` falls back to the raw state string for any state it does not know, silently and untranslated (pitfall #12). If `paused` is missing from either the `CLASSES` map or `strings.ts`, add it in both before continuing.

- [ ] **Step 7: Verify**

```bash
npm run typecheck && npm run verify
```

Expected: PASS, including `verify-pause-resume: OK` and `verify-class-sessions`.

- [ ] **Step 8: Commit**

```bash
git add src/api/session.ts src/screens/instructor/RunClass.tsx src/i18n/strings.ts tools/verify-pause-resume.mjs
git commit -m "A class that ran out of time can pause instead of concluding"
```

---

### Task 5: A paused class tells students it is paused

Today treats `paused` as live (`["live","paused"].includes(session.state)`), so a paused class would announce itself as running. And when a resumed half and a new lecture share a day, the student session picker takes the first `live` **or** `paused` session in date order — handing a student the older paused one while the new lecture is what is actually running.

**Files:**
- Modify: `src/features/join/sessionState.ts`
- Modify: `src/screens/student/Today.tsx`
- Modify: `src/screens/student/Live.tsx`
- Modify: `src/i18n/strings.ts`
- Modify: `tools/verify-class-sessions.mjs` (append assertions; it already imports `selectLiveSessionId` and `fallbackLiveSessionId` and already reads `Today.tsx` and `Live.tsx` into `today` and `live`)

**Interfaces:**
- Consumes: `StudentSession.state`, `StudentPulseView.session_state` (already returned by `course-pulse`; no server change).
- Produces: `selectLiveSessionId` and `fallbackLiveSessionId` keep their signatures and now prefer `live` over `paused`.

- [ ] **Step 1: Write the failing test**

Append to `tools/verify-class-sessions.mjs` (keeping its existing imports and adding these):

```js
// ------------------------------------------- a live class outranks a paused one
//
// A day can hold both: last week's lecture, paused and being finished, and a
// brand-new one. Sessions arrive in planned-date order, so the paused older
// class is first — and taking the first live-or-paused entry would put every
// student in the wrong room.
{
  const sessions = [
    { session_id: "paused-older", state: "paused" },
    { session_id: "live-newer", state: "live" }
  ];
  assert.equal(
    selectLiveSessionId(sessions, null),
    "live-newer",
    "a class actually running must outrank one that is paused"
  );
  assert.equal(
    selectLiveSessionId(sessions, "paused-older"),
    "paused-older",
    "a student who scanned into a specific class stays in it"
  );
  assert.equal(
    selectLiveSessionId([{ session_id: "only-paused", state: "paused" }], null),
    "only-paused",
    "a paused class is still the student's class when nothing else is running"
  );
  assert.equal(
    fallbackLiveSessionId(sessions, "live-newer"),
    "paused-older",
    "falling back off a stale session must still find the paused one"
  );
}

// ------------------------------------------------------------------- wiring
//
// This file already reads Today.tsx and Live.tsx into `today` and `live` at the
// top (lines 24–25) using cwd-relative paths, because run-verifiers.mjs always
// spawns from the repo root. Reuse those consts — do not re-read the files and
// do not add node:path or node:url imports this file does not have.
{
  assert.match(
    today,
    /const pausedSession = /,
    "Today must know a paused class apart from a running one"
  );
  assert.doesNotMatch(
    today,
    /\["live", ?"paused"\]\.includes\(session\.state\)/,
    "a paused class must not be announced as live"
  );
  assert.match(
    today,
    /t\("today\.classPaused"\)/,
    "a paused class must say so, in both languages"
  );
  assert.match(
    live,
    /view\?\.session_state === "paused"/,
    "the live screen must read the paused state the poll already returns"
  );
  assert.match(
    live,
    /t\("live\.pausedTitle"\)/,
    "the paused card must be translated"
  );
}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node tools/verify-class-sessions.mjs
```

Expected: FAIL on `"a class actually running must outrank one that is paused"`.

- [ ] **Step 3: Prefer live over paused**

In `src/features/join/sessionState.ts`, replace `firstLiveSessionId` with:

```ts
/**
 * One day can hold two classes the student belongs to: last week's lecture
 * being finished, and a brand-new one. Sessions arrive in planned-date order,
 * so the paused older class comes first — and a plain live-or-paused match
 * would put the whole room in the wrong class. A class actually running always
 * wins; paused is what is left when nothing is.
 */
function firstLiveSessionId(
  sessions: StudentSessionRef[],
  excludedId?: string | null
): string | null {
  const eligible = sessions.filter((session) => session.session_id !== excludedId);
  return (
    eligible.find((session) => session.state === "live")?.session_id
    ?? eligible.find((session) => session.state === "paused")?.session_id
    ?? null
  );
}
```

- [ ] **Step 4: Add the strings**

```ts
  "today.classPaused": ["Class paused", "Clase pausada"],
  "today.classPausedBody": [
    "Your professor paused this class. It continues in your next session — nothing you have done is lost.",
    "Tu profesor pausó esta clase. Continúa en tu próxima sesión; nada de lo que hiciste se pierde."
  ],
  "live.pausedTitle": ["Class paused", "Clase pausada"],
  "live.pausedBody": [
    "Stay on this screen. The next question appears here as soon as your professor continues.",
    "Quédate en esta pantalla. La siguiente pregunta aparecerá aquí en cuanto tu profesor continúe."
  ],
```

- [ ] **Step 5: Split paused from live on Today**

In `src/screens/student/Today.tsx`, replace the `liveSession` line and `sessionIsLive` derivation with:

```tsx
  const liveSession = sessions.find((session) => session.state === "live");
  const pausedSession = sessions.find((session) => session.state === "paused");
  const activeSession = liveSession ?? pausedSession ?? null;
```

Then update the derived flags:

```tsx
  const currentSession = activeSession ?? todaysSession ?? nextPlanned ?? null;
  const sessionIsLive = Boolean(
    liveSession && currentSession?.session_id === liveSession.session_id
  );
  const sessionIsPaused = Boolean(
    pausedSession && currentSession?.session_id === pausedSession.session_id
  );
```

Use `sessionIsPaused` in the heading and the card eyebrow so a paused class reads as paused:

```tsx
        <h1>
          {sessionIsLive
            ? t("today.classLive")
            : sessionIsPaused
              ? t("today.classPaused")
              : t("today.title")}
        </h1>
```

and

```tsx
              <p class="eyebrow">
                {sessionIsLive
                  ? t("today.classLive")
                  : sessionIsPaused
                    ? t("today.classPaused")
                    : t("today.nextClass")}
              </p>
```

Add a paused explanation branch to the trailing block, before the existing scan/return branches:

```tsx
      {sessionIsPaused ? (
        <div class="card">
          <p class="eyebrow">{t("today.classPaused")}</p>
          <p>{t("today.classPausedBody")}</p>
        </div>
      ) : canReturnToClass ? (
```

`canReturnToClass` comes from the bug-fix plan's Task 3. If that task has not run, use `sessionIsLive` in its place and revisit when it does.

- [ ] **Step 6: Add the paused card to the live screen**

In `src/screens/student/Live.tsx`, insert this branch immediately **after** the `checked_in` gate and **before** the `if (round)` branch — a paused class has no open question, and the check-in gate must still come first:

```tsx
  // Paused, not over. The poll keeps running, so the moment the professor
  // resumes, the next question lands here with nothing for the student to tap.
  if (view?.session_state === "paused") {
    return (
      <LiveShell error={error}>
        <div class="empty-state card">
          <h3>{t("live.pausedTitle")}</h3>
          <p>{t("live.pausedBody")}</p>
        </div>
      </LiveShell>
    );
  }
```

- [ ] **Step 7: Verify**

```bash
npm run typecheck && npm run verify
```

- [ ] **Step 8: Test the whole loop through the real entry points**

1. Start a class, scan in as a student, push and reveal a poll.
2. Press **Pause class**. The open question must close, the student's phone must show "Class paused", and Today must say paused — not live.
3. Confirm the class appears in **neither** Review nor the gradebook.
4. Press **Resume class**. Push a poll. It must arrive on the student's phone with no action from them.
5. With the class paused, start a *different* class in the same group. Confirm a student scanning the new QR lands in the new class, not the paused one.

- [ ] **Step 9: Commit**

```bash
git add src/features/join/sessionState.ts src/screens/student/Today.tsx src/screens/student/Live.tsx src/i18n/strings.ts tools/verify-class-sessions.mjs
git commit -m "A paused class says paused, and a running one outranks it"
```

---

### Task 6: Record what was decided

**Files:**
- Modify: `docs/04-decisions.md`
- Modify: `docs/05-status.md`
- Modify: `docs/07-pitfalls.md`
- Modify: `~/Documents/GitHub/Tec Hub/mzareei.github.io/docs/professor-guide.md`

- [ ] **Step 1: Record the decision**

Add to `docs/04-decisions.md`: attendance is per day, engagement and grading per class; the professor's reasoning, in his words; and the consequence that students rescan on a resumed day.

- [ ] **Step 2: Record the pitfall**

Add to `docs/07-pitfalls.md`: *a unique constraint encodes a product rule, and relaxing it breaks every writer's `onConflict` and every reader's `.maybeSingle()` at once.* Name all five call sites and the two greps that find them (`grep -rn "class_attendance" supabase/functions/` and `grep -rn "class_session_id,profile_id" supabase/functions/`). Same family as pitfall #69: follow every path into the table, not just the one you are changing.

- [ ] **Step 3: Update the operating guide**

Add a short section to the professor guide: when to pause instead of end, what students see, that nothing is graded until the class is ended, and that students scan again on the day it resumes.

- [ ] **Step 4: Commit both repos**

```bash
git add docs/04-decisions.md docs/05-status.md docs/07-pitfalls.md
git commit -m "Record why attendance is a day and engagement is a class"

cd ~/Documents/GitHub/Tec\ Hub/mzareei.github.io
git add docs/professor-guide.md
git commit -m "Pausing a class, in the operating guide"
```

---

## Deliberately not built

- **Auto-resume, or a paused class expiring by itself.** A pause ends when the professor says so. A timeout here would conclude a class in an empty room.
- **A second QR code for the resumed day.** The join code lives on the session and does not change, so the same code works on both days. Students scan the same code again; that scan writes the second day's attendance row.
- **Splitting grades per day.** Explicitly refused by the professor: engagement and grading are per class.
