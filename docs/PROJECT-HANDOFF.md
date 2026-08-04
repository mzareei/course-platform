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

Frontend `main`: `e7360d8` (`docs: record projector controller deployment`).
Backend `main`: `4d3125b` (`feat: deploy synchronized classroom presentation`).

Live app: https://course-platform-3ko.pages.dev

The projector/controller feature is deployed:

- `/teach/run/:sessionId/projector` is a read-only projector route.
- Run Class contains `ControllerNavigation` with projector heartbeat status,
  previous/next slide requests, and an Open projector link.
- `class_presentation_state` migration `0028` is applied.
- `course-presentation` is deployed and returns separate controller/projector
  response shapes.
- Projector telemetry is bound to both the active session generation and the
  deck bridge generation; same-content session changes force a fresh deck mount.
- Projector safety verifiers reject private result APIs, correctness leaks,
  stale telemetry, dead polling, computed aliases, and reveal-shadowing tricks.

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

## What is pending

1. **Production data reset (destructive, last step).** Preserve TC2007B content,
   question banks, generation assets, one platform owner, and four clean groups
   (401 active with the owner; 402/501/502 planned). Delete historical students,
   memberships, sessions, releases, attempts, responses, grades, notes,
   reflections, audit history, and QA auth accounts. This has **not** been run.
2. Finish and review guarded reset migrations `0030`/`0031` in the backend. Do
   not improvise deletes: validate the actual production schema and run a
   count-only preview first, then execute only after all signed-in QA.
3. Real-phone dress rehearsal with the professor and students. Test from the
   Today screen, not by typing internal routes. Cover sleeping phones, late
   joins, concurrent answers, projector reload, quiz timing, reflection, and
   podium.
4. Phase 6 public-site cleanup: remove teaching content from the public academic
   repository, redirect retired apps, and crawl for gated-content leaks.

## Safe continuation sequence

1. Start in `~/Documents/GitHub/course-platform` and read `00-START-HERE.md`,
   this file, `04-decisions.md`, `05-status.md`, `06-runbook.md`, and
   `07-pitfalls.md`.
2. Check both repositories with `git status`, then fetch `origin/main`.
3. Run the verification baseline before changing code.
4. Re-read `docs/superpowers/specs/2026-07-30-production-data-reset-design.md`
   and `docs/superpowers/plans/2026-07-30-production-data-reset.md` before any
   reset work.
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
- Do not claim the platform is clean until the reset postconditions are queried
  and the clean-state UI is verified.
