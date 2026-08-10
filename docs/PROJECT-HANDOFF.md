# TC2007B platform — current agent briefing

**Last consolidated:** 2026-08-10

**Live app:** <https://course-platform-3ko.pages.dev>

**Supabase project:** `ojmbupftdikwmlqvibwt`

This is the canonical continuation record. Read it after `00-START-HERE.md`
before changing, deploying, or testing anything. Older status entries and
handoffs are historical evidence, not a replacement for this file.

## What the platform does

Mahdi Zareei uses this bilingual (English/Spanish) platform to run TC2007B
Information Security classes at Tecnológico de Monterrey.

- A professor manages groups, class days, content, question banks, and rosters.
- During class, students join from a QR code, see live questions on their phones,
  take a timed final quiz, and submit an optional reflection.
- The professor presents the deck, sends selected pulse questions, sees private
  results, and reviews attendance, participation, and class grades afterwards.
- A professor can generate either a bilingual slide deck plus question bank, or a
  question bank only, from an uploaded PDF.
- Course materials are authored in the private `mzareei/course-content` repository
  and can be explicitly synchronized into private platform storage. Syncing never
  releases content to students.

## Repositories and deployment boundaries

| Repository | Local path | Purpose | Deployment |
|---|---|---|---|
| Frontend | `~/Documents/GitHub/course-platform` | Vite + TypeScript + Preact SPA, Pages Function that serves gated content | Push to `main` deploys Cloudflare Pages |
| Backend | `~/Documents/GitHub/mzareei.github.io` | Supabase migrations, Edge Functions, private deck templates; also the separate public academic site | Migrations/functions deploy explicitly; a Git push alone does not deploy them |
| Content | `~/Documents/GitHub/course-content` | Private, Git-authored source HTML and metadata for course material | GitHub validates pull requests; publishing to platform storage is an explicit CLI/platform action |

Do not treat the public academic site's old `assets/course-materials/` files as
the active platform source. They are legacy content pending public-site
retirement.

## Product rules that are not optional

1. The browser never queries Supabase tables directly. Edge Functions authorize
   every data read and write; RLS is enabled with no browser table policies.
2. All user-facing copy is English and Spanish.
3. Deck HTML is always opened through gated same-origin `/content?t=…`; never
   use `srcdoc` or `blob:`.
4. A class session, not merely a release row, makes a live class visible to
   students.
5. Content synchronization and student release are separate, deliberate actions.
6. Generated questions must be based on course source material. A professor may
   select/reorder existing generated questions or create a short ad-hoc question
   for a particular class plan; the general question bank remains reusable.
7. For PDF generation, the uploaded PDF is the curriculum source of truth. The
   typed title is only a display label. The model must cover all source pages in
   order and may clarify with examples/analogies, but must not add new curriculum.

## Core architecture

### Authentication and content delivery

The SPA authenticates with Supabase, but it calls Edge Functions rather than
database tables. An authorized function mints a short-lived token; the SPA loads
the lecture through `/content?t=…`. This route has a deck-specific CSP that
allows the deck engine to run. Bypassing it makes the slide engine silently fail.

### Class lifecycle

1. The professor creates a group and class day, assigns a lecture/bank, and
   starts the class.
2. Students scan the session QR code to check in and join the live classroom.
3. The professor selects a planned or ad-hoc pulse question, sends it, reveals
   the result, then continues the lecture.
4. The professor starts a sequential timed end-of-class quiz and later closes
   the class. The class assignment makes the lecture available for Review.
5. Gradebook shows two views per class: participation/attendance and graded
   work. Attendance is based on QR check-in; engagement is based on live
   responses. The reflection/exit ticket is not graded but can apply the agreed
   class-grade penalty when missing.

Question timing is fixed in seconds: easy 20, medium 30, hard 45. Live answers
receive participation credit; correctness contributes to the class-grade policy.
The combined grade is capped at 100, with the agreed tolerance for mistakes and
the configured missing-reflection penalty.

### Question planning

Question banks are reusable and source-mapped. Each question records its topic
and PDF/slide evidence. A professor makes a separate plan for each class:

- choose existing questions by topic/source location;
- write one quick class-specific question when useful;
- place a question at a chosen point in the class plan; or
- run the platform only for pulse/final questions while presenting an external
  PDF outside the platform.

This deliberately keeps questions independent from fixed HTML checkpoints.
Editing a deck does not silently destroy a bank; the professor can adjust the
class plan freely.

### PDF generation workflow

The Content screen collects a PDF, display title, generation mode, and a
teaching brief. The brief supports free text plus structured preferences such
as checkpoint placement/counts and an end-of-class question target.

1. The worker extracts an ordered teaching-plan proposal from the PDF.
2. The professor reviews and edits that plan before approving generation.
3. In `deck_and_bank` mode, the worker creates source-mapped bilingual slide
   JSON, renders deterministic HTML, and creates a flexible question bank.
   In `bank_only` mode, it creates the bank without a deck.
4. An independent grounding pass checks the generated output against the
   original PDF before final persistence.
5. Only a passed result becomes a private content item/question bank. It still
   needs the normal explicit availability/release step before students can see it.

Legacy banks retain their exact historic validation. PDF-generated banks use a
flexible profile: no hard requirement for 18 questions. The amount should fit
the source and teaching plan.

### AI provider, prompts, and cost

The generation worker uses Anthropic's Messages API with structured tool output.
Its code default is `claude-sonnet-5`; the Supabase `ANTHROPIC_MODEL` secret can
override that default. It makes up to four logical calls: teaching-plan proposal,
slides (deck mode only), questions, and independent grounding. Output caps total
44,000 tokens, but normal structured jobs use substantially less.

At the current Sonnet introductory API pricing (through 2026-08-31), a normal
deck plus bank is roughly US$0.40–$1.00; bank-only is roughly US$0.25–$0.60.
Large/scanned PDFs or retries can be US$1–$2+. This is model API cost only, not
Cloudflare or Supabase hosting. Treat it as an estimate until per-call token
usage is recorded in the application.

## Current implementation and deployment state

### External content import — deployed 2026-08-10, code-verified, not yet browser-verified

A professor can now author a deck and question bank with their own AI
subscription (ChatGPT/Claude/Gemini) and import both — the platform makes no
model call on this path. See
`docs/superpowers/specs/2026-08-09-external-content-import-design.md` for the
design and `docs/04-decisions.md`'s newest entries for why this reverses "the
model never emits HTML" for this path only.

- New edge function `course-content-import` and the redeployed
  `course-generation-worker` (carries the rebuilt deck engine — the
  audience-facing language fix below) are live on `ojmbupftdikwmlqvibwt`.
  Confirmed reachable with a real 401 from an unauthenticated request, not a
  404.
- Frontend is live at `index-CMHNVQqE.js` / `index-BpRzTDRG.css`, confirmed by
  fetching the live page directly, not inferred from a successful push.
- **Fixed a live bug in the same change**: the classroom question overlay (both
  the parent page and the deck's own in-fullscreen copy) used to stack
  English and Spanish together instead of showing one language, affecting
  every class taught in Spanish (groups 501/502). Existing generated decks
  keep the old stacked behavior until **Refresh lecture deck** is run for
  their bank — see below.
- No migration. Verified before and after: `npx supabase migration list --linked`
  shows every local migration already applied on remote.
- One Critical finding surfaced and fixed in final review before deploy:
  importing under an existing lecture's slug would have silently corrupted a
  real production question bank or broken "Start quiz" mid-class. The fix
  (`isReimportableByThisFeature` in `course-content-import/index.ts`) was
  verified against a live read-only export of every production content item
  — zero could pass the guard. See pitfall #68.
- **Not yet done, and cannot be done by an agent**: any browser click-path.
  Test sign-in refuses instructors, so the Import tab, the preview/repair
  flow, deck upload through Run Class, the language fix in a real class, and
  a live pulse question reaching a real device are all unverified in the
  browser. Test fixtures and the exact click path were prepared and handed to
  the professor — see "High-priority remaining work" below.
- The authoring prompt has been tested against exactly one model (Claude),
  not ChatGPT or Gemini — visible as a caveat on the Import screen itself.

### Deployed and confirmed in the live browser

- The Content screen contains the new **Teaching brief** form: source-of-truth
  notice, deck-and-bank/bank-only choice, free-text instructions, checkpoint
  preferences, and question-count guidance.
- Content repository sync, sharing/copying, gated private content delivery,
  class/group management, QR joining, the single-screen presentation flow,
  gradebook, and the earlier class lifecycle are live.
- The real `course-content` repository contains the authoring/pull/publish
  tooling, mirrored deck templates, and 24 pulled storage-backed items. A safe
  publish-and-student-review test was completed on `week-02-lecture`.
- Migration `0035_pdf_teaching_plans.sql` was applied to production.
- Edge Functions `course-generation`, `course-generation-worker`, and
  `course-question-bank` were deployed with the PDF teaching-plan feature.

### Synchronized and deployed on 2026-08-09

- Backend GitHub `main`, the primary backend folder, and the active PDF worktree
  are synchronized at `0cb36b6`.
- The final compatibility/type-check fixes are deployed in
  `course-generation`, `course-generation-worker`, and `course-question-bank`.
- The PDF pipeline passed local contract checks, Deno checks, frontend
  typecheck/build, and the combined verifier suite. Do not claim an end-to-end
  generation is fully browser-verified until a fresh PDF upload completes and
  its resulting deck/bank are inspected through the real app.

### Browser-test limitation

The signed-in Chrome session can open the live instructor UI. Browser automation
could not select a local test PDF because Chrome blocks extension access to local
file URLs. To let an agent choose local files, open `chrome://extensions`, choose
Details for the ChatGPT/Codex browser extension, and enable **Allow access to
file URLs**. This is a local browser setting, not an application defect.

## Verification and deployment commands

Run frontend checks from the frontend worktree/repository:

```bash
npm run typecheck
COURSE_PLATFORM_BACKEND_ROOT=/absolute/path/to/mzareei.github.io npm run verify
npm run build
```

Relevant PDF/class checks include:

```bash
node tools/verify-pdf-teaching-plan.mjs
node tools/verify-slide-checkpoints.mjs
node tools/verify-live-checkpoint-security.mjs
node tools/verify-class-question-plans.mjs
node tools/verify-generation-teaching-plan.mjs
node tools/verify-generation-upload.mjs
```

Deploy a backend change only after its migration/verification review:

```bash
cd ~/Documents/GitHub/mzareei.github.io
npx supabase db push --include-all --yes
npx supabase functions deploy <function-name> --project-ref ojmbupftdikwmlqvibwt
```

Cloudflare Pages deploys the frontend when the reviewed frontend commit is pushed
to `main`. Confirm the live app after deployment; a successful build is not UI
evidence.

## High-priority remaining work

1. **Professor's browser pass on external content import.** Test fixtures
   (clean/faulty question files, clean/faulty decks) and the exact click path
   are prepared and were handed off directly — an agent cannot sign in as the
   instructor to do this. Covers: the Import tab reachable by click, the
   preview/repair flow, a deck's independent pass/fail from its paired
   questions, the deck opening through the real gated `/content?t=…` route,
   the language fix (Spanish-only room display, both the parent overlay and
   the in-deck fullscreen copy), and a real pulse question reaching a second
   device and grading correctly.
2. **Run the authoring prompt on ChatGPT and/or Gemini** with a real lecture,
   import the result, and confirm it's clean or fix the prompt. Currently
   validated against Claude only.
3. **Decide on Refresh lecture deck.** Only `week-01-lecture` currently
   qualifies (`checkpoint_preparation_state = 'ready'`) — confirmed by a
   read-only production query and by tracing `src/features/deck/bankReadiness.ts`'s
   own gating logic, not just the raw column. The other ten real lectures have
   never had checkpoints prepared, so the button isn't offered for them at
   all; bringing them onto the language-fixed deck engine needs **Prepare
   checkpoints** instead, a materially bigger action nobody has asked for.
   Not run by the agent that built this — the runbook forbids batching it and
   it rewrites production storage.
4. Finish one full browser test of PDF upload → teaching-plan review → generation
   → inspect deck and bank → make available/assign to a test class only if needed.
5. Complete and record one fresh browser test of the PDF generation result.
6. Conduct a real-phone class rehearsal: QR join, late join, concurrent pulse
   answers, final quiz, reflection, close/reopen behavior, and projector reload.
7. Decide and complete the public-site retirement of legacy teaching material
   only after its gated replacements are verified. Do not delete content as part
   of routine work.
8. Consider recording Anthropic token usage/estimated cost per generation job in
   the teacher interface.

## Safety and testing rules for every agent

- Check `git status` in all three repositories before editing. Preserve untracked
  `.superdesign/`, `AGENTS.md`, and `.DS_Store` files unless explicitly asked.
- Use an isolated worktree for feature work. The active PDF worktrees above
  already exist; do not overwrite their unrelated changes.
- Read actual Edge Function JSON responses, not just frontend TypeScript types.
- Test through the visible user route: a student starts at Today; an instructor
  starts at the instructor screens. Do not call an internal URL a sufficient test.
- Do not disclose or commit access tokens, Anthropic keys, GitHub tokens, student
  identities, email addresses, answers, grades, or notes.
- Keep `05-status.md`, this handoff, and `07-pitfalls.md` current when behavior
  or deployment state changes.

## Reading order for a new agent

1. `docs/00-START-HERE.md`
2. This file
3. `docs/04-decisions.md`
4. `docs/05-status.md`
5. `docs/06-runbook.md`
6. `docs/07-pitfalls.md`
7. `docs/superpowers/specs/2026-08-09-pdf-teaching-plan-and-grounding-design.md`
8. `docs/superpowers/plans/2026-08-09-pdf-teaching-plan-and-grounding.md`
9. `docs/superpowers/specs/2026-08-09-external-content-import-design.md` and
   `docs/superpowers/plans/2026-08-09-external-content-import.md` when
   changing the import feature.
10. `docs/CONTENT-REPO-SYNC-HANDOFF.md` when changing authoring/sync behavior.

The backend's short `docs/COURSE-PLATFORM-HANDOFF.md` and the content repo's
older README contain historical material. Use this file for current status when
they conflict, then update the stale document as part of the work that touches it.
