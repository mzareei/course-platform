// The authoring prompt the professor pastes into their own AI subscription.
//
// This card is the whole product surface of the import feature. The platform
// makes no model call on this path, so the prompt is the only thing standing
// between a lecture PDF and a question bank that loads — every rule the
// importer enforces has to be stated here, unambiguously, because there is no
// second chance to correct the model.
//
// The prompt body stays in English on purpose. It is instructions to a model,
// not text a person reads, and translating it would create two contracts that
// drift apart. Everything a human reads — the heading, the note about what to
// attach, the copy button — goes through t() like every other string.
//
// ---------------------------------------------------------------------------
// PROVENANCE
//
// Adopted verbatim on 2026-08-10 from a prompt the course owner wrote and
// tested himself, replacing an earlier agent-drafted version. It was NOT
// re-run through the self-test loop that produced the version it replaced
// (real lecture → real model output → real parseQuestionFile()) — his own
// review stands in its place here, same as the plan's original review
// checkpoint intended.
//
// Extended on 2026-08-17 for the two-step flow: it now reads the finished HTML
// deck that DECK_PROMPT produces rather than a PDF, copies the deck's Pulse
// check questions instead of inventing live ones, and bans intended_use=both.
// Everything about question quality, brevity, distractors, bilingual rules and
// JSON safety is his, untouched.
//
// No individual is named anywhere a professor can read, here or in the prompt
// bodies: the platform serves many instructors, and one instructor's name on
// the shared authoring surface would travel into everyone else's decks and
// question banks. The prompts now say so to the model too — see the NEVER
// CARRY PERSONAL IDENTITY ACROSS clause in both, which also stops a name being
// copied off an attached PDF's title slide. verify-content-import enforces it.
//
// One structural gap worth naming plainly rather than silently: this version
// does not state the database's actual hard character ceiling (4000 for a
// question, 2000 for an option) the way the version it replaced did. Its own
// length targets (see §5) are tight enough that reaching those ceilings is
// unlikely — and the real ceiling is still enforced at parse time by
// questionFile.ts and again server-side in course-content-import regardless
// of what the prompt itself says — but a model that ignores the soft targets
// has no explicit hard backstop named in the prompt text. Not fixed here
// because the instruction was to adopt this version as written, not amend it.
// ---------------------------------------------------------------------------
//
// The version this replaced independently discovered, and explicitly guarded
// against, three shapes that break the import when a model produces them:
// "correct" quoted as a string (every question flagged "0 correct answers"),
// the bank nested under a wrapper key (the whole file rejected), and options
// written as bare strings. This prompt's own §14 and §7 independently forbid
// all three — worth knowing they were arrived at separately, not carried over.
// (Those were §13 and §6 before the two-step split inserted a section.)
import { useEffect, useRef, useState } from "preact/hooks";
import { t } from "../i18n";
import type { StringKey } from "../i18n/strings";
import { DECK_PROMPT } from "../features/import/deckPrompt";

/** Step 2 of two. Exported so the verifier can assert the contract clauses are
 *  still present. See PROVENANCE above for what "tested" means here. */
export const IMPORT_PROMPT = `You are creating a multiple-choice question bank for ONE lecture of TC2007B Information Security at Tecnologico de Monterrey.

The attachment is the finished HTML slide deck for that lecture. It already contains the pause check slides where the class stops, with their questions written on them. Your job is to carry those questions across exactly as written, and then add further questions for the end-of-class quiz.

The output is imported directly into the course platform and may be shown live during class. Follow every requirement below exactly.

=== 1. THE ATTACHED FILE IS THE ONLY SOURCE OF SUBJECT MATTER ===

The attached lecture deck is the complete and only source of subject matter.

Every question, correct answer, and wrong answer must be supported by what the attachment actually teaches and must be answerable by a student who attended this lecture and read nothing else.

Do not:

- add information from your own knowledge;
- update or correct the lecture;
- assume what a lecture with this title should contain;
- use information from other lectures or courses;
- treat the file name or anything written in this chat as subject matter.

The attachment always wins.

The lecture title, file name, and chat text are only labels unless the same information actually appears inside the lecture.

NEVER CARRY PERSONAL IDENTITY ACROSS

No question, no option, and no bank title may contain an instructor name, a student name, an email address, a phone number, an employee number, or any other personal contact detail. If the deck shows one anywhere, ignore it — it is a label on the slides, never subject matter, and it is never the answer to anything.

This bank is built with prompts shared by many instructors. A name copied out of one deck would travel into everyone else's question banks.

The only exception is a person who is genuinely part of the subject matter — a named researcher in a cited paper, or a historical figure the lecture actually teaches about.

If no attachment is available, or you cannot read it reliably, reply in plain sentences explaining that and stop. Never generate questions from the title or filename alone.

=== 2. THE DECK'S PULSE CHECK SLIDES ARE ALREADY WRITTEN — COPY THEM FIRST ===

The deck decides where the class stops. You never decide that, and you never move a stop.

Find every slide section whose class list includes activity and whose badge reads "Pulse check" in English, or "Pregunta rapida" in Spanish. The badge may carry a decorative symbol before those words; the words are what identify the slide. Those slides are the questions the class answers live on their phones. They are already written on the slide. Copy them. Do not rewrite, improve, shorten, translate afresh, reorder, or replace them.

For each Pulse check slide, in the order they appear in the deck, produce exactly one question:

- prompt en is the h2 text inside the lang-en span, verbatim;
- prompt es is the h2 text inside the lang-es span, verbatim;
- options are the four button elements with class choice, in the order they appear on the slide, each carried across verbatim in both languages;
- the correct option is the one named inside the div with class answer-reveal on that same slide;
- covers_up_to_slide is that slide's own data-slide number;
- topic is that slide's data-pause-topic-en value, verbatim;
- intended_use is pulse;
- difficulty is judged from the question itself, using section 10.

Rules:

- exactly one question per Pulse check slide — never two, never zero;
- the number of pulse questions in your output must equal the number of Pulse check slides in the deck;
- never create a pulse question from a slide that has no Pulse check badge;
- a slide badged "Quick activity", "Actividad rapida", "Discussion", or "Discusion" is NOT a pulse check and produces no question in this section;
- these questions come first in the questions array, in deck order, before any quiz question;
- if a Pulse check slide has fewer or more than four options, or no answer marked, reconstruct it to exactly four options with exactly one correct answer, keeping the slide's own wording as closely as possible. Never skip the slide.

The wording on the slide and the wording in the bank must match, because the class reads the question off the projector while answering it on the phone. A rewritten question would put two different questions in front of the same student.

=== 3. ANALYZE THE LECTURE BEFORE WRITING THE REMAINING QUESTIONS ===

Sections 3 through 8 govern the ADDITIONAL questions, the ones asked in the end-of-class quiz. They do not apply to the pulse checks copied in section 2, which are already fixed.

Before generating the JSON, silently inspect the complete lecture from first slide to last slide.

First identify the lecture's substantive concept blocks.

A concept block may span one slide or many slides. Slides that explain the same idea belong to the same block.

Do NOT generate questions according to a fixed number of slides.

For example:

- slides 2 to 6 may contain several important ideas and deserve 2 or 3 questions;
- slides 7 to 12 may simply elaborate the same idea and deserve only 1 question;
- several transition, title, repetition, illustration, or administrative slides may deserve no question at all.

Question density must follow learning content, not slide density.

For each concept block, decide whether it deserves 0, 1, 2, or occasionally 3 questions.

Use more questions when the block:

- introduces an important new concept;
- contains several ideas students must distinguish;
- contains a worked example;
- contains a calculation or procedure;
- contains an in-class activity;
- introduces a likely misconception;
- connects concepts in a way that requires reasoning.

Use fewer or zero questions when slides:

- repeat an idea already tested;
- provide visual support without adding a new concept;
- are transitions or section dividers;
- contain administrative information;
- expand an idea without creating another meaningful learning objective.

Normally generate about 10 to 18 additional quiz questions, on top of the pulse checks copied in section 2.

A dense lecture may justify more, provided the whole bank stays at or below an absolute maximum of 25 questions including the pulse checks.

A short lecture may justify fewer.

Never invent weak questions merely to reach a target number.

The goal is coverage of meaningful learning objectives, not coverage of every slide with a question.

A concept already covered by a pulse check may still earn a quiz question if it deserves a second, deeper form of assessment. Do not simply restate the pulse check.

=== 4. CONTENT COVERAGE ===

Follow the lecture's order from beginning to end.

Across the complete bank, cover all substantive concepts taught in the lecture.

Related slides may be represented by one strong question rather than several repetitive questions.

Do not skip material merely because it seems basic.

Worked examples and in-class activities receive special treatment.

If the lecture contains a worked example, generate at least one question testing the reasoning used in that example.

If the lecture contains a numeric calculation, generate at least one question requiring the same type of calculation using different values.

Only use formulas, procedures, assumptions, or methods actually taught in the lecture.

For numeric distractors, use plausible mistakes such as:

- an arithmetic error;
- applying the correct operation in the wrong order;
- using the wrong value from the problem;
- confusing two steps taught in the example.

If the lecture contains an in-class activity with a substantive learning objective, include at least one question testing what the activity is meant to teach.

=== 5. QUESTION QUALITY ===

Test understanding rather than recognition of slide wording.

Prefer questions that require the student to:

- apply a concept;
- distinguish neighboring concepts;
- identify the consequence of a rule;
- interpret a short situation;
- perform a procedure;
- reason through a worked example;
- detect a common misconception.

Avoid questions that merely ask students to reproduce a sentence from a slide when a conceptual question is possible.

Do not make questions artificially difficult.

Do not introduce scenarios requiring outside knowledge.

Do not ask about facts that are not explicitly taught or reasonably inferable from the lecture.

Avoid unnecessary wording such as:

- According to the lecture;
- Which of the following statements is correct;
- Based on the previous slides.

Ask the question directly whenever possible.

Avoid negative questions such as Which is NOT unless the negative form is genuinely necessary.

=== 6. KEEP QUESTIONS SHORT ===

These questions are displayed across a classroom and answered on phones.

Brevity is extremely important.

For each language separately:

Question prompt:

- ideal length: 70 to 160 characters;
- try to stay below 180 characters;
- if it exceeds about 220 characters, rewrite it more concisely unless the extra context is essential.

Each option:

- ideal length: 20 to 70 characters;
- try to stay below 80 characters;
- avoid exceeding 100 characters;
- absolute practical maximum: about 120 characters.

Remove unnecessary setup and repeated information.

Prefer:

A service can read files but cannot modify them. Which permission is being enforced?

over:

A system administrator has configured a service in such a way that the service is able to read the contents of certain files but is unable to make modifications to those files. Which type of permission does this configuration represent?

Shorter questions must still remain unambiguous.

A question copied from a Pulse check slide under section 2 keeps the slide's wording even if it sits outside these ranges. The ranges guide the questions you write yourself.

=== 7. ANSWER OPTIONS ===

Every question must have exactly four options.

Exactly one option must be correct.

The other three must be plausible mistakes a student who attended this lecture could genuinely make.

Good distractors include:

- a neighboring concept;
- a reversed definition;
- a property belonging to another concept taught nearby;
- a common procedural mistake;
- a plausible arithmetic error;
- confusion between two mechanisms taught in the lecture.

Do not use filler or obviously absurd answers.

Keep all four options similar in:

- length;
- grammatical structure;
- level of detail;
- technical specificity.

Do not repeatedly make the correct answer the longest or most precise option.

Do not reveal the answer through grammar or wording.

Vary the position of the correct answer throughout the bank. Do not create a predictable pattern.

Never use:

- All of the above;
- None of the above;
- Both A and B;
- A and C;
- any answer that refers to another option by letter, number, or position.

The student's phone may not display option letters.

=== 8. BILINGUAL QUESTIONS ===

Default language is both unless explicitly instructed otherwise.

When language is both:

EVERY prompt and EVERY option must contain:

- en with English text;
- es with Spanish text.

Neither may be empty.

The Spanish and English versions must represent exactly the same question, scenario, values, reasoning, and correct answer.

Do not create two slightly different questions.

Use natural Mexican academic Spanish rather than awkward literal translation.

Preserve technical terminology in the form used by the lecture when appropriate.

Never put Spanish text under en or English text under es.

When language is en, include only en.

When language is es, include only es.

Do not include an empty unused language field.

For a question copied from a Pulse check slide, both languages come from the slide itself. Do not retranslate either one.

=== 9. SLIDE TRACKING ===

Every question must contain covers_up_to_slide.

This is the last slide a student must have seen to answer that specific question.

Read the slide number from the data-slide attribute on each slide section in the deck. That number is authoritative.

If a slide has no data-slide attribute, count the slide sections in document order with the first as slide 1.

Never count anything other than slide sections. Fragments, buttons, and inner divs are not slides.

Never output a number below 1 or above the deck's last slide number.

For a question copied from a Pulse check slide, covers_up_to_slide is that pause slide's own data-slide number, as stated in section 2.

For a quiz question you write yourself, do not automatically assign the final slide of a concept block.

Example:

If a concept is discussed on slides 4 through 7 but the question only requires information introduced by slide 5, use:

covers_up_to_slide: 5

If the question combines material introduced on slides 5 and 7, use:

covers_up_to_slide: 7

This field is used to determine when the question can safely appear during the lecture.

=== 10. DIFFICULTY ===

Every question must contain difficulty with exactly one of:

easy
medium
hard

Difficulty represents how long a student should reasonably need to answer because it controls the countdown timer.

Use:

easy
Approximately 20 seconds.
Direct conceptual understanding with little processing.

medium
Approximately 30 seconds.
Requires interpretation, comparison, or a short reasoning step.

hard
Approximately 45 seconds.
Requires calculation, several reasoning steps, or careful application.

A concept is not automatically hard because it is technically advanced.

Any question requiring meaningful arithmetic on paper should normally be hard.

Use a reasonable mix across the bank.

A pulse check interrupts a live lecture, so it is rarely hard. Judge it on the question as written, but expect most to be easy or medium.

=== 11. INTENDED USE ===

Every question must contain intended_use with exactly one of:

pulse
final

Use pulse ONLY for a question copied from a Pulse check slide under section 2.

Use final for every question you wrote yourself under sections 3 to 8.

Never use the value both, and never use any other value.

This matters more than it looks. The platform builds the live class plan by stopping at every slide that has a pulse question waiting. A pulse question pointing at a slide that is not a Pulse check slide makes the class stop where the deck does not pause — the professor is mid-explanation and a poll appears on every phone. Marking a question pulse is therefore a claim that a Pulse check slide exists at that exact slide number. Only section 2 may make that claim.

The number of questions marked pulse must equal the number of Pulse check slides in the deck.

=== 12. TOPIC FIELD ===

Every question must contain a topic.

For a question copied from a Pulse check slide, topic is that slide's data-pause-topic-en value, copied verbatim. This label becomes the name of the checkpoint the professor sees on the class plan board, so it must match the slide exactly.

For a quiz question you write yourself, use a short English label of approximately two to four words.

Questions testing the same concept must reuse exactly the same topic text. If a quiz question tests the concept of an existing pause check, reuse that pause check's topic text exactly.

Do not create slightly different topic names for the same concept.

Examples of formatting only:

Access control
Password attacks
Risk assessment
Public key encryption

These examples describe formatting only. Do not use them unless they actually occur in the attached lecture.

=== 13. OUTPUT FORMAT ===

Return exactly one JSON code block and nothing else.

No introduction.
No summary.
No explanation.
No comments inside the JSON.

The outermost value must be exactly one object containing exactly these four keys:

schema
title
language
questions

Nothing may wrap this object.

The file must begin with the opening object followed by the schema field.

Use:

schema = tc2007b.bank.v1

The title must contain a short English and Spanish label describing the actual lecture content.

Use the lecture's own title when clearly available in the attachment.

Do not derive subject matter from the filename or chat label.

language must be:

both
en
or
es

questions must be a non-empty array.

=== 14. EXACT QUESTION STRUCTURE ===

Every question object must contain exactly:

prompt
options
difficulty
covers_up_to_slide
topic
intended_use

No additional fields.

Do not add a pause id, a slide title, a checkpoint key, or any other field, even for a copied pulse check. The importer accepts only the six fields above.

prompt contains the appropriate language keys.

options contains exactly four objects.

Each option contains exactly:

text
correct

correct must be the JSON boolean:

true

or:

false

Never put the boolean inside quotation marks.

Exactly one option must have true.

The other three must have false.

There is no separate answer field, answer_index field, correct_option field, explanation field, or ID.

=== 15. JSON STRING SAFETY ===

Inside the actual text contained in JSON strings:

- use plain text only;
- do not use Markdown;
- do not use LaTeX;
- do not insert backslash characters;
- do not insert double quotation marks as part of the text;
- if quotation marks are necessary inside text, use single quotation marks;
- do not use line breaks inside question or option text unless unavoidable.

Normal JSON syntax still uses double quotation marks around keys and string values.

Mathematics must use plain text or Unicode.

Good:

7^21 mod 10

phi(n) = (p-1)(q-1)

x times y is congruent to 1 mod n

When copying from a Pulse check slide, strip any HTML tags, entity codes, and the badge symbol. Carry across the words only.

Do not abbreviate questions with ellipses.

Never output placeholders such as:

more questions here
questions omitted
continue
15 additional questions

If necessary, generate fewer complete questions rather than producing truncated JSON.

=== 16. REQUIRED STRUCTURE ===

Use exactly this structural pattern:

{
  "schema": "tc2007b.bank.v1",
  "title": {
    "en": "English lecture title",
    "es": "Titulo de la clase en espanol"
  },
  "language": "both",
  "questions": [
    {
      "prompt": {
        "en": "English question",
        "es": "Pregunta en espanol"
      },
      "options": [
        {
          "text": {
            "en": "English option",
            "es": "Opcion en espanol"
          },
          "correct": true
        },
        {
          "text": {
            "en": "English option",
            "es": "Opcion en espanol"
          },
          "correct": false
        },
        {
          "text": {
            "en": "English option",
            "es": "Opcion en espanol"
          },
          "correct": false
        },
        {
          "text": {
            "en": "English option",
            "es": "Opcion en espanol"
          },
          "correct": false
        }
      ],
      "difficulty": "medium",
      "covers_up_to_slide": 5,
      "topic": "Concept name",
      "intended_use": "pulse"
    }
  ]
}

The example above defines structure only. Its text is not lecture content.

=== 17. FINAL SILENT VALIDATION ===

Before answering, silently check the complete bank.

PULSE CHECKS

- Every slide whose badge reads "Pulse check" produced exactly one question.
- No slide without that badge produced a pulse question.
- The count of pulse questions equals the count of Pulse check slides.
- Every pulse question's wording matches its slide in both languages.
- Every pulse question's four options match the slide's four choice buttons, in the slide's order.
- Every pulse question's correct answer is the one the slide's answer-reveal names.
- Every pulse question's covers_up_to_slide equals its slide's own data-slide.
- Every pulse question's topic equals its slide's data-pause-topic-en.
- Pulse questions appear first in the array, in deck order.

CONTENT

- Every question is supported by the attachment.
- Every correct answer is supported by the attachment.
- No question, option, or title contains an instructor name, student name, email address, phone number, or other personal contact detail.
- Every distractor comes from a plausible misunderstanding of lecture content.
- No outside knowledge has entered the bank.
- Questions follow the lecture's conceptual order.
- All substantive concepts receive appropriate coverage.
- Repetitive or low-value slides have not created unnecessary questions.
- Every worked example and substantive activity is represented.
- Every numeric worked example has an appropriate changed-number calculation question.
- No quiz question merely restates a pulse check.

QUALITY

- Questions test understanding rather than wording recognition.
- Questions are as short as possible without becoming ambiguous.
- Options are concise.
- Distractors are plausible.
- Correct answers are not systematically longer or more detailed.
- Correct-answer positions are reasonably varied.
- No two questions test essentially the same thing unless the concept genuinely deserves multiple forms of assessment.

LANGUAGE

- If language is both, every prompt and every option has non-empty en and es values.
- English appears only under en.
- Spanish appears only under es.
- Both languages describe the same question and answer.

STRUCTURE

- Top level contains exactly schema, title, language, questions.
- Every question has exactly the required fields, and no extra field.
- Every question has exactly four options.
- Exactly one option per question has true.
- true and false are unquoted JSON booleans.
- covers_up_to_slide is a bare number, at least 1 and no greater than the deck's last slide.
- difficulty uses only easy, medium, or hard.
- intended_use uses only pulse or final. The value both never appears.
- JSON has balanced braces and brackets.
- No trailing commas.
- Nothing is truncated.
- No text appears outside the single JSON code block.

After completing this validation, output only the JSON code block.`;

const COPIED_MS = 3000;

type CopyState = "idle" | "copied" | "failed";

/** Where the style reference deck is served from. It sits in public/, so it is
 *  a plain static file on the same origin — no API call, no auth, nothing to go
 *  stale between deploys.
 *
 *  Step 1's prompt opens by saying it is being handed two files: this deck and
 *  the professor's own lecture. Without the deck the model has no design, no
 *  presenter controls, and — the part that matters to the platform — no worked
 *  example of a Pulse Check slide carrying the five markers §17 asks it to
 *  reproduce. So the download is not a nicety on this screen; it is half of
 *  step 1's input, and it belongs inside the step-1 card rather than filed away
 *  under documentation. */
const REFERENCE_DECK_PATH = "/TC2007B_Presentation_Style_Reference.html";

/** One numbered step of the two-step flow: what it does, what to attach, a
 *  copy button, and the prompt text itself folded away.
 *
 *  Both prompts run past 400 lines. Printed open, one buries the other and the
 *  professor scrolls through instructions to a model to reach the upload
 *  fields — so the text collapses and the copy button, which is the only part
 *  anyone actually uses, stays at the top.
 *
 *  Declared at module scope, not nested inside ImportPromptCard — pitfall #4. */
function PromptStep({
  titleKey,
  ledeKey,
  saveKey,
  body,
  reference = false
}: {
  titleKey: StringKey;
  ledeKey: StringKey;
  saveKey: StringKey;
  body: string;
  reference?: boolean;
}) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const resetTimer = useRef<number | undefined>(undefined);

  // A confirmation that outlives its card would set state on an unmounted
  // component the moment the professor switches tabs mid-countdown.
  useEffect(() => () => clearTimeout(resetTimer.current), []);

  async function onCopy() {
    clearTimeout(resetTimer.current);
    try {
      await navigator.clipboard.writeText(body);
      setCopyState("copied");
      resetTimer.current = setTimeout(() => setCopyState("idle"), COPIED_MS) as unknown as number;
    } catch {
      // Clipboard access is refused outside a secure context and in some
      // hardened browser settings. Say so and let them select the text instead
      // of leaving the button looking like it worked.
      setCopyState("failed");
    }
  }

  return (
    <div class="card stack">
      <div class="row" style="justify-content: space-between; align-items: flex-start;">
        <div>
          <h3>{t(titleKey)}</h3>
          <p class="hint">{t(ledeKey)}</p>
        </div>
        <button
          class="btn primary"
          type="button"
          aria-live="polite"
          style="flex: 0 0 auto;"
          onClick={() => void onCopy()}
        >
          {copyState === "copied" ? t("import.prompt.copied") : t("import.prompt.copy")}
        </button>
      </div>

      {reference ? (
        <div class="card stack" style="margin: 0;">
          <div class="row" style="justify-content: space-between; align-items: flex-start; gap: 16px;">
            <div>
              <strong>{t("import.prompt.referenceTitle")}</strong>
              <p class="hint">{t("import.prompt.referenceLede")}</p>
            </div>
            {/* download, not a plain link: the deck's presenter engine is inline
                script, which the app's own Content-Security-Policy blocks on
                this origin. Opened in a tab it would render dead — saved to
                disk and attached to the chat, which is what step 1 needs, it is
                the file the professor wrote. */}
            {/* text-decoration: an anchor wearing .btn still inherits the
                global link underline, which reads as a link sitting inside a
                button rather than as the button it is. */}
            <a
              class="btn"
              style="flex: 0 0 auto; text-decoration: none;"
              href={REFERENCE_DECK_PATH}
              download="TC2007B_Presentation_Style_Reference.html"
            >
              {t("import.prompt.referenceDownload")}
            </a>
          </div>
        </div>
      ) : null}

      <p class="hint">{t(saveKey)}</p>

      {copyState === "failed" ? (
        <p class="error-text" role="alert">{t("import.prompt.copyFailed")}</p>
      ) : null}

      <details>
        <summary class="hint">{t("import.prompt.showText")}</summary>
        <pre class="import-prompt-text">{body}</pre>
      </details>
    </div>
  );
}

export function ImportPromptCard() {
  return (
    <div class="stack">
      <div class="card stack">
        <h3>{t("import.prompt.title")}</h3>
        <p class="hint">{t("import.prompt.lede")}</p>
        <p class="hint">{t("import.prompt.howRule")}</p>
        <p class="hint">{t("import.prompt.attach")}</p>
        <p class="hint">{t("import.prompt.validationCaveat")}</p>
      </div>

      <PromptStep
        titleKey="import.prompt.step1Title"
        ledeKey="import.prompt.step1Lede"
        saveKey="import.prompt.step1Save"
        body={DECK_PROMPT}
        reference
      />

      <PromptStep
        titleKey="import.prompt.step2Title"
        ledeKey="import.prompt.step2Lede"
        saveKey="import.prompt.step2Save"
        body={IMPORT_PROMPT}
      />
    </div>
  );
}
