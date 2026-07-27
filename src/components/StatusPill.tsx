// Plain-language status labels. Students and professors never see raw
// state-machine vocabulary — that lives only in the Advanced drawer.
const LABELS: Record<string, { text: string; cls: string }> = {
  draft: { text: "Hidden", cls: "hidden" },
  scheduled: { text: "Scheduled", cls: "scheduled" },
  released: { text: "Open now", cls: "open" },
  live: { text: "Live", cls: "live" },
  paused: { text: "Paused", cls: "warn" },
  review_only: { text: "Review only", cls: "review" },
  closed: { text: "Closed", cls: "hidden" },
  archived: { text: "Archived", cls: "hidden" },
  planned: { text: "Planned", cls: "scheduled" },
  open: { text: "Open", cls: "open" },
  continued: { text: "Continued", cls: "scheduled" },
  cancelled: { text: "Cancelled", cls: "hidden" },
  posted: { text: "Posted", cls: "open" },
  locked: { text: "Final", cls: "review" },
  missing: { text: "Missing", cls: "warn" },
  excused: { text: "Excused", cls: "hidden" },
  submitted: { text: "Submitted", cls: "open" },
  started: { text: "In progress", cls: "scheduled" },
  active: { text: "Active", cls: "open" },
  inactive: { text: "Inactive", cls: "hidden" },
  invited: { text: "Invited", cls: "scheduled" },
  revoked: { text: "Revoked", cls: "hidden" }
};

export function StatusPill({ state, dateHint }: { state?: string; dateHint?: string | null }) {
  const key = (state || "").toLowerCase();
  const label = LABELS[key] ?? { text: state || "—", cls: "" };
  const text =
    key === "scheduled" && dateHint
      ? `Scheduled for ${new Date(dateHint).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
      : label.text;
  return <span class={`pill ${label.cls}`}>{text}</span>;
}
