// Tiny bilingual layer: one signal, one t() function, no dependencies.
//
// Language choice order: what the user picked (stored) → the browser's
// preference → English. The choice is also written to `tc-lang`, the key the
// lecture-deck engine reads, so a deck opened from the app comes up in the same
// language as the app (decks are served same-origin, so they share storage).
import { signal } from "@preact/signals";
import { strings, type StringKey } from "./strings";
import { ApiError } from "../api/client";

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
  // A key that reaches here from server data (difficulty, status, role) may not
  // exist. Rendering the key itself is ugly but visible; throwing white-screens
  // the subtree mid-class.
  if (!pair) return String(key);
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

/**
 * Today (or any Date) as a local-timezone `YYYY-MM-DD` key, for comparing
 * against `planned_date`. `toISOString().slice(0, 10)` is the UTC date — in
 * Monterrey that flips to tomorrow at 6 PM, which once made the professor's
 * "today's class" card vanish during an evening class.
 */
export function localDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Backend error codes that have a bilingual sentence of their own. */
const ERROR_CODE_KEYS: Partial<Record<string, StringKey>> = {
  signed_out: "errors.signedOut",
  request_failed: "errors.requestFailed"
};

/**
 * The one way to turn a caught backend error into user-facing text.
 *
 * The old pattern — `e instanceof Error ? e.message : t(fallback)` — never
 * reached its translated branch, because ApiError extends Error: every backend
 * refusal was shown in the backend's English, even to a Spanish classroom.
 * Here: a known error code gets its translated sentence; otherwise English UI
 * shows the backend's specific sentence, and Spanish UI leads with the Spanish
 * fallback and keeps the specific sentence in parentheses so nothing is lost.
 */
export function apiErrorText(
  error: unknown,
  fallbackKey: StringKey,
  vars?: Record<string, string | number>
): string {
  if (error instanceof ApiError && error.code) {
    const mapped = ERROR_CODE_KEYS[error.code];
    if (mapped) return t(mapped);
  }
  const message = error instanceof Error && error.message ? error.message : "";
  if (!message) return t(fallbackKey, vars);
  return lang.value === "es" ? `${t(fallbackKey, vars)} (${message})` : message;
}

/**
 * Format a calendar date that has no time component (`planned_date` and
 * friends, which Postgres returns as `YYYY-MM-DD`).
 *
 * `new Date("2026-08-04")` parses as **UTC midnight**, so anywhere west of
 * Greenwich — including Monterrey — it renders as the 3rd. Pinning to local
 * noon puts it safely inside the intended day for every timezone on earth.
 * Always use this for a bare date; `new Date(value)` is wrong.
 */
export function formatDay(
  value?: string | null,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const text = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "—";
  return new Date(`${text}T12:00:00`).toLocaleDateString(locale(), options);
}
