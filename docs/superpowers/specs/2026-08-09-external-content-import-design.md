# External content import — decks and question banks authored outside the platform

**Status:** approved 2026-08-09, not implemented.

## Purpose

Let a professor author a lecture deck and its question bank with **their own AI
subscription** — ChatGPT, Claude, Gemini, whatever they already pay for — and
import the result. The platform runs no model calls of its own on this path.

Two problems motivate it.

**Cost.** The in-platform PDF pipeline bills the platform owner's Anthropic key
for every generation. With four professors teaching twenty classes each, and
two or three attempts per lecture before the output is right, the spend scales
with faculty headcount and is unbounded from the owner's side. Professors
already hold AI subscriptions; that cost is already paid and does not grow with
the platform's success.

**Iteration.** One-shot generation cannot be argued with. A professor who wants
slide 12 simplified, or a question rewritten to stress a different distractor,
has no move except regenerating the whole lecture and hoping. A chat interface
is the correct tool for that conversation, and every professor already has one.

The platform's job becomes what it is genuinely good at: running the class.
Attendance, live questions, the timed quiz, reflection, grading, and the
gradebook are untouched by this change.

## What this does not change

- **The PDF generation pipeline stays exactly where it is.** No code is deleted,
  no migration reverted, no function undeployed. `course-generation`,
  `course-generation-worker`, migration `0035`, the teaching-brief UI, and the
  grounding pass all remain. They simply stop being the promoted path. They cost
  nothing while idle and remain available if a professor prefers them.
- Class sessions, QR joining, pulse rounds, the sequential timed quiz,
  reflections, the gradebook, private notes, releases, and the `/content?t=…`
  gated delivery chain are all unaffected.
- The content repository (`mzareei/course-content`) authoring loop is unaffected
  and remains the path for hand-authored material.

## Product decisions

### The platform makes no model calls on this path

Decided with the professor on 2026-08-09. There is no grounding pass, no
validation of pedagogy, no regeneration, no "improve this" button. The
professor's own AI is the author, and the professor is the reviewer. The
platform shows them clearly what they are about to import and lets them change
it.

This supersedes, for the import path only, the fidelity gate described in
`2026-08-09-pdf-teaching-plan-and-grounding-design.md`. That gate still governs
in-platform generation, where the platform is the author and therefore owes the
guarantee.

### Two independent files, never one

The deck and the question bank are separately useful and are never coupled.

A professor teaching from PowerPoint or a PDF uploads **only** the questions and
never touches HTML. A professor who wants the platform to present uploads both.
A professor revising one question must not have to regenerate their deck.

An earlier proposal embedded the bank inside the deck HTML as a `<script
type="application/json">` block, to make mismatched pairs impossible. It was
rejected: it forces coupling that does not match how the artifacts are actually
used, and the mismatch problem it solves does not exist. Questions do not pair
with a *file*; they pair with a *class*. `class_sessions` already carries a
lecture and the class question plan already selects a bank, independently, by
explicit instructor action. That is the pairing, and it already works.

### The editor is the repair mechanism

Nothing is ever rejected back to the professor with "fix this and re-upload."

A question that cannot render — three options, no correct answer, an empty stem
— is flagged inline in the import preview with the specific problem, and the
professor fixes it in place before saving. This is not content review. It is the
difference between *is this question good* (the professor's judgment, never the
platform's) and *can this question be displayed at all* (a structural fact:
`course-pulse` snapshots four options and grades by option key, the student UI
lays out four, and the timer reads `difficulty`).

A question that fails structurally does not import badly. It fails live, in
front of the room, mid-class.

### The model emits HTML on this path

This reverses, for imported decks only, the decision recorded in
`04-decisions.md` under "The model never emits HTML." That decision's reasoning
was that a bad or adversarial generation must not inject markup into a page a
student opens — sound when the platform is the one calling the model.

Here the uploader is an authenticated instructor, which is the same trust
boundary `course-content-upload` and `tools/publish.mjs` already sit on. An
instructor could already upload arbitrary HTML before this change. The new risk
is not a malicious professor; it is a professor unknowingly forwarding AI output
shaped by prompt injection in their source PDF. The deck check below is the
control for that, and the existing "no undeclared external hosts" rule is
already an anti-exfiltration measure: a beacon or tracking pixel needs a host,
and an undeclared host fails the gate.

The in-platform generation path keeps the original rule unchanged.

## The two files

### Questions file

JSON. The essential artifact — works entirely on its own.

    {
      "schema": "tc2007b.bank.v1",
      "title": { "en": "Week 5 — Access control", "es": "Semana 5 — Control de acceso" },
      "language": "both",
      "questions": [
        {
          "prompt":    { "en": "...", "es": "..." },
          "options": [
            { "text": { "en": "...", "es": "..." }, "correct": true  },
            { "text": { "en": "...", "es": "..." }, "correct": false },
            { "text": { "en": "...", "es": "..." }, "correct": false },
            { "text": { "en": "...", "es": "..." }, "correct": false }
          ],
          "difficulty": "medium",
          "covers_up_to_slide": 15,
          "topic": "Least privilege",
          "intended_use": "pulse"
        }
      ]
    }

Field notes:

- `language` is `en`, `es`, or `both`, and declares which keys the file
  populates. A Spanish-only file writes its text under `es` and leaves `en`
  absent — the prompt must never ask an AI to put Spanish text under a key named
  `en`, which is an obvious source of silent error. The importer does the
  mapping: whichever language the file declares becomes the **primary** column
  (`questions.prompt`, `question_options.option_text`), and the other, if
  present, becomes `prompt_es` / `option_text_es`.

  For a single-language file this means the text lands in the primary column and
  therefore displays for every student regardless of their personal toggle,
  which is the desired behaviour for a course taught in one language. No schema
  change is required: `prompt_es` and `option_text_es` are already nullable, and
  every student-facing render already falls back to the primary field.
- `difficulty` is `easy | medium | hard` and is load-bearing: it sets the
  per-question countdown (20 / 30 / 45 seconds, `SECONDS_BY_DIFFICULTY` in
  `features/quiz/Player.tsx`). Missing difficulty defaults to `medium` and is
  shown as defaulted in the preview.
- `covers_up_to_slide` is **advisory**. It drives the preview grouping the
  professor asked for ("these four cover up to slide 15, these six up to slide
  20") and pre-fills `checkpoint_after_slide`. For a bank-only import it refers
  to the professor's own PowerPoint, which the platform never sees and cannot
  verify. It is a navigation cue, not a coordinate.
- `intended_use` is `pulse | final | both`, and is advisory only. It persists into
  the existing `questions.topic_tags text[]` column rather than a new one, so
  this feature needs no migration at all. The per-class plan stays authoritative
  regardless: the same bank behaves differently in group 401 and group 501, and
  re-importing a revised file never overwrites a plan the professor has built.

Verified column contract (read from `0005_authenticated_activity_storage.sql`
and `0014_bilingual_generated_questions.sql`, not from a TypeScript interface —
pitfall #3):

| Field | Column | Constraint |
|---|---|---|
| prompt, primary | `questions.prompt` | not null, length 1–4000 |
| prompt, secondary | `questions.prompt_es` | nullable, length 1–4000 |
| option, primary | `question_options.option_text` | not null, length 1–2000 |
| option, secondary | `question_options.option_text_es` | nullable, length 1–2000 |
| difficulty | `questions.difficulty` | not null, default `medium`, in (easy, medium, hard) |
| intended use | `questions.topic_tags` | `text[]`, default `{}` |

The database's own `difficulty` default is `medium`, so the importer's defaulting
rule matches the schema rather than inventing a second convention.
- Exactly four options with exactly one `correct: true` is required to display.
  Anything else is flagged in the preview for inline repair.

### Deck file

Plain self-contained HTML. Optional; skipping it breaks nothing.

The professor's AI does not need to implement any platform protocol. Run Class
already tolerates a deck that never announces readiness — `RunClass.tsx:339`,
*"If the deck never announces readiness, the class remains operable through the
exact checkpoint coverage loaded from the bank"* — and falls back to manual
question selection after `BRIDGE_TIMEOUT_MS`. That fallback already exists and is
already covered by the deck-protocol verifier.

Consequence worth stating plainly: an imported deck will not auto-cue questions
at checkpoints. The professor picks each question from the Run Class panel. This
is a real capability difference from generated decks and should be described
honestly in the UI rather than discovered.

## Language model

Each group is taught in a single language — 401/402 in English, 501/502 in
Spanish — but the same syllabus. So questions are authored bilingually **once**
and used by all four groups. Two separate single-language prompts were considered
and rejected: they double the authoring and review work and let the two versions
drift apart the moment one is edited.

Both languages are never on screen at the same time.

### Existing defect this fixes

Student-facing renders are already correct: `Live.tsx:167`, `Player.tsx:144`, and
`CheckpointPanel.tsx:134` all use `(useSpanish && x_es) || x`.

The **audience-facing** layer is not, and this is a live defect affecting groups
501 and 502 today, independent of this feature. Two copies exist, per pitfall #46
(a parent overlay is hidden when the iframe goes fullscreen, so the question must
render in both places):

1. `course-platform/src/features/live/ClassroomQuestionLayer.tsx:58` and `:70`
   stack the English text and then the Spanish beneath it, for the prompt and for
   every option. This is the layer projected to the room.
2. `mzareei.github.io/supabase/functions/_shared/templates/deck-script.js:196`
   and `:218` do the same inside the deck engine.

### The fix

**Parent overlay.** `ClassroomQuestionLayer` follows the app's `lang` signal.
The file already imports `t` from `../../i18n`; `lang` is exported from the same
module, so this is one added import and the same one-line pattern
`CheckpointPanel` already uses. The stacked `classroom-question-es` and
`classroom-question-option-es` elements are removed. No migration, no new props,
no schema change. Setting the platform to Spanish before teaching 501 puts the
room in Spanish.

**Deck overlay.** The deck picks the language from its **own** existing language
toggle, so slides and question always agree.

The bridge message shape is deliberately **not** changed. `deck-script.js:272`
does exact-shape validation requiring precisely
`checkpoint_key,options,prompt,prompt_es,type,version`, and pitfall #29 explains
why that strictness exists. Adding a language key would make any deck generated
before the change reject the message and show **no question at all** — worse than
showing two languages. Sending both and letting the deck choose means an
un-refreshed deck degrades to today's behaviour instead of breaking.

Because the deck engine is embedded, this half requires the documented sequence:
edit the template, run `node tools/build-deck-assets.mjs`, redeploy, then run the
idempotent **Refresh lecture deck** action for existing ready banks. Imported
decks are unaffected — they do not implement the bridge, so only the parent
overlay ever applies to them.

## Architecture

Four components. Two are small because the machinery exists.

**This feature requires no database migration.** Every column it writes already
exists, and the language fix is a rendering change. That is worth stating
because it removes the ordering hazard of pitfall #39 — no function deploy can
outrun a migration that does not exist — and it means the whole feature is
reversible by reverting code.

### 1. Prompt page (frontend)

Shows the exact text to paste into the professor's AI, with a copy button and a
short note on what to attach. Bilingual chrome, single prompt producing both
languages.

**This is where the quality of the whole system lives.** The prompt is the
product; it deserves more iteration than any of the code. It must state the
output contract precisely enough that ChatGPT, Claude, and Gemini all produce
loadable JSON, and must instruct that the uploaded PDF is the source of
truth — carrying forward the lesson of pitfall #65, now as prompt text the
professor sends rather than a gate the platform enforces.

### 2. Import screen (frontend)

Upload a file or paste its contents — both, because a chat interface often makes
copying easier than downloading.

The preview is the heart of the feature and matches what the professor
described: every question grouped by the slide range it covers and by difficulty,
each showing its topic and marked correct answer, all editable inline. Anything
structurally unloadable is flagged in place with the specific problem. Nothing is
written until the professor confirms.

A `localStorage` draft protects an in-progress edit against a closed tab. A
staging table with a durable multi-session review workflow was considered and
rejected as disproportionate: a new migration and a second release-like state
machine to protect an editing session that lasts minutes.

### 3. `course-content-import` (new edge function)

One door for the commit, so a client that skips the preview cannot push
unvalidated content into private storage. Keeps product rule #1 intact — edge
functions authorize every operation.

It authorizes the instructor, re-checks question structure server-side,
validates the deck HTML, writes both halves, and emits one audit event. The
question half largely delegates to `import_bank` in `course-question-bank`,
which already exists, is already instructor-gated, and is already idempotent by
`(bank, generation_key)` — regenerating replaces a bank's own questions instead
of duplicating them, and instructor-edited questions are preserved unless
`replace_edited` is set.

### 4. Deck check (new, ported)

Ports `course-content/lib/validate.mjs` (~144 lines, Node ESM → Deno) into the
edge function. It enforces:

- the artifact is **self-contained** — a surviving relative reference means an
  asset that will 404 from behind the gate, where there is no sibling file to
  find;
- **no link to the public origin** — pitfall #57: a student inside `/content?t=…`
  one click from the ungated copy;
- **no undeclared external hosts** — the anti-exfiltration control;
- the document has a `<title>`, and bilingual metadata is present.

Failures are reported in the professor's language with the specific reference
that caused them, at their desk, before the class.

## Error handling

| Situation | Behaviour |
|---|---|
| File is not valid JSON | Named at the top of the import screen with the parser's position. Nothing else runs. |
| Question has ≠ 4 options, or ≠ 1 correct | Flagged on that question in the preview. Professor fixes inline. Not a file-level failure. |
| Missing `difficulty` | Defaults to `medium`, shown as defaulted so it is visible rather than silent. |
| Prompt over 4000 or option over 2000 characters | Flagged in the preview with the character count and limit, **before** save. This is pitfall #7's exact shape: a verbose AI-written question can pass every app-level check and then be rejected by a Postgres length constraint at insert. The preview must enforce the database's own limits, not a limit of its own invention. |
| Missing Spanish on a `both` file | Flagged per field. Professor supplies it or switches the file to single-language. |
| Deck has a relative reference | Named with the exact reference; save is blocked for the deck only. Questions still import. |
| Deck links to the public origin or an undeclared host | Same; the host is named. |
| Import interrupted | `localStorage` draft restores the edit session. |
| Re-importing a revised file | Replaces that bank's generated questions; instructor-edited questions preserved; class question plans untouched. |

A deck failure never blocks a question import, and vice versa. They are
independent artifacts and fail independently.

## Testing

Test-first, following the repo's existing verifier convention — captured RED
before implementation, GREEN after.

- `tools/verify-content-import.mjs` (frontend): the file schema contract, the
  single-language mapping into the primary column, the defaulting rules, and
  that structural failures surface per question rather than per file.
- `tools/verify-content-import-security.mjs` (backend): the deck check rejects
  relative references, public-origin links, and undeclared hosts; the commit
  endpoint refuses a non-instructor; the browser cannot bypass the preview.
- `tools/verify-classroom-language.mjs` (frontend): the audience layer renders
  exactly one language and never both. Mutation-test it — the verifier must fail
  if the stacked element is restored.
- Existing `verify-i18n` covers the new bilingual strings; existing
  `verify-deck-protocol` must still pass unchanged, proving the bridge shape was
  not altered.

Browser verification, through real entry points only (pitfall #1):

1. Import a questions-only file; confirm the preview grouping matches the file;
   edit one question; save; confirm it appears in Question Banks.
2. Build a class question plan from the imported bank; run a class; confirm a
   pulse question reaches a student phone and grades correctly.
3. Import a deck; open it through Run Class; confirm it renders in the gated
   iframe and that manual question selection works without the bridge.
4. Set the platform to Spanish; confirm the room display shows Spanish only, for
   both an imported deck and a generated one.
5. Attempt a deck with a deliberate relative reference; confirm the failure is
   specific and the questions still import.

## Deliberately out of scope

- Any model call from the platform on this path.
- Changing, deprecating, or removing the PDF generation pipeline.
- Auto-cueing questions from an imported deck (needs the bridge; a professor
  wanting that uses generated decks).
- A durable multi-session import staging workflow.
- Recording token usage for the generation pipeline — still worth doing, tracked
  separately in `PROJECT-HANDOFF.md`.

## Open item — not blocking

The reported ~$10 per generation does not reconcile with the documented
$0.40–$1.00 estimate, and neither figure is measured: nothing in the application
records token usage. Reading the worker: four calls, output capped at 44,000
tokens, the PDF sent **twice** (`index.ts:248` and `:490`), **no prompt caching**
anywhere in `_shared/anthropic.ts`, and `maxAttemptsPerStep = 3` with a ceiling of
`× 6` — so a failing job can burn up to 18 model calls rather than 4.

A scanned or image-heavy PDF tokenizes as images, is sent twice uncached, and a
retry storm multiplies that four-and-a-half fold, which reaches $10 plausibly.
That suggests retries rather than baseline cost. This does not block the import
work — it is the reason for it either way — but it is worth confirming against
the Anthropic console, because if it is a retry loop it is a bug worth fixing on
its own terms.
