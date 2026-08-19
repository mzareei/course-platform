# End-of-class quiz: carry-over timer, shorter cushion, 40-word exit ticket, and the piñata race

## Decision

Today's first real run of the end-of-class quiz showed the problem: the room
goes silent, every head drops to a phone, and the fun of a live quiz is gone.
This design keeps the quiz itself exactly as graded today and changes what is
around it. Five changes, in the order a class meets them:

1. **The per-question timer carries over.** A question is still worth 30 s
   (45 s if it is long to read), but saved seconds roll forward: answer Q1 in
   25 s and Q2 shows 35 s. The phone works off one running budget.
2. **The cushion on the whole quiz drops from 120 s to 60 s.** A 12-question
   quiz is 6:00 of question time + 1:00 = 7:00.
3. **The exit ticket minimum drops from 50 to 40 words.** Maximum stays 100.
4. **The room's screen becomes a piñata race.** Inside Run Class, a fullscreen
   layer (the same pattern as the podium) opens by itself when the professor
   starts the quiz. Every student is a secret racer — an emoji and a Spanish
   animal name — moving along a 12-checkpoint track as they advance. Every
   real answer anyone gives is one hit on a piñata named after today's lecture;
   at 85 % it bursts. Commentary is calm, cheers the back of the pack by racer
   name, and never shames. At the end the screen freezes and the existing
   **Show the winners** button brings up the podium.
5. **The student's phone joins in only when it is safe to.** A one-tap "Today
   you are 🐿️ Ardilla Turbo — Let's go!" splash before Q1, nothing about the
   race while answering, and after submitting: the piñata %, their candy, their
   finishing place, and a **Cheer someone on!** button.

Grading, speed bonus, gradebook posting, rank, name reveal, the reflection
flow, and the class-grade calculation are unchanged. No question content,
difficulty tag, or selection logic changes.

## What is deliberately not built

- **No sound.** Ever. It is a classroom.
- **Nothing about correctness on the screen.** The track shows progress only.
  Scores stay private until the podium, which is unchanged.
- **No progress strip on the phone while answering.** The phone is for
  answering. The race reaches the phone only before Q1 (the splash) and after
  submit (the done card).
- **No resume from the server's position after a reload.** A reloaded phone
  restarts the player as it does today. The progress pings exist for the
  screen, not for recovery; that is a separate problem.
- **No answers saved as they are given.** Progress pings carry two integers.
  Grading keeps reading `student_responses` written at submit, as today.
- **No realtime/push.** The whole app polls; the layer polls the new `race`
  action every 2 s and that is plenty for one screen and 26 phones.
- **No teams, no boss, no chase.** Brainstormed and set aside. The piñata is
  cooperative on its own: the slow student is still "helping break it".
- **No AI commentary.** Every line is a template with a racer name dropped in.
- **The `/projector` route is not touched**, for the reasons in the
  2026-08-14 spec. The race is a layer inside Run Class.
- **The professor does not see who is behind, by name, anywhere.** He has the
  counts he has today. Racer names stay secret from everyone but their owner.

## Timing rule: the running budget

The server still decides each question's worth (`seconds`: 30, or 45 past the
reading threshold — `_shared/question-timing.ts`, unchanged). What changes is
how the phone spends them.

- `T0` is the moment the student taps **Let's go!** on the splash (client
  clock). Before that tap no question is shown and no question clock runs.
- The deadline for question *k* (0-based) is
  `T0 + Σ seconds[0..k] × 1000`. The pill shows `deadline(k) − now`.
- Tapping **Next** before the deadline moves to *k+1*, whose deadline is the
  same running sum — so the unused seconds are visibly added.
- **Skip-forward on wake.** On every tick, while `now ≥ deadline(index)` and
  `index < last`, advance. A phone that slept through three questions lands on
  the first one whose deadline is still ahead, in one tick, instead of
  crawling through them one per second.
- On the last question, `now ≥ deadline(last)` submits what the student has
  (or ends with nothing to grade if they answered nothing) — same rule as
  today's deadline effect.
- The instance-wide `ends_at` still auto-submits as today; the `quizClosed`
  handoff is unchanged.
- Speed bonus keeps using the server's `started_at` (the `start_attempt`
  call), so time spent on the splash costs the student a sliver of bonus — it
  is their own tap, and the whole-quiz clock bounds it.

The budget arithmetic lives in a pure module, `src/features/quiz/budget.ts`
(`deadlines(seconds[], t0)`, `positionAt(deadlines, now)`), so the verifier can
run it rather than grep for it. `Player.tsx` keeps its 30-second fallback for a
stale server that omits `seconds`, and still holds no timing table of its own.

## Cushion

`CUSHION_SECONDS` in `_shared/question-timing.ts` becomes 60. Nothing else in
the total-time estimate changes: worst-case sum of the longest questions the
student could draw, plus the cushion, clamped to [60, 3600].

## Exit ticket: 40 words

- Migration: `class_sessions.reflection_min_words` default 50 → 40, and
  `update … set reflection_min_words = 40 where reflection_min_words = 50 and
  state not in ('closed', 'cancelled')` so every class not yet finished gets
  the new floor. Closed sessions keep their historical 50.
- `course-exit-ticket` `defaultReflectionMinWords` 50 → 40;
  `course-pulse` fallback `?? 50` → `?? 40`.
- Frontend: no logic change (it already renders the server's bounds). Comments
  saying "50-100 by default" are corrected.

## The piñata screen

A fullscreen, opaque layer inside Run Class — `ClassroomPinataLayer`,
mirroring `ClassroomPodiumLayer` (fixed position, focus on open, Escape
closes, no fullscreen toggle). It shows exactly four things.

**1. The clock.** The same `M:SS` countdown the End of Class box shows, large,
top-left, ticking locally and re-synced to `ends_at` on every poll. Under it,
the one commentary line.

**2. The counts.** Top-right: *22 swinging · 3 got candy 🍬 / 26 present · 1
still blindfolded*. Present = checked in today (`present` from the auto-close
check); swinging = attempts that exist and are not submitted; candy =
submitted or late; blindfolded = present − started (never negative; the line
is omitted when it is 0).

**3. The track.** A horizontal grid of `question_count + 2` columns: *start*,
1 … N, and 🍬. `position` counts questions passed, so a racer sits in the
column labelled with their `position` — 0 = *start* (still on Q1), 5 = column
"5" (five down, on Q6) — stacked bottom-up when several share a column.
Submitted racers leave the track and appear in **la porra** (the cheering
corner, bottom-right), emoji only, with a count. Racers slide between columns
with a short CSS transition; nothing flashes.

**4. The piñata.** Right side: a large 🪅, a crack bar, and its name —
`🪅 Today's piñata: {lecture title}` (ES: `🪅 La piñata de hoy: {title}`).
Below it, la porra.

### Hits, percent, burst

- `hits = Σ progress_answered` over all attempts of the instance (submitted
  attempts are exact: at submit the server sets `progress_answered` to the
  number of responses received and `progress_position` to `question_count`).
- `total = max(1, started) × question_count`.
- `percent = floor(100 × hits / total)`, clamped to [0, 100].
- `burst = percent ≥ 85`, **or** the instance is closed with
  `closed_reason = "everyone"` — a room where everyone finished broke it.
- The maths live in `_shared/pinata.ts` (pure, imported by both the `race`
  action and the student poll, and executed by the frontend verifier). The
  burst threshold is a named constant there, nowhere else.

### Milestones (loud for three seconds, then calm)

The layer detects crossings between successive polls and shows, in order, at
most one milestone at a time:

| Crossing | Commentary line (Spanish in both languages) | Visual |
|---|---|---|
| 25 % | 🎶 Dale, dale, dale… | piñata wobbles once |
| 50 % | 🎶 …no pierdas el tino… | wobble |
| 75 % | 🎶 …porque si lo pierdes… | wobble |
| burst | 🎶 …¡pierdes el camino! — ¡SE ROMPIÓ! 🪅💥 | 3 s candy-rain overlay, then the piñata shows as broken with candy |
| closed by time, no burst | ¡Casi! 71 % — next class it falls (ES: — la próxima clase cae) | none |

With `prefers-reduced-motion`, no overlay and no wobble — the line alone.

### Commentary rules

One line under the clock. It never scrolls. Events are queued from poll diffs
and each is shown for at least 4 s; when the queue is empty and 8 s have passed
since the last line, a **chant** is shown.

- A finisher: `🍬 {name} grabbed a candy!` (ES: `🍬 ¡{name} agarró un dulce!`).
  The first three finishers get 👑 in front of their name in la porra.
- A cheer sent from a phone: `📣 {from} cheers for {to}!`
  (ES: `📣 ¡{from} le echa porra a {to}!`).
- Milestones and the burst, as above.
- **Chant**: pick a racer at random from the bottom third of the pack by
  `position` (started, not finished), never the same racer twice in a row,
  and one of the rotating templates:
  `📣 ¡{animal}, {animal}, ra ra raaa!`,
  `📣 ¡Vamos {name}, tú puedes!`,
  `📣 ¡{name}, la porra está contigo!`,
  `📣 ¡Échale ganas, {name}!`,
  `📣 ¡Sí se puede, {name}!`.
  Chants stay Spanish in both languages — it is the fun part.
- **Banned words** — the generator never emits *slow, slowest, last, behind,
  late, lento, última, último, atrás, rezagado, tarde*. The verifier runs the
  generator over many seeds and greps.

The generator is a pure module, `src/features/quiz/commentary.ts`
(`nextLine(prev, curr, state, rng)`), so it can be run in the verifier.

### Opening, closing, freezing

- `EndOfClass.onStart` opens the layer as soon as `startClassQuiz` resolves.
- On mount, if `currentClassQuiz` returns a running instance, the layer opens
  too — a reloaded Run Class puts the race back on the room's screen.
- Escape / **Back to class** closes it; a **Show the piñata** button in the
  End of Class box re-opens it while a race instance exists.
- When the poll reports `state = closed`, the layer stops polling and
  **freezes** on the final payload: the final track, the final percent, burst
  or ¡Casi!. It shows **Show the winners** (enabled once the podium entries
  have loaded, which EndOfClass already polls for) and **Back to class**.
  **Show the winners** swaps to `ClassroomPodiumLayer`, unchanged.
- Starting another quiz replaces the race instance; the old frozen race is
  gone, the same way the old podium is cleared today.

## The student's phone

**Splash (once, before Q1).** After `start_attempt` returns, if the attempt
carries `racer_name`, the player shows: eyebrow *Today you are*, the emoji and
name large, hint *Only you know. Find yourself on the screen.*, and one button
**Let's go!** (ES: **¡Vamos!**). Tapping it sets `T0` and shows Q1. Without a
racer name (stale server) the splash is skipped and `T0 = now`. A resumed,
already-submitted attempt never shows the splash. `quizClosed` and `ends_at`
apply on the splash exactly as on a question: nothing answered → finished with
nothing to grade.

**While answering.** Nothing new. Same pills, same Next/Submit.

**After submitting, while the quiz is still open.** Under today's *Done · 83 %*
the player renders a `PinataCard` fed by the class poll's `my_race`:

- `🪅 Piñata {percent} %` with the same crack bar; when `burst`, *¡SE ROMPIÓ!*
- `🍬 You grabbed a candy` and `You were {emoji} {name} — {place}th across`
- **Cheer someone on!** (ES: **¡Échale porra!**). One tap → `cheer` action →
  the card says *📣 You cheered for {emoji} {name}!* and the button shows a
  20-second cooldown. If nobody is left to cheer: *Everyone's done — watch the
  piñata!* The server enforces the 20 s; the client only displays it.

The card updates on every poll until the instance closes; then Live.tsx moves
to the reflection step as today (RankBanner, exit ticket). The card does not
appear there.

## Racer names

- `_shared/racer-names.ts` (pure): ~30 Spanish animals each with an emoji
  (Ajolote 🦎, Tlacuache 🦝, Jaguar 🐆, Tecolote 🦉, Coyote 🐺, Guacamaya 🦜,
  Tortuga 🐢, Abeja 🐝, Águila 🦅, Rana 🐸, Pulpo 🐙, Flamenco 🦩, Caballo 🐴,
  Alacrán 🦂, Delfín 🐬, Ardilla 🐿️, Perezoso 🦥, Erizo 🦔, Oso 🐻, Zorro 🦊,
  Pingüino 🐧, Pavorreal 🦚, Cocodrilo 🐊, Mariposa 🦋, Borrego 🐏, Conejo 🐰,
  Mono 🐵, Tiburón 🦈, Ballena 🐳, Llama 🦙, Cangrejo 🦀, Caracol 🐌,
  Dinosaurio 🦖, Dragón 🐉, Unicornio 🦄) × ~30 adjectives that do **not**
  change with gender, so every pairing is correct Spanish (Turbo, Veloz, Feroz,
  Audaz, Fugaz, Sagaz, Tenaz, Picante, Valiente, Brillante, Elegante, Rebelde,
  Salvaje, Imparable, Invencible, Increíble, Genial, Fenomenal, Radical,
  Espacial, Astral, Digital, Viral, Ninja, Zen, Relámpago, Fantasma, Pirata,
  Jedi, Samurái). Name = `{Animal} {Adjective}`; emoji stored separately.
- Assigned at attempt creation in `findOrCreateAttempt`, only when the
  instance has a `class_session_id` (a live class quiz). Random pick from the
  unused combinations for that instance; a partial unique index on
  `(activity_instance_id, racer_name)` plus up to five retries on `23505`
  guarantees uniqueness across simultaneous starts.
- Returned by `start_attempt` (`attempt.racer_name`, `attempt.racer_emoji`),
  in the student poll (`my_race`), and in `race`. Never in `podium`,
  `summary`, or anything the professor reads by student.
- Racer names stay Spanish in both UI languages.

## Data and actions

### Migrations

- `0055_reflection_min_words_40.sql` — default and update, as above.
- `0056_quiz_pinata_race.sql`:
  - `student_attempts`: `racer_name text`, `racer_emoji text`,
    `progress_position int not null default 0`,
    `progress_answered int not null default 0`;
    `create unique index … on student_attempts (activity_instance_id,
    racer_name) where racer_name is not null`.
  - `quiz_cheers` (`id`, `activity_instance_id`, `from_attempt_id`,
    `to_attempt_id`, `created_at`), RLS on, no policies, revoked from
    anon/authenticated — the same posture as every other table.

### `course-activity-attempt` (student)

- `report_progress { attempt_id, position, answered }` — attempt must belong
  to the caller and be `started`; instance must be open. Updates are monotonic
  (`greatest(existing, new)`) and clamped to `[0, question_count]`. Fire-and-
  forget from the phone: called on every advance (tap or timeout) and on the
  splash tap (`position 0, answered 0`); failures are swallowed.
- `submit_attempt` — additionally sets `progress_answered = responses.length`,
  `progress_position = question_count`.
- `cheer { attempt_id }` — caller's attempt must be `submitted`/`late`; the
  instance open; the caller's last cheer ≥ 20 s ago (else
  `"Wait a moment before the next cheer."`). Picks a random attempt in the
  same instance that is `started` and not submitted; if none, returns
  `{ ok: false, reason: "nobody_left" }`. Inserts into `quiz_cheers`; returns
  `{ ok: true, to: { racer_name, racer_emoji } }`.
- `start_attempt` — the attempt payload gains `racer_name`, `racer_emoji`.

### `course-class-quiz` (instructor / TA)

- `race { activity_instance_id }` — runs the same auto-close check as
  `status`, then returns:
  `{ instance_id, state, ends_at, question_count, present, started,
  submitted, closed_reason, pinata: { name, hits, total, percent, burst },
  racers: [{ racer_name, racer_emoji, position, answered, finished,
  finish_place }], cheers: [{ from_name, from_emoji, to_name, to_emoji, at }]
  (last 20 s), cheers_total }`.
  `finish_place` is the 1-based order of `submitted_at` among submitted
  attempts. Attempts without a racer name (none expected) are labelled
  `🎒 Mochila` so nothing is hidden.
- `start` — unchanged. (`activity_instances` has no metadata column, so
  `race` resolves the piñata's name by following the instance's template to
  its content item and reading the title.)

### `course-pulse` (student poll)

- `view.quiz.my_race` — present when the student has an attempt in the
  running quiz: `{ racer_name, racer_emoji, finished, finish_place,
  pinata: { percent, burst }, swinging }` (`swinging` = racers still running,
  so the phone can say *Everyone's done*). Computed with `_shared/pinata.ts`.

## Language rules

- All buttons, labels, hints, and counts go through `t()` with EN + ES pairs,
  as everywhere (`verify-i18n` enforces).
- Deliberately Spanish in both languages, on the identical-strings allowlist:
  the piñata song lines, the chants, *la porra*, *¡SE ROMPIÓ!*, *¡Casi!*,
  racer names.
- EN **Let's go!** / ES **¡Vamos!**; EN **Cheer someone on!** / ES **¡Échale
  porra!**.

## Files

### Backend — `~/Documents/GitHub/mzareei.github.io`

| File | Change |
|---|---|
| `supabase/migrations/0055_reflection_min_words_40.sql` | new — default 40 + update open sessions |
| `supabase/migrations/0056_quiz_pinata_race.sql` | new — racer/progress columns, unique index, `quiz_cheers` |
| `supabase/functions/_shared/question-timing.ts` | `CUSHION_SECONDS` 120 → 60 |
| `supabase/functions/_shared/racer-names.ts` | new — animals, adjectives, `pickRacerName(used)` |
| `supabase/functions/_shared/pinata.ts` | new — `pinataState({ hits, started, questionCount, closedReason })` |
| `supabase/functions/course-activity-attempt/index.ts` | racer name at creation and in `start_attempt`; `report_progress`; progress set at submit; `cheer` |
| `supabase/functions/course-class-quiz/index.ts` | `race` action (resolves the piñata name via the template's content item) |
| `supabase/functions/course-pulse/index.ts` | `my_race`; min-words fallback 40 |
| `supabase/functions/course-exit-ticket/index.ts` | default min words 40 |

Edge functions do not deploy on push — each changed function needs
`npx supabase functions deploy <name>`, and the migrations need
`npx supabase db push`.

### Frontend — `~/Documents/GitHub/course-platform`

| File | Change |
|---|---|
| `src/features/quiz/budget.ts` | new — cumulative deadlines, `positionAt` |
| `src/features/quiz/Player.tsx` | splash + `T0`; running budget; skip-forward; progress pings; `PinataCard` under the done state |
| `src/features/quiz/PinataCard.tsx` | new — phone card: percent, candy, place, cheer button with cooldown |
| `src/features/quiz/commentary.ts` | new — pure line generator, banned-word-free |
| `src/features/live/ClassroomPinataLayer.tsx` | new — the room's screen: clock, counts, track, piñata, porra, milestones, frozen state |
| `src/screens/instructor/EndOfClass.tsx` | open the layer on start / on adopting a running quiz; **Show the piñata**; hand podium + onShowPodium to the layer |
| `src/screens/student/Live.tsx` | pass `my_race` into the player |
| `src/api/quiz.ts` | `reportProgress`, `cheerRacer`, `classQuizRace` + types |
| `src/api/pulse.ts` | `my_race` type |
| `src/i18n/strings.ts` | every new string in EN + ES; allowlist the deliberately-Spanish ones |
| `src/styles/app.css` | layer, track, piñata, porra, candy rain (reduced-motion safe), phone card |
| `src/features/reflection/Reflection.tsx`, `src/api/reflection.ts` | comment fix only (40–100) |
| `tools/verify-quiz-timing.mjs` | cushion assertion 120 → 60 |
| `tools/verify-quiz-race.mjs` | new — see below |
| `docs/05-status.md`, `docs/07-pitfalls.md` | status entry; any pitfalls met |

## Acceptance criteria

**Timer**

- Answering Q1 at 25 s shows 35 s on Q2; answering Q2 at 10 s shows 55 s on
  Q3 (all short questions). A long question adds 45 instead of 30.
- A phone that misses three deadlines while asleep lands on the right question
  in one tick.
- The question clock does not run until **Let's go!** is tapped; the
  whole-quiz `ends_at` still ends the attempt regardless.
- `Player.tsx` contains no `30 * 1000`-style timing constant beyond the
  documented fallback.

**Cushion and exit ticket**

- `CUSHION_SECONDS === 60`; a 12-short-question quiz reads 7:00 on the
  professor's box.
- A new class session has `reflection_min_words = 40`; an open session created
  before the migration now has 40; a closed one keeps 50. The phone's counter
  says *need 40–100*; a 40-word paragraph is accepted, 39 is rejected.

**Racer names**

- Every attempt in a live-class quiz has a unique `{Animal} {Adjective}` name
  and an emoji; two students starting in the same second never share a name.
- The student sees their name on the splash and on the done card; it appears
  on the room's screen; it appears nowhere the professor reads by student.

**The screen**

- Opens on Start, re-opens on reload while running, closes on Escape.
- Counts match the End of Class box on every poll.
- A racer sits in the column labelled with their `position` (*start* for 0);
  submitted racers are in la porra, first three with 👑.
- Percent equals `floor(100 × Σanswered / (started × N))`; the song lines
  appear at 25/50/75; the burst at 85 or on close-by-everyone; ¡Casi! on
  close-by-time without burst.
- The commentary line changes at most every 4 s, never scrolls, and over
  10 000 generated lines contains none of the banned words.
- Chants never name the same racer twice in a row.
- After close the layer freezes, polling stops, **Show the winners** opens
  the existing podium.

**The phone**

- While answering, nothing about the race is on the screen.
- After submit, the card shows percent/burst, candy, racer name, place, and
  the cheer button; a tap cheers one still-running racer chosen by the server,
  then cools down 20 s; a second tap inside 20 s is refused by the server.
- When nobody is left to cheer the card says so.
- After the quiz closes the phone goes to the reflection as today.

**Plumbing**

- `report_progress` is monotonic and clamped; a failed ping never surfaces to
  the student.
- `race` and `my_race` agree on percent and burst for the same instant.

## Verification

- `tools/verify-quiz-timing.mjs` — cushion 60.
- `tools/verify-quiz-race.mjs` (new), executed not grepped where possible:
  - imports `_shared/racer-names.ts`: ≥ 900 combinations, all unique, every
    animal has an emoji, `pickRacerName(used)` never returns a used name (the
    gender-invariance of the adjective list is a hand-curated fact, reviewed,
    not machine-checked);
  - imports `_shared/pinata.ts`: percent maths, clamping, 0 started → 0 %,
    burst at 85, burst on close-by-everyone, no burst on close-by-time at 84;
  - imports `src/features/quiz/budget.ts`: the 25 s → 35 s example, the long
    question case, skip-forward over three missed deadlines;
  - imports `src/features/quiz/commentary.ts`: 10 000 seeded lines, no banned
    word, no repeated chant target, the five song/burst lines exactly;
  - static: migrations exist with the named columns/table/index;
    `report_progress`, `cheer`, `race`, `my_race` present in the right
    functions; defaults/fallbacks read 40; `Player.tsx` pings on advance and
    on the splash tap; strings present in both languages.
- `npm run verify`, `npm run typecheck`, `npm run build` green.
- A real run-through in an empty group (501/502 — never 402, which holds real
  students): start a class, check two student phones in, start the quiz,
  watch the layer, finish on one phone, cheer from it, let the other time out,
  confirm the freeze, the podium, and the 40-word exit ticket.
