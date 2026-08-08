# Class Question Plans, Attendance, and Results

## Goal

Let each professor tailor questions to one class session without changing the
shared lecture or its reusable question bank. The same workflow must work with
the platform deck or an external PowerPoint, PDF, or Google Slides deck.

## User model

- **Question bank:** reusable questions connected to a lecture. It remains the
  source for prompts, options, answers, explanations, and topic metadata.
- **Class Question Plan:** a per-class-session sequence of checkpoint cards.
  It is independent from the bank and may be changed freely during class.
- **Platform deck:** slide hints can highlight a matching checkpoint card.
- **External deck:** the professor chooses a card manually; slide numbers are
  reminders, not a requirement.

## Class Question Plan

Each planned checkpoint has:

- optional slide hint (for example, "after slide 10");
- topic label (for example, "Multi-factor authentication");
- candidate questions from the bank;
- an **Ask now** action;
- optional instructor notes.

The plan also stores an end-of-class quiz selection and the session grading
policy. A new class can copy an earlier plan, then adjust it without changing
that earlier class or the base bank.

During class, a professor may add, move, rename, or remove future checkpoints.
Questions already sent remain immutable records of what happened in that class.

## Question choices during class

The live checkpoint board offers two paths:

1. Select an exact prepared question from the relevant checkpoint/topic.
2. Create a quick question: prompt, two to four options, and either an
   ungraded poll or a graded single-correct-answer question.

A quick question is attached to the class first. After class, the professor can
save it to the reusable bank or discard it. AI generation is intentionally not
part of the live workflow.

## PDF generation planning

Before generation, the professor supplies structured settings plus optional
notes:

- number of during-class questions;
- number of final-quiz questions;
- suggested slide spacing or explicit slide hints;
- a final slide after which no checkpoint should be proposed;
- free-text teaching notes and topic requests.

The generation pipeline proposes the first plan and bank. The professor reviews
and edits both before use. Existing deck/checkpoint behavior remains available.

When an existing deck changes:

- copy-only changes preserve its plan;
- slide insertions, removals, or reordering flag affected slide hints;
- the system never silently remaps questions; the professor reviews or remaps
  affected future checkpoints.

## Attendance and engagement

Each class gets an **Attendance & engagement** tab with one row per enrolled
student:

| Field | Meaning |
| --- | --- |
| Student name and ID | Identifies the student. |
| QR check-in | Timestamp of the beginning-of-class check-in. |
| Attendance | Present, late, excused, absent, or left early; professor-overridable. |
| Pulse responses | Answers submitted / questions eligible after check-in. |
| Engagement | Observed response percentage. |
| Last activity | Last check-in or live-response timestamp. |

The QR confirms check-in, not physical presence for the full class. Engagement
is labelled as observed participation, never as physical attendance. There is
no compulsory end QR; the professor may record early departure manually.

## Class results

A separate **Class results** tab shows:

| Field | Meaning |
| --- | --- |
| Student name and ID | Identifies the student. |
| Pulse score | Correct / attempted graded pulse questions. |
| Final quiz score | Correct / attempted final-quiz questions. |
| Final submission | Submitted, missing, or late. |
| Class grade | Calculated grade, with an explicit professor override. |

Attendance and engagement are visible but do not affect the grade by default.

## Default grading policy

Each class session saves a snapshot of its grading policy so later policy edits
cannot change historical results.

1. Calculate a weighted raw score from graded pulse questions and the final
   quiz. Default weights: 30% pulse, 70% final quiz.
2. Treat 80% raw accuracy as full class credit:

   `class score before submission penalty = min(100, raw accuracy / 0.80 * 100)`

3. The final submission is required but ungraded. If it is missing, multiply
   the class score by 0.80.
4. The professor may override a student's final class grade with an audit note.

Examples:

- 80% raw accuracy + submission: 100.
- 60% raw accuracy + submission: 75.
- 80% raw accuracy + missing final submission: 80.

## Student-facing activity description

> During this class, scan the QR code to check in. You may receive short live
> questions during the lesson and an end-of-class quiz. Your class score is
> based on your answers: 80% correct or more earns full credit, and lower
> scores are scaled proportionally. Please submit the final activity; it is
> required, and a missing submission reduces the class score by 20%. Attendance
> and participation are shown separately from your grade.

## Safety and rollout

Build in this order:

1. Per-session Class Question Plans and the manual checkpoint board.
2. Quick-question composer and saved-session records.
3. Attendance & engagement and Class results tabs.
4. Platform-deck highlighting and PDF-generation planning form.

Existing question banks, deck checkpoints, releases, grades, and class records
remain unchanged until a professor creates a new plan for a session.

Before allowing multiple professors to use PDF generation, scope generation
jobs, previews, and source PDFs to the creator (or an explicit share). This is
a separate privacy prerequisite.

## Verification

- Test a platform-deck class and an external-deck class using the same bank.
- Test a copied plan, live checkpoint edits, and an already-sent question.
- Test check-in, late/left-early manual overrides, and engagement denominators.
- Test score rounding, the 80% full-credit threshold, missing-submission
  penalty, and grade overrides.
- Confirm existing classes with no plan render and grade exactly as before.
