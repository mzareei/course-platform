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
// VALIDATION CAVEAT — READ BEFORE TRUSTING THIS FOR A REAL CLASS
//
// This prompt has been validated against exactly ONE model: Claude. It has NOT
// been tested against ChatGPT or Gemini, which the design spec names as the
// other two providers a professor is likely to use. The self-test was: read the
// real week-05 TC2007B lecture (asymmetric encryption), follow this prompt
// against it, and feed the resulting JSON through the real parseQuestionFile()
// — 23 questions, zero problems, bankIsImportable true. That proves the
// contract is self-consistent and machine-loadable, not that three different
// providers all honour it. Sanity-check one lecture on whichever AI you
// actually use before relying on this in front of a class.
// ---------------------------------------------------------------------------
//
// Three shapes below are stated explicitly because a permissive reading of an
// earlier draft allowed each of them, and each one was confirmed against the
// real parser to break the import: "correct" quoted as a string (every question
// flagged "0 correct answers"), the bank nested under a wrapper key (the whole
// file rejected — no questions array), and options written as bare strings
// (every option empty). Do not trim those clauses without re-running the
// self-test in .superpowers/sdd/.
import { useEffect, useRef, useState } from "preact/hooks";
import { t } from "../i18n";

/** Exported so the verifier can assert the contract clauses are still present. */
export const IMPORT_PROMPT = `You are writing a multiple-choice question bank for ONE lecture of TC2007B
(Information Security) at Tecnologico de Monterrey. Your answer is imported
straight into the course platform and shown to students during class, so it has
to follow the file contract below exactly.

=== 1. THE ATTACHED FILE IS THE ONLY SOURCE OF SUBJECT MATTER ===

The attached lecture is the complete and only source of content. Every question,
every correct answer and every wrong answer must come from what that file
actually teaches, and must be answerable by a student who sat through this
lecture and read nothing else.

Do not add material from your own knowledge of the subject, from other courses,
or from what you assume a lecture with this name ought to contain. Do not skip
material because it looks too basic. Do not correct or update the lecture.

The lecture title, the file name, and anything else I type in this chat are
labels for my own filing. They are NOT subject matter. If the title and the
attachment disagree, the attachment wins and the title is ignored. A title like
"test mal" or "week 5" describes nothing; treating such a label as the topic has
already produced a whole deck about the wrong subject once, so never do it.

If nothing is attached, or you cannot read the attachment, reply in plain
sentences saying so and stop. Never build a question file from the title alone.

=== 2. WHAT TO WRITE ===

- Roughly one question per two or three slides: 10 to 25 questions in total.
- Follow the lecture's own order, from its first slide to its last, and cover
  all of it - including every worked example and in-class activity.
- If the lecture works a numeric example, at least one question must make the
  student do that same kind of computation with different numbers.
- Test understanding, not recall of wording. A student who understood the
  lecture should get it right; one who only recognises the words on a slide
  should not.
- Every wrong option must be a mistake a real student in this lecture could
  make: a confused definition, a plausible arithmetic slip, a property that
  belongs to the neighbouring concept. Never filler, never obviously absurd,
  never a joke.
- Do not write "All of the above", "None of the above", "Both A and B", or any
  option that refers to another option by letter or position. The room display
  labels the options A to D but the student's phone shows no letters at all, so
  such an option is unreadable exactly where it is answered.
- Keep a question under about 300 characters and an option under about 120. The
  question is read across a lecture hall; the options are tapped on a phone.

=== 3. THE FILE FORMAT ===

Return exactly one JSON code block and nothing else - no sentence before it, no
summary after it, no comments inside it, no trailing commas. Write every
question out in full; never abbreviate with "..." or "15 more questions". If the
bank would be too long for one reply, emit fewer questions rather than an
incomplete or truncated JSON block.

Inside the strings use plain text only: no Markdown, no LaTeX, no backslashes,
no double quotes. A backslash or a stray quote makes the file unreadable and the
whole import fails. If you need quotation marks, use single quotes. Write
mathematics the way it would be said aloud or with plain Unicode - "7^21 mod 10",
"phi(n) = (p-1)(q-1)", "x times y is congruent to 1 mod n" are all fine.

This is the shape, with every field filled in. The subject matter of this
example is a placeholder from a different lecture - copy the structure, never
the content:

{
  "schema": "tc2007b.bank.v1",
  "title": {
    "en": "Week 5 - Access control",
    "es": "Semana 5 - Control de acceso"
  },
  "language": "both",
  "questions": [
    {
      "prompt": {
        "en": "A backup service needs to read every user's home directory each night, and nothing else. Which configuration follows least privilege?",
        "es": "Un servicio de respaldo necesita leer cada noche el directorio personal de cada usuario, y nada más. ¿Cuál configuración sigue el menor privilegio?"
      },
      "options": [
        {
          "text": {
            "en": "A dedicated account with read-only access to those directories",
            "es": "Una cuenta dedicada con acceso de solo lectura a esos directorios"
          },
          "correct": true
        },
        {
          "text": {
            "en": "The root account, so the backup never fails on a permission error",
            "es": "La cuenta root, para que el respaldo nunca falle por un error de permisos"
          },
          "correct": false
        },
        {
          "text": {
            "en": "A shared administrator account also used by the help desk",
            "es": "Una cuenta de administrador compartida que también usa la mesa de ayuda"
          },
          "correct": false
        },
        {
          "text": {
            "en": "A dedicated account with read and write access to the whole filesystem",
            "es": "Una cuenta dedicada con acceso de lectura y escritura a todo el sistema de archivos"
          },
          "correct": false
        }
      ],
      "difficulty": "medium",
      "covers_up_to_slide": 15,
      "topic": "Least privilege",
      "intended_use": "pulse"
    }
  ]
}

The outermost value is that single object, with exactly those four keys:
"schema", "title", "language" and "questions". Nothing wraps it. Do not nest it
under a key such as "bank" or "question_bank", do not return an array at the top
level, and do not add keys of your own. The file must begin with an opening
brace followed by "schema".

Field by field:

"schema"
  Always exactly "tc2007b.bank.v1".

"title"
  A short name for this bank, in both languages. It is a label only.

"language"
  "both", "en" or "es" - it declares which keys you fill.
  Default to "both" unless I tell you otherwise.
  If it is "both", then EVERY prompt and EVERY option carries both an "en" and
  an "es" value, and neither is empty. A single missing Spanish option is
  flagged on import and has to be typed in by hand.
  If it is "en" or "es", write only that one key everywhere and leave the other
  out entirely. Do not include an empty string for the missing language.
  Never put Spanish text under "en" or English text under "es". This is the
  single most common way this file goes silently wrong.
  The two languages must be the same question, with the same correct answer in
  the same position - a translation, not a second, different question. Use
  Mexican academic Spanish and keep technical terms in the form the lecture
  itself uses.

"questions"
  A non-empty array. Each entry has exactly the fields shown above and no
  others.

"prompt"
  The question itself. Hard limit 4000 characters, with "en" and "es" measured
  separately. Aim for far less - about 300.

"options"
  Exactly four, no more and no fewer.
  Every option is an object with a "text" and a "correct" - never a bare string,
  never a plain list of answers. There is no separate "answer", "answer_index"
  or "correct_option" field anywhere in this format; the only thing that marks
  the right answer is "correct" inside the option itself.
  "correct" is the JSON boolean true or false, unquoted. Never the string
  "true", never 1 or 0, never "T" or "yes". A quoted boolean parses as valid
  JSON and then silently marks the question as having no correct answer at all.
  Exactly one option in each question has true; the other three have false.
  Hard limit 2000 characters per option; aim for about 120.

"difficulty"
  "easy", "medium" or "hard". This is not decoration - it sets the countdown on
  the student's phone: easy 20 seconds, medium 30, hard 45. Choose it by how
  long the answer genuinely takes, not by how advanced the topic sounds. A
  question that needs arithmetic on paper is "hard" even when the idea is
  simple. Use a mix across the bank. If you omit it the platform assumes
  "medium".

"covers_up_to_slide"
  A bare number, not text: the last slide of MY deck a student must have seen to
  answer this question. Count slides exactly as they appear in the attachment -
  the first slide is 1. If the attachment prints its own slide numbers, use
  those instead. The platform never sees my slides and cannot check this number;
  it uses it to group the questions for review and to suggest where to pause in
  class. Get it right and the review reads in lecture order.

"topic"
  Two to four words naming the concept, in English, reused verbatim across every
  question about that same concept.

"intended_use"
  "pulse" for a short question I can push mid-lecture, "final" for the
  end-of-class quiz, or "both".

=== 4. BEFORE YOU ANSWER ===

Check each item, then output the JSON block alone:
- every question traces to something actually on a slide of the attachment;
- exactly four options everywhere, each an object, exactly one with the
  unquoted boolean true;
- if "language" is "both", no empty or missing "en" or "es" anywhere;
- no Spanish under "en", no English under "es";
- no backslashes, no double quotes, no Markdown inside any string;
- the top-level object is not wrapped in anything;
- the JSON parses: balanced braces, no trailing commas, nothing truncated;
- one code block, no text around it.`;

const COPIED_MS = 3000;

type CopyState = "idle" | "copied" | "failed";

export function ImportPromptCard() {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const resetTimer = useRef<number | undefined>(undefined);

  // A confirmation that outlives its card would set state on an unmounted
  // component the moment the professor switches tabs mid-countdown.
  useEffect(() => () => clearTimeout(resetTimer.current), []);

  async function onCopy() {
    clearTimeout(resetTimer.current);
    try {
      await navigator.clipboard.writeText(IMPORT_PROMPT);
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
          <h3>{t("import.prompt.title")}</h3>
          <p class="hint">{t("import.prompt.lede")}</p>
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

      <p class="hint">{t("import.prompt.attach")}</p>

      {copyState === "failed" ? (
        <p class="error-text" role="alert">{t("import.prompt.copyFailed")}</p>
      ) : null}

      <pre class="import-prompt-text">{IMPORT_PROMPT}</pre>
    </div>
  );
}
