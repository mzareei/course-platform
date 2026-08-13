import { useEffect, useRef, useState } from "preact/hooks";
import { ApiError } from "../../api/client";
import { resolveJoinCode } from "../../api/join";
import { rememberJoinedClassSession } from "../../api/session";
import {
  consumeAuthReturnPath,
  saveAuthReturnPath
} from "../../features/auth/returnPath";
import { t } from "../../i18n";
import { context, refreshContext, session } from "../../state/session";
import { SignIn } from "../SignIn";

type JoinIssue = "invalid" | "closed" | "access" | "unknown";

export function JoinClass({ joinCode }: { joinCode?: string }) {
  const signedIn = Boolean(session.value);
  const [issue, setIssue] = useState<JoinIssue | null>(null);
  const claimed = Boolean(context.value);
  const retried = useRef(false);

  useEffect(() => {
    const code = String(joinCode || "").trim();
    if (!signedIn) {
      saveAuthReturnPath(`/join/${code}`);
      return;
    }
    // course-auth-context is what links a brand-new account to its rostered
    // profile. The server claims it too now, but a browser still holding an
    // older bundle would race it and be told it is in the wrong group.
    if (!claimed) return;

    // A magic-link return boots already signed in and bypasses finishSignIn().
    // Consume the stored path here too so it cannot hijack a later sign-in.
    consumeAuthReturnPath();

    let cancelled = false;
    resolveJoinCode(code)
      .catch(async (error) => {
        const unclaimed =
          error instanceof ApiError && error.status === 403 && !retried.current;
        if (!unclaimed || cancelled) throw error;
        retried.current = true;
        await refreshContext();
        return resolveJoinCode(code);
      })
      .then(async (joined) => {
        if (cancelled) return;
        rememberJoinedClassSession(joined.session_id);
        await refreshContext();
        if (!cancelled) location.href = "/live";
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof ApiError && [400, 404].includes(error.status)) {
          setIssue("invalid");
        } else if (error instanceof ApiError && error.status === 409) {
          setIssue("closed");
        } else if (error instanceof ApiError && error.status === 403) {
          setIssue("access");
        } else {
          setIssue("unknown");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [joinCode, signedIn, claimed]);

  // Signed out at a QR code is the one moment a student may claim a PIN: the
  // code proves a class is live, which is what puts them in the room. Passing it
  // down is what unlocks the first-time branch of the form.
  if (!signedIn) return <SignIn joinCode={String(joinCode || "").trim()} />;

  if (issue) {
    return (
      <div class="card">
        <p class="eyebrow">{t("join.eyebrow")}</p>
        <h2>{t(`join.${issue}.title`)}</h2>
        <p class="hint">{t(`join.${issue}.body`)}</p>
        <a class="btn" href="/">{t("join.back")}</a>
      </div>
    );
  }

  return (
    <div class="empty-state card" role="status">
      <p class="eyebrow">{t("join.eyebrow")}</p>
      <h2>{t("join.loading.title")}</h2>
      <p>{t("join.loading.body")}</p>
    </div>
  );
}
