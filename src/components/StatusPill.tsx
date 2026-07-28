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
  revoked: "hidden"
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
