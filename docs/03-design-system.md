# Design system and UI rules

The entire design system is one file: **`src/styles/app.css`**. There is no
Tailwind, no CSS-in-JS, no component library. Add to that file; don't introduce
a second styling mechanism.

## Design direction

Calm, institutional, legible. This is a tool someone operates in front of a
lecture hall and a student squints at on a phone — not a landing page. Nothing
decorative. Restraint is the aesthetic.

The tokens were ported from the previous course app so the two generations don't
look like different products during the transition.

## Colour

Defined as custom properties on `:root` in `app.css`. **Never hardcode a colour
in a component** — always use a token.

- Surfaces: `--surface` (page), `--surface-1` (card), `--surface-2`,
  `--surface-3`
- Text: `--text`, `--text-muted`, `--text-subtle`, `--text-onfill`
- Brand: `--primary` (blue `#2563eb`), `--primary-strong`, `--primary-soft`,
  and `--accent` (teal `#0a6f65`) for eyebrows and progress
- Semantic: `--good`, `--warn`, `--danger`, each with a `-soft` companion

Semantic colour is separate from the accent and is only used to mean something
(correct / warning / destructive).

## Theming contract

Three layers, and the order matters:

1. `:root` holds **light** tokens (the default).
2. `@media (prefers-color-scheme: dark)` applies dark — but scoped
   `:root:not([data-theme="light"])`, so an explicit user choice wins over the OS.
3. `:root[data-theme="dark"]` / `[data-theme="light"]` always wins.

`ThemeToggle` writes `data-theme` on `<html>` and persists it. The lecture decks
keep their own separate keys (`tc-theme`, `tc-lang`) because they are standalone
documents; the app mirrors `cp.lang` into `tc-lang` so a deck opens in the same
language as the app.

**Any new component must work in both themes.** Style through tokens and this is
free; hardcode a colour and you have broken one of them.

## Typography

- `--font-sans`: Inter, then system fallbacks. `--font-mono` for code and the
  language toggle.
- `h1` 1.6rem / 750 weight (1.9rem above 720px), `h2` 1.2rem, `h3` 1rem.
- Headings get `text-wrap: balance`.
- `.eyebrow` — 0.7rem, uppercase, letter-spaced, `--accent`. Used above a page
  title to say what kind of screen this is.
- `.hint` — muted 0.9rem, the workhorse for secondary text.
- Use `font-variant-numeric: tabular-nums` wherever digits line up (`td.num`).

## Layout primitives

Compose from these rather than writing new layout CSS:

- `.shell` — the page container (max 1080px, bottom padding for the phone dock)
- `.stack` — vertical flex with a gap. The default for almost everything.
- `.row` — horizontal flex, wraps, gap
- `.grid-2` — auto-fitting columns, min 240px
- `.card` / `.card.muted` — the standard content container
- `.table-scroll` + `table.data` — wide tables scroll **inside their own
  container**; the page body must never scroll sideways
- `.action-dock` — the one primary action on student phones, fixed to the bottom
  with safe-area padding

Spacing comes from flex/grid `gap`, not per-element margins.

## Components

- **Buttons:** `.btn`, `.btn.primary` (the one main action), `.btn.quiet`
  (tertiary/links), `.btn.danger` (irreversible). Minimum 44px tall — these are
  tapped in a lecture hall.
- **`.btn.loading`** — add it (plus `aria-busy`) to any button whose request is
  in flight; it appends a small spinner ring after the busy label. Keep the
  text swap ("Signing in…") — the ring supplements it, never replaces it.
- **`StatusPill`** — never render a raw state string. It maps machine states to
  plain language.
- **`.pill`** — `live` (in progress), `warn`, `hidden` (neutral/finished).
- **`.pulse-choice.tappable`** — the big answer targets. `.selected` marks the
  student's choice; `.correct` is only ever applied after a reveal.
- **`.progress-track` / `.progress-fill`** — generation progress.

## UI rules (the "dumb-proofing contract")

These are product rules, not preferences:

1. **One primary action per screen.** On a student phone it lives in
   `.action-dock`.
2. **No state-machine vocabulary in the default UI.** Not `review_only`,
   `paused`, `activity_instance`. Say "Open now", "Class ended", "Quiz closed".
3. **Destructive confirms name their consequences.** "Ending the class closes
   any open question and any running quiz, and students can no longer join."
4. **Empty states teach.** "Drop your first lecture PDF above to see how it
   works" — never a bare "No data".
5. **Progress is described in human terms.** "Reading the PDF", "Writing
   questions" — not `generating_deck`.
6. **Students never navigate during class.** The screen follows the professor.
7. **No role picker.** Routing comes from `course-auth-context`.

## Copy voice

Plain, warm, specific. Write from the user's side of the screen.

- A control says exactly what happens: "Start the quiz", "End the class".
- Errors explain what went wrong and what to do. No apologies, no blame.
- Reassure where a user might think they broke something: "Nothing is wrong with
  your sign-in — access opens the moment you're added."
- Prefer the concrete: "6 easy · 6 medium · 6 hard" beats "18 questions".

## Bilingual rules — non-negotiable

Every user-facing string lives in `src/i18n/strings.ts` as an
`["English", "Español"]` pair. Spanish targets a Mexican university audience;
avoid "usted" in favour of the neutral imperative that reads naturally on a
button.

- Add strings **in pairs**. `tools/verify-i18n.mjs` fails the build on a missing
  or copy-pasted translation, on drifting `{placeholders}`, and on hardcoded
  English in a screen.
- `t("key", { name: value })` interpolates.
- Currently ~1,140 string pairs.
- **Known gap:** content *titles* come from the database and are English only.
  Translating them needs a `content_items.title_es` column.

### Inside lecture decks

Decks use a different mechanism — a `data-es="…"` attribute holding the Spanish
HTML, swapped by the deck engine.

- In hand-authored decks: use single quotes for nested tag attributes and
  typographic quotes (`" "` `¿` `¡`) inside `data-es`. A straight `"` closes the
  attribute and breaks the slide.
- In **generated** decks this is handled for you: `deck.ts` escapes text and
  double-escapes ampersands for the attribute layer, because the value survives
  two decode passes (HTML attribute parse, then `innerHTML`).

## Accessibility baseline

- Visible focus (`:focus-visible` → `--ring`).
- `prefers-reduced-motion` disables animation globally; honour it in new CSS.
- Errors are `role="alert"`, status messages `role="status"`.
- Decorative elements get `aria-hidden`.
- Tap targets ≥44px.

## Lecture deck content rules

For decks (hand-authored and generated alike), from the professor:

- **Enrich, don't transcribe.** Add examples, analogies, and debate-sparking
  discussion questions ("which is worse, a false accept or a false reject?").
- Recreate diagrams as clean web-native visuals; drop decorative clipart. Never
  reproduce textbook figures verbatim.
- No "≈ 2-hour session" pill on the title slide.
- Quiz answers stay hidden behind a click.
- Never invent facts, figures or citations. Flag uncertain numbers with a
  figure-note.
