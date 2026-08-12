# Runbook

## Prerequisites

- Node (for the SPA), `npx supabase` CLI already linked to project
  `ojmbupftdikwmlqvibwt`.
- Both repos checked out:
  - `~/Documents/GitHub/course-platform` (SPA)
  - `~/Documents/GitHub/mzareei.github.io` (functions, migrations)

## Frontend

```bash
cd ~/Documents/GitHub/course-platform
npm run dev        # local dev server
npm run typecheck  # tsc --noEmit
npm run verify     # every tools/verify-*.mjs — treat failure as a build failure
npm run build      # typecheck + vite build
```

**Deploying is `git push`.** Cloudflare Pages builds `main` automatically.

To confirm a deploy actually landed before testing (the asset hash changes every
build):

```bash
# the hash printed by `vite build`, e.g. index-DQXm01eX.js
until curl -s https://course-platform-3ko.pages.dev/ | grep -q "index-<HASH>"; do sleep 5; done; echo deployed
```

Testing against a stale bundle is a reliable way to waste an hour.

## Backend

```bash
cd ~/Documents/GitHub/mzareei.github.io

npx supabase db push --include-all             # apply migrations
npx supabase functions deploy <function-name>  # deploy one function
```

Functions do **not** deploy on git push — deploy them explicitly.

New function checklist:
1. Create `supabase/functions/<name>/index.ts`.
2. Add to `supabase/config.toml`:
   ```toml
   [functions.<name>]
   verify_jwt = false
   ```
3. Deploy.
4. Add a typed wrapper in `src/api/`.

### Secrets

```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
# optional
npx supabase secrets set ANTHROPIC_MODEL=claude-sonnet-5
npx supabase secrets set GENERATION_WORKER_SECRET=<random>   # locks the worker endpoint
```

### Content repository sync

Create a GitHub fine-grained token with read-only **Contents** access to the private
`mzareei/course-content` repository. Keep the token out of the browser, repository,
and frontend build output; store it only in Supabase:

```bash
cd ~/Documents/GitHub/mzareei.github.io
npx supabase secrets set COURSE_CONTENT_GITHUB_TOKEN="<fine-grained-read-only-token>" --project-ref ojmbupftdikwmlqvibwt
npx supabase functions deploy course-content-sync --project-ref ojmbupftdikwmlqvibwt
```

Then push the `course-platform` frontend so Cloudflare Pages builds it. In the live
app, open **Content**, choose **Sync from repository** on an owned storage-backed
item, and confirm that the result reports the source commit. The button updates the
private instructor copy and version history only; it does not change
`content_releases`. Release the item separately after review.

Check the AI pipeline is wired up:

```bash
curl -s -X POST \
  https://ojmbupftdikwmlqvibwt.supabase.co/functions/v1/course-generation-worker \
  -H 'content-type: application/json' -d '{"action":"health"}'
# => {"ok":true,"anthropic_key_configured":true}
```

### Deck template assets

The deck engine's CSS/JS and skeleton are embedded in
`supabase/functions/course-generation-worker/deck-assets.ts` because edge
functions only ship files reachable through a TypeScript import. After editing
anything in `supabase/functions/_shared/templates/`:

```bash
node tools/build-deck-assets.mjs
```

## Deploying the private-content work

Ordered. Each step assumes the one before it succeeded. Nothing here is
reversible by simply reverting a commit, so read the whole sequence before
starting the first command.

### 0. Before anything

Create the private repository `mzareei/course-content` on GitHub (private, no
README) and move `tools/content-repo/` into it — see that directory's README.
The materials need a home before they leave the public one.

### 1. Backend, in this order

Migrations first, then the functions that depend on them. A function deploy
proves packaging, not that its database contract exists.

```bash
cd ~/Documents/GitHub/mzareei.github.io
npx supabase migration list --linked        # confirm 0032/0033 are pending
npx supabase db push --include-all --yes    # applies 0032 then 0033
```

`0032` is additive and changes nothing anyone can see. `0033` assigns all 27
content items to the platform owner; it aborts if there is not exactly one
active owner, and rolls back rather than leaving a half-owned library.

**The ordering that matters:** `0033` must be applied *before* the content
functions are deployed. Every existing item has a null owner until it runs, and
while the code treats null as "visible to everyone" — deliberately, so this
cannot lock you out — deploying the filter first and the backfill later leaves
a window where ownership means nothing.

```bash
npx supabase functions deploy course-section-management --project-ref ojmbupftdikwmlqvibwt
npx supabase functions deploy course-content-library    --project-ref ojmbupftdikwmlqvibwt
npx supabase functions deploy course-content-upload     --project-ref ojmbupftdikwmlqvibwt
npx supabase functions deploy course-content-cleanup    --project-ref ojmbupftdikwmlqvibwt
npx supabase functions deploy course-content-sync       --project-ref ojmbupftdikwmlqvibwt
npx supabase functions deploy course-generation         --project-ref ojmbupftdikwmlqvibwt
npx supabase functions deploy course-generation-worker  --project-ref ojmbupftdikwmlqvibwt
```

### 2. Frontend

Merge the frontend PR. Cloudflare builds `main` automatically. Confirm the new
bundle is live before testing anything — testing against a stale bundle is a
reliable way to waste an hour.

### 3. Clean the stored decks

Instructor → **Content**. A card appears above your lectures naming how many
items still link to the public site and how many links in total. Preview costs
nothing and writes nothing.

**Do this while nothing is released.** Production confirmed zero student-visible
releases on 2026-08-06; the rewrite currently disturbs nobody, and that stops
being true the moment you release material for a class.

Confirm, and watch it work through the items one at a time. Each one keeps a
rollback copy under `.versions/` with a `content_versions` row.

Then verify one deck through the real path: open it from **Review** as a
student, not by typing a URL. Check the deck still advances, and that the
mission's "Return to lecture" button is gone rather than broken.

### 4. Only then, the public site

Do not start this until step 3 reports every item clean. Retiring the public
tree first turns every mission's primary navigation into a 404 *from inside*
the private bucket.

Two content items also point at the public apps and must be archived or
repointed in the same change: `review-coach` and `teacher`.

### Rolling back

- A bad deck: the previous bytes are in `.versions/` next to it, indexed by
  `content_versions`. Re-upload that object at the live path.
- The ownership backfill: `owner_profile_id` was null before it ran, and the
  audit row records the count assigned.
- Migration `0032`: additive; leaving the columns in place is harmless.

## Clean production reset (one time, after QA)

The reset is guarded by migration `0030_prepare_clean_platform_reset.sql`.
It preserves TC2007B content, generated assets, question banks and the owner,
then leaves Groups 401/402/501/502 with no students or historical activity.
Do not run it while feature QA is still in progress.

From the backend repository, first apply only migration 0030 and run the
count-only preview through the service-role SQL connection:

```sql
select public.clean_tc2007b_platform(false);
```

The preview returns counts and opaque fingerprints only; it does not perform
DML. Review the owner count, retained-asset fingerprint and operational counts.
If any precondition fails, stop and fix the data rather than bypassing the
guard. After the final signed-in rehearsal, apply migration 0031:

```bash
npx supabase db push --include-all --yes
```

Migration 0031 calls `public.clean_tc2007b_platform(true)` in the migration
transaction, asserts that retained fingerprints are unchanged and that all
historical tables are empty, then drops the one-shot function. Any error rolls
back the complete reset. In the production project on 2026-08-03, the same
guarded transaction was executed directly in the signed-in SQL Editor because
the available CLI session had no `SUPABASE_ACCESS_TOKEN`; the count-only
postcondition was recorded in `05-status.md` and `PROJECT-HANDOFF.md`.
Verify the clean state from the real instructor entry point: TC2007B opens,
Groups 401/402/501/502 are present, Content and Question banks remain, and
Classes, Gradebook history, Review releases, notes, students and attempts are
empty. Do not create a synthetic production class merely to make the clean
state appear non-empty.

## Sending sign-in emails to a whole class

**Why this exists.** The first real class (2026-08-11/12) could not sign in:
every student saw a rate-limit error. The project still uses Supabase's
**built-in** email service, which is capped at a couple of messages per hour for
the entire project and is documented by Supabase as testing-only. Thirty
students pressing **Send** in one minute means two get a code and the rest are
refused. No code change raises this — `course-test-signin` exists precisely
because of it, and its own header says so.

**Step 0.** Open Supabase → **Project Settings → Authentication → SMTP Settings**
and check whether *Enable Custom SMTP* is already on. Everything below assumes
it is off, which is what hitting the built-in ceiling implies.

### Choosing a provider

Resend and most transactional providers require a **verified DNS domain**, and
we do not control DNS for `tec.mx`. Two that do not:

**Brevo — recommended.** Free tier, 300 emails/day, verifies a *single sender
address*.

1. Create an account at brevo.com.
2. **Senders, Domains & Dedicated IPs → Senders → Add a sender**, using
   `m.zareei@tec.mx`.
3. Click the confirmation link Brevo emails to that address.
4. **SMTP & API → SMTP**: copy the server, port `587`, the login, and the
   generated SMTP key.

**Gmail — second choice.** Needs 2-Step Verification on the Google account, then
an **App Password** from myaccount.google.com/apppasswords. Host
`smtp.gmail.com`, port `465`, username the full Gmail address, password the
16-character app password. Roughly 500 recipients a day.

### Configuring Supabase

Project Settings → Authentication → **SMTP Settings** → enable Custom SMTP →
paste host, port, username, password. **Sender email must be the address
verified with the provider**, or every message is rejected. Save.

Then Authentication → **Rate Limits** → raise *Rate limit for sending emails*
from the built-in default to **300 per hour** — comfortably above one class, and
low enough that a runaway loop is still capped.

### Verify before a class, not during one

From a phone that has never signed in, on the live site, request a code with a
real student address and confirm it arrives within a minute. **Then have a
second and third address request one inside the same minute and confirm all
three arrive.** One success proves nothing about the ceiling — that is exactly
what a single professor's test proved on day one, while the class was locked out.

### Then close the test sign-in door

Only after that verification, and as a change of its own:

```bash
# In the SPA repo: set testSignIn to false in src/config.ts, then
npm run typecheck && npm run verify
git commit -am "Close test sign-in now that real email works"
```

and clear the `COURSE_TEST_SIGNIN_UNTIL` secret in the Supabase dashboard. Until
both are done, anyone who knows a rostered address can sign in as that student,
and their grades hang off that account. Record the date in `docs/05-status.md`.

### If a class still sees refusals afterwards

The whole room shares one campus NAT address. Some Supabase auth endpoints are
rate-limited **per IP**, independently of email. That is the next thing to
check — not a reason to conclude the SMTP change failed.

## Testing against production without touching a real class

**Never rehearse on a real class session.** A session left `live` for hours is
usually half-taught on purpose and will be continued next session; ending it
posts every student's grade and publishes the lecture to Review. Closing a class
the professor intended to resume is not recoverable by re-opening it.

Use a throwaway instead. Group **502** is empty (`planned`, zero enrolments) and
exists for this:

1. Add one disposable student to 502 — `add_person` with a `@tec.mx` address.
   They land as `status: 'invited'` with no auth link, which is also exactly the
   state needed to test a first-ever sign-in.
2. Create a session in 502, title it obviously (`ZZ SANDBOX — delete me`), and
   attach whichever lecture you need. For anything about polls retiring
   themselves, pick a lecture whose bank has **zero checkpoint coverage** — that
   is the imported-deck shape where the plan-driven path runs.
3. Start it, test, then clean up **all four** of these:
   - close and `delete_session` with `force: true` (it will have pulse rounds),
   - `remove_person` for the disposable student,
   - archive the `review_only` release that closing the session created for 502,
   - confirm `list_sessions` shows no `SANDBOX` rows left.

`remove_person` deactivates the membership and deliberately keeps the profile
row (see pitfall #20), so the roster count stays one higher. That is expected,
not leftover mess.

To drive a student and an instructor at once without losing the instructor
session, do not sign in and out — both share one `localStorage` key per origin.
Get a student session with `course-test-signin` and exchange the OTP at
`/auth/v1/verify` with `fetch`, keeping the token in a variable. The instructor
session in `localStorage` is never touched.

**Make the probe fail loudly.** A verification script that greps the UI must
assert the strings it greps for actually exist, and must treat a non-200 response
as a failure rather than as "nothing on screen". Both mistakes were made on
2026-08-12 and both made a broken cockpit look healthy.

## Test accounts

| Who | Email | How |
|---|---|---|
| Instructor / owner | `m.zareei@tec.mx` | Emailed 6-digit code. Test sign-in is **refused** for instructors. |
| QA student | `zarei.1982@gmail.com` | "Sign in without email (testing)" button |
| Second student | `test.student@tec.mx` | Same testing button |

Use a second browser or a private window for the student side so both sessions
are live at once.

## Manual test: a full class

Do this through the UI, never by typing internal URLs.

1. With no future session, **Instructor Home → Schedule a class**. In
   **Classes**, create a group if needed and schedule the class with its lecture.
2. Content → **Question banks**. If the selected legacy lecture says
   **Needs attention**, run **Prepare checkpoints** and wait for **Ready for
   class** before presenting it.
3. Home → **Run class** → verify the private deck and QR → **Start class**.
4. **Student** (fresh second browser) starts from Today or scans the QR. The
   **Join class** action must be reachable without typing `/live`.
5. Advance the deck to an authored checkpoint. Space sends the prepared
   question; the student answers; Space reveals; Right Arrow closes it and
   resumes the deck. Complete two checkpoints and skip one.
6. Reload Run Class while a question is open and confirm the same round is
   restored. Hold Space once and confirm it does not send then reveal.
7. At the end, **Start the quiz**. Student gets questions one at a time,
   each timed, auto-advancing.
8. **Instructor** → watch submitted count → **Close the quiz** → class average.
9. **Student** → reflection (50–100 words) → submit.
10. **Instructor** → the reflection appears under Reflections.
11. **Instructor** → **End the class**, read the in-app consequence text, then
   **Confirm: end the class**. This closes the session — only do it when
   you're finished testing, since it stops "Join class" appearing).
12. Check Gradebook → **Per class**, then **View as student** and navigate
    Today → Review → Grades. Week 1 Quiz must never appear in Review.

Rehearse the student side at 375×812 and 430×932, and the instructor cockpit at
1440×900.

A quiz can be run more than once per class — after closing, the button becomes
**Start another quiz**.

## Manual test: per-class review (Gradebook Tab B)

Instructor only — test sign-in cannot reach this screen, so it has to be you.

1. Sign in as the instructor → **Gradebook** → the **Per class** tab.
2. The picker defaults to the most recent class that has actually been held.
   Choose the session you just ran.
3. Expect three blocks:
   - **Questions asked in class** — one bar chart per question, in the order
     they were pushed, correct answer marked ✓, with "x of y correct · z in the
     class" underneath.
   - **End-of-class quiz** — "n of m finished · class average p%", then a row
     per student with status, score and submission time.
   - **Reflections** — every submitted paragraph in full, with its word count.
4. A class where nothing happened should say so in words ("No questions were
   sent to the class during this session."), never render an empty table.

## Manual test: your lectures and making them available

Instructor only. **Making something available is a real write — students see it
immediately.**

1. Sign in as the instructor → **Content** → **Your lectures** (default tab).
2. Every content item is listed with one of two badges: **Students can open it**
   or **Not available to students**. Filter with All / Available / Not available.
3. **Make it available** → confirm → the badge flips and it says *Whole course*.
4. Check as a student (QA account): it should appear under **Review**.
5. **Take it back** → confirm → the badge flips back and it disappears for the
   student. Then make it available again — that round trip is the regression
   for pitfall #16.
### What "available" means

**Available** = a `content_release` in a student-visible state
(`released | live | paused | review_only`, or `scheduled` after `opens_at`),
within its opening/closing window and with no class session. A future
`scheduled` release is labelled with its opening date but is not counted as
available. **Cancel scheduled access** returns it to `draft`; it must not try
the invalid `scheduled → closed` transition.

A whole-course available release reaches every student through **Review**,
which is what you want for nearly all material.

A release can also carry a `class_session_id`, which is what puts it on that
day's **Today** screen. There is no UI for that right now: the control was
removed on 2026-07-28 because it created a draft and never released it. It
returns properly now that class days can be created — see `05-status.md`.

## Manual test: CSV roster import

Instructor only. **Apply is a real bulk write — test against a throwaway
section first.**

1. Sign in as the instructor → **People**.
2. **Import a roster from a spreadsheet** → choose `docs/test-roster-sample.csv`.
   It is built to exercise the whole preview: Spanish accented headers, a quoted
   name containing a comma, a blank role that should default to student, and
   four rows that should each be rejected for a *different* reason (malformed
   email, non-institutional domain, unknown section, duplicate email).
   Expect **3 accepted, 4 rejected**.

   **Stopping at the preview writes nothing** — that alone verifies the parser,
   the header matching and every rejection message.
3. The preview shows accepted rows and, separately, rejected rows with the
   reason for each. Nothing has been written yet.
4. **Import n people** → confirm. The roster table below refreshes.

   The sample file's three valid rows are fake `@tec.mx` addresses. They can be
   taken off again with **Remove** on each row, which leaves a "Removed" row
   behind rather than deleting anything. If you only want to check the parser,
   stop at step 3 — the preview writes nothing.
5. Re-import the same file. Everyone should keep their sign-in — that is the
   regression guarded by pitfall #13. (Removing a student is item #6 on the
   remaining-work list, and this is why it matters.)

Headers are matched loosely: `email`/`correo`, `name`/`nombre`,
`section`/`grupo`/`sección`, `student_id`/`matrícula`. Only email, name and
section are required.

## Manual test: platform admin

Platform owners only. The **Admin** tab appears in the instructor nav only if
you hold an active `platform_owner` membership.

1. Sign in as the owner → **Admin**.
2. The **Courses** table lists every course with its teaching-staff count.
3. **Invite a professor** — pick a course, enter a `tec.mx` / `itesm.mx`
   address, choose Professor or Teaching assistant, invite. The row appears in
   **Teaching staff** straight away, with the account showing as *Invited*
   until that person signs in for the first time and claims it.
4. **Remove** deactivates the membership after a confirm that names the
   consequences. Platform-owner rows have no Remove button, so you cannot lock
   yourself out.
5. Creating a course needs all four fields; the short id is permanent and is
   what appears in links.

An invite is a real write. Test with an address you control, then remove it.

## Manual test: the AI pipeline

1. Instructor → **Content** → give a lecture title, choose a PDF →
   **Upload and generate**.
2. Watch the job card move through the steps (~2–4 minutes).
3. **Review it** — the deck preview should navigate properly and show
   *n* / *total*, and the questions should list with correct answers marked and
   a 6/6/6 split.
4. **Approve** — the bank goes active and a **draft** release is created.
   Students still see nothing until it is released for a class.

If you need a test PDF, the working recipe is in
`docs/05-status.md` under "How the pipeline was dogfooded".

## Verifying against the database

The Supabase SQL editor is useful for confirming what actually landed:

```sql
select * from participation_events order by created_at desc limit 5;   -- pulse credit
select * from gradebook_scores order by updated_at desc limit 5;       -- quiz scores
select * from exit_tickets order by created_at desc limit 5;           -- reflections
select id, status, error, lecture_title from generation_jobs
  order by created_at desc limit 5;                                    -- AI jobs
```

Note that some destructive/administrative SQL may be blocked by tooling policy —
prefer the app's own endpoints where possible.

## Common gotchas

- **Deploy hash:** always confirm the new bundle is live before testing.
- **Session already used:** the test class session accumulates state (a closed
  quiz, a submitted reflection). That is not a bug — some branches simply won't
  render again for that student. A fresh session exercises them cleanly.
- **Instructor test sign-in fails:** by design.
- **A generated job shows an error but says "Ready for your review":** a retry
  that later succeeded. The UI now hides it and `approve` clears it.

## Manual test: groups, class days, and removing people

All instructor-only, all on the **People** screen.

1. **Groups** → *Add a group* with a short code (e.g. `B`). It appears in the
   table as Active, and immediately becomes selectable when adding a class day.
   *Retire* takes it out of that picker without touching anything existing.
2. **Class days** → pick a date, a group, and a title → *Add a class day*.
   Confirm three things, because each has broken before:
   - the row shows the date **you picked** (pitfall #19),
   - it also appears on **Home** under Upcoming sessions,
   - *Run this class* opens Run Class with the question-bank picker — the href
     must be a UUID, not `/teach/run/undefined` (pitfall #3).
3. **Cancel this class** on a planned day removes it from both lists.
4. **Remove** on a roster row: the person's badge becomes **Removed**, their
   group disappears, and the button goes away. Their work and grades are
   untouched, and adding the same email again brings them back.
   There is no Remove button on your own row, and the server refuses it anyway.

Test removal with a throwaway address rather than a real student — removal is
reversible but leaves a "Removed" row behind, and there is no hard delete.

## Release rehearsal: class editing, group Review, and private notes

Use an instructor session plus the two test students in separate browser
origins. These steps make real writes; use a disposable group and restore the
student afterwards.

1. Before deploying a roster function that calls a new RPC, run
   `npx supabase migration list --linked`. Apply every reviewed pending
   migration before deploying the dependent function.
2. Confirm the production alias serves the new hashed bundle, not only the
   deployment-specific Pages URL.
3. Classes → create a disposable active group. Manage members → assign an
   **invited** student before their first sign-in and confirm the filtered row
   shows the new group. Retire another disposable group: its People view must
   show no assignment control, and a direct authenticated assignment call must
   return `group_not_assignable` without changing enrollment.
4. Create a class day with **No lecture yet**. Edit it to attach one reviewable
   lecture and save. Then open **Content**, find a different lecture, and use
   **Assign to a class** to replace the planned class's lecture. Reload Classes
   to prove the replacement persisted.
5. Edit the group's meeting metadata and confirm the server-returned value is
   visible after save.
6. Before close, use **Make available now** for the attached lecture, confirm
   the whole-course Review scope as required for the rehearsal, then **Remove
   from Review**. The class assignment must remain unchanged.
7. Run the class and Start class. Return to Classes: the live row must not offer
   Edit. Also send an authenticated `update_session` from a stale editor with a
   recognizable sentinel change; it must refuse because `actual_start_at`
   exists, and a fresh row must prove the sentinel was not stored. As QA Test
   Student, start at Today and use Join class.
8. End the class with the two-step in-app confirmation. Repeat the authenticated
   close request once and confirm it returns the same closed session while the
   single group Review release remains unique. Reload the QA student's context
   and confirm the attached lecture appears as **Review only**.
9. Sign in as Test Student. The QA group's lecture must be absent from Review.
10. Instructor → Gradebook → Per class → choose the class and QA Test Student.
   Add a unique private note with Needs follow-up. Move that student to a
   second disposable active group, then reopen the original class: its session
   note list must still load, the moved student must remain selectable through
   the dropped historical enrollment, and resolving the old-group follow-up
   must succeed. Open People → the same student's Notes and prove the
   profile-wide history still contains every semester note after Resolve while
   the class-scoped view remains exact.
11. With a QA-student token, call `course-auth-context` and
    `course-student-progress`: neither response may contain the note text.
    `course-student-notes` must return 403 and no note content.
12. If a future scheduled release is available for rehearsal, confirm Content
    does not count it as open yet and **Cancel scheduled access** moves it to
    draft with bilingual confirmation. Then cleanup: remove the disposable
    group Review release, move the QA student back to their original group,
    restore any temporarily changed group fields, and retire the disposable
    group. Recheck the real production group.

Closed class sessions and resolved notes are append-only operational history;
do not delete them to make a rehearsal look clean.

The 2026-07-30 follow-up completed this matrix on production bundle
`index-B-nhKDB6.js`. It also proved the archived-group server refusal through a
pre-staged authenticated People action, so the check exercised the real UI
entry point and the backend guard in one request.

The final composition follow-up completed the extended matrix on
`index-Dlk8k3FR.js`. For close idempotency, record release, release-event, and
`session_closed_with_review` audit counts before close, after close, and after a
second signed-in stale-tab close request; the observed values were
`0 / 0 / 0`, `1 / 1 / 1`, and `1 / 1 / 1`. For sequence moves, record the
source sequence and every occupied target sequence before moving, then query
the returned/persisted session; QA sequence 3 moved into A as sequence 5.

The future-schedule rehearsal used a release scoped only to disposable QA730E
and opening in 2035. Content showed it as scheduled but not available, and
Cancel scheduled access persisted `draft`. Keep that inert draft for the
planned final reset when deleting its event history is not explicitly approved.
