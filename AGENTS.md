# AGENTS.md

Guidance for Codex working in this repository.

## Read the docs first

**`docs/00-START-HERE.md`** is the entry point. The `docs/` folder is the
complete, current handoff — project goal, architecture, design system, decision
log, status, runbook, and a pitfalls file. Read it before making changes or
debugging; it exists so context survives between sessions and agents.

`docs/07-pitfalls.md` in particular documents traps that have already shipped
broken behaviour. Read it before you start debugging anything.

## What this is

The teaching platform for TC2007B (Information Security) at Tecnológico de
Monterrey — Professor Mahdi Zareei's live class software. It shows students the
lecture deck, pushes questions to their phones mid-lecture, runs a timed
end-of-class quiz, collects a written reflection, grades all of it, and
generates a bilingual lecture deck plus its question bank from an uploaded PDF.

**Live:** https://course-platform-3ko.pages.dev

## Two repos — you need both

| | Path | Holds |
|---|---|---|
| This repo | `~/Documents/GitHub/course-platform` | The Vite + TypeScript + Preact SPA |
| Backend | `~/Documents/GitHub/mzareei.github.io` | `supabase/functions/`, `supabase/migrations/`, the public academic site, original lecture decks |

Supabase project ref: `ojmbupftdikwmlqvibwt`.

Frontend deploys on `git push` (Cloudflare Pages). **Edge functions do not** —
deploy them explicitly with `npx supabase functions deploy <name>` from the
other repo.

## Commands

```bash
npm run dev        # local dev server
npm run typecheck  # tsc --noEmit
npm run verify     # three verifier scripts — treat failure as a build failure
npm run build      # typecheck + vite build
```

## Rules that matter most

1. **Test through the real entry points.** Sign in as a student and click from
   the Today screen. Navigating straight to an internal route validates paths a
   real user cannot reach — this shipped a build where students could not join a
   live class at all.
2. **Never render deck HTML with `srcdoc` or `blob:`.** Both inherit the app's
   CSP and silently kill the deck engine. Always go through `/content?t=…`.
   This has bitten twice.
3. **The professor never writes quiz questions.** Every question is generated
   from lecture content. Product rule, not an implementation detail.
4. **Every user-facing string is EN + ES**, added in pairs to
   `src/i18n/strings.ts`. A verifier enforces it.
5. **The browser never queries a table.** RLS is on with zero policies; edge
   functions are the only door.
6. **Read the actual `return json({...})` in an edge function** before trusting
   a TypeScript interface. Cross-service field-name mismatches are invisible to
   the compiler and have shipped several times.

## Keeping the docs current

When you finish something or learn something painful, update `docs/05-status.md`
and `docs/07-pitfalls.md` in the same commit as the work. The professor's stated
goal is being able to swap agents at any moment without losing direction.
