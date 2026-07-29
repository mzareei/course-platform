# Handoff prompt

Paste everything below the line into a fresh session.

---

I'm Mahdi Zareei, a research professor at Tecnológico de Monterrey. You're
picking up an in-progress project from a previous AI session. Everything you
need is documented in the repo — read it before doing anything.

## Open this folder

Start the session in **`~/Documents/GitHub/course-platform`**. You'll also need
`~/Documents/GitHub/mzareei.github.io` (edge functions and migrations) — just
use absolute paths for it; you don't need a second session.

## First, orient yourself

Read these files in order, from `docs/`:

1. `00-START-HERE.md`
2. `01-project-overview.md`
3. `02-architecture.md`
4. `03-design-system.md`
5. `04-decisions.md`
6. `05-status.md`
7. `06-runbook.md`
8. `07-pitfalls.md` — **read this properly. Every entry already cost real time.**

## What this is

A teaching platform for my information-security course (TC2007B), live at
**https://course-platform-3ko.pages.dev**. It runs my classes: shows the lecture
deck, pushes live questions to students' phones mid-lecture, runs a timed
end-of-class quiz, collects a written reflection, and grades all of it. It also
generates a bilingual lecture deck *and* its question bank automatically from a
PDF I upload.

Two repos, you need both:
- `~/Documents/GitHub/course-platform` — the Preact SPA (deploys to Cloudflare
  Pages on push to `main`)
- `~/Documents/GitHub/mzareei.github.io` — Supabase edge functions
  (`supabase/functions/`), migrations (`supabase/migrations/`), and my public
  academic site

Supabase project ref: `ojmbupftdikwmlqvibwt`. `ANTHROPIC_API_KEY` is set.

Both repos were fully committed and pushed, nothing outstanding, as of
2026-07-29. Confirm with `git status` yourself before trusting that — it's the
first thing worth checking, not an assumption to inherit.

## Where things stand

Phases 1–5 are complete and deployed. Since the version of this prompt you may
have seen before, a lot of instructor-facing functionality that either didn't
exist or was quietly broken has been built, found broken, fixed, and this time
**verified live in a real signed-in browser** rather than just reasoned about.
Read `05-status.md` in full — it is long and it is the actual source of truth,
this section is a summary and will drift out of date faster than that file
does. `07-pitfalls.md` has grown to ~21 entries; several were found in the last
two days and are directly relevant to anything you touch on these screens.

**Done and verified live (as of 2026-07-29):**
- The full class flow: deck, live pulse questions, timed quiz, reflection,
  grading — this was already true
- Gradebook → **Per class** review (pulse distributions with correct answers,
  quiz stats, every reflection in full)
- **Admin** screen: create courses, invite professors/TAs, remove staff
- **CSV roster import** on People, with bilingual header matching and a
  preview before any write
- Content → **Your lectures**: lists all 27 items (decks + missions), and can
  make one available to students / take it back. This closed a real gap where
  the app had **no way to release any content at all** — every release that
  existed had been made in the old app or seeded by hand, which is why testing
  never caught it (see `07-pitfalls.md` #14, and #17/#18 for the two release
  bugs found and fixed after that)
- **Groups** (course sections) and **class days**: create/rename/retire a
  group, add/cancel a class day, run it from there — this unblocks onboarding
  a second professor, who previously had nowhere to put their students
- **Remove a person** from the roster (not a delete — reversible, work and
  grades survive)

`05-status.md` has the full remaining list in priority order. The top items:

1. A dress rehearsal with real students on real phones (nothing substitutes for
   this — only test accounts have ever used it). **Still the single highest-
   value thing outstanding.**
2. Re-verify the reflection step on a genuinely fresh class session — easier
   now that class days can actually be created
3. Grade adjustments and locking — backend exists, no UI
4. Phase 6 cleanup — strip lecture content from the public repo, redirect the
   old app pages, confirm nothing gated leaks. This is success criterion #6.
5. A known low-priority wrinkle: the AI generation worker can race itself on a
   cold start (self-healing, writes a confusing transient error)

## How I want you to work

- **Keep going without stopping to ask.** Make the reasonable call and tell me
  what you decided. I'll redirect you if it's wrong.
- **Test through the real entry points, in an actual browser, yourself.** Sign
  in as a student and click from the Today screen. A previous session tested by
  navigating straight to internal routes, and shipped a build where students
  literally could not join a live class. More recently (2026-07-28/29), three
  bugs in a row shipped on the same instructor screen because it was reasoned
  about instead of opened in a browser — I had to find each one myself and say
  so before it got fixed properly. **I have Chrome MCP browser tools available
  and I expect you to use them on my already-signed-in session** for anything
  instructor-facing, not just student flows. If you're typing an internal URL,
  or you're only reading code and not clicking anything, you are not testing it.
- **Don't tell me something works until you've seen it work in the UI, yourself,
  in that session.** I test for real and I'll find it if you didn't.
- **Be honest about what's verified vs. assumed.** Say plainly when something is
  broken or unverified.
- **Keep the docs current.** When you finish something or learn something
  painful, update `05-status.md` and `07-pitfalls.md` in the same commit. The
  point of these files is that I can swap agents at any moment.

## Test accounts

- Instructor (me): `m.zareei@tec.mx` — emailed 6-digit code. Test sign-in is
  deliberately refused for instructors, by design, so you cannot script your way
  into this account. Either drive my already-signed-in Chrome session if your
  environment gives you that, or ask me to sign in and drive it together.
- QA student: `zarei.1982@gmail.com` — use the "Sign in without email (testing)"
  button
- Second student: `test.student@tec.mx` — same

Use a second browser or private window so both sessions are live at once.

## Definition of success

The project is finished when:

1. I can run a complete class — deck, live questions, timed quiz, reflection —
   from one screen, without touching the old apps or the database.
2. A professor who has never seen the codebase can upload a PDF and get a usable
   deck plus a valid question bank, and can tell what to fix if the output is
   wrong.
3. Students only ever see released content, and grading needs no manual
   reconciliation.
4. Everything I need is available in Spanish.
5. A full class has run on real student phones without intervention.
6. No teaching content remains in the public repository.

Items 1–4 are met, including releasing content, as of 2026-07-28. 5 and 6 are
the outstanding ones — that's genuinely what's left for "done."

## Already answered — don't re-ask

The quiz's per-question timing (20s easy / 30s medium / 45s hard) was a real
open question in earlier versions of this project. **I confirmed on 2026-07-28
it's seconds, correctly implemented, and closed.** Don't raise it again; see
`04-decisions.md` if you want the record.

Start by reading the docs, then tell me what you plan to do first.
