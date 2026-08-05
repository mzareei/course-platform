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

## Private content architecture — status as of 2026-08-05

Audit and design are complete on paper; implementation has not started.

Established from repository evidence (direct):

- 23 migrated items at `courses/tc2007b/items/<slug>/index.html` — note the
  filename differs from the AI pipeline's `deck.html` (pitfall #58).
- The public academic site still publishes all 23, linked from
  `_courses/information-security.md`; `_config.yml` does not exclude `assets/`.
- Every private object carries absolute `mzareei.github.io` links; 9 missions
  link to the public copy of their own lecture (pitfall #57).
- Content items are unowned and course-wide: any instructor can read, edit and
  overwrite any other instructor's item and storage object. `created_by` is
  null on migrated items (pitfall #59).
- Group create is owner-only on the backend; rename and archive are not, and
  the Add-a-group control renders for every instructor.

Not verified — this session had no Supabase credentials and no outbound access
to `mzareei.github.io`:

- The actual 27 `content_items` rows, their release/session use, and their
  question-bank links. Run `docs/audits/content-origin-audit.sql` (read-only)
  and record the results in the audit document before any publish or cleanup.
- Whether the public URLs are currently live.

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
