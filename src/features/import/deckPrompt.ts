// The step-1 authoring prompt: lecture PPTX/PDF in, one self-contained HTML deck out.
//
// It lives in a .ts file, not beside the step-2 prompt in ImportPromptCard.tsx,
// for one concrete reason: this prompt quotes real slide markup, and
// verify-i18n.mjs scans every .tsx under src/components for JSX text nodes
// matching >some English sentence< . A line like
//   <span class="lang-en">Fraudulent purchases and card fraud</span>
// inside a template literal is indistinguishable from untranslated JSX to that
// regex, and would fail the build. The walker only collects .tsx, so the prompt
// is safe here and the bilingual guard stays strict where it matters.
//
// ---------------------------------------------------------------------------
// PROVENANCE
//
// Adopted on 2026-08-17 from the course owner's own universal lecture prompt,
// verbatim through section 16, replacing the earlier version that spelled the
// slide markup out inline. This version delegates the whole presentation system
// — visual design, controls, bilingual behaviour, progressive reveals, media
// policy, Pulse Check interaction — to a reference deck the professor wrote and
// downloads from the Import tab, rather than describing it in prose.
//
// Section 17 is the one addition, made at his explicit request. His prompt says
// "reproduce the reference file"; the reference file is the design, not the
// contract. The platform reads five markers off a Pulse Check slide to turn it
// into a live phone question, and a model rewriting a slide loses them without
// anything looking wrong on the projector. Section 17 names them, and the
// reference deck served at /TC2007B_Presentation_Style_Reference.html carries
// them on its own Pulse Check slide so the model has a worked example to copy.
// Keep the two in step: verify-content-import asserts the prompt states each
// marker and that the served reference actually carries it.
//
// Also dropped in that swap, and NOT restored: the NEVER CARRY PERSONAL
// IDENTITY ACROSS clause the previous version carried. His prompt has none, and
// adding one was out of scope for adopting his text — so a name on an attached
// lecture's title slide can now reach the generated deck. Step 2 still refuses
// to carry a name into the question bank. verify-content-import asserts the gap
// deliberately, so restoring the clause fails the build until the note goes
// with it.
//
// Source of truth for both prompts: docs/prompts/. The .txt there is this
// string unescaped — regenerate them together, never one alone.
// ---------------------------------------------------------------------------
//
// Paired with IMPORT_PROMPT (step 2) in ImportPromptCard.tsx, which finds the
// pause slides by the "Pulse check" badge and the activity class, copies the
// four .choice options across verbatim, and takes covers_up_to_slide from the
// slide's own data-slide number.

/** Exported so the verifier can assert the contract clauses are still present. */
export const DECK_PROMPT = `# Universal Prompt — Generate a Teaching-First Interactive HTML Lecture

I am attaching two files:

1. **\`TC2007B_Presentation_Style_Reference.html\`** — this is the canonical reference for the presentation's **visual design, controls, navigation, bilingual behavior, progressive click-to-reveal system, preserved-media behavior, Pulse Check interaction, overview/help overlays, and presenter UX**.
2. A new **PPTX/PDF lecture** — this is the primary source of the **actual lecture-specific content, concepts, examples, activities, visuals, terminology, and teaching intent**.

Create a complete classroom-ready standalone HTML lecture.

## Critical separation of roles

Use the reference HTML for **HOW the presentation looks and behaves**.

Use the newly uploaded PPTX/PDF for **WHAT the lecture teaches**.

Do **not** reuse the placeholder subject matter from the reference HTML. Do not let the placeholder slides influence the topic or concepts of the new lecture.

The final lecture should feel like it was built with the same presentation system as the reference file, but its content must come from the new lecture.

---

## 1. Understand the entire lecture before rebuilding it

Inspect the complete uploaded PPTX/PDF before creating the HTML. Review all slides/pages, including text, definitions, examples, analogies, equations, code, diagrams, tables, screenshots, figures, photos, GIFs, questions, activities, humor, references, and transitions.

Determine:

- the major concepts;
- the intended teaching sequence;
- which ideas depend on earlier ideas;
- which examples and visuals are important;
- which slides are introductory, explanatory, interactive, application-oriented, or summary;
- what students should understand by the end.

Do not begin redesigning after reading only part of the lecture.

---

## 2. Preserve my teaching intent

The uploaded lecture is the primary source of what I want to teach.

Do not lose any meaningful concept.

You may improve:

- wording and grammar;
- explanations;
- examples and analogies;
- visual organization;
- slide sequence;
- slide count;
- conceptual comparisons;
- interaction design.

A dense source slide may become multiple HTML slides. Several repetitive slides may be reorganized if no teaching concept is lost.

Do not preserve the original slide count merely for consistency.

Do not remove a concept because it is difficult to present cleanly. Give it more space instead.

---

## 3. Improve the pedagogy when useful

You are explicitly allowed to improve the lecture when doing so genuinely helps students understand the material.

You may:

- clarify confusing explanations;
- improve weak examples;
- introduce a better analogy;
- add a short intermediate explanation that the original lecture assumes;
- explicitly compare concepts students may confuse;
- convert disconnected bullets into a meaningful model or relationship;
- add a second example when it materially improves understanding;
- correct an obvious conceptual or terminology mistake.

However, stay close to the intended scope and academic level. Do not expand the lecture into unrelated material simply because it is relevant to the general subject.

If my original explanation or example is already effective, preserve it.

If something appears factually questionable and correcting it would require substantial outside research, do not silently invent a correction. Preserve the intended teaching concept and mention the uncertainty in your final report if necessary.

---

## 4. Use the reference HTML as the canonical presentation system

Reproduce the presentation behavior and visual language demonstrated by \`TC2007B_Presentation_Style_Reference.html\`.

This includes, at minimum:

- full-viewport 16:9 slide presentation;
- dark theme by default and light-theme option;
- large projection-safe typography;
- top progress bar;
- fixed upper-right controls for fullscreen, overview, EN/ES, theme, and help;
- bottom-center previous/next buttons;
- footer with lecture/course label, current section, and slide number;
- \`click to reveal\` / \`clic para revelar\` hint while hidden fragments remain;
- slide overview overlay;
- help overlay;
- URL hash slide tracking;
- keyboard navigation;
- click navigation;
- touch/swipe navigation;
- localStorage persistence for language and theme;
- responsive and print fallbacks.

Do not redesign the interface into a different presentation system unless absolutely necessary. The goal is visual and behavioral consistency across lectures.

---

## 5. Teaching-first progressive disclosure

This is a live teaching deck, not a static reading document.

Use progressive \`.fragment\` reveals whenever they help control attention.

A forward action should:

1. reveal the next hidden teaching element;
2. stay on the same slide;
3. move to the next slide only when no hidden fragments remain.

A backward action should:

1. hide the most recently revealed fragment;
2. stay on the same slide;
3. move to the previous slide only when no revealed fragments remain.

Good candidates for progressive reveals include:

- bullets;
- stages in a process;
- cards;
- comparison points;
- examples;
- diagram nodes/arrows;
- conclusions;
- equations or derivation steps;
- important takeaways;
- answer explanations.

Do not animate content merely for decoration. Reveals should correspond to how a professor would naturally explain the idea step by step.

---

## 6. Classroom readability

The primary target is a large classroom projector at approximately 1920×1080.

Keep text large and consistent with the reference HTML.

If content does not fit comfortably, split it into additional slides rather than shrinking important text.

Prefer:

- one primary teaching idea per slide;
- generous margins;
- short lines;
- clear visual hierarchy;
- no more than 2–3 major columns;
- large meaningful images and diagrams.

Avoid dense walls of text, tiny tables, tiny screenshots, or excessive numbers of small cards.

---

## 7. Full English / Spanish support

The complete lecture must be bilingual.

English is the default.

Use the same EN/ES interaction demonstrated by the reference file.

Translate all meaningful user-facing content, including:

- titles and subtitles;
- body text;
- cards and labels;
- definitions;
- questions;
- Pulse Checks;
- A/B/C/D options;
- answer explanations;
- activities;
- captions;
- section names;
- final recap;
- any new teaching text you introduce.

Spanish should be natural professional neutral/Mexican Spanish, not literal machine translation.

---

## 8. Pulse Checks — required

For a normal **90–120 minute lecture**, include approximately **5–7 meaningful Pulse Check slides** distributed naturally throughout the lecture.

A Pulse Check is specifically a **short multiple-choice mini-quiz with exactly four options: A, B, C, and D**.

There must be **exactly one best/correct answer**.

Pulse Checks are intended to verify that students have been paying attention and understood the material just taught. They should normally be **easy to moderate**, not difficult exam questions.

### Placement

Do not insert them mechanically after a fixed number of slides.

Place them after meaningful conceptual blocks. As a rough consequence they may often occur every 6–10 slides, but conceptual timing is more important than slide count.

Spread them across the lecture.

If the lecture is unusually short and cannot support five strong questions, use fewer rather than forcing bad questions.

### Content rule

Every Pulse Check must be answerable using **only material that students have already seen earlier in this lecture**.

Do not require future-slide knowledge, outside reading, unrelated trivia, or obscure prior knowledge.

An attentive student should normally be able to answer.

### Question quality

Prefer questions that test:

- recognition of an important concept;
- distinction between related concepts;
- simple application to a scenario;
- interpretation of an example, diagram, process, or result;
- a straightforward conceptual relationship.

The three incorrect options must be plausible distractors based on related concepts, common misunderstandings, reversed relationships, or reasonable but incorrect interpretations.

Do not use silly distractors. Keep all four options reasonably parallel in style and length.

### Interaction behavior

Match the Pulse Check behavior in the reference HTML exactly:

1. show the question and four clickable A/B/C/D options;
2. clicking an option marks it selected but **does not reveal correctness**;
3. the next normal presentation reveal highlights the correct answer in green;
4. if a wrong selected answer exists, highlight it in red;
5. reveal a concise explanation panel.

Existing source questions may count as Pulse Checks if they naturally meet these requirements. Preserve other useful open-ended or discussion questions separately; they do not need to become Pulse Checks.

---

## 9. Examples, analogies, comparisons, and diagrams

When an abstract concept would benefit from a clearer example or analogy, improve it using a familiar context appropriate to the students.

When concepts form a meaningful relationship, consider a simple visual flow, comparison, chain, timeline, or process diagram.

Do not force every idea into the same model. The structure must emerge from the lecture content.

When students are likely to confuse concepts, explicitly compare them using side-by-side cards, X vs. Y layouts, before/after structures, or another clear comparison.

---

## 10. Definitions and technical material

Preserve important formal definitions and terminology.

When useful, show the formal definition followed by a plain-language explanation.

If the lecture contains mathematics, code, algorithms, procedures, or derivations, preserve them accurately. Break complex steps across progressive reveals or additional slides rather than making them unreadably small.

---

## 11. Activities and existing classroom interactions

Preserve meaningful activities from the source lecture.

Present them clearly with elements such as:

- TASK;
- TIME;
- INSTRUCTIONS;
- WHAT TO NOTICE / DISCUSS.

If an activity uses a URL, preserve it and embed a QR code when that meaningfully improves classroom use.

Do not reveal an activity solution before students are supposed to work on it.

Preserve useful humor, personal teaching elements, anecdotes, memes, class rules, acknowledgments, and informal interactions when they contribute to the lecture experience.

---

## 12. Visual fidelity policy — preserve source visuals when necessary

Inspect the source lecture visually.

Meaningful source visuals include, but are not limited to:

- diagrams;
- screenshots;
- photos;
- figures;
- charts;
- illustrations;
- memes;
- historical visuals;
- interface captures;
- animated GIFs.

Use this decision rule:

> **Preserve the source visual unless recreating or replacing it produces an equal or better teaching result with no meaningful loss of information, fidelity, recognizability, behavior, context, or pedagogical intent. When uncertain, preserve the original.**

### Recreate in native HTML/CSS/SVG when appropriate

Rebuild a visual natively only when it is primarily something like:

- boxes and arrows;
- simple flow diagrams;
- structured comparison tables;
- simple labeled charts;
- clean shapes and labels;
- simple callouts.

Only do this when the recreated version is at least as clear, accurate, and readable as the source.

### Preserve the original static image when appropriate

Preserve the original image when it is something like:

- a photo;
- a screenshot;
- a meme;
- a distinctive illustration;
- a historical image;
- a complex chart/figure;
- a figure whose exact appearance matters;
- anything that would lose quality or meaning if redrawn poorly.

If an HTML recreation would look worse, be less precise, or change the teaching meaning, **do not recreate it**. Preserve the original.

### Preserve animated GIFs when motion matters

If the source includes an animated GIF or another animated visual whose motion is part of the teaching value, preserve that animation unless you can replace it with something clearly better.

Do **not** silently flatten an animated GIF into a single static frame when the animation itself demonstrates a process, sequence, behavior, or effect.

### Replacement rule

You may replace a source visual only when the replacement is clearly better and still preserves the same teaching intent.

If the replacement is worse, less faithful, less recognizable, or less precise, preserve the original visual instead.

### Embedding rule

Preserved visuals must still live inside the standalone HTML file.

- Preserve static images as Base64/Data URIs when appropriate.
- Preserve animated GIFs as \`data:image/gif;base64,...\` when appropriate.
- Native diagrams may use HTML/CSS/SVG.

Do not simply convert every source slide into one big image. Rebuild surrounding text and layout natively wherever practical, while preserving the meaningful visual component itself.

Compress or resize responsibly, but do not degrade readability, animation, or important visual detail just to reduce file size.

---

## 13. One completely standalone HTML file

The final deliverable must be one standalone HTML file containing:

- HTML;
- CSS;
- JavaScript;
- English and Spanish content;
- embedded images;
- embedded GIFs when needed;
- inline diagrams;
- presenter interactions.

Do not require external CSS, JavaScript, Google Fonts, CDN libraries, image folders, asset folders, or remote rendering dependencies.

External websites mentioned by the lecture may remain clickable links, but the deck itself must render and function offline.

---

## 14. Final recap

Before the final Questions/Discussion slide, create a concise recap titled approximately:

**What you should leave with today**

Include roughly 3–6 major ideas from the lecture.

Use progressive reveal if helpful.

Then optionally end with a Questions/Discussion slide or reveal.

---

## 15. Verification before delivery

Before giving me the final HTML, verify:

### Content

- the entire source lecture was inspected;
- no meaningful source concept was unintentionally omitted;
- improvements remain within the lecture's intended scope.

### Presentation engine

- one slide active at a time;
- next reveals fragments before advancing;
- previous hides fragments before moving back;
- upper-right controls work;
- bottom navigation works;
- progress bar and footer update;
- reveal hint works;
- overview and help overlays work;
- keyboard/click/swipe navigation exists;
- language/theme persistence works.

### Pulse Checks

- report the number of Pulse Checks and their slide numbers;
- each has exactly A/B/C/D;
- exactly one best answer;
- only previously taught material is tested;
- distractors are plausible;
- selection does not immediately reveal correctness;
- next reveal displays answer feedback and explanation;
- English and Spanish versions are equivalent.

### Visual fidelity

- report how many source visuals were preserved, how many were recreated, and how many were replaced;
- confirm that preserved visuals were embedded inside the HTML;
- confirm that any preserved animated GIFs remain animated rather than flattened into a static frame;
- confirm that visuals were not recreated when the recreation would have reduced fidelity or teaching value.

### Offline / portability

- no required external stylesheets, scripts, fonts, or remote images;
- all required visuals embedded;
- no broken relative asset paths;
- copy the HTML to another directory and confirm it remains self-contained.

### Visual QA

If browser rendering is available, inspect representative slides around 1920×1080, including title, dense concept, progressive reveal, Pulse Check before/after answer, preserved image or GIF example where relevant, activity, and final recap.

Check for overflow, clipping, tiny text, poor contrast, bad alignment, controls covering content, or inconsistent typography.

If browser visual testing is unavailable or fails, state that limitation clearly rather than claiming it passed.

---

## 16. Final response

Do not paste the entire HTML source into the chat unless I explicitly request it.

Create the finished file and give me:

1. the download link;
2. final slide count;
3. number of Pulse Checks and their slide numbers;
4. short summary of the main pedagogical improvements;
5. confirmation of full English/Spanish support;
6. confirmation that required visuals are embedded;
7. confirmation that the file is standalone/offline;
8. a short visual-fidelity summary describing preserved vs recreated vs replaced visuals;
9. verification performed;
10. any verification limitations.

Unless essential information is genuinely missing, **do not stop at a plan**. Analyze the uploaded lecture and produce the completed HTML artifact.

---

## 17. Course-platform markers — reproduce them, never invent your own

The reference HTML carries a small set of class names and attributes that the course platform reads while the class is running. None of them is visible on the projector, and all of them are easy to lose while rewriting a slide. Reproduce every one of them exactly.

### On every slide

- \`class="slide"\`, plus \`title-slide\`, \`section\`, \`activity\`, or \`wrap\` when that applies;
- \`data-slide\`, starting at 1 on the first slide and increasing by exactly 1 with no gaps and no repeats, in document order;
- \`data-section-en\`, \`data-section-es\`, \`data-title-en\`, and \`data-title-es\`.

Exactly one slide carries the class \`active\` at any moment, and the first slide starts with it. The platform finds the professor's position from that class and from \`data-slide\`, so the numbering must be perfect.

### On every Pulse Check slide

A Pulse Check is where the class stops and every student answers on their phone. The platform builds that live question by reading the slide, so all five markers below must be present:

- the slide is \`class="slide activity"\`;
- the badge reads exactly \`Pulse check\` in English and \`Pregunta rapida\` in Spanish, each in its own language span;
- exactly four button elements with class \`choice\`, one per option, in both languages;
- the answer and its explanation sit inside \`<div class="answer-reveal fragment correct">\`, so they stay hidden until you reveal them;
- the slide carries \`data-pause-id\` — a short lowercase slug naming the concept, unique in the deck, words joined by hyphens — together with \`data-pause-topic-en\` and \`data-pause-topic-es\`, a two to four word label for the same concept.

A Pulse Check that loses any of these still looks correct on the projector, and the class silently has nothing to answer.

### Never add these

Never add the attribute \`data-course-deck-engine\` to any element.

Never add the attribute \`data-teaching-slide\` to any slide.

Both belong to a different deck system and will stop the platform from tracking your slides.

### Reachable offline

Keep the whole deck self-contained, exactly as section 13 requires: no link to an external stylesheet or font, no script with a src attribute, no image, video, audio, or iframe loaded from a URL, and no relative paths. The platform rejects a deck that reaches outside itself.

---

# Core principle

> **The reference HTML defines the presentation system. The new PPTX/PDF defines the lecture. Preserve what I teach, improve how I teach it, preserve source visuals when necessary, and produce a complete bilingual interactive standalone HTML deck in the same presentation family.**
`;
