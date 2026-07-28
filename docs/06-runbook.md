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
npm run verify     # the three verifier scripts — treat failure as a build failure
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

1. **Instructor** → Home → **Run class** on today's session.
2. **Ask a quick question** → pick a lecture + difficulty → *Pick a question* →
   *Send to the class*.
3. **Student** (fresh session) → Today should read **"Class is live"** with a
   **Join class** button → tap it → the question appears within a few seconds →
   answer it.
4. **Instructor** → vote count updates → *Show the answer* → student sees
   right/wrong and points → *Close the question*.
5. **Instructor** → **Start the quiz**. Student gets questions one at a time,
   each timed, auto-advancing.
6. **Instructor** → watch submitted count → **Close the quiz** → class average.
7. **Student** → reflection (50–100 words) → submit.
8. **Instructor** → the reflection appears under Reflections.
9. **Instructor** → **End the class** (this closes the session — only do it when
   you're finished testing, since it stops "Join class" appearing).
10. Check **Gradebook** and the student's **My Grades**.

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
