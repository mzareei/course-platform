# The end-of-class quiz becomes La Subida: a lockstep room clock, live per-round reveal, and a climb toward the piñata

## Decision

The piñata race shipped on 2026-08-19 and ran with a full class on 2026-08-20.
It did not work, for one reason that is not a bug: **the students never looked
up.** Each phone runs its own clock, one question at a time, thirty seconds
each, so a student never has a free second to watch the room's screen. The
race played to an audience of one — the professor.

Two real defects came out of the same run. On question 1 all twenty-six racers
stack in a single column, which pushes the layer taller than the screen. And
between a racer's occasional slide and a commentary line every four to eight
seconds, nothing on the screen moves.

This design replaces the free-running clock with a **room clock**, gives the
room **ten shared moments** instead of none, and rebuilds the screen as **La
Subida** — the animals climb toward the piñata instead of walking a track.

Eight decisions, in the order a class meets them:

1. **Ten questions, four easy / three medium / three hard**, the order shuffled
   independently for every student.
2. **A room clock.** Forty seconds to answer, then a ten-second break, ten
   times. The round ends early if all present students have answered.
3. **The break reveals the answer on the phone**, then sends the student's eyes
   to the screen.
4. **Grading counts every question dealt.** Unanswered is wrong. Five answered
   with four correct is 40%, not 80%.
5. **The grade's speed bonus is removed.** Equal correctness, equal grade.
6. **Speed pays in candy instead.** Correct is one candy; correct within the
   first twenty seconds is two. Candy is the race and never the grade.
7. **The screen becomes La Subida** — twenty-six labelled ropes, animals
   climbing toward a piñata, height is candy, size is correct answers, and a
   permanent top three.
8. **Sound is allowed.** This reverses "no sound, ever" from the 2026-08-19
   spec. Sound is the only channel that reaches a student whose eyes are down.

The reflection flow, the exit ticket, the podium, the gradebook posting, name
reveal, and the class-grade calculation are unchanged.

## What is deliberately not built

- **No shared question on the room's screen.** Students keep per-student deals:
  different questions, differently shuffled options. The screen never shows a
  question, an option, or a correct answer. This was decided so that nothing a
  student says out loud can help a classmate.
- **No difficulty on the screen.** Because the order is shuffled per student,
  round 5 is a different difficulty for every student. The HUD shows the round
  number and the clock and nothing else about the question.
- **No difficulty weighting on candy.** Flat candy is what makes per-student
  ordering fair; weighting it would turn luck of the draw into a visible lead.
- **No carry-over budget.** `budget.ts` and the `MAX_QUESTION_SECONDS` cap from
  2026-08-20 are deleted. The room clock replaces them entirely.
- **No public correctness by student.** The climb is driven by correctness, but
  every animal is a secret name known only to its owner. Nothing on the screen
  or in any professor-facing view maps a racer to a person.
- **Nobody shrinks and nobody falls.** Size only ever grows. A wrong answer
  costs a climb, never a demotion, and the reveal flash marks only the correct
  answers — the rest are left untouched rather than dimmed.
- **No AI commentary.** Templates with a racer name dropped in, as today.
- **No realtime/push.** The layer polls, as everything else does.
- **The `/projector` route is not touched.** The screen stays a layer inside
  Run Class.

## The room clock

The instance owns one schedule and every phone obeys it. `started_at` on the
activity instance is the anchor.

- Round *k* (0-based) answers from `started_at + k × 50 s` for **40 s**, then
  breaks for **10 s**.
- A round ends early the moment every student **who has started an attempt**
  has answered it. Present-but-never-started students are not counted, or a
  single person who checked in and never opened the quiz would hold every round
  to its full forty seconds. The break still runs its full ten seconds; only
  the answering window is cut.
- The whole quiz is `10 × 50 s = 8:20` worst case, and closer to seven minutes
  in practice.
- **Late joiners** are dropped into whatever round is live with whatever time
  remains on it, and answer only the rounds that follow. They are graded out of
  ten like everyone else.
- The instance-wide `ends_at` is sized from the same schedule plus the existing
  sixty-second cushion, and still auto-submits as it does today.

The schedule arithmetic lives in a pure module, `src/features/quiz/rounds.ts`
(`roundAt(startedAt, now)`, `windowFor(startedAt, k)`), so the verifier can run
it rather than grep for it.

`src/features/quiz/budget.ts` is deleted along with its verifier assertions.

## Questions: the mix and the order

`selectQuestions` in `course-activity-attempt` currently draws round-robin
across easy/medium/hard, which produces both an uneven count and a patterned
order. It is replaced by:

- A **fixed quota** of 4 easy, 3 medium, 3 hard. If a tier is short, backfill
  from the nearest tier and keep the total at ten rather than serve fewer.
- A **shuffled order**, drawn independently per attempt, so no two students
  meet the same difficulty in the same round.

**`maybeShuffle` is replaced with a real Fisher-Yates shuffle.** The current
`values.sort(() => Math.random() - 0.5)` is measurably biased: with four
options the correct one lands in some positions more often than others, which
is a signal a student can learn. This affects both question order and option
order and is a correctness fix independent of everything else here.

The per-attempt deal stays frozen in `questions_json` at first start, exactly
as it is today.

## Grading

Two changes, both of which lower scores and are intended to.

**The denominator becomes the questions dealt, not the questions answered.**
Today `Player.tsx` filters unanswered questions out before submitting and
`gradeResponses` sums `totalPoints` only over what arrives, so a student who
answers five of ten and gets four right scores 80%. Under this design they
score 40%. The player now submits a row for every dealt question, with a null
selection where the student did not answer, and the grader counts its points
toward the total.

**The speed bonus comes off the grade.** `maxSpeedBonusPercent` becomes 0 for
class quizzes. Under a room clock every student finishes at the same instant,
so it no longer measures anything, and it contradicts "equal correctness, equal
grade."

Expect the class average to drop. That is the point: the number now reflects
what the class actually knew.

## Candy — the race, never the grade

| Event | Candy |
|---|---|
| Correct | 1 |
| Correct, answered in the first 20 s of the round | 2 |
| Wrong or unanswered | 0 |

Ceiling is 20. Difficulty does not affect candy.

The twenty-second test is measured **server-side**: the round's start is known
from the schedule, and the server stamps the arrival of the first
`report_progress` carrying an answer for that round's question. The client is
never trusted with the timing.

Candy determines a racer's height. It has no path to `score_raw`,
`score_percent`, `score_final`, or the gradebook, and the verifier asserts it.

## The piñata

Two numbers for two jobs, and this is a change from 2026-08-19:

- **Correct answers crack the piñata.** `damage = Σ correct / (started × 10)`.
  The old formula used answers *given*, so the piñata burst whether or not the
  class knew anything.
- **Burst at 70 %**, down from 85 %, or when the instance closes with
  `closed_reason = "everyone"`. Correct answers are a harder bar than answers
  given, and a piñata that never breaks is a worse ending than one that breaks
  most classes.
- The piñata takes **one visible hit per round**, sized to how many students
  got it right, instead of a continuous drip.

The maths stay in `_shared/pinata.ts`, pure, imported by both the `race` action
and the student poll, executed by the frontend verifier. The threshold stays a
named constant there and nowhere else.

## The screen: La Subida

A fullscreen opaque layer inside Run Class, replacing the track layout in
`ClassroomPinataLayer`. The podium-layer posture is unchanged: fixed, focus on
open, Escape closes, no fullscreen toggle.

**Layout.**

- **HUD, top left** — `Ronda 5 de 10` and the round clock in `M:SS`, large.
  No difficulty, ever.
- **The piñata, top centre** — the figure, a damage bar, its lecture name, and
  the percentage.
- **Counts, top right** — answered this round, candy in the room, present,
  and blindfolded (present minus started, omitted at zero).
- **The climb, filling the middle** — one rope per student, each labelled at
  the ground with the racer's name set vertically. The label stays fixed at the
  ground; it marks the lane, not the racer's position. Animals sit at
  `candy / 20` of the rope's height and are sized `1 + 0.2 × correct`,
  capped at 3×. Bigger racers sort in front. Every animal bobs on an idle loop
  with a per-racer phase offset, so the screen is never still.
- **Top three, permanent right rail** — medal, emoji, racer name, candy.
- **One commentary line, bottom.**

**Height is candy; size is correct answers.** They are deliberately different
numbers, so the screen can tell two stories at once: a large low animal has
answered steadily without ever beating the clock, and a small high one has
fewer right but took them fast.

**Nothing shrinks.** Size is cumulative correct answers, so it only ever grows.
A small animal beside a large one is a student who has answered less, not a
student being pointed at, and the difference between those two readings is the
whole reason the size channel is cumulative rather than a streak.

### The round, in three beats

The ten-second break is choreographed. This is the part the students look up
for, so it is specified rather than left to the implementation.

| Beat | At | What happens |
|---|---|---|
| Flash | 0.0 s | Every correct racer rings green at once. Incorrect racers are **untouched** — never dimmed, never marked. The piñata takes the round's whole damage in one jolt. Line: `🍬 19 de 26 le pegaron a la piñata`. |
| Climb | 0.6 s | Every earner rises to their new height together, sizes tween up. This is the second overtakes happen, and it is the only second that matters. |
| Spotlight | 1.5 s | One standout gets a card over the top-three rail: emoji large, racer name, what they just earned. Golden-candy earners are preferred, then first-time earners, then the new leader. |

The remaining seconds hold the new standings so the room can read them.

### Floating text

Text rises out of an animal and fades — the way a game shows a hit landing.
This is what carries the small facts the layout cannot: a streak, a personal
best, a jump into the top three. It also restores **streak**, which lost its
home when size became cumulative.

| Label | When | Beat |
|---|---|---|
| `+1` / `+2` | every racer who earned candy, `+2` tinted gold | flash, staggered by lane so 26 do not land as a wall |
| `🔥 3 seguidas` | a streak reaching a multiple of three | climb |
| `⚡ ¡el más rápido!` | the first correct answer of the round, one racer only | climb |
| `🚀 ¡al top 3!` | a racer entering the top three this round | climb |

Rules that keep this from turning into noise or a callout:

- **Numbers rise flat; phrases rise vertical.** `+1` and `+2` are two
  characters wide and stay horizontal, where they read fastest. The word
  labels are rotated, because twenty-six lanes sit about nineteen pixels apart
  and a horizontal `🔥 3 seguidas` covers three or four neighbouring ropes —
  overlapping its neighbours' labels and appearing to belong to the wrong
  animal. Rotated, a phrase stays inside its own lane the whole way up. An
  outer wrapper carries the upward drift and an inner span carries the
  rotation, so the two transforms do not fight.
- **Nothing negative ever floats.** There is no label for a wrong answer, a
  broken streak, or falling out of the top three. A racer who misses is silent,
  not marked.
- **A label spawns just above its own animal**, at the racer's position plus
  the emoji's current height plus a small gap — not at the racer's baseline.
  Because size grows with correct answers, a fixed offset would put a leader's
  label behind its own emoji, which is where it looked wrong. Vertical phrases
  grow upward from that anchor so they never fall back across the animal.
- **Labels drift slowly.** Each rises about sixty pixels over 2.6 s at a
  constant speed, stays fully opaque for the first 1.5 s, then fades over
  1.1 s. Fast pop-ups read as noise from the back of a room; a slow drift is
  legible while the eye is still travelling to it. The whole life of a label is
  well inside the ten-second break, so nothing survives into the next round.
- Labels are staggered within a beat — roughly 45 ms per lane for the candy
  numbers, and the special labels land a beat later, after the climb — so
  twenty-six of them read as a wave rather than a wall.
- Under `prefers-reduced-motion` a label appears in place and fades without
  travelling.

Streak is tracked for these labels only. It never touches size, height, candy,
or the grade.

### Opening and closing

- **The roster.** Before round 1, as each phone taps *¡Vamos!*, that animal
  pops onto the screen with a sting until all present students are up. This
  uses the splash window that already exists and is the pre-game moment.
- Opens on Start and re-opens on reload while running, as today.
- On close the layer stops polling and plays **the finale** (below), then
  freezes on the racer podium until the professor moves on.

### The finale

Round 10's break does not simply end. It runs one last sequence, and this is
the payoff the whole design has been building toward.

| Beat | At | What happens |
|---|---|---|
| Everyone pops | 0.0 s | Every animal in the room jumps and scales up with a 🍬 over its head, staggered about 40 ms apart so it crosses the screen as a wave rather than a single flash. Nobody is excluded — a student who earned nothing still pops. |
| Candy rain | 0.0 s | Candy falls across the whole screen for about four seconds. The piñata shows as broken. |
| The racer podium | 1.5 s | The ropes, the ground, the lane names and the top-three rail fade out, and the three highest climbers rise onto a three-step podium — second, first, third — large, under their **racer names**, with their candy counts. Line: `🏆 ¡{name} se llevó la piñata!` |

**Everyone pops, not just the winners.** The burst is the room's, not the top
three's, and a finale that only celebrates the leaders would undo the care
taken everywhere else in this design.

### Two podiums, in order

The racer podium is **not** the existing podium and does not replace it:

| | Racer podium (new) | `ClassroomPodiumLayer` (unchanged) |
|---|---|---|
| Ranked by | candy — correctness plus speed | quiz score |
| Names shown | secret racer names | real names, for students who opted to reveal |
| When | automatically, at the end of the finale | when the professor presses **Show the winners** |

So the ending is two stages: the fun one plays itself, and the real one is a
button the professor presses when they are ready. They can disagree about who
won, and that is fine — one is a game and the other is a grade.

Both **Show the winners** and **Back to class** sit under the racer podium, as
they do today.

### Commentary

Unchanged in structure from 2026-08-19: one line, never scrolling, events
queued from poll diffs, chants filling silence, and the banned-word list
(*slow, slowest, last, behind, late, lento, última, último, atrás, rezagado,
tarde*) enforced by the verifier over many seeds. New event lines cover the
per-round hit count, golden candies, and lead changes. Chants stay Spanish in
both languages.

## Sound

This reverses the 2026-08-19 rule. Visuals cannot reach a student looking at a
phone; sound can, and that is the entire problem this design exists to fix.

- **A ticking bed** during the forty seconds, accelerating over the last ten.
- **A sting the instant the round closes.** This is the cue that lifts
  twenty-six heads at once and is the single most important sound here.
- **A burst jingle** when the piñata breaks.
- Synthesized with the Web Audio API rather than shipped as audio files:
  Kahoot's music is licensed and cannot be used, and a tick that accelerates is
  a few dozen lines with no licensing question attached. Royalty-free loops may
  be added later behind the same mixer.
- **Autoplay** is satisfied by the professor's click on **Start the quiz**,
  which is the user gesture that unlocks audio for the session.
- **A visible mute and volume control** on the layer, defaulting to on, with
  the choice persisted in local storage.
- All sound lives on the room's screen. The phones stay silent.

Sound lives in `src/features/live/sound.ts`, a small mixer with named cues, so
that muting is one switch and no component reaches for an oscillator directly.

## The student's phone

**Splash.** Unchanged — racer name, one tap. The tap now also registers the
student for the roster reveal rather than starting a private clock.

**Answering, 40 s.** Nothing about the race on screen. Same options, same
selection. The **Next** button is gone: the room clock decides when the round
ends, so a student who answers early waits, and the pill shows the round's
remaining time.

**The break, 10 s.** The phone shows ✅ or ❌ and the correct option text —
glanceable in about a second — and then dims to a 👀 prompt pointing at the
room's screen for the rest of the window. The explanation is **not** shown
here; ten seconds is not enough to read one, and trying would defeat the
purpose of the break.

**After the last round.** The existing done state and `PinataCard`, plus a new
**review list**: all ten questions, what the student chose, the correct
answer, and `explanation` / `explanation_es` where the bank has one. This is
read while the exit ticket is open and is where the teaching actually lands.
The columns already exist on `questions`; nothing new is stored.

## Data and actions

### Migrations

`0057_quiz_la_subida.sql`:

- `student_attempts`: `candy int not null default 0`,
  `correct_count int not null default 0`,
  `round_answer_times jsonb not null default '{}'::jsonb` (question id →
  server-stamped first-answer time).
- `activity_instances`: nothing new — the schedule derives from `started_at`
  and `question_count`.

### `course-activity-attempt` (student)

- `start_attempt` — deals 4/3/3 in shuffled order with a fair shuffle; returns
  the racer name as today, plus the room schedule anchor.
- `report_progress` — additionally stamps `round_answer_times` for the round's
  question on first arrival. Still monotonic, still fire-and-forget.
- **Grading a closed round happens on read, not on the student's ping.** A
  phone that answers round 3 and then goes quiet would otherwise never trigger
  the grading of round 3. So `race` and `course-pulse` both settle every round
  whose window has passed and is not yet settled, updating `candy` and
  `correct_count` from the stored answers and stamped times. Settling is
  idempotent and keyed on the round index, so the two callers cannot
  double-count.
- `submit_attempt` — submits a row per dealt question, null selection where
  unanswered; grades against all ten; no speed bonus.
- `cheer` — unchanged.

### `course-class-quiz` (instructor / TA)

- `race` — returns the round index and window alongside today's payload, plus
  per-racer `candy` and `correct_count` in place of `position`/`answered`, and
  the per-round hit count the flash beat needs.

### `course-pulse` (student poll)

- `view.quiz.round` — the live round index and its window, so a reloaded phone
  rejoins the room clock rather than starting its own.
- `view.quiz.my_race` — gains `candy` and `correct_count`.

## Language rules

Every new string goes through `t()` in EN and ES, as `verify-i18n` enforces.
Deliberately Spanish in both languages and on the identical-strings allowlist:
the piñata song lines, the chants, *la porra*, *¡SE ROMPIÓ!*, *¡Casi!*, *La
Subida*, and the racer names.

## Files

### Backend — `~/Documents/GitHub/Tec Hub/mzareei.github.io`

| File | Change |
|---|---|
| `supabase/migrations/0057_quiz_la_subida.sql` | new — candy, correct count, answer times |
| `supabase/functions/_shared/question-timing.ts` | flat 40 s round; schedule helper; cushion unchanged |
| `supabase/functions/_shared/pinata.ts` | damage from correct answers; burst 70 % |
| `supabase/functions/_shared/shuffle.ts` | new — Fisher-Yates, replacing the biased sort |
| `supabase/functions/course-activity-attempt/index.ts` | 4/3/3 quota, shuffled order, fair shuffle, round stamping, per-round grading, full-denominator grading, speed bonus to 0 |
| `supabase/functions/course-class-quiz/index.ts` | `race` returns round window, candy, correct counts, per-round hits |
| `supabase/functions/course-pulse/index.ts` | `round`; `my_race` gains candy and correct count |

Edge functions do not deploy on push — each changed function needs
`npx supabase functions deploy <name>`, and the migration needs
`npx supabase db push`.

### Frontend — `~/Documents/GitHub/Tec Hub/course-platform`

| File | Change |
|---|---|
| `src/features/quiz/rounds.ts` | new — room-clock schedule, pure |
| `src/features/quiz/budget.ts` | **deleted** — carry-over is gone |
| `src/features/quiz/Player.tsx` | room clock; no Next button; the 10 s reveal; submit every dealt question |
| `src/features/quiz/ReviewList.tsx` | new — the post-quiz review with explanations |
| `src/features/quiz/PinataCard.tsx` | candy and correct count |
| `src/features/quiz/commentary.ts` | per-round hit lines, golden candy, lead change |
| `src/features/live/ClassroomPinataLayer.tsx` | rebuilt as La Subida — ropes, lane labels, climb, sizes, top three, three-beat break, roster reveal |
| `src/features/live/sound.ts` | new — Web Audio cue mixer, mute persisted |
| `src/screens/student/Live.tsx` | pass the round window into the player |
| `src/api/quiz.ts`, `src/api/pulse.ts` | new fields and types |
| `src/i18n/strings.ts` | every new string, EN + ES |
| `src/styles/app.css` | the climb, lane labels, rail, spotlight, beats, reduced-motion |
| `tools/verify-quiz-race.mjs` | rewritten for this design |
| `docs/05-status.md`, `docs/07-pitfalls.md` | status entry; pitfalls met |

## Acceptance criteria

**Room clock**

- Every phone shows the same round at the same second; a phone that reloads
  mid-quiz rejoins the live round rather than starting over.
- A round closes at 40 s, or the moment every present student has answered.
- A student who joins during round 6 answers rounds 6 to 10 and is graded out
  of ten.
- `budget.ts` no longer exists and nothing imports it.

**Questions**

- Every attempt is dealt exactly 4 easy, 3 medium, 3 hard; a short tier
  backfills to keep ten.
- Two attempts in the same instance meet difficulties in different orders.
- Over many runs the correct option lands in each position within a few percent
  of uniform — the current biased sort fails this and the replacement passes.

**Grading**

- Five answered, four correct, out of ten dealt = 40 %.
- Two students with identical correctness get identical grades regardless of
  how fast either answered.
- Candy appears nowhere in `score_raw`, `score_percent`, `score_final`, or any
  gradebook payload.

**Candy and the piñata**

- Correct is 1; correct inside the round's first 20 s is 2; the timing decision
  is made from server-stamped arrival, not from anything the client sends.
- Damage equals correct answers over `started × 10`; burst at 70 % or on
  close-by-everyone; ¡Casi! on close-by-time below it.

**The screen**

- Twenty-six racers at the same height do not overflow the layer, and the HUD,
  piñata, and rail stay on screen at all times.
- Every rope carries its racer's name set vertically at the ground, fixed.
- Candy numbers rise horizontally; word labels rise rotated, and no word label
  ever overlaps a neighbouring rope at any point in its rise.
- Height tracks candy; size tracks correct answers and never decreases.
- On a round close: correct racers flash and incorrect racers are visually
  untouched; the piñata takes one jolt; the climb happens together; one
  spotlight card appears.
- The top three are visible at every moment of the quiz.
- Floating text appears for candy earned, streaks at multiples of three, the
  round's fastest correct answer, and entry into the top three — and for
  nothing else. No label is ever emitted for a wrong answer, a broken streak,
  or a drop out of the top three.
- Every floating label is gone before the next round's flash.
- Difficulty appears nowhere on the layer.
- At the close every animal pops, including racers with zero candy, and candy
  rains before the racer podium appears.
- The racer podium ranks by candy and shows racer names; pressing **Show the
  winners** then opens the existing score podium with real names. The two may
  list different students.
- Commentary changes at most every 4 s, never scrolls, and over 10 000
  generated lines contains no banned word.
- With `prefers-reduced-motion`, no bobbing, no rain, no shake — the lines and
  the positions alone.

**Sound**

- Cues fire on round close and on burst; the ticking bed accelerates over the
  last ten seconds; mute silences everything and survives a reload.
- No sound is ever emitted by a student's phone.

**The phone**

- Nothing about the race is on screen during the 40 s.
- The break shows the student's own result and correct option, then the look-up
  prompt.
- The review list after submit shows all ten questions with explanations where
  the bank has them.

## Verification

- `tools/verify-quiz-race.mjs`, rewritten and executed rather than grepped:
  - `rounds.ts` — round boundaries at 0/50/100 s, the late-joiner landing, the
    early-close case;
  - `_shared/shuffle.ts` — position distribution of the correct option across
    100 000 shuffles within tolerance of uniform, and the current biased sort
    asserted to fail the same test;
  - the 4/3/3 quota including short-tier backfill, and order differing across
    attempts;
  - `_shared/pinata.ts` — damage from correct answers, burst at 70, burst on
    close-by-everyone, no burst at 69 on close-by-time;
  - candy: 1 / 2 / 0, ceiling 20, and a static assertion that no grading path
    reads it;
  - `commentary.ts` — 10 000 seeded lines, no banned word, no repeated chant
    target;
  - static: migration present with the named columns; `round` and the new
    `my_race` fields present; `maxSpeedBonusPercent` is 0; `budget.ts` absent
    and unimported; strings present in both languages.
- `npm run verify`, `npm run typecheck`, `npm run build` green.
- A real run-through in an empty group — **501 or 502, never 402, which holds
  about twenty-six real students.** Check People first. Start a class, check
  two phones in, watch the roster reveal, run several rounds, confirm the
  reveal on the phone and the three beats on the screen, let one phone miss a
  round, confirm the grade counts it wrong, confirm the freeze, the podium, and
  the review list under the exit ticket.
