# Single-screen classroom display design

## Decision

Run Class is the only teaching display. The separate projector route and
controller synchronization are removed from the normal class workflow. The
professor opens the lecture deck's own full-screen control on the classroom
display.

When a live checkpoint question is sent, Run Class renders a full-screen,
student-safe question layer over the deck. It shows the prompt and options but
never highlights the correct option or exposes student names, scores, notes,
or reflections. The layer remains until the professor chooses Continue. The
professor's private checkpoint panel remains available outside the classroom
display for Send, Reveal, results, retry, and Continue.

The existing student phone flow, server pulse state, timing, participation
grading, end quiz, reflection, and gradebook remain authoritative and unchanged.

## Flow

1. Professor opens Run Class and uses the deck full-screen control.
2. Deck reaches an authored checkpoint; the panel prepares a question.
3. Professor sends it. The deck/question layer shows the prompt and options.
4. Students answer on phones while the professor sees private counts/results.
5. Professor may reveal privately in the panel; the classroom layer remains
   answer-neutral.
6. Professor clicks Continue; the layer closes and the deck resumes.

## Acceptance criteria

- No separate projector link or projector status is required to teach.
- A question replaces the visible deck content on the main teaching page until
  Continue.
- Correctness is never visually highlighted in the classroom question layer.
- Existing pulse answers, reveal, close/resume, timed quiz, reflection, and
  gradebook data continue through their existing APIs.
- The browser view is usable full-screen and all copy remains EN/ES.
