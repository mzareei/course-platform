// S1 Today — the student landing screen. Sessions drive this screen; releases
// belong to Review and never determine whether a class exists.
import { context } from "../../state/session";
import { StatusPill } from "../../components/StatusPill";
import { t, locale, formatDay } from "../../i18n";
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

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function Today() {
  const ctx = context.value;
  if (!ctx) return null;

  const today = localDateKey(new Date());
  const sessions = ctx.student_sessions;
  const liveSession = sessions.find((session) => ["live", "paused"].includes(session.state));
  const todaysSession = sessions.find(
    (session) =>
      session.planned_date === today &&
      ["planned", "open", "continued"].includes(session.state)
  );
  const nextPlanned = sessions.find(
    (session) =>
      session.planned_date >= today &&
      ["planned", "open", "continued"].includes(session.state)
  );
  const currentSession = liveSession ?? todaysSession ?? nextPlanned ?? null;
  const sessionIsLive = Boolean(liveSession && currentSession?.session_id === liveSession.session_id);

  return (
    <div class="stack">
      <div>
        <p class="eyebrow">
          {new Date().toLocaleDateString(locale(), { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1>{sessionIsLive ? t("today.classLive") : t("today.title")}</h1>
      </div>

      {!currentSession ? (
        <div class="empty-state card">
          <h3>{t("today.emptyTitle")}</h3>
          <p>{t("today.emptyBody")}</p>
        </div>
      ) : (
        <div class={`card student-session-card ${sessionIsLive ? "live" : ""}`}>
          <div class="row" style="justify-content: space-between;">
            <div>
              <p class="eyebrow">{sessionIsLive ? t("today.classLive") : t("today.nextClass")}</p>
              <h2>{currentSession.title}</h2>
            </div>
            <StatusPill state={currentSession.state} />
          </div>
          <p class="hint">
            {t("today.sessionDetails", {
              date: formatDay(currentSession.planned_date, { weekday: "long", month: "long", day: "numeric" }),
              code: currentSession.section_code
            })}
          </p>
          {currentSession.content_title ? (
            <p>{t("today.lecture", { title: currentSession.content_title })}</p>
          ) : null}
        </div>
      )}

      {/*
        No join button, by design. Scanning the QR code on the projector is the
        only way into a live class, because the scan IS the attendance record —
        a button here would let a student "attend" from anywhere and make the
        professor's attendance table describe a room that was never full.
      */}
      {sessionIsLive ? (
        <div class="card">
          <p class="eyebrow">{t("today.scanToJoin")}</p>
          <p>{t("today.scanToJoinBody")}</p>
        </div>
      ) : null}
    </div>
  );
}
