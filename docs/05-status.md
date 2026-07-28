# Status

**Last updated:** 2026-07-28

Phases 1–5 are complete and deployed. Phase 6 (cleanup) has not started, and
several capabilities still live only in the old app.

---

## Done and verified live

Everything below was exercised through the real UI, not by calling endpoints.

### Foundation
- SPA scaffolded, deployed to Cloudflare Pages, auto-deploys on push to `main`.
- Auth: institutional email + 6-digit code, plus a testing sign-in for rostered
  students (refused for instructors).
- Full EN/ES bilingual (~318 string pairs), enforced by a verifier.
- Light/dark theming with OS default and an explicit override.
- Three verifier scripts running in CI.

### Content gating (Phase 2)
- All 23 decks/missions moved to a **private** Supabase Storage bucket as
  single-file HTML.
- The three-hop gated delivery chain works and is guarded by a verifier.
- `GatedFrame` viewer in the app; students only see released content.

### Live class (Phase 3)
- `pulse_rounds` / `pulse_answers`; push / reveal / close / answer.
- Question snapshotted at push; correctness withheld until reveal.
- Hybrid grading into `participation_events` (partial for answering, full for
  correct) — the existing gradebook needed no changes.
- Per-student client-side option shuffling.
- **Verified end to end:** pushed a question, fresh student session received it
  via its own poll with no reload, answered, instructor saw the live count,
  revealed, closed, and the participation row landed in the database.

### Question banks
- 11 lectures × 18 bilingual tiered questions (6 easy / 6 medium / 6 hard),
  generated and imported. 198 questions total.
- `selectQuestions` is difficulty-stratified so a quiz always mixes tiers.

### End-of-class quiz + reflection (Phase 4)
- `course-class-quiz` orchestrates start / close / status / summary /
  reflections / current, reusing the existing activity engine.
- Sequential, per-question-timed player (20s / 30s / 45s by difficulty),
  auto-advance, auto-submit, no going back.
- Reflection: one paragraph, 50–100 words, server-enforced, 5-minute grace
  window after the class closes.
- **Verified end to end**, including running a *second* quiz in the same session
  for a student who had already finished the first and submitted a reflection.

### End the class
- Closes any open question, closes a running quiz, closes the session (which
  stamps `actual_end_at`, the anchor for the reflection grace window). Confirms
  first and names the consequences.

### AI generation pipeline (Phase 5)
- Schema, `course-admin`, PDF upload actions, `course-generation`,
  `course-generation-worker`, deck skeleton + assembler, and the Content screen.
- **Dogfooded on real content**: a PDF built from the professor's own Week 2
  Lecture 2 (Access Control) produced a **33-slide bilingual deck** (126 `data-es`
  attributes) and **18 questions, exactly 6/6/6**, previewed and approved. The
  bank now appears alongside the hand-made ones and is immediately usable.
- The validator caught a real bad generation in the wild ("Q3 has 5 options")
  and the retry produced a valid bank.

---

## Remaining work, in priority order

### 1. Dress rehearsal with real students on real phones — **highest value**
Nothing here substitutes for it. Only 1–3 test accounts have ever used the
platform, all driven by automation on one machine. Run one complete class.

Watch for: concurrent answer bursts, phones sleeping mid-quiz, students joining
late, flaky campus wifi.

### 2. Re-verify the reflection step on a fresh class session
It worked, and only its polling changed since. But the current test session
already has a reflection submitted, so that branch no longer renders for that
student. **Flagged rather than claimed.**

### 3. Gradebook Tab B — per-class review — **DONE, verified by the professor**
Built on 2026-07-28. A **Per class** tab on the Gradebook screen: pick a class
session, then see every question pushed to the room with its distribution and
correct answer marked, the quiz attempt table with the class average, and every
reflection in full.

Backend: a new `rounds` action on `course-pulse` (all rounds of one session,
batched — `results` is per-round and would have been an N+1). Deployed.
`summary` and `reflections` on `course-class-quiz` were reused as-is; their
return shapes were read directly and match the frontend interfaces.

**Verified:** the `rounds` action is live and role-gated (student → 403, bogus
action → "Unknown action"); typecheck, all three verifiers, and the build pass;
the student surface is unaffected and console-clean.

**Confirmed working by the professor on 2026-07-28.**

### 4. Admin screens — **DONE, verified by the professor**
Built on 2026-07-28. `src/screens/instructor/Admin.tsx`: the course list with a
teaching-staff count, a create-a-course form, the teaching-staff table filtered
by course, an invite form (professor or TA), and removal with a confirm that
names the consequences.

Two structural bugs were fixed on the way in, both instances of pitfalls that
are already documented:

- **`/admin` had a route but no nav link.** It was reachable only by typing the
  URL — pitfall #1, the exact shape of the bug that once shipped a live class
  students could not join. `InstructorNav` now shows an **Admin** tab, for
  platform owners only.
- **The `/admin` route component was an inline arrow inside `App`** — pitfall
  #4, a new component identity on every render. Now a module-scope `AdminRoute`.

The dead `Placeholder` component and its orphaned strings went with them.

**Verified:** all five `course-admin` actions are refused for a student token
("This action is restricted to a platform owner" — the owner gate runs before
the action switch); the `course_memberships` unique constraint that
`invite_professor`'s `ON CONFLICT` needs is a plain table-level constraint, not
a partial index, so pitfall #6 does not bite; typecheck, all three verifiers and
the build pass; the student surface still works end to end (Today, Review and
Grades all render real data, console clean).

**Confirmed working by the professor on 2026-07-28.**

### 5. CSV roster import — **DONE, verified by the professor**
Built on 2026-07-28. `src/components/RosterImport.tsx`, on the People screen:
choose a CSV, see exactly which rows will be imported and which will be skipped
and why, then apply behind a confirm. Nothing is written until you have seen the
preview.

Header matching accepts common English and Spanish spellings (`email` /
`correo`, `name` / `nombre`, `section` / `grupo` / `sección`, `matrícula`), so a
professor's own export usually just works. Only email, name and section are
required; role defaults to student.

**A destructive backend bug was found and fixed on the way in.** See the
"Roster import used to sign everyone out" note in `07-pitfalls.md` #13 — this is
the most important thing in this entry.

**Verified:** the CSV parser is covered by a new fourth verifier,
`tools/verify-csv-roster.mjs` (21 checks: CRLF, Excel BOM, quoted commas,
quoted newlines, doubled quotes, Spanish and accented headers, padded cells,
missing-column reporting, header-only files, blank-line handling). It was
mutation-tested — breaking the row-number offset, the email lowercasing or the
blank-line filter each makes it fail — so it is a test that can actually fail.
Typecheck, all four verifiers and the build pass.

**Confirmed working by the professor on 2026-07-28.**

### 6. Your own lectures + the release gate — **built 2026-07-28, NOT yet seen working**

**This entry corrects a claim the docs used to make.** `01-project-overview.md`
said definition-of-success items 1–4 were "essentially met", including *"run a
complete class without touching the old apps or the database"*. That was not
true, and the reason was invisible:

- The Content screen listed **generation jobs only**. The professor's own 23
  decks were in `content_items` from Phase 2 but nothing in the v2 app ever
  listed them — `course-content-library` was never called.
- **The SPA never called `course-release-management` at all.** So the app had no
  way to move a release from `draft` to `released`. Every release in the system
  had been made in the old app or seeded by hand — including the one that made
  Week 1 Lecture 1 visible during all the testing, which is why nobody noticed.
- That also made the AI pipeline a dead end: approving a generated lecture
  creates a **draft** release, and nothing in the app could then release it.

Raised by the professor ("I already have all the contents … those should be
visible in my content"), and it turned out to be the larger of the two problems.

Now built: a **Your lectures** tab on Content (the new default; *Generate from a
PDF* is the second tab), listing every content item with its releases. Per item:
*Give it to a class* creates a draft release for a chosen session, then *Release
to students* publishes it. Transitions offered are a plain-language subset of
what `course-release-management` allows — `scheduled` needs a date picker and
`live` is deliberately not set from the SPA, since the student app keys off the
class session rather than the release state (see `04-decisions.md`).

**Verified:** typecheck, all four verifiers, build. **Not verified:** the screen
itself — needs the professor. The releasing path is a real write.

### 7. Grade adjustments and locking
Backend exists; no UI. Still done in the old app.

### 8. Removing people, and managing sections
Two roster holes found on 2026-07-28 while writing test instructions:

- **There is no way to remove or deactivate a student.** The People screen only
  adds. This makes a mistaken roster import unfixable through the UI.
- **There is no way to create, rename or retire a section.**
  `course-section-management` exists but the SPA never calls it. Sections can
  only be assigned to, never managed, so a second group cannot be set up — which
  matters the moment another professor is onboarded through Admin.

### 9. Phase 6 cleanup
- Strip lecture/mission content from the public `mzareei.github.io` repo.
- Point the syllabus at the new app; turn old Gen-2 app pages into redirects.
- Crawl the public site to confirm zero gated-content leaks.
- Gen-1 apps stay frozen.

### 10. Deferred by the professor's own choice
- **QR join code** — `class_sessions.join_code` exists, no UI. Students
  currently reach class through Today.
- **Projector view** — separate big-screen window for pulse results.
- **Mid-slide questions inside the deck** — explicitly "the last thing we do".

### 11. Known wrinkle worth fixing eventually
The generation worker self-chains *and* the Content screen nudges `advance`, so
two invocations can race on one step. Self-healing, but it can write a confusing
transient error. A claim/lease on the job row would fix it properly.

---

## Closed questions

- **Quiz per-question timing** — asked and answered on 2026-07-28: **seconds**.
  20 / 30 / 45 seconds stays as implemented. Closed; don't reopen it.

---

## A standing constraint on agent testing

Test sign-in refuses instructor accounts by design
(`course-test-signin/index.ts:128`), and the QA account
`zarei.1982@gmail.com` is student-only — no TA role. An agent can therefore
drive the **entire student side** unaided but **cannot reach any instructor
screen** (Run class, Content, Gradebook, People). Anything instructor-facing
needs the professor signed in at `m.zareei@tec.mx` with an emailed code.

Plan around this: build instructor features knowing the last mile of
verification is the professor's, and say so plainly rather than implying a
screen was seen working.

---

## How the pipeline was dogfooded (reproducible recipe)

Useful if you need a test PDF again:

1. Chrome headless `--print-to-pdf` on a lecture deck captures **only the one
   visible slide** — deck CSS hides the rest. Don't bother.
2. Instead: parse the deck HTML, extract each `<section class="slide">`'s English
   text (strip `data-es`), emit a plain print-friendly HTML document, then print
   *that* to PDF.
3. For automated testing a minimal base-14 (non-embedded-font) PDF writer keeps
   the file ~7KB — small enough to base64 into the page and attach to the real
   file input via `DataTransfer`, so the actual UI path gets exercised.

Working scratch scripts were used for this and not committed; the recipe above is
enough to recreate them.
