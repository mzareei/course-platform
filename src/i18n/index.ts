// Tiny bilingual layer: one signal, one t() function, no dependencies.
//
// Language choice order: what the user picked (stored) → the browser's
// preference → English. The choice is also written to `tc-lang`, the key the
// lecture-deck engine reads, so a deck opened from the app comes up in the same
// language as the app (decks are served same-origin, so they share storage).
import { signal } from "@preact/signals";
import { strings, type StringKey } from "./strings";

export type Lang = "en" | "es";

const STORAGE_KEY = "cp.lang";
const DECK_STORAGE_KEY = "tc-lang";

function detectLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "es") return stored;
  } catch {
    // Private browsing: fall through to the browser preference.
  }
  const preferred = [navigator.language, ...(navigator.languages || [])];
  return preferred.some((tag) => String(tag).toLowerCase().startsWith("es")) ? "es" : "en";
}

export const lang = signal<Lang>(detectLang());

/** Keep the deck engine in step with the app, including on first load. */
function syncDeckLang(next: Lang) {
  try {
    localStorage.setItem(DECK_STORAGE_KEY, next);
  } catch {
    // Nothing to sync when storage is unavailable; the deck falls back to English.
  }
}
syncDeckLang(lang.value);

export function setLang(next: Lang) {
  lang.value = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // The choice still applies for this session.
  }
  syncDeckLang(next);
  document.documentElement.lang = next;
}

document.documentElement.lang = lang.value;

/**
 * Translate a key, optionally interpolating {placeholders}.
 * Reading `lang.value` here is what makes components re-render on a switch.
 */
export function t(key: StringKey, vars?: Record<string, string | number>): string {
  const pair = strings[key];
  const text = (lang.value === "es" ? pair[1] : pair[0]) || pair[0];
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    name in vars ? String(vars[name]) : match
  );
}

/** Locale tag for Intl / toLocaleDateString. */
export function locale(): string {
  return lang.value === "es" ? "es-MX" : "en-US";
}
