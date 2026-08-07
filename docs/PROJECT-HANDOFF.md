# TC2007B platform handoff

This file is the durable continuation record. Read it after `00-START-HERE.md`
when opening the project on a new machine or with a new AI session.

## Mission

Build Mahdi Zareei's bilingual teaching platform for Tecnológico de Monterrey's
TC2007B Information Security course. A professor schedules a class, presents a
lecture deck, asks generated questions at the points students have reached,
runs a timed end-of-class quiz, collects a reflection, and reviews grades and
notes. Students use Today, Review, Grades, and their phone during class.

Product rules already decided:

- Quizzes are live-only: the professor starts them during a class session.
- In-lecture questions are pre-generated from the deck's already-taught
  segments and appear at embedded checkpoints; they are not random questions
  from the whole lecture.
- Every question is generated from lecture content; the professor does not
  author quiz questions.
- In-lecture participation can make up for missed end-quiz points, but final
  grades do not exceed 100.
- Question timers are seconds: 20 easy / 30 medium / 45 hard.
- A class assignment makes the lecture available for student review after the
  class; there is no separate required "add to review" action.
- Projector results hide student identities except the final top-three podium.
- All user-facing copy is English + Spanish.

## Repository map

| Repository | Local path | Deployment |
|---|---|---|
| Frontend | `~/Documents/GitHub/course-platform` | Cloudflare Pages on push to `main` |
| Backend | `~/Documents/GitHub/mzareei.github.io` | Supabase migrations/functions manually |

Supabase project ref: `ojmbupftdikwmlqvibwt`.

The browser never queries tables directly. It calls Supabase Edge Functions.
Lecture HTML is always opened through the gated `/content?t=...` path; never use
`srcdoc` or `blob:`.

## Current deployed state

Frontend `main`: `2fb1a83` (single-screen classroom question layer).
Backend working tree: clean-reset migrations `0030`/`0031` are prepared for
future environments; production reset evidence is recorded below.

Live app: https://course-platform-3ko.pages.dev

The single-screen classroom feature is deployed:

- Run Class renders one lecture deck. A checkpoint question is sent into that
  same deck as an answer-neutral overlay, so the professor can use ordinary
  browser fullscreen without a second projector window.
- Reveal and grading stay private in the Checkpoint panel; Continue removes the
  overlay and resumes the deck. The generated deck and parent shell validate
  the protocol and reject correctness or identity leakage.
- The old projector route and `course-presentation` function remain as
  compatibility code only; they are not required for the classroom flow.
- Chrome rehearsal verified the deployed instructor path: bilingual prompt,
  A/B/C/D options, neutral reveal, and continue/resume were observed in the
  real deck iframe.

## Verification baseline

From the frontend repository:

```bash
npm install
npm run typecheck
COURSE_PLATFORM_BACKEND_ROOT=/absolute/path/to/mzareei.github.io npm run verify
npm run build
```

The current baseline is 13 verifiers passing, typecheck passing, and Vite build
passing. Backend functions do not deploy on Git push:

```bash
cd ~/Documents/GitHub/mzareei.github.io
npx supabase db push --include-all --yes
npx supabase functions deploy <function-name> --project-ref ojmbupftdikwmlqvibwt
```

## What is complete

- Auth, bilingual shell, themes, gated decks, generated deck/question-bank
  pipeline, content availability, class groups and class days.
- Student Today → Join class → live lecture → pulse → timed quiz → reflection.
- Instructor Run Class, Gradebook per-class review, Admin, People/CSV roster,
  private student notes, and end-class lifecycle.
- Remote projector/controller synchronization and its privacy verifiers.

## Production reset and verification

The clean reset was executed on 2026-08-03 in the signed-in Supabase SQL
Editor, after the guarded owner precondition returned exactly one active owner.
The count-only postcondition returned: 1 course, 1 profile, 2 memberships, 4
groups, 1 instructor enrollment, and zero sessions, releases, attempts,
responses, grades, notes, reflections, and audit rows. Retained TC2007B assets
are 27 content items, 14 question banks, and 223 questions (plus options and
generation assets). Group 401 is active; 402, 501, and 502 are planned.

The backend reset implementation is tracked in migrations `0030` and `0031`,
and `tools/verify-clean-platform-reset.mjs` passes. Production was executed
directly because the session had no Supabase CLI access token; no synthetic
class session was created after the reset.

## What is pending

1. Real-phone classroom dress rehearsal with the professor and enrolled
   students. Cover QR join from Today, late joins, concurrent answers, quiz
   timing, reflection, podium, and a projector reload. Desktop instructor
   rehearsal is complete; Chrome's student tab was blocked by an extension UI,
   so this evidence must be collected with actual phones.
2. Phase 6 public-site cleanup: remove teaching content from the public academic
   repository, redirect retired apps, and crawl for gated-content leaks. **The
   2026-08-05 audit found this cannot be done first** — every private object
   links back to the public copies, so the objects must be re-published clean
   before the public site is retired. See pitfall #57.
3. Private content authoring and publishing — **designed, awaiting approval,
   not built.** Read `docs/audits/2026-08-05-content-origin-audit.md` and
   `docs/superpowers/specs/2026-08-05-private-content-publishing-design.md`.
   No production data, storage object, or repository was created or changed.

## Private content architecture — status as of 2026-08-06

Audit closed, design approved, implementation complete except the public-site
retirement. **Nothing is deployed.** No production row, storage object, release
or public page has been changed.

### Verified from production (all five audit queries run 2026-08-06)

27 content items: 12 lectures, 12 missions, 2 `static_path` resources, 1
activity. 14 question banks, 223 active questions. Matches the reset record.

- **Zero items are released to students.** This inverts the risk on cleaning
  the decks: the rewrite currently disturbs nobody, and stops being free the
  moment material is released for a class.
- Every item points at `deck.html`, not `index.html` as the code-derived audit
  claimed. 23 superseded `index.html` objects sit in the bucket referenced by
  nothing (pitfall #58).
- Only `week-01-lecture` was ever checkpoint-prepared, so 11 lectures and all
  12 missions carry every public link they were migrated with.
- `review-coach` and `teacher` point straight at the public first-generation
  apps and break when those are retired.
- `created_by` is null on all 27, so ownership was assigned, not recovered.

### Built, on branch `claude/tc2007b-private-content-4cniyb` in both repos

| Piece | Where |
|---|---|
| Group lifecycle restricted to the platform owner | both repos |
| Ownership / sharing / versions schema + delete guard (`0032`) | backend |
| Ownership backfill (`0033`) | backend |
| Content scoped to its owner; upload guarded too | backend |
| `copy_content_item` — copy with its question bank | backend |
| Generated lectures under the same ownership rules | backend |
| Legacy nav cleanup, anchors **and** engine script | backend |
| `course-content-cleanup` — preview + clean, one item per call | backend |
| The Content screen's cleanup control | frontend |
| Owned/shared distinction and Copy action | frontend |
| Content repository scaffold, validator, publish CLI | frontend `tools/content-repo/` |

Measured on all 23 real decks rebuilt from source: **111 public references
before the cleanup, 0 after**, every script block still parsing.

Verifier baseline: **17 frontend, 62 backend.** Seven backend verifiers fail
identically on pristine `origin/main` — pre-existing and unrelated. Frontend
typecheck and build pass.

### Blocked, and on what

1. **`mzareei/course-content` does not exist.** This session's GitHub token
   cannot create repositories (403). It is a manual step; `tools/content-repo/`
   holds everything that goes in it.
2. **D5/D6, retiring the public course tree**, is correctly blocked twice over:
   the materials need the new repository first, and the stored decks must be
   cleaned first or every mission's navigation 404s from inside the bucket.
3. **Nothing has been verified live.** No signed-in instructor session and no
   network route to Supabase from this environment. Every claim above is from
   static verification or from the professor's own query output.

### The deployment sequence

`06-runbook.md` carries it in full. The order is not a preference: create the
content repository, apply `0032` then `0033`, deploy the six edge functions,
merge the frontend, clean the decks while nothing is released, and only then
touch the public site.

Destructive steps are enumerated as D1–D8 in the design document with a
mandatory ordering (D2 → D1 → D4 → D5 → D6). **None have been performed, and
none should be without explicit approval.** D8 — any deletion of content items,
question banks, questions, students, grades, attempts, releases or storage
objects — is not proposed at all.

## Safe continuation sequence

1. Start in `~/Documents/GitHub/course-platform` and read `00-START-HERE.md`,
   this file, `04-decisions.md`, `05-status.md`, `06-runbook.md`, and
   `07-pitfalls.md`.
2. Check both repositories with `git status`, then fetch `origin/main`.
3. Run the verification baseline before changing code.
4. Re-read `docs/superpowers/specs/2026-07-30-production-data-reset-design.md`
   and `docs/superpowers/plans/2026-07-30-production-data-reset.md` before any
   future reset work.
5. Keep this file, `05-status.md`, and `07-pitfalls.md` updated in the same
   commit as meaningful changes. Record commit IDs, deployment IDs, verified
   behavior, and explicit remaining work. Never record student names, emails,
   answers, grades, or notes in repository evidence.

## Known constraints and pitfalls

- Instructor test sign-in is intentionally refused; instructor UI verification
  requires Mahdi's real emailed-code session.
- Cloudflare frontend deploys on push; Supabase edge functions require an
  explicit deploy command.
- The primary local checkout may contain untracked `.superdesign/` and
  `AGENTS.md`; preserve them.
- Do not claim a real-phone rehearsal until phones complete the flow. The clean
  platform claim is backed by the SQL postcondition counts above; create a
  production class only when the next real class is ready.
