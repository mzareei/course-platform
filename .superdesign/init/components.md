# Shared UI primitives

Framework: Preact with TypeScript. Components use semantic HTML and the shared vanilla CSS classes in `src/styles/app.css`.

## ThemeToggle

- Path: `src/components/ThemeToggle.tsx`
- Theme preference button; no external props.

```tsx
import { useState } from "preact/hooks";
import { config } from "../config";
import { t } from "../i18n";

function currentTheme(): "light" | "dark" {
  const forced = document.documentElement.dataset.theme;
  if (forced === "dark" || forced === "light") return forced;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState(currentTheme());

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(config.themeStorageKey, next);
      // The deck engine reads its own key; keep decks matching the app.
      localStorage.setItem("tc-theme", next);
    } catch {
      // Preference still applies for this session.
    }
    setTheme(next);
  }

  const label = t(theme === "dark" ? "app.themeToLight" : "app.themeToDark");
  return (
    <button class="btn quiet" type="button" onClick={toggle} aria-label={label} title={label}>
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
```

## LanguageToggle

- Path: `src/components/LanguageToggle.tsx`
- English/Spanish preference button; no external props.

```tsx
import { lang, setLang, t } from "../i18n";

export function LanguageToggle() {
  const next = lang.value === "es" ? "en" : "es";
  return (
    <button
      class="btn quiet lang-toggle"
      type="button"
      onClick={() => setLang(next)}
      aria-label={t(next === "es" ? "app.switchToSpanish" : "app.switchToEnglish")}
      title={t(next === "es" ? "app.switchToSpanish" : "app.switchToEnglish")}
    >
      {next === "es" ? "ES" : "EN"}
    </button>
  );
}
```

## StatusPill

- Path: `src/components/StatusPill.tsx`
- Plain-language status badge.
- Props: `state?: string`, `dateHint?: string | null`.

```tsx
// Plain-language status labels in both languages. Students and professors never
// see raw state-machine vocabulary — that lives only in the Advanced drawer.
import { t, locale } from "../i18n";
import type { StringKey } from "../i18n/strings";

const CLASSES: Record<string, string> = {
  draft: "hidden",
  scheduled: "scheduled",
  released: "open",
  live: "live",
  paused: "warn",
  review_only: "review",
  closed: "hidden",
  archived: "hidden",
  planned: "scheduled",
  open: "open",
  continued: "scheduled",
  cancelled: "hidden",
  posted: "open",
  locked: "review",
  missing: "warn",
  excused: "hidden",
  submitted: "open",
  late: "warn",
  started: "scheduled",
  active: "open",
  inactive: "hidden",
  invited: "scheduled",
  revoked: "hidden",
  completed: "hidden",
  merged: "hidden",
  dropped: "warn"
};

export function StatusPill({ state, dateHint }: { state?: string; dateHint?: string | null }) {
  const key = (state || "").toLowerCase();
  const cls = CLASSES[key] ?? "";
  const stringKey = `state.${key}` as StringKey;
  const known = key in CLASSES;

  const text =
    key === "scheduled" && dateHint
      ? t("state.scheduledFor", {
          date: new Date(dateHint).toLocaleDateString(locale(), { month: "short", day: "numeric" })
        })
      : known
        ? t(stringKey)
        : state || "—";

  return <span class={`pill ${cls}`}>{text}</span>;
}
```

