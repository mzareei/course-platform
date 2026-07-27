// S3 Review — everything already released, grouped for self-study.
import { context } from "../../state/session";
import { StatusPill } from "../../components/StatusPill";
import type { ReleaseItem } from "../../api/types";

function releaseHref(release: ReleaseItem): string {
  const item = release.content_item;
  if (!item) return "#";
  if (item.source_kind === "static_path") {
    return `https://mzareei.github.io/${item.source_ref.replace(/^\//, "")}`;
  }
  if (item.source_kind === "external_url") return item.source_ref;
  return "#";
}

export function Review() {
  const ctx = context.value;
  if (!ctx) return null;

  const reviewable = (ctx.releases ?? []).filter((r) =>
    ["released", "live", "review_only", "paused"].includes(r.effective_state || r.state)
  );

  const byType = new Map<string, ReleaseItem[]>();
  for (const release of reviewable) {
    const key = release.content_item?.content_type ?? "other";
    byType.set(key, [...(byType.get(key) ?? []), release]);
  }

  const order = ["lecture", "mission", "activity", "quiz_bank", "case_file", "resource", "other"];
  const groups = [...byType.entries()].sort(
    (a, b) => order.indexOf(a[0]) - order.indexOf(b[0])
  );

  return (
    <div class="stack">
      <div>
        <p class="eyebrow">Self-study</p>
        <h1>Review</h1>
        <p class="hint">Everything your professor has released stays here for you to revisit.</p>
      </div>

      {reviewable.length === 0 ? (
        <div class="empty-state card">
          <h3>Nothing to review yet</h3>
          <p>Released lectures and practice missions collect here after each class.</p>
        </div>
      ) : (
        groups.map(([type, items]) => (
          <section class="stack">
            <h2>{groupTitle(type)}</h2>
            {items.map((release) => (
              <a
                class="card"
                style="text-decoration: none; color: inherit;"
                href={releaseHref(release)}
                target="_blank"
                rel="noreferrer"
              >
                <div class="row" style="justify-content: space-between;">
                  <h3>{release.content_item?.title ?? "Material"}</h3>
                  <StatusPill state={release.effective_state || release.state} />
                </div>
              </a>
            ))}
          </section>
        ))
      )}
    </div>
  );
}

function groupTitle(type: string): string {
  switch (type) {
    case "lecture": return "Lectures";
    case "mission": return "Practice missions";
    case "activity":
    case "quiz_bank": return "Activities";
    case "case_file": return "Case files";
    case "resource": return "Resources";
    default: return "Other materials";
  }
}
