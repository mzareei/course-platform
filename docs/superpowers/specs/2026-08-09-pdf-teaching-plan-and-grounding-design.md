# PDF teaching plan and source-grounded generation

## Purpose

Replace the rigid PDF-to-deck generator with a professor-controlled teaching
plan. The uploaded PDF is the complete source of truth: the generated output
must preserve every PDF page and its overall order. The system may clarify a
topic with a safe analogy or example, but must not omit taught content, add new
curriculum, or introduce unsupported facts.

This design also corrects two observed failures:

- a useful bank was rejected solely for missing the fixed 18-question, 6/6/6
  quota and 3–5-checkpoint quota;
- a short display title (for example, `test mal`) could steer an unverified
  AI outline away from the uploaded malware PDF.

## Professor workflow

1. Upload a PDF and choose one output:
   - **Web deck + question bank**;
   - **Question bank only**, for teaching from an external presentation.
2. Enter a free-text teaching brief and optional structured goals:
   - approximate number of during-class checkpoints;
   - approximate candidates per checkpoint;
   - approximate end-of-class quiz questions;
   - checkpoint preferences or restrictions, such as “roughly every ten
     slides” and “none after slide 14.”
   Every quantitative goal can be set to **AI decides**.
3. The system reads the PDF and presents an editable proposal before it
   generates the final output. The proposal includes source pages, topics in
   PDF order, suggested checkpoints, candidate counts, and end-quiz scope.
4. The professor edits and approves the plan. The original brief and approved
   plan are retained as immutable snapshots on the job.
5. Generation creates only the approved output. The professor reviews it,
   including its source mapping, before releasing anything to students.

## Fidelity contract

- The PDF, not the title or teaching brief, supplies instructional facts and
  scope. The typed title is a display label only.
- Every PDF page is represented in its original overall order, including title,
  agenda, references, and administrative pages.
- Generated slides and questions retain their source PDF page mapping.
- Analogies, examples, and clearer wording may aid understanding, but may not
  introduce new concepts, facts, claims, statistics, curriculum, or assessed
  material.
- A source-grounding gate verifies the extracted plan, generated deck, and
  questions against the original PDF. A topic mismatch or unsupported material
  fails the job before a content item, question bank, or release is created.
- This generation change preserves the source mapping needed for a later
  lecturer-facing hide/delete-slide feature. That editing feature is outside
  this implementation; until then questions rely on every generated slide.

## Question design

- There is no fixed total, fixed 6/6/6 split, or fixed checkpoint count.
- Quantities are flexible goals constrained by the PDF and the approved plan.
- Each question remains bilingual, has four options and exactly one correct
  answer, and is supported by its cited source pages.
- Difficulty describes the thinking required and the plausibility of the
  distractors. It does not require a different topic or a unique question stem.
- During-class candidates are tagged with topic and source context. A generated
  web deck may display suggested placements, but it never stops automatically.
  The existing per-class Question Plan and manual controls decide what is asked
  in each particular class session.
- Bank-only generation produces the same topic-tagged candidates without deck
  or slide dependencies.

## Data and state

Generation jobs gain a generation mode, teaching-brief snapshot, editable
proposal, approved-plan snapshot, source-evidence summary, and source-mapping
status. The job lifecycle adds a plan-review state after PDF extraction and
before deck/question generation. Existing completed jobs and hand-authored
question banks remain unchanged.

A failed job is only a failed job: it cannot create or update a content item,
question bank, storage deck, or student release. Generation writes its final
artifacts only after question validation and source-grounding validation pass.

## Review experience

The plan-review screen makes source evidence visible rather than hidden in a
model prompt. For each proposed topic/checkpoint it shows the relevant PDF
page(s), intended live/end-quiz use, and the professor’s editable targets.
The final review screen shows the generated slide/question source mappings and
the exact reason for a validation failure in professor-friendly language.

## Error handling and verification

- Reject an absent, unreadable, or insufficiently grounded PDF before content
  generation.
- Reject unsupported deck/question material and subject mismatches before
  persistence.
- Preserve a clear failed-job record with no learner-visible side effects.
- Test the full workflow with a malware PDF and a deliberately vague title;
  verify that the proposal and output remain malware-grounded.
- Test both output modes, custom checkpoint restrictions, flexible quantities,
  plan edits, review approval, and legacy jobs/banks.
- Keep existing manual Question Plan, live-class controls, content release, and
  repository-sync behavior unchanged.
