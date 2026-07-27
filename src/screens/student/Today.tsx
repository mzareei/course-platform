// S1 Today — the student landing screen. One primary action:
// a live class → "Join class"; otherwise the newest released item.
import { context } from "../../state/session";
import { StatusPill } from "../../components/StatusPill";
import type { ReleaseItem } from "../../api/types";

export function releaseHref(release: ReleaseItem): string {
  // Phase 1: static_path items still live on the public site.
  // Phase 2 replaces this with the gated Storage viewer.
  if (release.source_kind === "static_path") {
    return `https://mzareei.github.io/${release.source_ref.replace(/^\//, "")}`;
  }
  if (release.source_kind === "external_url") return release.source_ref;
  return "#";
}

export function describeType(type?: string): string {
  switch (type) {
    case "lecture": return "Lecture deck";
    case "mission": return "Practice mission";
    case "quiz_bank":
    case "activity": return "Graded activity";
    case "exit_ticket": return "Reflection";
    case "resource": return "Resource";
    case "case_file": return "Case file";
    default: return "Material";
  }
}

export function Today() {
  const ctx = context.value;
  if (!ctx) return null;

  const releases = (ctx.releases ?? []).filter((r) =>
    ["released", "live", "review_only"].includes(r.state)
  );
  const liveNow = releases.filter((r) => r.state === "live");
  const newest = liveNow[0] ?? releases[releases.length - 1];

  return (
    <div class="stack">
      <div>
        <p class="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
        <h1>{liveNow.length ? "Class is live" : "Today"}</h1>
      </div>

      {releases.length === 0 ? (
        <div class="empty-state card">
          <h3>Nothing released yet</h3>
          <p>
            When your professor releases materials or starts a class, they appear here.
            You don't need to do anything else.
          </p>
        </div>
      ) : (
        <div class="stack">
          {releases.map((release) => (
            <a
              class="card"
              style="text-decoration: none; color: inherit;"
              href={releaseHref(release)}
              target="_blank"
              rel="noreferrer"
            >
              <div class="row" style="justify-content: space-between;">
                <h3>{release.title}</h3>
                <StatusPill state={release.state} dateHint={release.opens_at} />
              </div>
              <p class="hint">
                {describeType(release.content_type)}
                {release.summary ? ` — ${release.summary}` : ""}
              </p>
            </a>
          ))}
        </div>
      )}

      {newest ? (
        <div class="action-dock">
          <a class="btn primary" href={releaseHref(newest)} target="_blank" rel="noreferrer">
            {liveNow.length ? "Join class" : `Open: ${newest.title}`}
          </a>
        </div>
      ) : null}
    </div>
  );
}
