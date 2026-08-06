# Status

**Last updated:** 2026-08-06

### Private content work — approved, implementation started

The professor approved the design on 2026-08-05 and settled every open
question. Decisions, all recorded in `04-decisions.md`:

- Content repository is `mzareei/course-content`, one directory per course
  (`courses/tc2007b-information-security/`).
- Ownership backfill assigns all existing items to the owner profile (D3).
- **Sharing is copy-based, not read-only.** A receiving instructor sees a
  shared item and takes a copy they own and can edit; the question bank is
  copied with it. The owner's later improvements deliberately do not propagate.
  This supersedes the "read-only, cannot edit" wording in the original brief.
- Publishing is CLI-only; the GitHub Action validates and cannot publish.
- Public course content is removed but the course page stays, carrying a link
  to the platform.
- Generation is routed through the same ownership and versioning rules, the
  legacy-nav matcher is fixed, and a trigger refuses deletion of a content item
  with an active bank.

**Shipped to the branch, not deployed:**

1. **Group lifecycle is platform-owner only** (requirement 8). The backend
   update branch refused nothing before — any assigned instructor could rename
   or archive a group. It now returns `section_management_owner_only` as 403,
   and the frontend hides Add / Edit / Retire for non-owners with a bilingual
   explanation. Manage members stays available to assigned instructors.
2. **Migration `0032_content_ownership_and_versions.sql`** — `owner_profile_id`,
   `visibility`, `forked_from_content_item_id`, `content_shares`,
   `content_versions`, and a BEFORE DELETE trigger on `content_items` that
   refuses when an active question bank still points at it. Additive only, and
   deliberately contains **no backfill** so D3 stays a separate approved step.
3. **`removeLegacyDeckNavigation` now cleans missions.** It only ever matched
   `ui-btn`; missions use `btn` / `back-link` and link to the public `progress/`
   app and the public copy of their own lecture.

**Still to build:** owner scoping in `course-content-library` and
`course-content-upload`, the copy/fork action, generation slug namespacing
(P12), the content repository and publish CLI, and the Content screen's
owned/shared distinction.

**Still parked on production access:** D3 (backfill) and D4 (re-publish the 23
objects). Both need the audit SQL output first.

**Corrected finding on generated slugs.** It was first recorded as "the second
professor silently overwrites the first". That is wrong: `create_job` already
refuses a colliding slug. What is real is that the refusal names content the
caller will not be allowed to see once the library is owner-scoped, blocking a
legitimate title and leaking that someone else's exists — plus two narrow races
where the check and the upsert are far apart. Owner-namespaced slugs plus an
ownership check at the write fix both. See pitfall #60, rewritten.

### Private content authoring and publishing — audited and designed, not built

Requirements 1–8 and 13 of the private-content brief are answered on paper. No
code was changed, no migration was written, no production row or storage object
was touched, and the private content repository was **not** created. Awaiting
the professor's approval before implementation.

- `docs/audits/2026-08-05-content-origin-audit.md` — the content-origin audit.
- `docs/audits/content-origin-audit.sql` — a read-only script that produces the
  per-item production report. Safe to run at any time, including during class.
- `docs/superpowers/specs/2026-08-05-private-content-publishing-design.md` — the
  private-repo layout, the seven-gate publish workflow, the CLI-vs-Action
  recommendation, the owner/sharing model, the group-management guards, the
  destructive-step register, and the TDD plan.

What the audit established from repository evidence:

- All 23 migrated items (11 lectures, 12 missions including 3 bridge missions)
  are `storage_object` at `courses/tc2007b/items/<slug>/index.html` — note
  `index.html`, not `deck.html`; `deck.html` is the AI pipeline's filename.
- The public academic site still publishes every one of them, linked by hand
  from `_courses/information-security.md`. `_config.yml` excludes `supabase`
  and `docs/superpowers` but not `assets/`.
- Every object in the private bucket carries hard `https://mzareei.github.io`
  links, because `migrate-gated-content.mjs` deliberately absolutised them in
  Phase 2. Nine missions link to the **public copy of their own lecture**.
- `removeLegacyDeckNavigation()` strips four of those destinations, but only
  from `ui-btn` anchors and only during checkpoint preparation — so no mission
  has ever been cleaned, and no code path currently would.
- Content items are course-wide and unowned: any instructor can read, edit and
  overwrite any other instructor's item and storage object. `created_by` is
  null on the migrated items because `register_item` never set it.
- Group create is owner-only on the backend; **rename and archive are not**, and
  the Add-a-group card renders for every instructor.

What is still unverified: everything about production rows. This session had no
Supabase credentials and the sandbox blocks outbound HTTPS to
`mzareei.github.io`, so the 27-item inventory is derived from the code that
wrote it, not read from the database. Run the SQL script before acting.

### Single-screen classroom display — deployed and instructor-verified

Run Class is now the teaching display. The separate projector/controller card
has been removed from the normal workflow. The professor keeps the lecture
deck full-screen and the same deck document receives an answer-neutral live
question layer (prompt plus options only) when a checkpoint is sent. Reveal and
grading remain private in the Checkpoint panel; Continue clears the layer and
resumes the deck. The old projector route and `course-presentation` function
remain only as compatibility code, not part of the normal teaching flow.

Frontend commit deployed to Cloudflare Pages: `2fb1a83`.
Supabase migration `0028_class_presentation_state.sql` and edge function
`course-presentation` are deployed to project `ojmbupftdikwmlqvibwt`.

The normal-mode question overlay's opaque surface regression was fixed after a
browser screenshot showed the iframe's fullscreen layer compositing underneath
it. The app-shell verifier now guards the surface token contract.

The question preview is now answer-neutral too: before the professor sends a
checkpoint, the Run Class screen shows only the prompt and options. Correct
answer styling is reserved for the private post-reveal results state.

Live questions now include a Full screen action. It promotes the neutral
question layer to the browser viewport so the room sees one readable question;
Escape or the same button returns to the normal teaching cockpit.

Question Banks now has an instructor-only review editor. It lists every active
question used by both during-class checkpoints and the end-of-class quiz,
shows the correct option for expert review, supports bilingual prompt/option
edits, and archives questions that should no longer be used.

Instructor sign-in now accepts any valid email domain when the address belongs
to an invited instructor/platform owner. Student access remains restricted by
the institutional-domain or explicit external-access-grant policy.

The People screen now follows the same role-aware policy: an external instructor
can be added without an outside-institution reason, while external students,
teaching assistants, and observers still require the documented reason/grant.
This keeps the Add person button usable for guest professors without weakening
student access controls.

Instructor roster adds now also send a Supabase Auth invitation email. If the
address already has an Auth account, the backend sends the normal magic-link
email instead. Invited instructor rows expose a Resend invitation action, and
the People screen reports whether delivery succeeded. Backend commit `2b777a3`
is deployed for `course-roster-management` and `course-admin`.

Instructor access is now section-scoped. A regular instructor can see and
manage only the group(s) where they have an active `section_enrollments` row
with role `instructor`; the `platform_owner` is the only global course
administrator. This applies consistently to Home sessions, Classes, People,
releases, gradebook, insights, and roster mutations. The policy is enforced in
the edge functions rather than relying on the client hiding other groups.
The deployed backend scope hardening is tracked in commits `03295ad`,
`1a524d8`, and `9d40cc0`.

The canonical continuation record is now [`PROJECT-HANDOFF.md`](PROJECT-HANDOFF.md).
The production data reset has now been executed and verified. Instructor-side
browser rehearsal of the single-screen question layer is complete. A true
real-phone rehearsal remains a human-device check; Chrome's student tab was
blocked by an extension UI, so it is not represented as completed here.

### Production clean reset — executed and verified

On 2026-08-03 the signed-in Supabase SQL Editor ran the guarded reset
transaction after the owner precondition returned exactly one active owner.
The count-only postcondition query returned one course, one profile, two
memberships, four groups, and one instructor enrollment; zero sessions,
releases, attempts, responses, grades, notes, reflections, and audit rows.
TC2007B teaching assets were preserved: 27 content items, 14 question banks,
and 223 generated questions (with their options and generation assets).
Groups are `401: active`, `402: planned`, `501: planned`, and `502: planned`.
No production class session was created after the reset, so the delivered
state is clean rather than polluted by a synthetic rehearsal.

The guarded operation is preserved for future environments in backend
migrations `0030_prepare_clean_platform_reset.sql` and
`0031_execute_clean_platform_reset.sql`. Production was executed directly in
the SQL Editor because this session did not have a Supabase CLI access token;
the verifier and migration remain committed as the reproducible runbook.

### Projector browser rehearsal — fixed and verified

On 2026-08-04, Chrome exposed that the Week 1 storage deck predated the remote
navigation listener. The backend presentation state was changing, but the old
iframe ignored it. The deck engine and checkpoint-backfill function were
deployed, Week 1 Lecture 1 was upgraded through the Question banks screen, and
the live controller/projector pair was verified on slides 2 → 3 with a healthy
projector heartbeat.

Phases 1–5 are complete and deployed. Phase 6 public-site cleanup remains
separate from the clean teaching-platform reset.

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

### 0. Coherent class lifecycle redesign — **DEPLOYED AND VERIFIED IN PRODUCTION**

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
Run Class renders the deck with context-sensitive controls; live checkpoints
appear in the same deck surface rather than a separate projector window.

The redesign is live and its instructor lifecycle has been rehearsed through a
production browser session. The real-phone classroom dress rehearsal remains
the next operational milestone and must be performed with actual student
devices; it is not safe to manufacture that evidence from a desktop tab.

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

### 0.2 First-class class sessions and Classes — **DEPLOYED AND VERIFIED**

Built 2026-07-29 as the second coherent-lifecycle increment. Class sessions and
content releases are now separate collections in `course-auth-context`.
Students receive their active-section sessions even when no content release
exists, and Today plus Live discover class state only from that session
collection.

The instructor navigation now has **Classes**, which owns Groups and Class days;
People is roster-only. Scheduling can associate an optional reviewable lecture,
prefills the student-facing title, and records the lecture directly on the
session. A dedicated `start_session` transition moves `planned | open |
continued` to `live` with the start timestamp in the same update and writes one
state-change audit event.

`tools/verify-class-sessions.mjs` locks the student-session context, the
session-driven Today/Live paths, and the Classes route. The verifier was captured
RED before implementation and GREEN afterwards. Frontend typecheck passes.
Migrations 0020 and 0023 and the affected functions are live. On 2026-07-29 the
production empty state led from Home → Schedule a class → Classes; the
instructor created “Deployment rehearsal — Week 1”, opened it from Home, and
started it successfully. Migration 0023 is the production-discovered fix that
adds Supabase's trusted `extensions` schema to the atomic starter's search path.

### 0.3 QR class joining — **DEPLOYED; ENROLLED STUDENT PATH VERIFIED**

Built 2026-07-29 as the third coherent-lifecycle increment. Run Class now shows
a real QR code before and during class. It encodes only the session URL
(`/join/<join_code>`), never a pulse question, so students scan once and remain
on `/live` for the questions, quiz, and reflection that follow.

The new `course-session-join` edge function validates the JWT, active profile,
4–12-character alphanumeric code, session state, and active student enrollment
for the session's group. It creates no enrollment. Signed-out QR visits keep
only a strict same-origin `/join/<UPPERCASE_CODE>` return path, consume it once
after code or test sign-in, and also clear it after a magic-link return.

`tools/verify-class-sessions.mjs` covers the return-path allow-list and
one-time consumption. The verifier was captured RED with the expected
missing-module failure, then GREEN. The function was syntax-bundled, checked
to contain no database writes, deployed to Supabase project
`ojmbupftdikwmlqvibwt`, and a live unauthenticated POST reached the function
and returned its own HTTP 401 response.

The five authenticated browser cases remain pending because this increment was
not pushed to Cloudflare Pages and an instructor email code is required to
prepare a live class. Do not describe QR joining as browser-verified until the
signed-in enrolled, signed-out return, unenrolled, invalid-code, and
closed-session paths have all been exercised through the UI.

### 0.4 Existing-deck checkpoint preparation — **DEPLOYED; WEEK 1 PILOT VERIFIED**

Built 2026-07-29 as the recoverable legacy-content increment. The instructor-only
Content action maps each existing 18-question bank to 3–5 teaching checkpoints
without rewriting prompts, options, or question status. Migration 0022 adds the
durable `none | pending_upload | ready` preparation state and two service-role
RPCs: the first atomically commits all five metadata fields for the full bank
with `pending_upload`; the second acknowledges readiness only after the same-path
private deck upload succeeds.

An interrupted upload or readiness acknowledgement is now recoverable from the
Content card. The pending action rebuilds the mapping from persisted metadata,
re-transforms the current deck, uploads, and finalizes without another model
call. The pure deck transformer is retry-idempotent, structurally rejects nested
sections inside teaching slides, and removes bare-relative, parent-relative,
root-relative, and absolute Home/Mission/Quiz/Exit controls with query/hash
variants while preserving unrelated navigation.

Migration 0022 and the backfill function are live. Week 1 Lecture 1 was prepared
in production: 45 teaching slides became a 50-section deck with five embedded
checkpoints; all 18 existing questions were mapped; and Home, Mission, Quiz,
and Exit disappeared while language, theme, overview, help, fullscreen, and
slide controls remained. The production pilot also found and fixed model output
that used a different concept key per question and returned six adjacent
boundaries. The server now groups all candidates at one slide boundary and
merges the closest adjacent boundaries when more than five are returned.

### 0.5 Unified Run Class cockpit — **DEPLOYED AND VERIFIED END TO END**

Built 2026-07-29 as the instructor-facing lifecycle increment. A scheduled
session's selected lecture now opens privately inside Run Class beside one
checkpoint panel; the obsolete lecture/bank and difficulty controls are gone.
Before live, the professor sees the real deck, session QR, and the atomic
**Start class** action. During live teaching, the same deck and QR remain in a
two-column cockpit with the action appropriate to the current checkpoint.

Instructor deck access is content-item based and teacher-gated. It mints the
existing short-lived content token without creating or consulting a student
release, and the iframe loads only `/content?t=…` with scripts and same-origin
enabled—never `srcdoc`, `blob:`, popups, or a public Storage URL.

At a deck checkpoint, Run Class draws from that exact slide boundary. Sending
passes only `question_id` plus `checkpoint_after_slide`; `course-pulse` reloads
the active question and bank, then refuses the push unless the session is
exactly `live`, the session lecture matches the bank content item, and the
stored question checkpoint matches the request. Prompt and bilingual option
text are still snapshotted into the round. Space remains a generic deck intent:
the parent alone maps `ready → send` and `open → reveal`. Right Arrow remains
deck navigation; the parent closes any round once the deck reports it resumed.
If the bridge does not connect, the panel exposes the bank's validated
checkpoint coverage as a manual selector.

The final quiz is absent from the active panel until the last prepared teaching
point is reached or the professor explicitly opens it. The existing sequential
20/30/45-second student quiz and automatic reflection transition remain
unchanged; student pulse rendering now uses the bilingual bank snapshot.

`tools/verify-app-shell.mjs`, `tools/verify-deck-protocol.mjs`, and backend
`tools/verify-live-checkpoint-security.mjs` cover cockpit composition, gated
iframe rules, parent-authoritative Space intent, client protocol mismatch
rejection, server lecture/checkpoint identity enforcement, reload recovery,
conditional reveal/close transitions, repeated-key suppression, and token
refresh at the current slide. A session close now closes every open or revealed
pulse on the server first.

Production rehearsal evidence (session
`65803c87-f4b8-4dfe-a53f-6608ba8637d4`, closed):

- Instructor Home → Run class → Start class loaded the cleaned 50-section deck
  and QR in the single cockpit.
- A question authored after teaching slide 15 was prepared from slides 11–11,
  sent, received by a separately signed-in QA student from Today → Join class,
  revealed, restored after an instructor reload, and closed.
- The timed 12-question quiz arrived automatically; QA Test Student submitted
  11 answers and received 18.2%.
- Closing the quiz automatically opened reflection. A 58-word reflection was
  submitted, appeared in the instructor feed, and the student completion screen
  confirmed pulse/quiz/reflection were recorded.
- The class was closed using the bilingual two-step in-app confirmation.
- Gradebook → Per class showed the pulse distribution, 1 of 1 quiz finished
  with an 18% class average, and the full 58-word reflection.

The rehearsal intentionally records 0 pulse answers because the 60-second pulse
expired while the separate student browser was reconnected. Delivery, expiry,
reveal, recovery, close, quiz, reflection, and gradebook persistence were all
observed through the production UI.

### 0.6 Faithful student preview — **DEPLOYED AND VERIFIED**

The instructor preview now exposes all three real student destinations:
`/student`, `/student/review`, and `/student/grades`. Each route renders the
same screen component and the same `StudentShell` bottom navigation used by a
student. Instructor tabs are removed during preview and a visible exit returns
to `/teach`.

The production preview was exercised at 375×812 and 430×932. Today, Review, and
My Grades used `/student/*` links, the instructor navigation was absent, and the
exit returned to `/teach`. Review contained Week 1 Lecture 1 and did not contain
Week 1 Quiz. The projector cockpit was checked at 1440px width with a 977×549
deck iframe and no horizontal overflow.

The latest deployed frontend bundle is `index-Dlk8k3FR.js` from commit
`af1ea69`. Backend `main` is `623feca`; migrations 0020–0027 and the class
management, roster management, and student-notes functions are deployed.

### 0.7 Class management and private notes — **DEPLOYED AND PRODUCTION VERIFIED**

Instructors can append private notes for an exact class session and enrolled
student from Gradebook → Per class. Notes can be marked for follow-up; the
original text remains immutable and only an open follow-up exposes Resolve.
People opens the same profile-scoped history across all class sessions. The
note API is deliberately absent from student screens and rejects student tokens.

The partial 2026-07-30 production rehearsal used QA group `QA730E`, class session
`460a2cfb-bdfb-4e41-8577-21336195789e`, and class code `98ZXF8UV`:

- The instructor assigned QA Test Student through the group-filtered People
  screen, created a class with no lecture, attached Week 1 Lecture 1, then
  replaced it with Week 1 Lecture 2.
- The group edit round trip persisted all fields. Starting the class changed it
  to Live; Classes no longer offered Edit after `actual_start_at` existed.
- QA Test Student reached the class from Today → Join class. Closing it used the
  in-app two-step confirmation and produced a group-scoped `review_only`
  release. QA Test Student saw Week 1 Lecture 2; Test Student, in another group,
  did not.
- Gradebook → Per class created a follow-up note and resolved it. Real
  QA-student edge calls returned auth context 200 and progress 200 without the
  note; `course-student-notes` returned 403 without note content.

Cleanup removed the QA Review release, restored QA Test Student to Section A,
restored Section A to Archived, restored the QA group's edited details, and
retired the QA group. The closed QA class and resolved note remain as deliberate
audit/history rows. Production group `TC2007B-401` stayed unchanged and Active.

The release gate found two deployment issues during that partial rehearsal. Strict Deno
checking exposed inferred-`unknown` rows in all three management functions; the
fixes are behavior-preserving type narrowing. The first assignment then failed
because the roster function had been deployed before migration
`0025_assign_student_section.sql`; applying the pending migration supplied its
transactional RPC and the same UI action passed.

Review then found two assignment-boundary defects: the original release
permitted a direct RPC assignment into a completed or archived group and
excluded invited students before first sign-in. Migration
`0026_guard_student_section_assignment.sql` replaces the deployed RPC without
rewriting 0025: only `planned | active` groups are targets and
`active | invited` student profiles are eligible. The People UI mirrors
those rules and maps structured server error codes to bilingual messages. These
fixes are deployed.

The safe follow-up used session
`27d87aed-b99c-4d83-8235-398fe1f28ba0` and completed the full matrix:

- Content → Assign to a class replaced planned Week 1 Lecture 1 with Week 1
  Lecture 2; a fresh Classes load proved persistence.
- After start, the Live row exposed no Edit. A stale authenticated
  `update_session` request with a sentinel title was refused, and a fresh row
  proved no title or lecture mutation.
- Before close, Week 1 Lecture 2 completed Make available now → Remove from
  Review; the live class remained assigned to Week 1 Lecture 2.
- Gradebook's class-scoped history created and resolved a unique note; People's
  profile-scoped history showed the identical resolved record.
- An invited profile was assigned before first sign-in. After QA730E was
  archived, its People view explained that it must be reactivated and a
  pre-staged authenticated assignment was refused without changing enrollment.
- A fresh QA-student privacy check returned auth context 200 and progress 200
  without the new note; the notes endpoint returned 403 without note content.

Cleanup restored Student Name to A and QA Test Student to TC2007B-401, archived
A and QA730E, removed the temporary whole-course Review release, and left the
new QA class Closed. TC2007B-401 remained unchanged and Active.

#### Final composition hardening — **DEPLOYED AND PRODUCTION VERIFIED**

Whole-plan review found four cross-feature composition defects plus two UI
state-refresh defects. The fixes are implemented test-first in additive
migration `0027_class_management_composition_fixes.sql` and the existing
management functions/components:

- Private note creation, session listing, profile history, and follow-up
  resolution use historical `active | dropped` student enrollment, so a normal
  group move does not erase earlier class records or make one moved student's
  note fail the whole session list.
- Moving an unstarted class into a group with the same sequence number chooses
  and returns that group's next number atomically.
- Repeating End class on an already-closed session returns the existing closed
  result without another Review release, release event, or audit entry; the
  edge function can retry remaining pulse/activity cleanup.
- Future scheduled access is not counted as currently available. Content offers
  bilingual **Cancel scheduled access**, which uses the valid
  `scheduled → draft` transition; ordinary Review removal still closes the
  release.
- Resolving from People reloads the full profile-wide semester history, and
  each group assignment selector follows fresh roster props after a move.

Migration 0027 and the updated session and notes functions are deployed.
Frontend commit `af1ea69`, backend commit `623feca`, and production bundle
`index-Dlk8k3FR.js` completed the live release gate:

- A note created in old QA session `27d87aed-b99c-4d83-8235-398fe1f28ba0`
  remained available after the student moved from QA730E to A. The class list
  still loaded both students, People retained all three semester notes, and
  resolving from People preserved the full list through a page reload.
- Planned session `8d72be63-54ce-4fe2-a0ed-0c08ed340626` moved from QA730E
  sequence 3 into A, whose sequences 1–4 were occupied. The persisted result
  was A sequence 5.
- Close counts for release / release event / audit were `0 / 0 / 0` before,
  `1 / 1 / 1` after the first close, and still `1 / 1 / 1` after a second
  authenticated close request.
- A QA730E release opening in 2035 rendered as scheduled and not currently
  available. Cancel scheduled access succeeded and persisted `draft`.
- The roster group selector followed A immediately and after reload.
- Student auth context and progress returned 200 without the moved-note text;
  the notes endpoint returned 403 without it.

Cleanup restored QA Test Student to TC2007B-401, archived A and QA730E, and
closed the new class's Review release without changing the historical Group A
release. The cancelled schedule remains as an inert `draft` QA fixture for the
planned final data reset. TC2007B-401 remained unchanged and Active.

### 1. Dress rehearsal with real students on real phones — **highest value**
Nothing here substitutes for it. Only 1–3 test accounts have ever used the
platform, all driven by automation on one machine. Run one complete class.

Watch for: concurrent answer bursts, phones sleeping mid-quiz, students joining
late, flaky campus wifi.

### 2. Re-verify the reflection step on a fresh class session — **DONE**
The 2026-07-29 production rehearsal used a fresh class session. Closing the quiz
opened reflection automatically; the QA student submitted 58 words; the
instructor feed and Gradebook both displayed the saved response.

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

- **Groups** (`components/Sections.tsx`) — create, edit, retire, reactivate,
  and hand off directly to that group's filtered People roster. Group saves
  echo every persisted field so optional meeting and campus metadata are never
  cleared accidentally. The 2026-07-30 browser follow-up replaced the
  enrollment-scoped auth-context group list with the authoritative section
  endpoint and added transactional student group moves. The filtered view can
  move a current member out or assign another active student into the group;
  prior enrollment rows remain as dropped history and are excluded from
  current-member filtering. Current-group detection is limited to active
  student enrollments whose section belongs to this course.
  "Group" in the UI, `section` in the schema; the schema word means nothing to a
  professor and design rule #2 forbids leaking it.
- **Class days** (`components/Schedule.tsx`) — add one per class meeting, edit
  an unstarted planned/open/continued class (including replacing its lecture),
  cancel a planned one, run it. New backend action `create_session`, which assigns the
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

### Coherent lifecycle: generated slide checkpoints and deck bridge — **IMPLEMENTED LOCALLY, NOT DEPLOYED**

Built 2026-07-29 across both repositories. Newly generated banks now carry a
stable concept segment, cited finalized slide numbers, a source range, and the
exact slide after which each question may be asked.

- Generated slides have sequential one-based `slide_number` values.
- Question generation receives the finalized slide JSON, not the earlier
  outline, and is rejected unless it produces exactly 18 questions, exactly
  6/6/6 by difficulty, 3–5 checkpoints for a normal 18–50-slide lecture, and at
  least two candidates at every checkpoint.
- One shared backend validator guards the worker and `import_bank`; both
  persistence paths write the same five columns.
- `list_banks`, `draw_question`, and generation `review_bundle` return the
  checkpoint fields their consumers use. The Question banks tab now shows
  balance, coverage and legacy-bank warnings. It has no release action:
  question banks remain professor-only inputs to a live class.
- Legacy banks now have a local-only preparation path. **Prepare checkpoints**
  appears only when every active question is truly missing checkpoint metadata,
  calls an instructor-authenticated edge function with the real content-item id,
  and reports checkpoint/question counts or a per-bank error in the same card.
  Invalid or partially mapped banks never receive the action.
- The backfill accepts only a private `storage_object` lecture with exactly one
  active 18-question bank. It downloads the existing single-file HTML, extracts
  the teaching slides in order, loads the unchanged questions and options, and
  makes one structured Claude call that returns metadata only. Exact question-id
  coverage, 6/6/6 balance, 3–5 checkpoints, every source range, and at least two
  candidates per checkpoint are validated before the first write.
- The legacy transformer preserves teaching-slide count, text and order; adds
  stable `data-teaching-slide` coordinates; removes only the retired
  Home/Mission/Quiz/Exit anchors; keeps custom lecture CSS/JavaScript and all
  language, theme, overview, help, fullscreen and slide controls; and replaces
  the old presenter engine with the existing `DECK_STYLE` / `DECK_SCRIPT`
  assets. All HTML substitutions use callback replacements so asset text such
  as `$&` cannot be interpreted as a replacement token.
- Database writes update only the five checkpoint metadata columns. The
  same-path private Storage upload is the final operation, so authentication,
  model, transform, validation or database failures cannot overwrite the
  working deck.
- The deterministic assembler now inserts a bilingual checkpoint section
  immediately after each matching teaching slide. Teaching-slide numbers remain
  stable even though the presentation gains additional physical slides.
  Reused concept-segment labels receive deterministic position-qualified deck
  keys, so metadata accepted by the bank validator cannot strand assembly.
- Generated decks expose a version-1 same-origin bridge. Every message is
  origin-, source-, version-, and shape-checked; the parent hook accepts messages
  only from its own iframe and sends only to `window.location.origin`.
- Exact-shape validation enumerates every own key and inspects its descriptor;
  non-enumerable, symbol, accessor, executable and unknown properties are
  rejected in both directions instead of disappearing from `Object.keys`.
- At a checkpoint, Right Arrow reports a skip before moving and Space is
  reports one generic parent action without moving. Run Class remains
  authoritative and interprets that intent as send or reveal from its current
  state. Ordinary slide navigation and fragment reveal behavior remain
  unchanged.
- The editable skeleton, style and script remain the only deck-template source;
  `deck-assets.ts` is regenerated and a verifier checks exact source parity.
  That verifier now runs in a path-scoped backend CI workflow, where the
  editable source actually lives.
- Frontend gated-content verification fails closed when that editable backend
  source cannot be inspected. Frontend CI explicitly checks out
  `mzareei/mzareei.github.io` and passes its path through
  `COURSE_PLATFORM_BACKEND_ROOT`; local verification may use the documented
  sibling checkout but cannot silently skip the contract.

**Local evidence:** a disposable same-origin parent harness loaded generated
fixture HTML through `/content?t=fixture` and captured `deck.ready`,
`deck.slide_changed`, `deck.checkpoint_entered`, and
`deck.checkpoint_skipped`. It confirmed skip-before-navigation, checkpoint Space
staying put, parent ready/resume, ordinary fragment reveal, overview, help,
language, and theme. The fullscreen control invoked `requestFullscreen`, but
the controlled browser denied fullscreen permission, so actual fullscreen entry
remains pending alongside verification through a live `/content` token.

The backend verifier also executes the real embedded deck script in a
deterministic DOM harness. It confirms that checkpoint Space emits exactly one
`deck.checkpoint_action` to `location.origin` without moving, and that Right
Arrow orders `deck.checkpoint_skipped` before `deck.slide_changed`.

Migration `0021_slide_checkpoints.sql` and the changed functions have **not**
been applied or deployed from this isolated task. No live generation was run
because there was no disposable instructor-authenticated fixture, and this
increment must not overwrite an existing private deck.

The new `course-checkpoint-backfill` function is also **not deployed**, and no
real private deck or bank was prepared. Managed approval for shared
backend/Storage mutation was explicitly rejected, so the runtime sequence
remains pending: apply the checkpoint migration and deploy the changed
functions only after authorization; prepare Week 1 Lecture 1 first; confirm all
45 teaching slides remain, 3–5 checkpoints exist, retired anchors are gone and
arrow navigation still works; then continue one lecture at a time with the same
preview and coverage checks. Do not batch this backfill.

**Local backfill evidence:** `tools/verify-checkpoint-decks.mjs` was captured
RED against the required four-slide legacy fixture, then GREEN. It exercises
the real transformer, preserves custom inline assets containing `$&`, verifies
the checkpoint falls after slide 3 without renumbering teaching slides, and
source-checks instructor/private/active-bank gates, current asset reuse, no
prompt/option mutations, pre-write validation and same-path Storage ordering.

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
