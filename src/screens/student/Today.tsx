// S1 Today — the student landing screen. Sessions drive this screen; releases
// belong to Review and never determine whether a class exists.
import { context } from "../../state/session";
import { StatusPill } from "../../components/StatusPill";
import { t, locale, formatDay, localDateKey } from "../../i18n";
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

export function Today() {
  const ctx = context.value;
  if (!ctx) return null;

  const today = localDateKey(new Date());
  // Sorted by date so "next class" really is the next one, whatever order the
  // server returned.
  const sessions = [...ctx.student_sessions].sort((a, b) =>
    String(a.planned_date ?? "").localeCompare(String(b.planned_date ?? ""))
  );
  // Kept apart on purpose. A paused class is still the student's class — it
  // continues next session — but telling them it is live sends them to a
  // waiting screen for a room nobody is in.
  const liveSession = sessions.find((session) => session.state === "live");
  const pausedSession = sessions.find((session) => session.state === "paused");
  const activeSession = liveSession ?? pausedSession ?? null;
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
  const currentSession = activeSession ?? todaysSession ?? nextPlanned ?? null;
  const sessionIsLive = Boolean(liveSession && currentSession?.session_id === liveSession.session_id);
  const sessionIsPaused = Boolean(
    pausedSession && currentSession?.session_id === pausedSession.session_id
  );
  // The one exception to "no join button": someone the server already recorded
  // as present. They cannot manufacture an attendance they do not have, because
  // this reads the attendance row, not their intent.
  const canReturnToClass = sessionIsLive && Boolean(liveSession?.checked_in);

  return (
    <div class="stack">
      <div>
        <p class="eyebrow">
          {new Date().toLocaleDateString(locale(), { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1>
          {sessionIsLive
            ? t("today.classLive")
            : sessionIsPaused
              ? t("today.classPaused")
              : t("today.title")}
        </h1>
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
              <p class="eyebrow">
                {sessionIsLive
                  ? t("today.classLive")
                  : sessionIsPaused
                    ? t("today.classPaused")
                    : t("today.nextClass")}
              </p>
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
      {sessionIsPaused ? (
        <div class="card">
          <p class="eyebrow">{t("today.classPaused")}</p>
          <p>{t("today.classPausedBody")}</p>
        </div>
      ) : canReturnToClass ? (
        <div class="card">
          <p class="eyebrow">{t("today.returnToClass")}</p>
          <p>{t("today.returnToClassBody")}</p>
          <a class="btn primary" href="/live">{t("today.returnToClass")}</a>
        </div>
      ) : sessionIsLive ? (
        <div class="card">
          <p class="eyebrow">{t("today.scanToJoin")}</p>
          <p>{t("today.scanToJoinBody")}</p>
        </div>
      ) : null}
    </div>
  );
}
