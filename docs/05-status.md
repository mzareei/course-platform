# Status

**Last updated:** 2026-07-29

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

### 0. Coherent class lifecycle redesign — **DESIGNED, not implemented**

The professor exercised the product on 2026-07-29 and found that the individual
features do not yet form a coherent teaching workflow:

- Week 1 Quiz can be marked "Students can open it", while Today and Review
  intentionally filter that legacy activity because it has no standalone
  player. The write succeeds and nothing appears to students.
- Reflections belong to a live class session, but the Content screen makes the
  quiz look like independent released content.
- Home's "No sessions planned" state does not lead to scheduling; class days
  are buried inside People.
- Run Class and the lecture deck are separate screens.
- Existing decks still contain links to retired Home, Mission, Quiz, and Exit
  pages.
- Pulse questions can be drawn from concepts that have not yet been taught.
- View as student is not a faithful student shell.

The product design is approved in
`docs/superpowers/specs/2026-07-29-coherent-class-lifecycle-design.md`.
Key decisions: quizzes remain live-only; question banks become
professor-only; Classes becomes a first-class screen; a 40-slide lecture gets
approximately four pre-generated concept checkpoints; QR joining returns; and
Run Class embeds the deck beside context-sensitive controls.

This work now precedes the real-phone dress rehearsal: the rehearsal should
exercise the intended lifecycle, not the misleading one.

### 0.1 Content delivery semantics — **DONE, verifier-covered**

Built 2026-07-29 as the first coherent-lifecycle increment. `studentDelivery()`
now classifies content by both content type and source: storage-backed lectures,
missions, case files, and resources use the gated viewer; approved external
materials open externally; activities and question banks are live-only; all
other shapes remain internal. `canReleaseToReview()` is used by the instructor
library and both student content consumers, so the professor is never offered
an availability control for something students cannot actually open.

Today is temporarily limited to releases assigned to a class session while the
next increment moves it fully to the session collection. Review now contains
only viewer or external materials. The Content screen labels its reviewable
materials and has a professor-only Question banks placeholder that makes the
live-only rule explicit. `tools/verify-content-semantics.mjs` locks the
classification contract; typecheck, all verifiers, and the production build
pass.

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

### 6. Your own lectures + the release gate — **DONE, verified in the browser**

**This entry corrects a claim the docs used to make.** `01-project-overview.md`
said definition-of-success items 1–4 were "essentially met", including *"run a
complete class without touching the old apps or the database"*. That was not
true:

- The Content screen listed **generation jobs only**, so the professor's own 23
  decks — in `content_items` since Phase 2 — were never displayed.
- **The SPA never called `course-release-management`**, so no release could move
  from `draft` to `released`. Every release in the system had been made in the
  old app or seeded by hand.
- The AI pipeline therefore dead-ended: approving creates a *draft* release the
  app could not publish.

Nobody caught it because Week 1 Lecture 1 was already released, seeded outside
the app — see pitfall #14.

**Then the first version of the screen was rejected on sight**, and correctly:
it exposed the state machine (Release / Open during class / Switch to review
only) and made the class-session picker mandatory, in a course with exactly one
class session. See pitfalls #15 and #16.

**Now:** each item shows one badge — *Students can open it* / *Not available to
students* — and one primary button, *Make it available* / *Take it back*, with a
filter across all three. The backend state machine was made navigable in both
directions.

**Then it was reported broken again the same day**, and correctly: *"when I
click on make it available, nothing actually happens."* Two causes, both now
fixed — see pitfall #17:

- `update_state` **requires** a `reason` when reopening a `closed` release. The
  client typed it optional and never sent one, so take-back worked and
  make-available threw every time.
- The resulting error rendered at the top of a 23-item list, so a hard failure
  looked like a no-op. Errors are now keyed by item and render in the card.

**"Tie it to a class day" was removed.** It created a draft release and never
released it, so it could only ever make content invisible — and it was premature
regardless, since there is no UI to create class days, so it offered one
irrelevant option. It returns with class-day management (item 8).

**A third round, same day:** *"it shows red error A valid source kind is
required."* — the new per-item error surfacing working as intended. Two more
causes, both fixed (pitfall #18):

- `course-content-library`'s `sourceKinds` allow-list never gained
  `storage_object`, which migration 0012 added to the `content_items` constraint
  in Phase 2. Every real lecture is a `storage_object`, so `save_content_item`
  rejected all 23. Broken for months; the function had no caller until now.
- More fundamentally, creating a release should never have gone through
  `save_content_item`, which rewrites the entire content item as a side effect.
  `course-release-management` now has a `create_release` action that makes a
  draft release and touches nothing else.

**VERIFIED IN THE UI on 2026-07-28, end to end**, driving the professor's own
signed-in Chrome:

1. Content → Your lectures lists all **27** items.
2. *Make it available* on Week 11 → badge flips to "Students can open it", no
   error.
3. QA student's Review shows it as *Disponible*.
4. Student opens it → `/view/<release_id>` → iframe `src="/content?t=…"` (the
   correct gated chain, not `srcdoc`) → token path
   `courses/tc2007b/items/week-11-lecture/deck.html`.
5. The deck renders **49 slides** and the counter reads `1 / 49` — the engine
   initialised. Arrow keys advance it to `3 / 49`, so it is genuinely alive,
   which is the direct test for pitfall #2.
6. *Take it back* → student loses it → *Make it available* again succeeds. That
   round trip is the regression for pitfalls #16 and #17.

No console errors at any step.

### 7. Grade adjustments and locking
Backend exists; no UI. Still done in the old app.

### 8. Groups, class days, and removing people — **DONE, verified in the browser**

Built and verified 2026-07-28. All three were holes where the backend existed
and the v2 app had no caller, and together they blocked onboarding a second
professor: invited through Admin, they could create neither a group nor a class
day, so they had nowhere to put anyone.

- **Groups** (`components/Sections.tsx`) — create, rename, retire, reactivate.
  "Group" in the UI, `section` in the schema; the schema word means nothing to a
  professor and design rule #2 forbids leaking it.
- **Class days** (`components/Schedule.tsx`) — add one per class meeting, cancel
  a planned one, run it. New backend action `create_session`, which assigns the
  sequence number server-side because `class_sessions` has
  `unique (section_id, sequence_number)`.
- **Remove a person** (People roster) — new backend action `remove_person`.
  Not a delete: memberships go `inactive`, section enrolments go `dropped`, so
  work and grades survive and re-adding the same email brings the person back.
  Refuses self-removal and platform owners.

Both panels call `refreshContext()` afterwards, since Home and the student Today
screen read `teacher_sessions` from the auth context.

**Verified end to end in the professor's browser:** created a class day, watched
it appear in the schedule *and* on Home, opened Run Class from it and got the
question-bank picker, then cancelled it. Added a throwaway person and removed
them. Confirmed the Remove button is absent on your own row.

**Three bugs were found by doing that, none of which reading would have caught:**

1. *Run this class* linked to `/teach/run/undefined` — `listSessions` returns
   `session_id`, not `id` (pitfall #3, made again while building this).
2. Home showed the class day one day early — a bare `YYYY-MM-DD` parses as UTC
   midnight (pitfall #19). `formatDay()` in `src/i18n/index.ts` is now the one
   place that knows this.
3. A removed person looked untouched, because the status cell preferred
   `profile_status` — which removal deliberately does not change — over
   `membership_status` (pitfall #20).

### 9. Phase 6 cleanup
- Strip lecture/mission content from the public `mzareei.github.io` repo.
- Point the syllabus at the new app; turn old Gen-2 app pages into redirects.
- Crawl the public site to confirm zero gated-content leaks.
- Gen-1 apps stay frozen.

### 10. Deferred by the professor's own choice
- **Projector view** — separate big-screen window for pulse results.

QR joining and mid-lecture deck checkpoints moved into the approved lifecycle
redesign on 2026-07-29.

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
