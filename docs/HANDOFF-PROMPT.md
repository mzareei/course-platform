# Handoff prompt

Paste everything below the line into a fresh session.

---

I'm Mahdi Zareei, a research professor at Tecnológico de Monterrey. You're
picking up an in-progress project from a previous AI session. Everything you
need is documented in the repo — read it before doing anything.

## First, orient yourself

Read these files in order, from `~/Documents/GitHub/course-platform/docs/`:

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

## Where things stand

Phases 1–5 are complete and verified live: content gating, live in-class
questions, the timed end-of-class quiz, reflections, grading, full EN/ES
bilingual support, and the AI PDF-to-deck-and-question-bank pipeline (which has
been run end to end on real lecture content — it produced a 33-slide bilingual
deck and 18 questions split 6 easy / 6 medium / 6 hard).

`05-status.md` has the full remaining list in priority order. The top items:

1. A dress rehearsal with real students on real phones (nothing substitutes for
   this — only test accounts have ever used it)
2. Re-verify the reflection step on a fresh class session
3. Gradebook Tab B — per-class review (still a placeholder)
4. Admin screens — the backend exists, there's no UI, so I can't onboard another
   professor yet
5. CSV roster import, then grade adjustments
6. Phase 6 cleanup — strip lecture content from the public repo, redirect the old
   app pages, confirm nothing gated leaks

## How I want you to work

- **Keep going without stopping to ask.** Make the reasonable call and tell me
  what you decided. I'll redirect you if it's wrong.
- **Test through the real entry points.** Sign in as a student and click from the
  Today screen. A previous session tested by navigating straight to internal
  routes, and shipped a build where students literally could not join a live
  class. If you're typing an internal URL to reach a feature, you're not testing
  it.
- **Don't tell me something works until you've seen it work in the UI.** I test
  for real and I'll find it.
- **Be honest about what's verified vs. assumed.** Say plainly when something is
  broken or unverified.
- **Keep the docs current.** When you finish something or learn something
  painful, update `05-status.md` and `07-pitfalls.md` in the same commit. The
  point of these files is that I can swap agents at any moment.

## Test accounts

- Instructor (me): `m.zareei@tec.mx` — emailed 6-digit code. Test sign-in is
  deliberately refused for instructors.
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

Items 1–4 are essentially met. 5 and 6 are the outstanding ones.

## One open question you can just ask me

The end-of-class quiz currently times each question at 20s (easy) / 30s (medium)
/ 45s (hard). I once said "20 seconds up to 45 minutes" — the previous session
read that as 45 *seconds*. Confirm with me, and if I meant minutes, change
`SECONDS_BY_DIFFICULTY` in `src/features/quiz/Player.tsx`.

Start by reading the docs, then tell me what you plan to do first.
