# PDF Teaching Plan and Source Grounding Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Let an instructor turn an uploaded PDF into a source-grounded deck and/or question bank only after reviewing an editable teaching plan.

**Architecture:** A generation job stores the professor's teaching brief, then pauses at ready_for_plan_review after reading the PDF. The worker makes an ordered proposal and independently verifies generated output against the same PDF. Only a grounded, approved plan may persist final artifacts. Existing per-class Question Plans stay responsible for what is asked live.

**Tech Stack:** Preact + TypeScript, Supabase Edge Functions (Deno), Postgres, Supabase Storage, Anthropic structured output, Node source-contract verifiers.

## Global Constraints

- The uploaded PDF is the complete source of truth. A title and teaching brief are display/planning inputs, never sources of curriculum.
- Preserve every PDF page and overall page order, including title, agenda, reference, and administrative pages.
- Clarifying examples and analogies may not introduce claims, statistics, topics, or assessed material absent from the PDF.
- Every generated question is bilingual, four-option, single-choice, has exactly one correct option, and cites source PDF pages.
- Flexible jobs do not require exactly 18 questions, a 6/6/6 mix, or 3–5 checkpoints. Legacy banks retain those rules.
- Generated decks receive suggested placements only; they do not auto-pause or insert checkpoint slides.
- A failed job must not create or update a content item, question bank, or content release. Private staging bytes may be cleaned later.
- Do not automatically remove, alter, or unrelease the existing test mal item; that requires explicit user approval.

## Files and contracts

Backend repository, ../mzareei.github.io:

- Create supabase/migrations/0035_pdf_teaching_plans.sql.
- Create supabase/functions/_shared/generation-plan.ts.
- Modify supabase/functions/course-generation/index.ts.
- Modify supabase/functions/course-generation-worker/index.ts, schemas.ts, and deck.ts.
- Modify supabase/functions/_shared/checkpoints.ts.
- Modify supabase/functions/course-question-bank/index.ts.
- Create tools/verify-pdf-teaching-plan.mjs.

Frontend repository, .:

- Modify src/api/generation.ts, src/api/checkpoints.ts, src/features/deck/bankReadiness.ts, src/components/QuestionBanks.tsx, src/screens/instructor/Content.tsx, and src/i18n/strings.ts.
- Create src/components/GenerationBriefForm.tsx, src/components/GenerationPlanReview.tsx, and tools/verify-generation-teaching-plan.mjs.

Shared request contract:

    type GenerationMode = "deck_and_bank" | "bank_only";

    type TeachingBrief = {
      generation_mode: GenerationMode;
      instructions: string;
      live_checkpoint_goal: number | null;
      candidates_per_checkpoint: number | null;
      end_quiz_question_goal: number | null;
      checkpoint_preferences: string;
    };

    type SourcePage = {
      source_pdf_page: number;
      topic: string;
      topic_es: string;
      evidence: string;
    };

    type TeachingPlan = {
      source_pages: SourcePage[];
      checkpoints: Array<{
        key: string;
        topic: string;
        source_pdf_pages: number[];
        suggested_after_pdf_page: number | null;
        candidate_goal: number | null;
      }>;
      end_quiz_goal: number | null;
    };

A null goal means AI decides. source_pages has one ordered row per PDF page. A bank-only job has no content_item_id but is selectable by the existing class Question Plan.

---

### Task 1: Persist the teaching-plan contract and safe API states

**Files:**

- Create: ../mzareei.github.io/supabase/migrations/0035_pdf_teaching_plans.sql
- Create: ../mzareei.github.io/supabase/functions/_shared/generation-plan.ts
- Modify: ../mzareei.github.io/supabase/functions/course-generation/index.ts
- Create: ../mzareei.github.io/tools/verify-pdf-teaching-plan.mjs

**Consumes:** Existing generation_jobs, content_uploads, and instructor authorization.

**Produces:** the typed brief/plan contract and authenticated create_job, review_plan, and approve_plan actions.

- [ ] **Step 1: Write the failing backend contract verifier**

Create tools/verify-pdf-teaching-plan.mjs. It must read migration, API, and helper sources and assert:

    assert.match(migration, /ready_for_plan_review/);
    assert.match(migration, /generation_mode/);
    assert.match(migration, /teaching_brief/);
    assert.match(migration, /proposed_plan/);
    assert.match(api, /case "review_plan"/);
    assert.match(api, /case "approve_plan"/);
    assert.match(helper, /function validateTeachingBrief/);
    assert.match(helper, /function validateTeachingPlan/);

- [ ] **Step 2: Confirm the verifier fails**

Run: node tools/verify-pdf-teaching-plan.mjs

Expected: it reports each missing migration, API, and helper marker.

- [ ] **Step 3: Add migration and pure validation**

Migration 0035 adds generation_mode (deck_and_bank or bank_only), teaching_brief JSONB, proposed_plan JSONB, approved_plan JSONB, and grounding_status (pending, passed, failed) to generation_jobs. Extend its existing status check with ready_for_plan_review.

Add generation_validation_profile (legacy or flexible) to question_banks and source_pdf_pages integer array to questions.

In generation-plan.ts implement validateTeachingBrief and validateTeachingPlan. Reject a blank mode, free text over 4,000 characters, non-positive numeric goals, an out-of-order page, a blank page topic/evidence, or a checkpoint citing a page absent from source_pages.

- [ ] **Step 4: Add course-scoped plan actions and final approval gates**

createJob stores the validated brief and mode, then invokes extraction only. reviewPlan returns teaching_brief and proposed_plan only to a course instructor. approvePlan validates the edited plan, writes approved_plan, clears errors, and invokes the worker.

Place this guard at the start of final bundle approval:

    if (job.grounding_status !== "passed" || !job.approved_plan) {
      throw new Error("This PDF plan has not passed source grounding and approval.");
    }
    if (job.generation_mode === "deck_and_bank" && !job.content_item_id) {
      throw new Error("This deck-and-bank job has no generated deck.");
    }
    if (!job.question_bank_id) throw new Error("This job has no generated question bank.");

- [ ] **Step 5: Verify and commit**

Run:

    node tools/verify-pdf-teaching-plan.mjs
    deno check supabase/functions/course-generation/index.ts
    deno check supabase/functions/_shared/generation-plan.ts

Expected: the verifier prints PDF teaching-plan contract: OK and both Deno checks pass.

    git add supabase/migrations/0035_pdf_teaching_plans.sql \
      supabase/functions/_shared/generation-plan.ts \
      supabase/functions/course-generation/index.ts \
      tools/verify-pdf-teaching-plan.mjs
    git commit -m "feat: add PDF teaching plan contract"

### Task 2: Extract an ordered proposal and require plan approval

**Files:**

- Modify: ../mzareei.github.io/supabase/functions/course-generation-worker/schemas.ts
- Modify: ../mzareei.github.io/supabase/functions/course-generation-worker/index.ts
- Modify: ../mzareei.github.io/tools/verify-pdf-teaching-plan.mjs

**Consumes:** Task 1 job fields and validation helper.

**Produces:** stepExtractProposal, which stops the job at ready_for_plan_review.

- [ ] **Step 1: Extend the verifier with failing workflow assertions**

Add:

    assert.match(worker, /stepExtractProposal/);
    assert.match(worker, /nextStatus = "ready_for_plan_review"/);
    assert.match(worker, /pdfBlock\(base64\)/);
    assert.match(worker, /source_pdf_page/);
    assert.match(worker, /title is a display label/i);
    assert.doesNotMatch(worker, /Write exactly 18 questions/);

- [ ] **Step 2: Confirm red state**

Run: node tools/verify-pdf-teaching-plan.mjs

Expected: it fails because the existing worker immediately converts extraction into deck generation.

- [ ] **Step 3: Add proposal schema and extraction**

Add PLAN_SCHEMA. Each source_pages item requires source_pdf_page, topic, topic_es, and evidence. Each checkpoint requires source_pdf_pages plus nullable placement/candidate goals.

Replace stepExtract with stepExtractProposal. Its model instruction must include:

    "The uploaded PDF is the complete source of truth. The typed title is a display label only. " +
    "List every PDF page in order, including title, agenda, reference and administrative pages. " +
    "Do not add, omit, reorder, or infer curriculum."

Pass the original PDF block and validated teaching brief. Validate the proposal, persist it, leave grounding_status pending, set ready_for_plan_review, and do not self-chain until plan approval.

- [ ] **Step 4: Verify and commit**

    node tools/verify-pdf-teaching-plan.mjs
    deno check supabase/functions/course-generation-worker/schemas.ts
    deno check supabase/functions/course-generation-worker/index.ts
    git add supabase/functions/course-generation-worker/schemas.ts \
      supabase/functions/course-generation-worker/index.ts \
      tools/verify-pdf-teaching-plan.mjs
    git commit -m "feat: require PDF plan review before generation"

Expected: all commands pass, and no extraction route bypasses plan review.

### Task 3: Generate only grounded artifacts in two output modes

**Files:**

- Modify: ../mzareei.github.io/supabase/functions/course-generation-worker/index.ts
- Modify: ../mzareei.github.io/supabase/functions/course-generation-worker/schemas.ts
- Modify: ../mzareei.github.io/supabase/functions/course-generation-worker/deck.ts
- Modify: ../mzareei.github.io/supabase/functions/_shared/checkpoints.ts
- Modify: ../mzareei.github.io/tools/verify-pdf-teaching-plan.mjs

**Consumes:** Task 1 approved plan and Task 2 source page map.

**Produces:** source-mapped slides/questions, independent grounding, no auto checkpoints, and flexible validation.

- [ ] **Step 1: Add failing grounding assertions**

    assert.match(worker, /async function stepGrounding/);
    assert.match(worker, /grounding_status: "passed"/);
    assert.match(worker, /generation_mode === "bank_only"/);
    assert.match(worker, /generation\/.*deck\.html/);
    assert.match(deck, /data-source-pdf-pages/);
    assert.match(checkpoints, /function validateFlexibleQuestionBank/);
    assert.doesNotMatch(worker, /deckCheckpointsFromQuestions\(questions\)/);

- [ ] **Step 2: Confirm red state**

Run: node tools/verify-pdf-teaching-plan.mjs

Expected: no grounding function, staging path, or flexible validator exists.

- [ ] **Step 3: Add source mapping and independent grounding**

Require source_pdf_pages on every generated slide and question. Add stepGrounding, which sends the original PDF, approved plan, and generated output to a structured tool returning:

    { passed: boolean; problems: string[] }

Reject missing/reordered pages, subject drift, and unsupported content. On rejection throw Generated output rejected by PDF grounding with the returned problems. Do this before content item, bank, or release persistence.

- [ ] **Step 4: Implement deck-and-bank and bank-only branches**

For deck_and_bank, generate slides in plan page order, add source_pdf_pages to the Slide interface, and emit data-source-pdf-pages in the deterministic HTML. Map approved checkpoint suggestions to final slide numbers but pass an empty checkpoint array to assembleDeck, so the deck never injects checkpoint slides.

For bank_only, skip slide generation and create PDF-mapped questions with checkpoint_after_slide, source_slide_start, and source_slide_end all null.

Add validateFlexibleQuestionBank. It must require at least one question, preserve four-option/one-correct/bilingual checks, and reject a missing or out-of-range source_pdf_page. Do not change validateCheckpointBank; it preserves legacy 18/6/6/3–5 behavior.

- [ ] **Step 5: Stage bytes, then persist only after all gates pass**

Write deck bytes only to a private staging path shaped as courses/<course>/generation/<job>/deck.html. After grounding and flexible validation pass, write final deck storage, content item, draft bank, and question rows. A bank-only job creates a draft question bank with content_item_id null and generation_validation_profile flexible. Every persisted generated question receives source_pdf_pages.

A failed job must not update an existing content item. A private orphaned staging object is acceptable and must have no release reference.

- [ ] **Step 6: Verify and commit**

    node tools/verify-pdf-teaching-plan.mjs
    node tools/verify-slide-checkpoints.mjs
    node tools/verify-live-checkpoint-security.mjs
    deno check supabase/functions/course-generation-worker/index.ts
    deno check supabase/functions/course-generation-worker/deck.ts
    git add supabase/functions/course-generation-worker \
      supabase/functions/_shared/checkpoints.ts \
      tools/verify-pdf-teaching-plan.mjs
    git commit -m "feat: ground generated PDFs before persistence"

Expected: all commands pass.

### Task 4: Preserve legacy readiness while exposing flexible banks

**Files:**

- Modify: ../mzareei.github.io/supabase/functions/course-question-bank/index.ts
- Modify: src/api/checkpoints.ts
- Modify: src/features/deck/bankReadiness.ts
- Modify: src/components/QuestionBanks.tsx
- Modify: src/i18n/strings.ts
- Create: tools/verify-generation-teaching-plan.mjs

**Consumes:** Task 1 validation profile and Task 3 source-PDF fields.

**Produces:** flexible banks are ready under their own contract; legacy banks retain exact readiness.

- [ ] **Step 1: Write failing frontend readiness checks**

    assert.match(readiness, /generation_validation_profile/);
    assert.match(readiness, /profile === "flexible"/);
    assert.match(api, /source_pdf_pages/);
    assert.match(component, /content\.banks\.flexibleReady/);
    assert.match(component, /content\.banks\.sourcePages/);
    assert.match(strings, /"content\.banks\.flexibleReady"/);

- [ ] **Step 2: Confirm the old readiness is rigid**

Run: node tools/verify-generation-teaching-plan.mjs

Expected: failure because each bank currently requires 18/6/6/3–5.

- [ ] **Step 3: Expose and consume flexible readiness**

course-question-bank returns generation_validation_profile and source_pdf_pages. In bankReadiness, branch before the legacy logic:

    if (bank.generation_validation_profile === "flexible") {
      return bank.total > 0 && bank.source_pdf_mapping_status === "valid"
        ? "ready"
        : "invalid";
    }

Retain the exact legacy rule below it. QuestionBanks shows Ready from approved teaching plan and source-page mappings for flexible banks. It never offers Prepare checkpoints or Refresh lecture deck for bank-only banks. Existing question edit validation remains strict.

- [ ] **Step 4: Add bilingual copy, verify, and commit**

Backend:

    git add supabase/functions/course-question-bank/index.ts
    git commit -m "feat: expose flexible generated bank readiness"

Frontend:

    node tools/verify-generation-teaching-plan.mjs
    npm run typecheck
    npm run build
    npm run verify
    git add src/api/checkpoints.ts src/features/deck/bankReadiness.ts \
      src/components/QuestionBanks.tsx src/i18n/strings.ts \
      tools/verify-generation-teaching-plan.mjs
    git commit -m "feat: show flexible teaching-plan banks"

Expected: all frontend checks pass.

### Task 5: Build the brief and plan-review interface

**Files:**

- Modify: src/api/generation.ts
- Create: src/components/GenerationBriefForm.tsx
- Create: src/components/GenerationPlanReview.tsx
- Modify: src/screens/instructor/Content.tsx
- Modify: src/i18n/strings.ts
- Modify: tools/verify-generation-teaching-plan.mjs

**Consumes:** Tasks 1–3 API types/statuses.

**Produces:** upload with instructions, editable plan review, and explicit approval before output generation.

- [ ] **Step 1: Add failing API/UI checks**

    assert.match(generationApi, /export type TeachingBrief/);
    assert.match(generationApi, /reviewPlan\(jobId/);
    assert.match(generationApi, /approvePlan\(input/);
    assert.match(content, /GenerationBriefForm/);
    assert.match(content, /GenerationPlanReview/);
    assert.match(strings, /"content\.plan\.approve"/);
    assert.match(strings, /"content\.mode\.bankOnly"/);

- [ ] **Step 2: Confirm red state**

Run: node tools/verify-generation-teaching-plan.mjs

Expected: failure because Content uploads and starts final generation immediately.

- [ ] **Step 3: Add typed API methods and the brief form**

Change createJob to require teaching_brief. Add reviewPlan and approvePlan methods using course-generation actions.

GenerationBriefForm owns display title, PDF, mode radio buttons, free-text instructions, and optional numeric goals. An empty number becomes null with an AI decides label. Its submit callback receives file, title, and teaching_brief but does not upload itself.

- [ ] **Step 4: Implement plan review**

GenerationPlanReview calls reviewPlan, shows source pages in order, and allows edits to checkpoint topic, page, candidate goal, and end-quiz goal. It visibly states that the PDF controls content and the title is only a label. Its action calls approvePlan.

Content renders it only for ready_for_plan_review, adds this state to displayed progress, and does not include it in IN_FLIGHT polling. Keep current final deck/question review and release behavior.

- [ ] **Step 5: Add bilingual copy, verify, and commit**

    node tools/verify-generation-teaching-plan.mjs
    npm run typecheck
    npm run build
    npm run verify
    git add src/api/generation.ts src/components/GenerationBriefForm.tsx \
      src/components/GenerationPlanReview.tsx src/screens/instructor/Content.tsx \
      src/i18n/strings.ts tools/verify-generation-teaching-plan.mjs
    git commit -m "feat: add PDF teaching plan review"

Expected: all checks pass and plan-review jobs no longer poll as active generation.

### Task 6: Deploy and prove the vague-title malware regression is fixed

**Files:** No product-file changes are expected. Amend only a verifier if the final test reveals a missing assertion.

**Consumes:** All prior commits and the existing Supabase/Pages deployment.

**Produces:** deployed migration/functions/frontend and test evidence without publishing test material.

- [ ] **Step 1: Run complete local verification**

Backend:

    node tools/verify-pdf-teaching-plan.mjs
    node tools/verify-slide-checkpoints.mjs
    node tools/verify-live-checkpoint-security.mjs
    node tools/verify-class-question-plans.mjs

Frontend:

    node tools/verify-generation-teaching-plan.mjs
    node tools/verify-generation-upload.mjs
    npm run typecheck
    npm run build
    npm run verify

Expected: every command exits 0.

- [ ] **Step 2: Review migration and request deployment approval**

Inspect the migration diff; it may only add the fields and constraints described in Task 1. Ask for approval before applying migrations or deploying functions.

- [ ] **Step 3: Deploy backend after approval**

    npx supabase link --project-ref ojmbupftdikwmlqvibwt
    npx supabase db push --linked --include-all --yes
    npx supabase functions deploy course-generation
    npx supabase functions deploy course-generation-worker
    npx supabase functions deploy course-question-bank

- [ ] **Step 4: Deploy frontend and run Chrome regression tests**

Push the frontend commit to its deployed branch and confirm the Pages bundle has ready_for_plan_review.

Using the malware PDF and a new title Malware grounding review test:

1. Select Web deck + question bank, vague title, and roughly every ten pages; none after page 14.
2. Confirm the job stops at plan review and identifies malicious-code/malware pages rather than test failure.
3. Edit a checkpoint, approve the plan, and wait for final review.
4. Confirm source-page mappings, no automatic checkpoint slide, and flexible question counts.
5. Repeat in Question bank only mode; confirm no content item/release is created.
6. Do not approve or release either test output to students. Leave the existing test mal item untouched.

- [ ] **Step 5: Report evidence**

Report migration number, deployed function names, Pages revision, both test titles/modes, and that existing test mal was not changed. If a verifier assertion was added after testing, commit it with message test: cover PDF grounding regression. Do not make an empty commit.
