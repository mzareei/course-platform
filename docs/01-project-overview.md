# Project overview

## What we are building

A teaching platform for **TC2007B — Information Security** at Tecnológico de
Monterrey, run by Professor Mahdi Zareei. It is the software he stands in front
of a class with.

It replaces four accreted generations of tooling (static decks → live quizzes →
a learning loop → a graded platform) that had become impossible to operate: 18
duplicated pages, a three-page dance to run one class, and teaching content
sitting publicly in a GitHub repo.

## The goal

**One screen to run a class, and a professor never writes a quiz question.**

Concretely:

1. A professor uploads a lecture PDF. The platform produces a bilingual web deck
   and a tiered question bank from it, for review and approval.
2. In class, the professor pushes questions from that bank to students' phones,
   sees the room's answers live, and reveals the answer.
3. At the end, a timed quiz runs — questions drawn automatically, mixed across
   difficulty — followed by a short written reflection.
4. Everything is graded and lands in a weighted gradebook without extra work.

## Who uses it

- **Students** — on phones, during class. They never navigate; the screen
  follows the professor. Design for someone who has never seen it before and
  isn't paying full attention.
- **The professor** — running a live class, one thing at a time, no
  state-machine vocabulary anywhere in the default UI.
- **Other professors (future)** — the whole point of the AI pipeline is that
  someone else can upload their own PDF and get a working lecture.

## Audience constraints that shape the product

- **Bilingual, always.** Every user-facing string is English + Spanish
  (Mexican academic register). Some instructors are not comfortable in English.
  This is enforced by a verifier, not by discipline.
- **Phone-first for students**, desktop/projector for the professor.
- **Nothing leaks.** Teaching content is private until released for a class.

## Definition of success

The project is finished when all of the following are true:

1. A professor can run a complete class — deck, live questions, timed quiz,
   reflection — from one screen, without touching the old apps or the database.
2. A professor who has never seen the codebase can upload a PDF and get a
   usable deck plus a valid question bank, and can tell what to fix if the
   output is wrong.
3. Students only ever see released content, and grading requires no manual
   reconciliation.
4. Everything a professor needs is available in Spanish.
5. A full class has been run on real student phones without intervention
   (**dress rehearsal — not yet done**).
6. No teaching content remains in the public repository.

Items 2–4 are essentially met. Items 5 and 6 are outstanding.

**Item 1 was wrongly claimed as met until 2026-07-28.** Releasing content was
never possible from the v2 app: the Content screen listed AI generation jobs
only, and nothing in the SPA ever called `course-release-management`. Every
release that existed had been made in the old app or seeded by hand — which is
exactly why testing never caught it, since the lecture used throughout was
already released. A **Your lectures** tab now closes this, but it has not yet
been exercised by the professor. See `05-status.md` item 6.

The general lesson is in `07-pitfalls.md` #14: a capability the test data
already satisfies is invisible until someone needs it for something new.

## Explicit non-goals

- Not a general-purpose LMS. It does one course well.
- Not a replacement for the institution's official grade system.
- The first-generation apps (`assets/course-materials/information-security/`
  classroom, teacher, progress, portfolio, exit-ticket, …) are **frozen**:
  untouched, unlinked, never built on.
- Portfolio and Review Coach were deliberately dropped from the v2 UI. Their
  backend and data remain.
