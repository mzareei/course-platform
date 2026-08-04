# Single-screen classroom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Make Run Class the only classroom display and show live questions in a student-safe full-screen layer.

**Architecture:** Keep the existing server pulse/checkpoint lifecycle. Add a
pure presentation component rendered by Run Class for open/revealed rounds,
remove the projector/controller card from the teaching workflow, and retire the
projector route from navigation without deleting backend compatibility yet.

**Tech Stack:** Preact, TypeScript, existing pulse/checkpoint APIs, bilingual strings, Vite verifiers.

## Global Constraints

- The professor never writes quiz questions.
- The browser never queries tables directly.
- Correctness and student identity stay out of the classroom display.
- Existing pulse, quiz, reflection, grading, and checkpoint APIs remain authoritative.
- Every user-facing string is added in EN/ES pairs.

### Task 1: Classroom question layer

**Files:** Create `src/features/live/ClassroomQuestionLayer.tsx`; modify
`src/i18n/strings.ts`; modify `src/styles/app.css`; add focused verifier checks.

- [ ] Write a failing source test requiring prompt/options, no correct-key read,
  no student data, and rendering for open/revealed rounds.
- [ ] Implement the answer-neutral layer with stable option keys and a Continue
  callback. It receives `PulseRound`, `isRevealed`, and `onContinue`.
- [ ] Verify typecheck, i18n, and the focused source test.

### Task 2: Integrate Run Class and remove normal projector controls

**Files:** Modify `src/screens/instructor/RunClass.tsx`,
`src/features/presentation/ControllerNavigation.tsx`, relevant CSS and app-shell verifier.

- [ ] Render the layer when checkpoint state is `open` or `revealed`.
- [ ] Keep the private CheckpointPanel for counts, reveal, retry, and Continue.
- [ ] Remove the projector-control card and Open projector link from Run Class.
- [ ] Leave the deck full-screen button available.
- [ ] Verify all existing checkpoint state tests and the full verifier suite.

### Task 3: Retire the obsolete projector workflow safely

**Files:** Modify `src/app.tsx`, projector strings/docs, and handoff docs.

- [ ] Remove projector links from normal navigation and mark the route as legacy
  compatibility or redirect it to Run Class.
- [ ] Keep backend presentation state/function source until production data
  reset and migration cleanup are explicitly completed.
- [ ] Update status, pitfalls, and handoff with the new single-screen decision.

### Task 4: Browser rehearsal and release gates

- [ ] Run typecheck, all 13 verifiers, build, and diff checks.
- [ ] Use Chrome on the live Week 1 class: deck full-screen, send checkpoint,
  verify answer-neutral layer, answer from student account, reveal privately,
  continue, and confirm deck resumes.
- [ ] Run the clean production reset only after the browser rehearsal and all
  fresh-session checks pass; record count-only evidence.
