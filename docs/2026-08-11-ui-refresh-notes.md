# UI refresh — 2026-08-11

Redesign pass over `src/styles/app.css` using the `ui-ux-pro-max` skill's
Quick Reference checklist (accessibility, touch/interaction, elevation,
motion, forms). Scope was **CSS-only, zero markup/logic changes** — see
"How to revert" below.

## Why not a palette swap

Running `--design-system` against this product generated an
"Exaggerated Minimalism" spa/wellness system (teal `#0D9488`, Lora/Raleway,
"avoid dark modes"). That's a different design system, not a fit here:
`docs/03-design-system.md` explicitly directs "calm, institutional,
legible... nothing decorative... restraint is the aesthetic," this app has a
working, real dark mode students and the professor use in a lecture hall, and
the tokens are intentionally shared with `course-platform-task-4-...` "so the
two generations don't look like different products during the transition."
Swapping the palette would have fought the product brief and broken visual
continuity with the sibling app. So this pass applied the skill's **rules**
(contrast, touch targets, motion timing, state clarity, elevation
consistency) to the *existing* token system instead of replacing it.

## What changed (all in `src/styles/app.css`)

- **`--border-strong` contrast raised** (light 1.6:1 → 2.0:1, dark 1.95:1 →
  2.74:1 against surface-1). Card/input/button outlines were nearly invisible
  in bright light — the exact condition this app is used in (a lit lecture
  hall + phone glare).
- **Fixed a dormant theming bug**: `.run-deck-warning` referenced
  `var(--warning, #d6a52f)` — `--warning` was never defined anywhere in the
  token system (the real token is `--warn`), so this rule always silently
  fell back to a hardcoded color that never adapted to dark mode. Now uses
  `var(--warn)`.
- **Fixed a dormant hover bug**: `.btn.danger` had no `:hover` rule of its
  own, so at equal CSS specificity `.btn:hover`'s generic
  `background: var(--surface-2)` never actually painted over the
  danger-red background in practice — the danger button had no real hover
  feedback. Added `.btn.danger:hover` (fills solid red, matches how
  `.btn.primary:hover` already behaves).
- **Press feedback** (`transform: scale(0.98)` on `:active`) added to `.btn`
  and `.pulse-choice.tappable` — per the skill's Touch & Interaction
  checklist ("press feedback" / "scale-feedback", 44px+ targets already were
  fine). Respects the existing global `prefers-reduced-motion` kill switch.
- **`touch-action: manipulation`** added to buttons, pulse choices, and
  bottom-nav links to cut the ~300ms mobile tap delay — this app is used on
  phones mid-lecture, so tap latency matters more than most products.
- **Table row hover** added to `table.data` (used by Gradebook, People,
  Question Banks) for scannability on long rosters.
- **Nav-tab hover state** added (`.nav-tabs a:hover`) — previously only the
  active tab had any visual state; hovering an inactive tab did nothing.
- **Form inputs**: added a hover border state and an explicit
  `:focus-visible` border-color change, so keyboard/mouse users get feedback
  before/without relying solely on the focus ring.
- **New tokens**: `--shadow-lg` (light+dark) for the one place that had a
  hardcoded, non-themed shadow; `--ease-press` (100ms) for the new press
  transforms, kept short and distinct from the existing 160ms `--ease`.
- **Small polish**: `::selection` uses `--primary-soft` instead of the
  browser default; anchor `:hover` darkens to `--primary-strong`;
  `--good` nudged `#15803d` → `#157a3d` (its `-soft` pairing was 4.45:1,
  a rounding hair under the 4.5:1 AA line).

Verified: `npm run typecheck`, `npm run verify` (26/26), `npm run build` all
pass unchanged. No component `.tsx` file was touched, no class name was
added, renamed, or removed — every existing selector still matches exactly
what it matched before.

## How to revert

A full backup of the pre-redesign file is at
`.design-backup/app.css` (gitignored, won't ship). Also:

```bash
# Everything in this pass is on its own branch — switch back to see the app
# exactly as it was before any of this:
git checkout main

# Or, to discard just the CSS change on this branch:
git checkout main -- src/styles/app.css

# Or restore explicitly from the backup file:
cp .design-backup/app.css src/styles/app.css
```

Branch for this work: `design/ui-redesign-2026-08-11`. `main` is untouched.

---

## Functionality-improvement notes (not implemented — observations only)

These came up while reading `app.css`, the components, and
`docs/07-pitfalls.md` during the pass. Flagging them separately since they'd
touch component logic/markup, which was out of scope for a "don't affect
functionality" pass.

1. **Animated `width` on progress bars.** `.progress-fill` and
   `.pulse-bar-fill` both transition `width`, which the skill's performance
   rules flag (layout-triggering property; prefer `transform: scaleX()`).
   Low real-world impact here (small, isolated elements, not per-frame), but
   if either bar ever gets choppy on a low-end classroom Chromebook, this is
   the first thing to change — it requires updating the inline `style`
   props in the TSX that set the width, not just the CSS.

2. **`.btn.danger:hover` was effectively dead code before this pass** (see
   above) — worth a quick grep for other same-specificity state rules
   (`.foo` + `.foo:hover` defined out of the order you'd expect) elsewhere in
   the file; I only found this one but didn't do an exhaustive sweep.

3. **No loading/disabled visual on the primary action while a request is
   in flight**, beyond whatever each screen does individually — `.btn:disabled`
   has an opacity dim but I didn't see a shared spinner treatment in
   `app.css`. Given "Loading buttons: disable during async + show spinner"
   is a CRITICAL-tier rule in the skill's checklist, and this app is full of
   async actions (send OTP, start quiz, end class, generate deck), a single
   shared `.btn.loading` treatment (small inline spinner + disabled state)
   might be worth it instead of each screen hand-rolling its own — but that's
   a component-level change I didn't make.

4. **`docs/07-pitfalls.md` is worth a read before touching any of the above**
   — the repo's own docs mention traps that have shipped broken behavior
   before; I read `03-design-system.md` for this pass but did not
   re-verify against the full pitfalls file since this pass never touched
   markup or logic.

5. **Toast/empty-state/error patterns**: the skill's Forms & Feedback
   checklist calls for `aria-live` regions on form errors and auto-dismiss on
   toasts. I didn't audit every screen for this — worth a follow-up pass if
   you want an accessibility-focused (not visual) review next.
