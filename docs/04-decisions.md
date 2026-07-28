# Decisions and their reasoning

Read this before changing anything structural. Each entry says what was decided
and — more importantly — *why*, so you can tell whether the reason still holds.

---

### Keep the existing Supabase backend; rebuild only the frontend

The previous generation already implemented roles, the release state machine,
server-side quiz selection/shuffling/grading, attempt limits, speed bonus, a
weighted gradebook with drop-lowest and locking, exit tickets, participation,
and an audit log. That is a lot of correct, load-bearing logic.

Rebuilding it would have been pure risk. So: **additive migrations only**, and
the new SPA talks to the same functions. New functionality gets new functions.

---

### A separate repo for the app

The academic site (`mzareei.github.io`) is Jekyll on GitHub Pages and serves a
different purpose. Mixing an SPA into it would have coupled two unrelated
deployment stories. The platform repo is public — safe because the anon key is
public by design, and content lives in a private bucket.

Cost: edge functions live in the *other* repo. Accepted, but it means you need
both checked out.

---

### RLS on, zero policies

Rather than writing per-table policies and hoping they compose correctly, the
database refuses browser access entirely and every read/write goes through an
edge function that checks the caller's role itself.

Fewer places for an authorisation bug to hide, and the rules are expressed in
readable TypeScript instead of scattered SQL predicates.

---

### Polling, not realtime

The plan allowed for Supabase realtime broadcast with polling as a fallback.
Polling at 3–4s proved entirely sufficient for a lecture hall, so realtime was
never built. One mechanism, no fallback path that only runs when something else
is broken.

Revisit only if a class is large enough that poll volume actually hurts.

---

### Questions are always generated, never authored

**A hard product rule.** The professor will not write quiz questions.

Every lecture gets a bank generated from its own content: 4 options, exactly 1
correct, plausible distractors, ~6 easy / 6 medium / 6 hard. Both the in-class
pulse questions and the end-of-class quiz draw from that bank. This extends to
the AI pipeline — an uploaded PDF produces the deck *and* its bank.

Consequence: quiz selection must be **difficulty-stratified**, not a uniform
shuffle, or a quiz can come out all-easy or all-hard. See `selectQuestions` in
`course-activity-attempt`.

---

### The end-of-class quiz reuses the existing activity engine

`course-class-quiz` only orchestrates: ensure a template and gradebook slot
exist, open an instance, close it. Taking and grading go through
`course-activity-attempt`, which already handles attempts, timing, integrity and
the gradebook.

A second grading path would have meant a second set of grading bugs.

---

### Sequential, per-question timing in the quiz

Originally the quiz was a browsable pool with one overall countdown. The
professor's actual model is a live sequence: one question at a time, each with
its own budget (~20s easy, ~30s medium, ~45s hard), auto-advancing when time
runs out, no going back.

Implemented in `features/quiz/Player.tsx`. The per-difficulty seconds live in
`SECONDS_BY_DIFFICULTY` there.

> Open question worth confirming: the professor said "20 second … till 45
> minutes". Given the "quick test" framing and the 20-second anchor this was
> read as **45 seconds**. If he meant minutes, change that constant.

---

### Hybrid grading for live questions

Answering earns partial credit; answering correctly earns full credit. The
intent is participation without punishing a wrong guess in a fast in-class
check. Written to `participation_events` so the existing gradebook picks it up
with no changes.

---

### Per-student answer shuffling, client-side

Options are shuffled per student, seeded by `round_id + profile_id`. The server
grades by option key and is unaware of display order.

Presentation-only, which is exactly what makes it safe — and it means "pick
number 2" is useless to the student beside you.

---

### The gated content chain (and why it is three hops)

Supabase serves HTML as `text/plain` on its shared domain, and its gateway
applies a restrictive CSP. A `blob:` or `srcdoc` iframe inherits the *parent's*
CSP, which kills the deck's inline script.

So decks are delivered from our own origin through a Pages Function at
`/content`, which has a relaxed CSP scoped to that path only, authorised by a
short-lived HMAC token minted after the release gate passes.

**This is load-bearing. Don't "simplify" it.** See `07-pitfalls.md`.

---

### The model never emits HTML

The generation worker asks Claude for **structured slide JSON** and builds the
markup itself in `deck.ts`, escaping all text.

Two payoffs: generated decks are structurally identical to hand-authored ones,
and a bad or adversarial generation cannot inject markup into a page a student
opens.

---

### Resumable generation, no cron

Each worker invocation advances exactly one step and checkpoints its output into
`generation_jobs.step_state` before moving the status. A crash, timeout or cold
start resumes instead of re-spending Claude API calls.

The worker re-invokes itself between steps, so no cron infrastructure is needed;
the Content screen also nudges `advance` while a job is in flight.

*Known wrinkle:* self-chaining plus UI nudging means two invocations can race on
the same step. Self-healing (steps are checkpointed), but it can write a
confusing transient error. A proper fix is a claim/lease on the job row.

---

### Approval creates a draft, not a release

Approving a generated lecture activates its question bank and creates a
`content_release` in **draft**. The professor still releases it for a class
through the normal flow.

Generated content gets no shortcut past the gate that protects every other piece
of content.

---

### "Live" means the class session, not the release row

There are two notions of "live" in the schema: `content_releases.state` and
`class_sessions.state`. **The student-facing app keys off the session.**

Nothing in the SPA ever sets a release to `live` — that transition only ever
existed in the old admin pages. `Today.tsx` originally checked the release row,
which meant "Join class" never appeared and students could not reach the live
screen at all. Both `Today.tsx` and `Live.tsx` now use `session_state`.

---

### Test sign-in exists, and refuses instructors

During the testing period, rostered students can sign in without proving mailbox
ownership (the emailed-code flow is rate-limited and was slowing testing).
Instructor accounts are explicitly refused — an instructor always uses the real
email code. This disappears before the semester starts.

---

### First-generation apps are frozen

The `assets/course-materials/information-security/` apps (classroom, teacher,
progress, portfolio, exit-ticket, review-coach, …) are untouched, unlinked, and
never built upon. Migrating them was judged not worth the risk; they will be
replaced by redirects in Phase 6.
