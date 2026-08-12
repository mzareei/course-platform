# First Class Session Bug Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the five things that broke during the first real class with students, so the next class runs without a student stuck at sign-in, a student locked out of a live class, or the professor's fullscreen dropping mid-lecture.

**Architecture:** Five independent fixes. Two touch edge functions in the backend repo (`course-auth-context`, `course-session-join`), three are frontend-only. No migration. Each fix follows this repo's established test culture: logic goes in a pure module under `src/features/…`, a `tools/verify-*.mjs` script asserts its behaviour and greps the calling file to prove the wiring exists, and `npm run verify` runs them all.

**Tech Stack:** Vite + TypeScript + Preact (SPA, deploys on push to Cloudflare Pages), Supabase Edge Functions in Deno (deploy explicitly), Node 26 verifier scripts using `node:assert/strict`.

**Source spec:** `docs/superpowers/specs/2026-08-12-first-class-session-fixes-design.md`

## Global Constraints

- **Two repos.** SPA: `~/Documents/GitHub/Tec Hub/course-platform`. Backend: `~/Documents/GitHub/Tec Hub/mzareei.github.io` (`supabase/functions/`). Paths below are relative to the SPA repo unless the task says otherwise.
- **Edge functions do not deploy on push.** Deploy explicitly: `npx supabase functions deploy <name>` run from the backend repo.
- **Every user-facing string is EN + ES**, added as a pair to `src/i18n/strings.ts`. `tools/verify-i18n.mjs` fails the build otherwise.
- **The browser never queries a table.** RLS is on with zero policies; edge functions are the only door.
- **Never render deck HTML with `srcdoc` or `blob:`.** Deck HTML only ever loads through `/content?t=…`.
- **`npm run verify` failure is a build failure.** Run `npm run typecheck && npm run verify` before every commit.
- Supabase project ref: `ojmbupftdikwmlqvibwt`.
- Commit messages: sentence describing the behaviour change, no `feat:`/`fix:` prefix required (match the existing log style, e.g. "Hold the slide's own answer back while the class is still voting").

---

### Task 1: A rate-limited sign-in says so, in both languages

The class hit Supabase's built-in email ceiling and every student saw a raw English error they could not act on. This makes the failure legible and stops it hiding the code box from students whose email did arrive.

**Files:**
- Create: `src/features/auth/signInErrors.ts`
- Create: `tools/verify-sign-in-errors.mjs`
- Modify: `src/screens/SignIn.tsx` (the `onSend` catch block, lines 61–66)
- Modify: `src/i18n/strings.ts` (add three pairs near the existing `signIn.*` block)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `classifySendFailure(error: unknown): SendFailure` where
  `type SendFailure = { kind: "rateLimited"; seconds: number | null } | { kind: "other"; message: string | null }`.
  No later task in this plan consumes it.

- [ ] **Step 1: Write the failing test**

Create `tools/verify-sign-in-errors.mjs`:

```js
// Thirty students pressing Send inside one minute is the normal shape of a
// class, and Supabase's answer to it is a 429 whose English message a student
// cannot act on. These are the shapes that must be recognised as "too many at
// once" rather than passed through raw.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifySendFailure } from "../src/features/auth/signInErrors.ts";

// Supabase AuthApiError carries status and code as own properties.
function authError(message, extra = {}) {
  return Object.assign(new Error(message), extra);
}

// ----------------------------------------------------- the project-wide limit
assert.deepEqual(
  classifySendFailure(authError("email rate limit exceeded", { status: 429 })),
  { kind: "rateLimited", seconds: null },
  "a 429 must be recognised as too many sign-ins at once"
);
assert.deepEqual(
  classifySendFailure(
    authError("over_email_send_rate_limit", { code: "over_email_send_rate_limit" })
  ),
  { kind: "rateLimited", seconds: null },
  "the documented rate-limit code must be recognised without a status"
);
assert.deepEqual(
  classifySendFailure(authError("Email rate limit exceeded")),
  { kind: "rateLimited", seconds: null },
  "the message alone must be enough when neither status nor code arrives"
);

// -------------------------------------------------- the per-address cooldown
assert.deepEqual(
  classifySendFailure(
    authError("For security purposes, you can only request this after 27 seconds.")
  ),
  { kind: "rateLimited", seconds: 27 },
  "the per-address cooldown must surface the number of seconds to wait"
);
assert.deepEqual(
  classifySendFailure(
    authError("For security purposes, you can only request this after 1 second.")
  ),
  { kind: "rateLimited", seconds: 1 },
  "a one-second wait is singular in Supabase's own text and must still parse"
);

// ------------------------------------------------------- everything that is not
assert.deepEqual(
  classifySendFailure(authError("Unable to validate email address: invalid format")),
  { kind: "other", message: "Unable to validate email address: invalid format" },
  "an unrelated failure must pass its own message through"
);
assert.deepEqual(
  classifySendFailure(authError("Signups not allowed for otp", { status: 422 })),
  { kind: "other", message: "Signups not allowed for otp" },
  "a non-429 status must not be treated as a rate limit"
);
assert.deepEqual(
  classifySendFailure(null),
  { kind: "other", message: null },
  "a thrown non-error must not crash the sign-in screen"
);
assert.deepEqual(
  classifySendFailure({ status: 429 }),
  { kind: "rateLimited", seconds: null },
  "a plain object from a network layer must classify on status alone"
);

// ------------------------------------------------------------------- wiring
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const signIn = readFileSync(path.join(root, "src/screens/SignIn.tsx"), "utf8");
assert.match(
  signIn,
  /classifySendFailure\(/,
  "the sign-in screen must classify a send failure rather than print it raw"
);
assert.match(
  signIn,
  /t\("signIn\.rateLimitedWait"/,
  "a countdown must be offered when the server named the seconds"
);
assert.match(
  signIn,
  /t\("signIn\.rateLimitedBusy"/,
  "a class-wide limit with no number must still explain itself"
);
assert.match(
  signIn,
  /setSent\(true\)/,
  "a rate-limited send must still reveal the code box, so a student whose email did arrive is not blocked behind a classmate's failure"
);

console.log("verify-sign-in-errors: OK");
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node tools/verify-sign-in-errors.mjs
```

Expected: FAIL — `Cannot find module '../src/features/auth/signInErrors.ts'`.

- [ ] **Step 3: Write the module**

Create `src/features/auth/signInErrors.ts`:

```ts
// Why a student cannot sign in, in terms a student can act on.
//
// Supabase answers a room full of simultaneous sign-ins with a 429 and an
// English sentence about rate limits. Printed raw on a phone mid-class it reads
// as "the app is broken", and the student stops trying — which is exactly what
// happened in the first real class. Two distinct limits produce it:
//
//   - the project-wide email ceiling ("email rate limit exceeded"), which is
//     about the whole room and clears on its own
//   - the per-address cooldown ("you can only request this after 27 seconds"),
//     which names its own wait
//
// They need different sentences, so they are classified apart here rather than
// collapsed into one "try again later".

export type SendFailure =
  | { kind: "rateLimited"; seconds: number | null }
  | { kind: "other"; message: string | null };

const RATE_LIMIT_CODES = [
  "over_email_send_rate_limit",
  "over_request_rate_limit",
  "over_sms_send_rate_limit"
];

/** "…after 27 seconds." / "…after 1 second." — Supabase writes both. */
const SECONDS_PATTERN = /after (\d+) seconds?/i;

function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === "string" ? value : "";
}

export function classifySendFailure(error: unknown): SendFailure {
  if (!error || typeof error !== "object") {
    return { kind: "other", message: null };
  }
  const source = error as Record<string, unknown>;
  const message = readString(source, "message");
  const code = readString(source, "code");
  const status = Number(source.status);

  const seconds = Number(message.match(SECONDS_PATTERN)?.[1] ?? Number.NaN);
  const rateLimited =
    status === 429
    || RATE_LIMIT_CODES.includes(code)
    || RATE_LIMIT_CODES.some((entry) => message.includes(entry))
    || /rate limit/i.test(message)
    || Number.isFinite(seconds);

  if (rateLimited) {
    return { kind: "rateLimited", seconds: Number.isFinite(seconds) ? seconds : null };
  }
  return { kind: "other", message: message || null };
}
```

- [ ] **Step 4: Add the strings**

In `src/i18n/strings.ts`, immediately after the existing `"signIn.sendFailed"` entry, add:

```ts
  "signIn.rateLimitedWait": [
    "Too many sign-in emails at once. Wait {seconds} seconds, then press Send again. If your code already arrived, type it below.",
    "Demasiados correos de acceso a la vez. Espera {seconds} segundos y vuelve a presionar Enviar. Si tu código ya llegó, escríbelo abajo."
  ],
  "signIn.rateLimitedBusy": [
    "Too many people are signing in at the same time. Wait a minute and press Send again. If your code already arrived, type it below.",
    "Demasiadas personas están entrando al mismo tiempo. Espera un minuto y vuelve a presionar Enviar. Si tu código ya llegó, escríbelo abajo."
  ],
```

- [ ] **Step 5: Wire the sign-in screen**

In `src/screens/SignIn.tsx`, add to the imports at the top:

```ts
import { classifySendFailure } from "../features/auth/signInErrors";
```

Replace the `catch` block inside `onSend` (currently lines 61–66) with:

```tsx
    } catch (error) {
      const failure = classifySendFailure(error);
      if (failure.kind === "rateLimited") {
        // The code box stays hidden until a send succeeds, which locks out the
        // student whose email *did* arrive while a classmate's request was the
        // one refused. A rate limit is the one failure where that is wrong.
        setSent(true);
        setMessage({
          kind: "error",
          text: failure.seconds
            ? t("signIn.rateLimitedWait", { seconds: failure.seconds })
            : t("signIn.rateLimitedBusy")
        });
        return;
      }
      setMessage({
        kind: "error",
        text: failure.message || t("signIn.sendFailed")
      });
    } finally {
```

- [ ] **Step 6: Run the verifiers**

```bash
npm run typecheck && npm run verify
```

Expected: PASS, including `verify-sign-in-errors: OK` and `verify-i18n`.

- [ ] **Step 7: Commit**

```bash
git add src/features/auth/signInErrors.ts tools/verify-sign-in-errors.mjs src/screens/SignIn.tsx src/i18n/strings.ts
git commit -m "A room full of sign-ins at once says so, in both languages"
```

---

### Task 2: Joining a class claims the student's profile

On day one no student had ever signed in, so no profile was linked to an auth account yet. `course-session-join` requires an already-linked, already-active profile and refuses with 403, which the app renders as "This class is for another group" — a message about the wrong thing entirely. Reloading fixed it because a reload runs `course-auth-context` first, and that is the only code that claims a profile.

**Files (backend repo `~/Documents/GitHub/Tec Hub/mzareei.github.io`):**
- Create: `supabase/functions/_shared/profile-claim.ts`
- Modify: `supabase/functions/course-auth-context/index.ts` (delete the local `loadOrClaimProfile`, import the shared one)
- Modify: `supabase/functions/course-session-join/index.ts` (`loadActiveProfile`, lines 140–159)

**Files (SPA repo):**
- Modify: `src/screens/student/JoinClass.tsx`
- Create: `tools/verify-join-claim.mjs`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `loadOrClaimProfile(db, user: { id: string; email: string })` exported from `_shared/profile-claim.ts`, returning the profile row plus `claimed_by_email: boolean`, or `null` when the address is not on the roster. Behaviour is byte-for-byte the behaviour `course-auth-context` has today.
- Task 3 modifies `course-auth-context` too. If both are executed, apply Task 2 first and re-read the file before Task 3's edit.

- [ ] **Step 1: Diff the source before you trust the copy below**

```bash
sed -n '82,135p' ~/Documents/GitHub/Tec\ Hub/mzareei.github.io/supabase/functions/course-auth-context/index.ts
```

This is a **move, not a rewrite.** The code in Step 2 was transcribed from that function on 2026-08-12. Compare the two before continuing; if they differ, the file on disk wins and Step 2's copy must be corrected to match it. Every branch is load-bearing — a subtly different claim path is an authorization change.

- [ ] **Step 2: Create the shared module**

Create `supabase/functions/_shared/profile-claim.ts`:

```ts
// Signing in is the claim.
//
// A rostered student exists as a `profiles` row long before they ever sign in,
// with no `auth_user_id` and `status = 'invited'`. Linking that row to the auth
// account, and promoting it to `active`, is what turns an invitation into a
// usable identity — and every student endpoint requires the result.
//
// This lived inside course-auth-context, which meant the *only* way to become
// active was to load the course context first. A student who scanned the class
// QR code on their very first sign-in reached course-session-join before that
// ever ran and was refused, with a message about being in the wrong group. That
// was every student in the first real class. Any endpoint a student can arrive
// at before the app has loaded its context must claim through this.
import { assertCourseEmailAllowed, assertProfileMatchesAuthEmail } from "./identity.ts";

const PROFILE_COLUMNS =
  "id, auth_user_id, institutional_email, student_identifier, full_name, preferred_name, status";

export async function loadOrClaimProfile(
  // deno-lint-ignore no-explicit-any
  db: any,
  user: { id: string; email: string }
) {
  const { data: linkedProfile, error: linkedError } = await db
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (linkedError) throw linkedError;
  if (linkedProfile) {
    assertProfileMatchesAuthEmail(linkedProfile, user.email);
    // A profile can be linked but still 'invited' (e.g. a roster correction set the
    // status without touching the link). Signing in is the claim, so promote it —
    // otherwise student endpoints that require an active profile reject the account.
    if (linkedProfile.status === "invited") {
      const { data: activated, error: activateError } = await db
        .from("profiles")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", linkedProfile.id)
        .eq("status", "invited")
        .select(PROFILE_COLUMNS)
        .maybeSingle();
      if (activateError) throw activateError;
      if (activated) return { ...activated, claimed_by_email: false };
    }
    return { ...linkedProfile, claimed_by_email: false };
  }

  const email = String(user.email || "").trim().toLowerCase();
  await assertCourseEmailAllowed(db, email);
  if (!email) return null;

  const { data: rosterProfile, error: rosterError } = await db
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("institutional_email", email)
    .maybeSingle();
  if (rosterError) throw rosterError;
  if (!rosterProfile || !["invited", "active"].includes(rosterProfile.status)) return null;
  if (rosterProfile.auth_user_id && rosterProfile.auth_user_id !== user.id) return null;
  assertProfileMatchesAuthEmail(rosterProfile, email);

  const { data: claimedProfile, error: claimError } = await db
    .from("profiles")
    .update({
      auth_user_id: user.id,
      status: "active",
      updated_at: new Date().toISOString()
    })
    .eq("id", rosterProfile.id)
    .is("auth_user_id", null)
    .select(PROFILE_COLUMNS)
    .maybeSingle();
  if (claimError) throw claimError;
  return claimedProfile ? { ...claimedProfile, claimed_by_email: true } : null;
}
```

The only edit made while moving it is the repeated column list becoming `PROFILE_COLUMNS`. Note in particular `.is("auth_user_id", null)` on the claim update and the `rosterProfile.auth_user_id !== user.id` guard above it: together they are what stops one auth account claiming a profile another account already holds. Neither may be dropped.

- [ ] **Step 3: Point course-auth-context at the shared module**

In `supabase/functions/course-auth-context/index.ts`, delete the local `loadOrClaimProfile` definition and add to the imports:

```ts
import { loadOrClaimProfile } from "../_shared/profile-claim.ts";
```

The call site at line 29 does not change.

- [ ] **Step 4: Make the join claim too**

In `supabase/functions/course-session-join/index.ts`, add the import:

```ts
import { loadOrClaimProfile } from "../_shared/profile-claim.ts";
```

Replace the whole `loadActiveProfile` function (lines 140–159) with:

```ts
// A student can arrive here before the app has ever loaded its course context —
// scanning the class QR on a first-ever sign-in does exactly that. Claiming the
// profile here means "you are in the wrong group" is only ever said when it is
// true, instead of being what a brand-new account is told.
async function loadActiveProfile(db: Db, token: string) {
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) {
    throw new HttpError("Invalid or expired session.", 401);
  }
  const email = userData.user.email || "";
  await assertCourseEmailAllowed(db, email);

  const profile = await loadOrClaimProfile(db, { id: userData.user.id, email });
  if (!profile || String(profile.status) !== "active") {
    throw new HttpError("No active course profile is linked to this account.", 403);
  }
  assertProfileMatchesAuthEmail(profile, email);
  return profile;
}
```

The enrollment check at lines 47–58 is untouched: a student genuinely in another group still gets the 403 and still sees "This class is for another group."

- [ ] **Step 5: Check nothing else read the moved function**

```bash
cd ~/Documents/GitHub/Tec\ Hub/mzareei.github.io
grep -rn "loadOrClaimProfile" supabase/functions/
```

Expected: exactly three hits — the definition in `_shared/profile-claim.ts` and one import + call in each of `course-auth-context` and `course-session-join`.

- [ ] **Step 6: Deploy both functions**

```bash
cd ~/Documents/GitHub/Tec\ Hub/mzareei.github.io && npx supabase functions deploy course-auth-context && npx supabase functions deploy course-session-join
```

Both must report success. No migration is involved, so pitfall #39's ordering does not apply here.

- [ ] **Step 7: Write the client guard and its verifier**

Back in the SPA repo, create `tools/verify-join-claim.mjs`:

```js
// A QR join runs the moment a session appears. The server now claims a
// first-ever profile itself, but a browser holding yesterday's bundle does not
// know that — so the screen must also wait for context and retry once, and the
// two halves must both stay in the file.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const join = readFileSync(path.join(root, "src/screens/student/JoinClass.tsx"), "utf8");

assert.match(
  join,
  /const claimed = Boolean\(context\.value\)/,
  "the join must know whether the course context has loaded before it calls"
);
assert.match(
  join,
  /if \(!claimed\) return;/,
  "the join must wait for the context that claims a first-ever profile"
);
assert.match(
  join,
  /\}, \[joinCode, signedIn, claimed\]\)/,
  "the effect must re-run once the context arrives, or waiting would hang forever"
);
assert.match(
  join,
  /await refreshContext\(\);\s*\n\s*return resolveJoinCode\(code\);/,
  "a 403 must be retried exactly once, after refreshing the context"
);
assert.match(
  join,
  /retried/,
  "the retry must be latched so a genuine wrong-group 403 cannot loop"
);

console.log("verify-join-claim: OK");
```

- [ ] **Step 8: Run it to verify it fails**

```bash
node tools/verify-join-claim.mjs
```

Expected: FAIL on the first assertion — `const claimed` does not exist yet.

- [ ] **Step 9: Implement the client guard**

In `src/screens/student/JoinClass.tsx`, change the `context` import to include the signal:

```ts
import { context, refreshContext, session } from "../../state/session";
```

Replace the component body's `useEffect` (lines 19–54) with:

```tsx
  const claimed = Boolean(context.value);
  const retried = useRef(false);

  useEffect(() => {
    const code = String(joinCode || "").trim();
    if (!signedIn) {
      saveAuthReturnPath(`/join/${code}`);
      return;
    }
    // course-auth-context is what links a brand-new account to its rostered
    // profile. The server claims it too now, but a browser still holding an
    // older bundle would race it and be told it is in the wrong group.
    if (!claimed) return;

    // A magic-link return boots already signed in and bypasses finishSignIn().
    // Consume the stored path here too so it cannot hijack a later sign-in.
    consumeAuthReturnPath();

    let cancelled = false;
    resolveJoinCode(code)
      .catch(async (error) => {
        const unclaimed =
          error instanceof ApiError && error.status === 403 && !retried.current;
        if (!unclaimed || cancelled) throw error;
        retried.current = true;
        await refreshContext();
        return resolveJoinCode(code);
      })
      .then(async (joined) => {
        if (cancelled) return;
        rememberJoinedClassSession(joined.session_id);
        await refreshContext();
        if (!cancelled) location.href = "/live";
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof ApiError && [400, 404].includes(error.status)) {
          setIssue("invalid");
        } else if (error instanceof ApiError && error.status === 409) {
          setIssue("closed");
        } else if (error instanceof ApiError && error.status === 403) {
          setIssue("access");
        } else {
          setIssue("unknown");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [joinCode, signedIn, claimed]);
```

Add `useRef` to the preact hooks import on line 1:

```ts
import { useEffect, useRef, useState } from "preact/hooks";
```

- [ ] **Step 10: Run the verifiers**

```bash
npm run typecheck && npm run verify
```

Expected: PASS, including `verify-join-claim: OK`.

- [ ] **Step 11: Test through the real entry point**

This is rule #1 in `CLAUDE.md` and the reason this bug shipped. Do not skip it and do not substitute typing `/join/CODE` into the address bar.

1. Start a class from Run Class so a QR code exists.
2. In a clean browser profile (or private window), open the join URL as a rostered student **who has never signed in**.
3. Sign in and confirm the student reaches `/live` **without a manual reload**.
4. Repeat with a student rostered in a *different* group and confirm they still see "This class is for another group".

- [ ] **Step 12: Commit**

```bash
git add src/screens/student/JoinClass.tsx tools/verify-join-claim.mjs
git commit -m "Scanning in on a first-ever sign-in is not being in the wrong group"
```

Then commit the backend repo:

```bash
cd ~/Documents/GitHub/Tec\ Hub/mzareei.github.io
git add supabase/functions/_shared/profile-claim.ts supabase/functions/course-auth-context/index.ts supabase/functions/course-session-join/index.ts
git commit -m "Signing in is the claim, wherever the student arrives first"
```

---

### Task 3: A student who already scanned in can get back to the class

Today deliberately has no join button, because the scan **is** the attendance record. But a student who scanned and then closed the tab had no route back — the live card is not clickable, and they were told to scan a code they had already scanned. The server knows who checked in; Today did not.

**Files (backend repo):**
- Modify: `supabase/functions/course-auth-context/index.ts` (`loadStudentSessions`, lines 316–365)

**Files (SPA repo):**
- Modify: `src/api/types.ts` (`StudentSession`, lines 76–87)
- Modify: `src/screens/student/Today.tsx`
- Modify: `src/i18n/strings.ts`
- Create: `tools/verify-return-to-class.mjs`

**Interfaces:**
- Consumes: `loadOrClaimProfile` from `_shared/profile-claim.ts` must already be in place if Task 2 ran first — re-read `course-auth-context/index.ts` before editing.
- Produces: `StudentSession.checked_in: boolean` on every entry of `course-auth-context`'s `student_sessions`. Field name matches the `checked_in` that `course-pulse` already returns, so the two agree (pitfall #3).

- [ ] **Step 1: Add `checked_in` to the server payload**

In `supabase/functions/course-auth-context/index.ts`, inside `loadStudentSessions`, after the `content_items` lookup and before `const sectionById = …`, add:

```ts
  // Today offers a way back into a live class only to a student the server
  // already recorded as present. Without this the screen cannot tell a student
  // who scanned from one who did not, so it can only ever say "scan the code"
  // — to someone who already did.
  const { data: attendance, error: attendanceError } = await db
    .from("class_attendance")
    .select("class_session_id")
    .eq("profile_id", profileId)
    .in("class_session_id", (sessions || []).map((session) => session.id));
  if (attendanceError) throw attendanceError;
  const checkedInSessionIds = new Set(
    (attendance || []).map((row) => String(row.class_session_id))
  );
```

Then in the returned object literal, after `content_title`, add:

```ts
      checked_in: checkedInSessionIds.has(String(session.id))
```

- [ ] **Step 2: Deploy and confirm the real shape**

```bash
cd ~/Documents/GitHub/Tec\ Hub/mzareei.github.io && npx supabase functions deploy course-auth-context
```

Then confirm the field actually arrives, rather than trusting the TypeScript interface (pitfall #3): sign in as a student who has scanned into a live class, open DevTools → Network → the `course-auth-context` response, and check `student_sessions[].checked_in` is `true`.

- [ ] **Step 3: Write the failing test**

In the SPA repo, create `tools/verify-return-to-class.mjs`:

```js
// Scanning the QR is the attendance record, so Today has no join button by
// design. The exception, and the only one: a student the server already
// recorded as present may return to the class they are already in. These
// assertions exist so that exception cannot quietly widen into a button anyone
// can press from anywhere.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const today = readFileSync(path.join(root, "src/screens/student/Today.tsx"), "utf8");
const types = readFileSync(path.join(root, "src/api/types.ts"), "utf8");

assert.match(
  types,
  /checked_in: boolean;/,
  "StudentSession must carry the server's own check-in fact"
);
assert.match(
  today,
  /const canReturnToClass = sessionIsLive && Boolean\(liveSession\?\.checked_in\)/,
  "the way back must require BOTH a live class and a recorded check-in"
);
assert.match(
  today,
  /canReturnToClass \? \(/,
  "the button must be gated on that combined condition, not on liveness alone"
);
assert.match(
  today,
  /href="\/live"/,
  "the way back must go to the live screen"
);
assert.match(
  today,
  /t\("today\.returnToClass"\)/,
  "the button must be translated"
);
assert.doesNotMatch(
  today,
  /checked_in \|\|/,
  "check-in must never be OR'd with anything — that is how an attendance gate becomes a suggestion"
);

// The scan card must survive for everyone else. If this assertion ever fails,
// a student who has NOT scanned is being shown a way in, and the attendance
// table starts describing a room that was never full.
assert.match(
  today,
  /t\("today\.scanToJoin"\)/,
  "a student who has not scanned must still be told to scan"
);

console.log("verify-return-to-class: OK");
```

- [ ] **Step 4: Run it to verify it fails**

```bash
node tools/verify-return-to-class.mjs
```

Expected: FAIL on the `StudentSession` assertion.

- [ ] **Step 5: Add the type**

In `src/api/types.ts`, add to `StudentSession` after `content_title`:

```ts
  /** The server's own attendance fact: this student scanned into this class. */
  checked_in: boolean;
```

- [ ] **Step 6: Add the strings**

In `src/i18n/strings.ts`, after the existing `"today.scanToJoinBody"` entry, add:

```ts
  "today.returnToClass": ["Return to class", "Regresar a la clase"],
  "today.returnToClassBody": [
    "You already scanned in. Go back to the question screen.",
    "Ya registraste tu entrada. Regresa a la pantalla de preguntas."
  ],
```

- [ ] **Step 7: Add the button**

In `src/screens/student/Today.tsx`, after the `sessionIsLive` declaration (line 48), add:

```tsx
  // The one exception to "no join button": someone the server already recorded
  // as present. They cannot manufacture an attendance they do not have, because
  // this reads the attendance row, not their intent.
  const canReturnToClass = sessionIsLive && Boolean(liveSession?.checked_in);
```

Replace the trailing `sessionIsLive ? (…) : null` block (lines 91–96) with:

```tsx
      {canReturnToClass ? (
        <div class="card">
          <p class="eyebrow">{t("today.returnToClass")}</p>
          <p>{t("today.returnToClassBody")}</p>
          <a class="btn primary" href="/live">{t("today.returnToClass")}</a>
        </div>
      ) : sessionIsLive ? (
        <div class="card">
          <p class="eyebrow">{t("today.scanToJoin")}</p>
          <p>{t("today.scanToJoinBody")}</p>
        </div>
      ) : null}
```

Leave the existing comment above that block in place — it explains why the default is still no button.

- [ ] **Step 8: Run the verifiers**

```bash
npm run typecheck && npm run verify
```

Expected: PASS, including `verify-return-to-class: OK`.

- [ ] **Step 9: Test through the real entry point**

1. Start a class. Scan in as a student. Confirm you reach `/live`.
2. Close the tab. Reopen the app at `/`. **Return to class** must be there, and must land on the live question screen.
3. Sign in as a rostered student in the same group who has **not** scanned. They must see the scan card and **no** button.

- [ ] **Step 10: Commit**

```bash
git add src/api/types.ts src/screens/student/Today.tsx src/i18n/strings.ts tools/verify-return-to-class.mjs
git commit -m "A student who already scanned in can find their way back"
```

And in the backend repo:

```bash
cd ~/Documents/GitHub/Tec\ Hub/mzareei.github.io
git add supabase/functions/course-auth-context/index.ts
git commit -m "Student sessions carry whether this student scanned in"
```

---

### Task 4: Fullscreen survives the deck's token refresh

`InstructorDeck` re-mints the content token every 540 seconds and assigns it straight to the iframe's `src`. Assigning `src` reloads the document, and the browser drops fullscreen when the fullscreen element is destroyed — so the professor was thrown out of fullscreen roughly every nine minutes of a two-hour lecture. The deck is one self-contained document served by `functions/content.ts`; the token gates that single fetch and the loaded document never uses it again.

**Files:**
- Modify: `src/features/deck/instructorDeckState.ts`
- Modify: `src/features/deck/InstructorDeck.tsx`
- Create: `tools/verify-deck-token-refresh.mjs`

**Interfaces:**
- Consumes: `instructorDeckUrl(token, slide)` and `shouldKeepDeckVisibleAfterRefreshFailure(currentSource)`, both already exported from `instructorDeckState.ts`. Neither changes.
- Produces: `shouldApplyDeckSource(input: { hasSource: boolean; inFullscreen: boolean }): boolean` exported from `instructorDeckState.ts`. No later task consumes it.

- [ ] **Step 1: Write the failing test**

Create `tools/verify-deck-token-refresh.mjs`:

```js
// The deck's token is refreshed on a timer so a genuine reload still works.
// Feeding that fresh token to the iframe reloads the document, and the browser
// exits fullscreen the instant the fullscreen element is destroyed — which is
// why the professor was thrown out of fullscreen every nine minutes of a
// two-hour lecture. Minting must continue; applying must not.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  instructorDeckUrl,
  shouldApplyDeckSource
} from "../src/features/deck/instructorDeckState.ts";

// --------------------------------------------------------- when to swap src
assert.equal(
  shouldApplyDeckSource({ hasSource: false, inFullscreen: false }),
  true,
  "the very first load has nothing on screen and must always apply"
);
assert.equal(
  shouldApplyDeckSource({ hasSource: false, inFullscreen: true }),
  true,
  "an empty frame must load even in fullscreen — there is nothing to interrupt"
);
assert.equal(
  shouldApplyDeckSource({ hasSource: true, inFullscreen: true }),
  false,
  "a working deck must never be reloaded under the professor mid-lecture"
);
assert.equal(
  shouldApplyDeckSource({ hasSource: true, inFullscreen: false }),
  true,
  "outside fullscreen a held token may be applied without costing anything"
);

// ------------------------------------ the slide hash must survive a real swap
assert.equal(
  instructorDeckUrl("abc", 37),
  "/content?t=abc#37",
  "a replacement URL must carry the current slide, or a reload returns to slide 1"
);

// ------------------------------------------------------------------- wiring
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const deck = readFileSync(
  path.join(root, "src/features/deck/InstructorDeck.tsx"),
  "utf8"
);

assert.match(
  deck,
  /pendingSource = useRef<string \| null>\(null\)/,
  "a freshly minted URL must be held, not assigned"
);
assert.match(
  deck,
  /shouldApplyDeckSource\(\{/,
  "applying a held URL must go through the shared rule"
);
assert.match(
  deck,
  /document\.fullscreenElement/,
  "the rule must be fed the real fullscreen state"
);
assert.match(
  deck,
  /addEventListener\("fullscreenchange"/,
  "leaving fullscreen must be the moment a held URL is applied"
);
assert.match(
  deck,
  /removeEventListener\("fullscreenchange"/,
  "the listener must be cleaned up, or every remount leaks another one"
);
assert.match(
  deck,
  /schedule\(expectedGeneration, access\.expires_in - 60\)/,
  "minting must still happen on the timer — a stale token breaks a genuine reload"
);

console.log("verify-deck-token-refresh: OK");
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node tools/verify-deck-token-refresh.mjs
```

Expected: FAIL — `shouldApplyDeckSource` is not exported.

- [ ] **Step 3: Add the rule**

Append to `src/features/deck/instructorDeckState.ts`:

```ts
/**
 * Whether a freshly minted deck URL may be handed to the iframe right now.
 *
 * The token is refreshed every nine minutes so a genuine reload still works,
 * but assigning the result to `src` reloads the document — and the browser
 * exits fullscreen the moment the fullscreen element is destroyed. The deck is
 * one self-contained document; once it has loaded, the token has done its whole
 * job. So a fresh token is worth holding and never worth interrupting a lecture
 * for.
 *
 * An empty frame is the exception in both directions: there is no presentation
 * to protect, and refusing to load would leave the professor with nothing.
 */
export function shouldApplyDeckSource(input: {
  hasSource: boolean;
  inFullscreen: boolean;
}): boolean {
  if (!input.hasSource) return true;
  return !input.inFullscreen;
}
```

- [ ] **Step 4: Hold the token instead of applying it**

In `src/features/deck/InstructorDeck.tsx`:

Update the import block:

```ts
import {
  instructorDeckUrl,
  shouldApplyDeckSource,
  shouldKeepDeckVisibleAfterRefreshFailure
} from "./instructorDeckState";
```

Add a ref beside the existing ones (after `const generation = useRef(0);`):

```ts
  // A minted URL the professor's fullscreen is not worth interrupting for.
  const pendingSource = useRef<string | null>(null);
```

Add an `applySource` helper directly above `async function mint(...)`:

```ts
  function applySource(nextSource: string) {
    pendingSource.current = nextSource;
    if (
      !shouldApplyDeckSource({
        hasSource: Boolean(sourceRef.current),
        inFullscreen: Boolean(document.fullscreenElement)
      })
    ) {
      return;
    }
    pendingSource.current = null;
    // Only a real navigation resets the bridge. Holding the URL means the
    // deck kept running, so its reported slide is still the truth.
    onNavigation();
    sourceRef.current = nextSource;
    setSource(nextSource);
  }
```

In `mint`, replace these three lines:

```ts
      onNavigation();
      sourceRef.current = nextSource;
      setSource(nextSource);
```

with:

```ts
      applySource(nextSource);
```

Add the fullscreen listener as a new effect, after the existing `useEffect` that watches `contentItemId`:

```ts
  // The held URL lands the moment the professor leaves fullscreen himself,
  // which is the one moment a reload costs the class nothing.
  useEffect(() => {
    const onFullscreenChange = () => {
      if (document.fullscreenElement) return;
      const held = pendingSource.current;
      if (held) applySource(held);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);
```

In the `contentItemId` effect, clear the held URL alongside the other resets — add after `sourceRef.current = null;`:

```ts
    pendingSource.current = null;
```

- [ ] **Step 5: Run the verifiers**

```bash
npm run typecheck && npm run verify
```

Expected: PASS, including `verify-deck-token-refresh: OK` and the existing `verify-gated-content` scripts.

- [ ] **Step 6: Test it against a real clock**

The bug fires on a 540-second timer, so a two-minute check proves nothing.

1. Open Run Class on a session with a lecture and start the class.
2. Put the deck into fullscreen and navigate to a slide well past the first.
3. **Leave it in fullscreen for at least 12 minutes**, using the deck normally.
4. Fullscreen must not drop and the deck must not flash or reload.
5. Exit fullscreen deliberately. The held token is applied; confirm the deck reloads to the same slide, not slide 1.

- [ ] **Step 7: Commit**

```bash
git add src/features/deck/instructorDeckState.ts src/features/deck/InstructorDeck.tsx tools/verify-deck-token-refresh.mjs
git commit -m "A refreshed token is not worth throwing the professor out of fullscreen"
```

---

### Task 5: A revealed question retires itself

After a poll is revealed, the cockpit panel keeps showing it with a **Continue with the class** button until someone clicks. Automatically it is retired only when the deck reports it resumed past a checkpoint — and only decks carrying the full engine send those messages. Every imported lecture carries just the slide-reporter shim, so nothing ever retired the panel, and the professor met last checkpoint's question the instant fullscreen dropped. Meanwhile the students' phones clear the same question after three minutes (`revealDisplayMinutes` in `course-pulse`), so the two sides already disagree.

**Files (backend repo):**
- Modify: `supabase/functions/course-pulse/index.ts` (`studentRound`, lines 518–534)

**Files (SPA repo):**
- Modify: `src/features/live/autoReveal.ts`
- Modify: `src/api/pulse.ts` (`PulseRound`)
- Modify: `src/screens/instructor/RunClass.tsx`
- Create: `tools/verify-auto-continue.mjs`

**Interfaces:**
- Consumes: `countAdvance(current, previousSlide, nextSlide)` and `ADVANCES_BEFORE_REVEAL`, already exported from `autoReveal.ts`.
- Produces:
  - `PulseRound.revealed_at?: string | null` on the client type, populated by `course-pulse`.
  - `REVEAL_DISPLAY_MS` (number) and
    `autoContinueReason(input: { state: "open" | "revealed" | "closed"; revealedAtMs: number | null; nowMs: number; advancesSinceRevealed: number }): "displayWindowElapsed" | "movedOn" | null`, both exported from `src/features/live/autoReveal.ts`.

- [ ] **Step 1: Send `revealed_at` to the client**

In `supabase/functions/course-pulse/index.ts`, add to the object `studentRound` returns, after `ends_at`:

```ts
    revealed_at: round.revealed_at ?? null,
```

`loadCurrentPulse` already selects `revealed_at` (it computes the staleness window from it), so no query changes. Deploy:

```bash
cd ~/Documents/GitHub/Tec\ Hub/mzareei.github.io && npx supabase functions deploy course-pulse
```

Then read the actual response in DevTools and confirm `round.revealed_at` is populated on a revealed round (pitfall #3 — never trust the interface).

- [ ] **Step 2: Write the failing test**

In the SPA repo, create `tools/verify-auto-continue.mjs`:

```js
// Revealing shows the class the answer. Retiring the question is a separate
// act, and until now the only automatic one came from a deck message that
// imported lectures cannot send — so the cockpit held the last question
// forever while every student's phone had already moved on. These are the
// conditions under which the cockpit lets go by itself.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADVANCES_BEFORE_REVEAL,
  REVEAL_DISPLAY_MS,
  autoContinueReason
} from "../src/features/live/autoReveal.ts";

const revealedAtMs = 1_000_000;
const revealed = {
  state: "revealed",
  revealedAtMs,
  nowMs: revealedAtMs + 1000,
  advancesSinceRevealed: 0
};

// ------------------------------------------------ only a revealed round retires
assert.equal(
  autoContinueReason(revealed),
  null,
  "a question just revealed must stay on screen"
);
for (const state of ["open", "closed"]) {
  assert.equal(
    autoContinueReason({ ...revealed, state, nowMs: revealedAtMs + REVEAL_DISPLAY_MS + 1 }),
    null,
    `a ${state} round must never be retired by this rule`
  );
}

// -------------------------------------- the phones' own window, matched exactly
assert.equal(
  REVEAL_DISPLAY_MS,
  3 * 60 * 1000,
  "the cockpit must use the same three minutes course-pulse serves students"
);
assert.equal(
  autoContinueReason({ ...revealed, nowMs: revealedAtMs + REVEAL_DISPLAY_MS - 1 }),
  null,
  "inside the window the cockpit must still show what the phones show"
);
assert.equal(
  autoContinueReason({ ...revealed, nowMs: revealedAtMs + REVEAL_DISPLAY_MS }),
  "displayWindowElapsed",
  "when the phones drop the question the cockpit must drop it too"
);

// ------------------------------------------------ the professor plainly moved on
assert.equal(
  autoContinueReason({ ...revealed, advancesSinceRevealed: ADVANCES_BEFORE_REVEAL - 1 }),
  null,
  "one or two forward presses is teaching, not leaving"
);
assert.equal(
  autoContinueReason({ ...revealed, advancesSinceRevealed: ADVANCES_BEFORE_REVEAL }),
  "movedOn",
  "advancing well past the answered question must retire it"
);

// ------------------------------------------- a round recovered after a reload
assert.equal(
  autoContinueReason({ ...revealed, revealedAtMs: null }),
  null,
  "an unknown reveal time must never retire on the clock — only on moving on"
);
assert.equal(
  autoContinueReason({
    ...revealed,
    revealedAtMs: null,
    advancesSinceRevealed: ADVANCES_BEFORE_REVEAL
  }),
  "movedOn",
  "moving on still works when the reveal time is unknown"
);

// ------------------------------------------------------------------- wiring
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runClass = readFileSync(
  path.join(root, "src/screens/instructor/RunClass.tsx"),
  "utf8"
);

assert.match(
  runClass,
  /autoContinueReason\(/,
  "Run Class must ask whether a revealed question should retire"
);
assert.match(
  runClass,
  /void continueCheckpoint\(false\)/,
  "retiring must reuse the same path the Continue button uses, so it closes the round server-side"
);
assert.match(
  runClass,
  /checkpointContinueInFlight\.current/,
  "a retire must not fire while a continue is already running"
);
assert.match(
  runClass,
  /advancesSinceRevealed/,
  "Run Class must count slides advanced after the reveal, separately from those before it"
);

console.log("verify-auto-continue: OK");
```

- [ ] **Step 3: Run it to verify it fails**

```bash
node tools/verify-auto-continue.mjs
```

Expected: FAIL — `REVEAL_DISPLAY_MS` is not exported.

- [ ] **Step 4: Add the rule**

Append to `src/features/live/autoReveal.ts`:

```ts
/**
 * How long `course-pulse` keeps serving a revealed round to students
 * (`revealDisplayMinutes = 3`). The cockpit has to use the same number: showing
 * a question the phones have already dropped is how the professor ended up
 * looking at last checkpoint's question with a Continue button under it.
 */
export const REVEAL_DISPLAY_MS = 3 * 60 * 1000;

export type AutoContinueReason = "displayWindowElapsed" | "movedOn";

/**
 * When the cockpit should let go of a revealed question by itself.
 *
 * Retiring used to have exactly one automatic trigger: the deck reporting that
 * it resumed past an authored checkpoint. Only a deck carrying the full engine
 * sends that, and every imported lecture carries just the slide reporter — so
 * on the decks the professor actually teaches from, nothing ever retired the
 * panel.
 *
 * Deliberately not keyed on the round's `checkpoint_after_slide`: `course-pulse`
 * treats `plan_checkpoint_id` and `checkpoint_after_slide` as mutually
 * exclusive, so a plan-driven round carries no slide at all — and plan-driven
 * rounds are exactly the ones this fixes.
 */
export function autoContinueReason(input: {
  state: "open" | "revealed" | "closed";
  /** Null when recovered after a reload and the server did not say. */
  revealedAtMs: number | null;
  nowMs: number;
  /** Slides advanced since the reveal, not since the question was asked. */
  advancesSinceRevealed: number;
}): AutoContinueReason | null {
  if (input.state !== "revealed") return null;
  if (input.advancesSinceRevealed >= ADVANCES_BEFORE_REVEAL) return "movedOn";
  if (input.revealedAtMs === null) return null;
  if (input.nowMs - input.revealedAtMs >= REVEAL_DISPLAY_MS) {
    return "displayWindowElapsed";
  }
  return null;
}
```

- [ ] **Step 5: Add the client type**

In `src/api/pulse.ts`, add to `PulseRound` after `ends_at`:

```ts
  /** When the instructor revealed. Null while open, or on an older round. */
  revealed_at?: string | null;
```

- [ ] **Step 6: Wire Run Class**

In `src/screens/instructor/RunClass.tsx`:

Extend the `autoReveal` import:

```ts
import {
  autoContinueReason,
  autoRevealReason,
  countAdvance
} from "../../features/live/autoReveal";
```

Add state and a ref beside the existing `advancesSinceAsked` declarations:

```ts
  const [advancesSinceRevealed, setAdvancesSinceRevealed] = useState(0);
  const previousContinueSlide = useRef<number | null>(null);
  const autoContinueInputs = useRef({
    state: "closed" as "open" | "revealed" | "closed",
    revealedAtMs: null as number | null,
    advancesSinceRevealed: 0
  });
```

After the existing `openRoundId` declaration, add its revealed counterpart:

```ts
  const revealedRoundId =
    checkpointState.type === "revealed" ? checkpointState.round.round_id : null;
```

Add the slide counting for the revealed phase, directly after the two effects that maintain `advancesSinceAsked`:

```ts
  useEffect(() => {
    setAdvancesSinceRevealed(0);
    previousContinueSlide.current = bridge.slide;
  }, [revealedRoundId]);

  useEffect(() => {
    if (!revealedRoundId) return;
    setAdvancesSinceRevealed((current) =>
      countAdvance(current, previousContinueSlide.current, bridge.slide));
    previousContinueSlide.current = bridge.slide;
  }, [bridge.slide, revealedRoundId]);

  autoContinueInputs.current = {
    state: checkpointState.type === "revealed" ? "revealed" : "closed",
    revealedAtMs:
      checkpointState.type === "revealed" && checkpointState.round.revealed_at
        ? new Date(checkpointState.round.revealed_at).getTime()
        : null,
    advancesSinceRevealed
  };
```

Then add the ticking effect, directly after the existing auto-reveal `useEffect`:

```ts
  // Revealing shows the answer; it does not end the question. The only
  // automatic end was a deck message an imported lecture cannot send, so on
  // every lecture after Week 1 the panel held the last question until it was
  // clicked — which the professor only ever saw when fullscreen dropped.
  useEffect(() => {
    if (!revealedRoundId || !isLive) return;
    const tick = () => {
      if (checkpointContinueInFlight.current) return;
      const reason = autoContinueReason({
        ...autoContinueInputs.current,
        nowMs: Date.now()
      });
      if (reason) void continueCheckpoint(false);
    };
    const id = setInterval(tick, 1000) as unknown as number;
    return () => clearInterval(id);
  }, [revealedRoundId, isLive]);
```

`continueCheckpoint(false)` is the existing function the **Continue** button calls: it closes the round server-side, clears the deck's question layer, resets the panel to `idle`, and is already guarded by `checkpointLifecycleSequence` so a late reply cannot resurrect it.

- [ ] **Step 7: Run the verifiers**

```bash
npm run typecheck && npm run verify
```

Expected: PASS, including `verify-auto-continue: OK` and the existing `verify-auto-reveal`.

- [ ] **Step 8: Test it in a real class**

Use a session whose lecture is an **imported** deck (no checkpoint coverage) with a class question plan — that is the path with the bug.

1. Start the class, join as a student, let a planned poll fire.
2. Let it auto-reveal.
3. Advance three slides. The cockpit panel must return to its teaching state on its own, and the student's phone must leave the question.
4. Repeat, this time standing still after the reveal. The panel must retire on its own within three minutes.
5. Confirm the manual **Continue with the class** button still works and still retires immediately.

- [ ] **Step 9: Commit**

```bash
git add src/features/live/autoReveal.ts src/api/pulse.ts src/screens/instructor/RunClass.tsx tools/verify-auto-continue.mjs
git commit -m "A revealed question lets go by itself, like the phones already do"
```

And in the backend repo:

```bash
cd ~/Documents/GitHub/Tec\ Hub/mzareei.github.io
git add supabase/functions/course-pulse/index.ts
git commit -m "A revealed round says when it was revealed"
```

---

### Task 6: Write the professor's email setup steps

Task 1 makes the rate limit legible; it cannot raise it. Raising it is a dashboard job only the professor can do, and it must exist as written steps he can follow without an engineer beside him — including the part where the door on test sign-in finally closes.

**Files:**
- Modify: `docs/06-runbook.md`

**Interfaces:** none. Documentation only.

- [ ] **Step 1: Confirm what is configured today before writing instructions for it**

Ask the professor to open Supabase → **Project Settings → Authentication → SMTP Settings** and say whether "Enable Custom SMTP" is already on. Everything below assumes it is off, which is what the built-in ceiling implies. Do not guess — the steps change if a provider is already half-configured.

- [ ] **Step 2: Add the section to the runbook**

Add a section titled **"Sending sign-in emails to a whole class"** to `docs/06-runbook.md` containing all of the following.

**Why this is needed:** Supabase's built-in email service is capped at a couple of messages per hour for the entire project and is documented as testing-only. Thirty students pressing Send in one minute means two get a code and the rest get a rate-limit error. There is no code change that raises this.

**Provider choice.** Resend and most transactional providers require a verified DNS domain, and the professor does not control DNS for `tec.mx`. Two options that do not:

- **Brevo (recommended)** — free tier, 300 emails/day, verifies a *single sender address*. Steps: create an account at brevo.com → **Senders, Domains & Dedicated IPs → Senders → Add a sender** with `m.zareei@tec.mx` → click the confirmation link Brevo emails there → **SMTP & API → SMTP** and copy the server, port `587`, login, and the generated SMTP key.
- **Gmail** — requires 2-Step Verification on the Google account, then an **App Password** from myaccount.google.com/apppasswords. Host `smtp.gmail.com`, port `465`, username the full Gmail address, password the 16-character app password. Roughly 500 recipients a day.

**Supabase configuration.** Project Settings → Authentication → **SMTP Settings** → enable Custom SMTP → paste host, port, username, password → **Sender email** must be the address verified with the provider, or every message is rejected → Save. Then Authentication → **Rate Limits** → raise *Rate limit for sending emails* from the built-in default to **300 per hour** (comfortably above one class, and low enough that a runaway loop is still capped).

**Verify before the class, not during it.** From a phone that has never signed in, on the real site, request a code with a real student address and confirm it arrives within a minute. Then have a second and third address request one in the same minute and confirm all three arrive — one success proves nothing about the ceiling, which is exactly what a single professor's test proved on day one.

**Then close the test sign-in door.** Only after that verification, and as a separate change:

```bash
# In the SPA repo: set testSignIn to false in src/config.ts, then
npm run typecheck && npm run verify && git commit -am "Close test sign-in now that real email works"
```

and clear the `COURSE_TEST_SIGNIN_UNTIL` secret in the Supabase dashboard. Until both are done, anyone who knows a rostered address can sign in as that student, and their grades hang off that account. Record the date this was done in `docs/05-status.md`.

**Campus network caveat.** The whole room shares one public IP. Some Supabase auth endpoints are rate-limited per IP independently of email, so if a class still sees refusals *after* SMTP is working, that is the next thing to check — not a reason to conclude the SMTP change failed.

- [ ] **Step 3: Commit**

```bash
git add docs/06-runbook.md
git commit -m "How to send sign-in emails to a whole class at once"
```

---

### Task 7: Record what was learned

`CLAUDE.md` requires status and pitfalls to be updated in the same work, so the next agent inherits the reasoning rather than rediscovering it.

**Files:**
- Modify: `docs/05-status.md`
- Modify: `docs/07-pitfalls.md`

- [ ] **Step 1: Add the pitfalls**

Add four entries at the top of `docs/07-pitfalls.md`, numbered above the current highest (currently #72), each following the existing shape — what was reported, what the code actually did, and the general rule:

1. **A claim that lives in one endpoint blocks every other door.** `loadOrClaimProfile` only ran in `course-auth-context`, so any student endpoint reachable before the app loaded its context refused a brand-new account — and said something unrelated while doing it. Rule: when one endpoint performs a one-time promotion every other endpoint requires, it belongs in `_shared/`, and every endpoint a user can arrive at *first* must call it.
2. **Refreshing a credential must not reload the thing using it.** Assigning a new `src` to an iframe destroys its document, and the browser exits fullscreen with it. Rule: a token refresh for a self-contained document is worth holding, not applying — and never applying while `document.fullscreenElement` is set.
3. **A server-side display window needs a client-side twin.** `course-pulse` retires a revealed round after three minutes; the cockpit had no equivalent, so the two disagreed and the professor was left looking at a question every student had already lost. Rule: when the server bounds how long something is shown, the other surface showing the same thing must use the same bound, imported from one place.
4. **An automatic path that depends on an optional capability is not automatic.** Retiring a revealed question depended on a deck message only full-engine decks send, on a platform whose normal lecture is an imported deck. Rule: before relying on a bridge message, check which decks in production can actually send it.

- [ ] **Step 2: Add the status entry**

Add a dated entry to `docs/05-status.md` recording: the first real class ran on 2026-08-11/12; five defects were reported and fixed; **the sign-in email ceiling is a configuration item that is not fixed by this work** and is tracked in the spec; and pause/resume with day-based attendance is planned separately in `docs/superpowers/plans/2026-08-12-pause-resume-and-day-attendance.md`.

- [ ] **Step 3: Commit**

```bash
git add docs/05-status.md docs/07-pitfalls.md
git commit -m "Record what the first real class taught us"
```

---

## Not in this plan

- **Performing the SMTP configuration.** It is a dashboard job in an account only the professor can open. Task 1 makes the failure legible and Task 6 writes the steps; neither can raise the ceiling.
- **Turning off test sign-in.** Its trigger and its exact steps are in Task 6, deliberately gated on a verified real email delivery. Doing it any earlier would strand a class if email is not ready.
- **Pause/resume and day-based attendance** (spec section 6). Separate plan: it needs a migration and touches five attendance call sites.
