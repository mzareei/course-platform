// S1 Today — the student landing screen. One primary action:
// a live class → "Join class"; otherwise the newest released item.
import { context } from "../../state/session";
import { StatusPill } from "../../components/StatusPill";
import { t, locale } from "../../i18n";
import type { StringKey } from "../../i18n/strings";
import type { ReleaseItem } from "../../api/types";
import { canReleaseToReview } from "../../api/contentVisibility";

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

  // Task 2 will make Today session-driven. Until the context returns student
  // sessions independently, do not let whole-course Review materials appear
  // here: only releases assigned to a class session belong on Today.
  const classReleases = (ctx.releases ?? [])
    .filter((r) => ["released", "live", "review_only"].includes(r.state))
    .filter((r) => Boolean(r.class_session_id));
  // A card needs a real delivery route. Activities and question banks remain
  // live-only even when their release record is visible to the student shell.
  const releases = classReleases.filter((release) => canReleaseToReview(release));
  // A class is "live" per the class SESSION, not the release row — a
  // release can sit in "released" state the whole time the session runs.
  // /live itself (Live.tsx) already keys off session_state; Today must
  // match it, or "Join class" never appears even mid-class. Checked against
  // every class-session release (not just displayable material), so a live
  // class is never hidden because its only associated record is live-only.
  const sessionIsLive = classReleases.some((r) => ["live", "paused"].includes(r.session_state || ""));
  const newest = releases[releases.length - 1];

  return (
    <div class="stack">
      <div>
        <p class="eyebrow">
          {new Date().toLocaleDateString(locale(), { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1>{sessionIsLive ? t("today.classLive") : t("today.title")}</h1>
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

      {sessionIsLive ? (
        <div class="action-dock">
          <a class="btn primary" href="/live">{t("today.joinClass")}</a>
        </div>
      ) : newest ? (
        <div class="action-dock">
          <a class="btn primary" href={releaseHref(newest)} target={releaseTarget(newest)} rel="noreferrer">
            {t("today.open", { title: newest.title })}
          </a>
        </div>
      ) : null}
    </div>
  );
}
