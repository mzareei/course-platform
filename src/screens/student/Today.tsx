// S1 Today — the student landing screen. One primary action:
// a live class → "Join class"; otherwise the newest released item.
import { context } from "../../state/session";
import { StatusPill } from "../../components/StatusPill";
import { t, locale } from "../../i18n";
import type { StringKey } from "../../i18n/strings";
import type { ReleaseItem } from "../../api/types";

export function releaseHref(release: ReleaseItem): string {
  // Storage-backed content opens inside the app through the gated viewer.
  if (release.source_kind === "storage_object") return `/view/${release.release_id}`;
  // Legacy public items (until everything is migrated).
  if (release.source_kind === "static_path") {
    return `https://mzareei.github.io/${release.source_ref.replace(/^\//, "")}`;
  }
  if (release.source_kind === "external_url") return release.source_ref;
  return "#";
}

export function releaseTarget(release: ReleaseItem): string | undefined {
  return release.source_kind === "storage_object" ? undefined : "_blank";
}

const TYPE_KEYS: Record<string, StringKey> = {
  lecture: "type.lecture",
  mission: "type.mission",
  quiz_bank: "type.activity",
  activity: "type.activity",
  exit_ticket: "type.exitTicket",
  resource: "type.resource",
  case_file: "type.caseFile"
};

export function describeType(type?: string): string {
  return t(TYPE_KEYS[type ?? ""] ?? "type.material");
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
        <p class="eyebrow">
          {new Date().toLocaleDateString(locale(), { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1>{liveNow.length ? t("today.classLive") : t("today.title")}</h1>
      </div>

      {releases.length === 0 ? (
        <div class="empty-state card">
          <h3>{t("today.emptyTitle")}</h3>
          <p>{t("today.emptyBody")}</p>
        </div>
      ) : (
        <div class="stack">
          {releases.map((release) => (
            <a
              class="card"
              style="text-decoration: none; color: inherit;"
              href={releaseHref(release)}
              target={releaseTarget(release)}
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
          <a class="btn primary" href={releaseHref(newest)} target={releaseTarget(newest)} rel="noreferrer">
            {liveNow.length ? t("today.joinClass") : t("today.open", { title: newest.title })}
          </a>
        </div>
      ) : null}
    </div>
  );
}
