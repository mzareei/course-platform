import { useEffect, useState } from "preact/hooks";
import { ApiError } from "../../api/client";
import { resolveJoinCode } from "../../api/join";
import { rememberJoinedClassSession } from "../../api/session";
import {
  consumeAuthReturnPath,
  saveAuthReturnPath
} from "../../features/auth/returnPath";
import { t } from "../../i18n";
import { refreshContext, session } from "../../state/session";
import { SignIn } from "../SignIn";

type JoinIssue = "invalid" | "closed" | "access" | "unknown";

export function JoinClass({ joinCode }: { joinCode?: string }) {
  const signedIn = Boolean(session.value);
  const [issue, setIssue] = useState<JoinIssue | null>(null);

  useEffect(() => {
    const code = String(joinCode || "").trim();
    if (!signedIn) {
      saveAuthReturnPath(`/join/${code}`);
      return;
    }

    // A magic-link return boots already signed in and bypasses finishSignIn().
    // Consume the stored path here too so it cannot hijack a later sign-in.
    consumeAuthReturnPath();

    let cancelled = false;
    resolveJoinCode(code)
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
  }, [joinCode, signedIn]);

  if (!signedIn) return <SignIn />;

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
