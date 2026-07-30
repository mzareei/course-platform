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
(`released | live | paused | review_only | scheduled`), with no class session.
It reaches every student through **Review**, which is what you want for nearly
all material.

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
