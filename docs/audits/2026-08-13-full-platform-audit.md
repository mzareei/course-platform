# Full platform audit — 2026-08-13

Audited by agent session on 2026-08-13: every instructor screen in the live
production app (signed-in Chrome), the student surface (mobile viewport,
separate browser), a frontend code audit, and a backend/edge-function audit.
This file is the durable record; the professor received the one-line-per-item
version. Severity: **A** = wrong today / security, **B** = teaching-workflow
friction, **C** = student experience, **D** = hygiene.

## A — Wrong today / security

| # | Finding | Evidence |
|---|---|---|
| A1 | The Aug 19 class ("Week02 Class 01 – Authentication", group 401) is already **live** — started early; one pulse question (Diffie-Hellman) pushed, 0 answers. Home and Classes show two Live sessions; students will see a live class that isn't being taught. Decision belongs to the professor (half-done classes are deliberate in this project). | Home + Classes screens; Gradebook Per-class defaults to it |
| A2 | **Attendance labels are wrong for a class closed late**: Aug 12 record reads "0 present · 2 late · 25 left early · 1 absent". "Left early" compares last activity against the (much later) close time. Fix: judge "left early" against actual teaching time (e.g. last pulse/attendance activity window), never the close timestamp. | /teach/class/bbd06a5d… |
| A3 | **Grading a class whose quiz never ran**: Aug 12 shows every student quiz 0/12 + reflection "Missing" (−20%). Posting as-is misgrades the whole group. Needs a rule: when no quiz instance was ever started for a session, grade on class questions alone and skip the missing-submission penalty. Backend formula lives in `_shared/class-grade.ts` (single source, confirmed). | Class record 8/12 |
| A4 | **`reset_student_pin` unscoped** — any instructor in any section can clear any profile's PIN then claim it. Add the same section scoping as `remove_person`. | `course-roster-management/index.ts:95-104`, `0051:174-198` |
| A5 | **Generation worker fails open** when `GENERATION_WORKER_SECRET` unset (`if (secret && …)`), with `verify_jwt=false`. Make it fail closed. | `course-generation-worker/index.ts:52-55` |
| A6 | **`course-test-signin` still deployed** (frontend flag off, but endpoint live; only env-date rail left). Delete/undeploy. | `functions/course-test-signin` |
| A7 | **Legacy no-auth write endpoints still deployed**: `quiz-start-attempt`, `quiz-submit-attempt`, `course-submit-reflection`, `course-submit-portfolio` (anon key suffices to write). Plus 3 summary endpoints behind one static `QUIZ_TEACHER_PIN` returning cohort PII. Undeploy the ~18 genuinely dead legacy functions (list in backend audit). | backend audit #5/#6/#12 |
| A8 | **PIN claim path leaks distinct errors** (`student_unknown` vs `pin_already_set` vs `not_in_this_class`) → student-ID oracle during a live class; no cross-ID throttle on `course-pin-auth`. Unify claim errors; consider modest IP throttle. | `0052:149-167`, `course-pin-auth/index.ts` |
| A9 | **All backend refusals reach users in raw English** — `e instanceof Error ? e.message : t(…)` is always-true (`ApiError extends Error`) in ~40 call sites, so the bilingual branch is dead. Worst for Spanish groups 501/502. Fix centrally: map `ApiError.code`→string keys (pattern exists: `pinRules.ts`), and add stable codes to the two delete refusal paths that are English-only on the backend. | frontend audit #4, backend audit #9/#10 |
| A10 | **Professor's "today" computed in UTC** — after 18:00 in Monterrey the Home "Today's class" card vanishes while class is running. Use local date key like student Today. | `Home.tsx:11` |
| A11 | `t()` throws on unknown keys fed from server data (difficulty/status/role keys) → potential white screen mid-class. Add fallback in `t()`. | `i18n/index.ts:56`, `CheckpointPanel.tsx:152` |
| A12 | Unknown `action` in `course-roster-management` falls through to `list_roster` (HTTP 200) instead of 400. | `index.ts:161-184` |
| A13 | `deno check` fails on `course-auth-context` (25 errs) and `course-pulse` (7 errs) — type safety only. | backend audit #3 |

## B — Teaching workflow

| # | Finding |
|---|---|
| B1 | **Cannot plan questions before class** — `ClassQuestionPlanBoard` renders only when live (`RunClass.tsx:1172/1312`); backend already allows `planned`. Render the board pre-live. Docs call this "worth fixing". |
| B2 | **Content list is unordered and huge** — 26 items in creation order (Week 10 next to Mission 07 next to Week 2), giant cards each repeating an "Assign to a class" dropdown. Sort by week/number, compact rows, add a search box. |
| B3 | **Confusing availability controls** — a card already "Students can open it" still shows primary "Make available now"; "Available" vs "Review" vs "Assign" vocabulary mixes. Make state + one toggle action explicit. |
| B4 | **Question-bank "Needs attention: Every active question needs a valid source-page mapping · Source PDF pages: —"** shows (twice per card) on imported banks where it is meaningless jargon — including the bank used in today's class. Suppress for imported banks / rewrite in plain language. |
| B5 | **People roster**: no search/filter, ~160px rows, duplicated group controls; Mahdi Zareei listed **twice** as Instructor·401 (duplicate enrollment rows); QA litter (`ZZ Rehearsal Test`, `max`) visible in the real 401 pickers. Compact + search + data cleanup. |
| B6 | **Nothing nudges posting grades** — Aug 12 closed, grades computed, never posted; Gradebook says only "No grades yet". Add "1 closed class not yet posted" hint. |
| B7 | **Future-dated class can be started silently** (that's how A1 happened). Ask for confirmation when starting a class whose date isn't today. |
| B8 | **Class record tables overflow** — the final-grade column lands off-screen at 1440px; horizontal scroll is invisible. Also Gradebook "Per class" defaults to the newest session rather than the most recent taught one, and shows raw poll internals ("Questions asked in class" with 0s) above the record link. |
| B9 | **Projector view is fully built but has no link anywhere** (route exists, screen exists, zero hrefs — the exact "shipped but unreachable" failure the repo warns about). Link it from Run Class or delete it. |
| B10 | **No success feedback in the plan board** — `notice` is set to null only; "Ask now"/"Save" give no confirmation. |
| B11 | Home card copy stale: "and (soon) PDF upload"; naming inconsistency "Week02 Class 01 – Authentication" vs "Week 1 Class 2: …". |
| B12 | `window.confirm()` used in 16 destructive spots vs the repo's own two-press bilingual pattern (pitfall #36) — two confirmation idioms coexist. |
| B13 | "Reset the course" (dangerous) sits directly under "Add a class day" on Classes. Move to Admin / behind distance. |

## C — Student experience

| # | Finding |
|---|---|
| C1 | Sign-in: phone keyboard "Go" does nothing (no `<form>` wrapper), PIN field misses all input styling incl. dark mode (`app.css` only styles email/text/number), no "forgot your PIN → ask your professor" hint, no "first time? scan the QR in class" hint. |
| C2 | Student Grades error path: raw English message, no retry, no way back (`Grades.tsx:83-90`); backend study recommendations render untranslated. |
| C3 | Live screen shows "waiting for the professor" during initial load (can't tell loading from idle); several screens render blank on transient null context. |
| C4 | "View as student" shows an unenrolled view — Today empty during a live class, My Grades a raw red "Student is not enrolled in this course." It does not show "exactly what your students see". Either enroll-preview per group or set expectations + friendly empty states. |
| C5 | "Next class"/"upcoming" rely on server ordering — sort by date client-side (`Today.tsx:47`, `Home.tsx:13`). |
| C6 | Attendance pills hardcode hex colors + reference non-existent tokens (`--ok`) → fail contrast in dark mode, on student Grades too. |
| C7 | A11y: fake tablists (`aria-current` on `href="#"`), sign-in errors as `role="status"` not `alert`, fullscreen question layer lacks dialog semantics/focus management. |
| C8 | ~70 list renders missing `key`, two on 3s-polling surfaces (`Live.tsx:233`, `CheckpointPanel.tsx:224`) where mis-reconciliation is possible mid-class. |

## D — Hygiene

| # | Finding |
|---|---|
| D1 | Data litter: 8 `mah.zareei+cptest*` auth users; duplicate instructor enrollment (B5); `ZZ Rehearsal Test`/`max` in 401. |
| D2 | Dead frontend code: `final_quiz_question_count`, `markClassQuestionPlanCheckpointSkipped`, `pushPulse`, `regenerateQuestions`, hidden "generate" tab branch (~400 lines), ~30 orphaned string pairs, `.action-dock` CSS, stale `types.ts` fields (incl. removed weighted categories). |
| D3 | `docs/05-status.md` stale on security: still says test sign-in is on (`config.ts:18` is false). Fix the doc. |
| D4 | `verify-i18n` scans only screens/components — extend to features/api/state (hardcoded English found in quiz Player, session state, api client, incl. leaking function name "course-pulse" to users). |
| D5 | `course-gradebook-summary` still carries weighted-category model (weight_percent/drop_lowest) after the one-grade-per-class redesign — remove or freeze. |
| D6 | Missing `[functions.X]` config blocks for `course-pin-auth`, `course-presentation`, `course-student-notes`; status-by-regex error mapping in several functions; 3 stray `round2` copies; `course_percent` math outside `class-grade.ts`. |
| D7 | Git: 13 merged local branches, prunable worktrees, uncommitted docs changes, untracked `AGENTS.md`. |
| D8 | 6.5rem dead bottom padding on every instructor screen (budgeted for a student-only dock). |
| D9 | Docs claim `course-presentation` is legacy-only — it is actively used by 7 frontend references; the actually-dead one is `course-quiz-compatibility`. Correct the docs before someone deletes the wrong function. |

## Verified working (no action)

Deck delivery chain (Review → `/view/...` → gated iframe) renders; wrong-PIN
error is bilingual and identical for unknown IDs on the signin path; PIN
lockout logic matches docs (5 tries / 15 min); migrations 0001–0052 match
remote exactly; no field-name mismatches between frontend api/*.ts and
deployed function returns; typecheck + all 38 verifiers pass.
