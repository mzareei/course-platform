# The two authoring prompts

Two prompts, run in order, in whichever AI you already use.
The platform makes no model call on this path — these prompts are the whole
pipeline.

```
reference deck ─┐
                ├─▶ prompt 1 ──▶ lecture.html ──▶ prompt 2 ──▶ bank.json
lecture PPTX/PDF┘                      │                          │
                                       └──────── both uploaded ────┘
                                          Content ▸ Import
```

| | File | Attach | Returns |
|---|---|---|---|
| Step 1 | `01-lecture-deck-prompt.txt` | the style reference deck **and** your lecture PPTX/PDF | one self-contained HTML deck |
| Step 2 | `02-question-bank-prompt.txt` | **the HTML from step 1** | one `tc2007b.bank.v1` JSON |

Step 1 takes **two** attachments. The reference deck
(`course-platform/public/TC2007B_Presentation_Style_Reference.html`, downloadable
from the step-1 card on the Import tab) supplies the presentation system —
design, presenter controls, bilingual behaviour, progressive reveals, media
policy. The lecture supplies the subject matter. The prompt is explicit that the
reference's own placeholder slides must never become content.

Upload both together on **Content ▸ Import** — the HTML in the deck field, the
JSON in the question field. Then open the class in Run Class and hit **Create
plan**; the checkpoints build themselves from the questions.

## The one rule that holds it together

**The deck owns the pauses. The bank only copies them.**

Prompt 1 places 5–7 `Pulse Check` slides where concepts finish, and writes the
question and its four options onto the slide. Prompt 2 reads those slides and
carries each question across verbatim, taking the slide's own `data-slide`
number as `covers_up_to_slide`.

Because the number comes out of the same file the question came from, the deck
and the bank cannot drift apart. Nothing counts slides twice.

## Why `intended_use: "both"` is now banned

`course-class-question-plan` builds the class plan by creating a checkpoint at
every slide that has a `pulse`-eligible question, and it treats `both` as
eligible ([`index.ts:389`](../../../mzareei.github.io/supabase/functions/course-class-question-plan/index.ts)).
A `both` question sitting at a slide with no `Pulse check` slide behind it makes
the class stop where the lecture does not pause — poll on every phone, professor
mid-sentence. So prompt 2 permits only `pulse` (copied from a pause slide) and
`final` (end-of-class quiz), and asserts that the pulse count equals the pause
slide count.

## No names, anywhere

Nothing on this surface credits or identifies an individual — not the cards, not
the caveat, not the prompt bodies. Many instructors use the platform, and one
instructor's name on the shared authoring surface reads as ownership of
everyone's lectures. `verify-content-import` asserts the dictionary and both
prompt bodies stay clean.

The same rule is pushed down to the model. Both prompts carry a **NEVER CARRY
PERSONAL IDENTITY ACROSS** clause, because lecture title slides routinely carry
their author's name: without it, step 1 copies that name onto the deck and step 2
can lift it into a question. Subject matter crosses over; identity does not. The
one carve-out is a person who *is* the subject — a cited researcher, a historical
figure — so the clause doesn't strip real content.

## What changed in prompt 2

It is the course owner's own prompt, adopted 2026-08-10, with the minimum edits
the two-step flow requires. Untouched: question quality, brevity targets,
distractor rules, bilingual rules, JSON safety, output format.

- **New §2** — copy the deck's `Pulse check` slides verbatim, first, in deck
  order. One question per pause slide, no more, no fewer.
- **§1** — the attachment is the finished HTML deck, not a PDF; plus the
  no-personal-identity clause above.
- **§3** (was §2) — now scoped to the *additional* quiz questions; count reads
  "10 to 18 additional", whole bank still capped at 25.
- **§9** (was §8) — slide numbers come from `data-slide`, not from counting.
- **§11** (was §10) — `both` forbidden, with the reason stated.
- **§12** (was §11) — a pause question's `topic` is copied from the slide's
  `data-pause-topic-en`.
- **§14** (was §13) — spells out that no extra JSON field is allowed, even for a
  copied pause check.
- **§17** (was §16) — a new PULSE CHECKS validation block.

## Known gap: the pause name is cosmetic today

Prompt 1 stamps each pause slide with `data-pause-id` (a stable slug) and
`data-pause-topic-en/es` (a short label). Only the label travels: prompt 2 puts
it in `topic`, the importer stores it as `questions.suggested_topic`, and
`pickCheckpointTopic` uses it to name the checkpoint on the plan board — which
is why the board reads "Slide 17 — Attacker monetization".

The **slug does not reach the platform**. The importer accepts only six fields
per question and deliberately leaves `checkpoint_after_slide` unset, so live
matching is still purely by slide number
([`course-content-import/index.ts:617`](../../../mzareei.github.io/supabase/functions/course-content-import/index.ts)).

In practice this rarely bites, because prompt 2 reads the number off the same
file. It bites if you hand-edit the deck after generating the bank and insert a
slide before a pause. Closing it properly means teaching the importer to accept
the pause id and write the real checkpoint column when the paired HTML contains
that id — not done yet. Until then the slug is forward-compatible data sitting
in the deck, costing nothing.

## Not yet wired into the app

`src/components/ImportPromptCard.tsx` still serves the original single-step
prompt (`IMPORT_PROMPT`) on the Import tab. Replacing it with
`02-question-bank-prompt.txt`, and adding a card for prompt 1, is a separate
change — the in-app prompt was adopted verbatim by the professor and should not
be swapped without his review.


## What changed in prompt 1 (2026-08-17)

Replaced wholesale by the course owner's own *Universal Prompt — Generate a
Teaching-First Interactive HTML Lecture*, adopted verbatim through §16. Where the
old prompt spelled the slide markup out in prose, this one delegates the whole
presentation system to the reference deck and spends its length on pedagogy:
understand the lecture before rebuilding it, preserve teaching intent, improve it
where that genuinely helps, preserve source visuals rather than redrawing them
badly, keep animated GIFs animated, end on a recap.

**§17 is the one addition**, made at his request. His prompt says reproduce the
reference file; the reference file is a design, not a contract. §17 names the
markers the platform actually reads — `data-slide`, the `active` class, the four
`data-section`/`data-title` attributes, and on a Pulse Check slide
`class="slide activity"`, the `Pulse check` / `Pregunta rapida` badge, four
`.choice` buttons, `answer-reveal fragment correct`, `data-pause-id` and
`data-pause-topic-en/es` — plus the two attributes that must never appear. The
shipped reference deck carries all of them on its own Pulse Check slide, so the
model has a worked example rather than only a rule.

`verify-content-import` checks the prompt and the reference file together. Either
one drifting on its own is the failure mode this guards.

## Known gap: no identity clause in prompt 1

Prompt 1 no longer carries **NEVER CARRY PERSONAL IDENTITY ACROSS**. His prompt
does not have one, and adding it was out of scope for adopting his text. A name
on an attached lecture's title slide can now reach the generated deck. Prompt 2
still refuses to carry one into the question bank, and the guard keeping names
off this shared surface is untouched — so what is exposed is the professor's own
projected deck, not everyone else's banks.

`verify-content-import` asserts the absence deliberately. Putting the clause back
fails the verifier, which forces this note to be updated in the same change
rather than left stale.
