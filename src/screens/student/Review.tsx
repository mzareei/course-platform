// S3 Review — everything already released, grouped for self-study.
import { context } from "../../state/session";
import { StatusPill } from "../../components/StatusPill";
import { t } from "../../i18n";
import type { StringKey } from "../../i18n/strings";
import type { ReleaseItem } from "../../api/types";
import { releaseHref, releaseTarget } from "./Today";

const GROUP_KEYS: Record<string, StringKey> = {
  lecture: "group.lectures",
  mission: "group.missions",
  activity: "group.activities",
  quiz_bank: "group.activities",
  case_file: "group.caseFiles",
  resource: "group.resources"
};

export function Review() {
  const ctx = context.value;
  if (!ctx) return null;

  const reviewable = (ctx.releases ?? [])
    .filter((r) => ["released", "live", "review_only", "paused"].includes(r.state))
    // Legacy standalone activities have no viewer route — see Today.tsx.
    .filter((r) => !(r.content_type === "activity" && r.source_kind === "supabase_record"));

  const byType = new Map<string, ReleaseItem[]>();
  for (const release of reviewable) {
    const key = release.content_type ?? "other";
    byType.set(key, [...(byType.get(key) ?? []), release]);
  }

  const order = ["lecture", "mission", "activity", "quiz_bank", "case_file", "resource", "other"];
  const groups = [...byType.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));

  return (
    <div class="stack">
      <div>
        <p class="eyebrow">{t("review.eyebrow")}</p>
        <h1>{t("review.title")}</h1>
        <p class="hint">{t("review.lede")}</p>
      </div>

      {reviewable.length === 0 ? (
        <div class="empty-state card">
          <h3>{t("review.emptyTitle")}</h3>
          <p>{t("review.emptyBody")}</p>
        </div>
      ) : (
        groups.map(([type, items]) => (
          <section class="stack">
            <h2>{t(GROUP_KEYS[type] ?? "group.other")}</h2>
            {items.map((release) => (
              <a
                class="card"
                style="text-decoration: none; color: inherit;"
                href={releaseHref(release)}
                target={releaseTarget(release)}
                rel="noreferrer"
              >
                <div class="row" style="justify-content: space-between;">
                  <h3>{release.title}</h3>
                  <StatusPill state={release.state} />
                </div>
                {release.summary ? <p class="hint">{release.summary}</p> : null}
              </a>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
