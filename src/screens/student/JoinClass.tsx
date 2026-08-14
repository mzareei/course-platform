import { useEffect, useRef, useState } from "preact/hooks";
import { useLocation } from "preact-iso";
import { ApiError } from "../../api/client";
import { resolveJoinCode } from "../../api/join";
import { rememberJoinedClassSession } from "../../api/session";
import {
  consumeAuthReturnPath,
  saveAuthReturnPath
} from "../../features/auth/returnPath";
import { PinForm } from "../../features/auth/PinForm";
import { t } from "../../i18n";
import {
  context,
  refreshContext,
  refreshSessionAndContext,
  session
} from "../../state/session";
import { SignIn } from "../SignIn";

type JoinIssue = "invalid" | "closed" | "access" | "unknown";

export function JoinClass({ joinCode }: { joinCode?: string }) {
  const { route } = useLocation();
  const signedIn = Boolean(session.value);
  const [issue, setIssue] = useState<JoinIssue | null>(null);
  // The server refuses the scan until this student has chosen a PIN. Held
  // separately from `issue` because it is not a dead end — the form below is
  // the way through it.
  const [pinRequired, setPinRequired] = useState(false);
  const [attempt, setAttempt] = useState(0);
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
        // In-app navigation: context is already fresh, so a full reload would
        // only re-download the app on classroom Wi-Fi at the worst moment.
        if (!cancelled) route("/live");
      })
      .catch((error) => {
        if (cancelled) return;
        // Checked before the plain 409 below, which means "this class is
        // closed" — the two share a status and only the code tells them apart.
        if (error instanceof ApiError && error.code === "pin_required") {
          setPinRequired(true);
        } else if (error instanceof ApiError && [400, 404].includes(error.status)) {
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
    // `attempt` is what re-runs the join after a PIN is claimed: signing in
    // again leaves signedIn and claimed both true, so nothing else in this list
    // changes and the effect would otherwise never fire a second time.
  }, [joinCode, signedIn, claimed, attempt]);

  // Signed out at a QR code is the one moment a student may claim a PIN: the
  // code proves a class is live, which is what puts them in the room. Passing it
  // down is what unlocks the first-time branch of the form.
  if (!signedIn) return <SignIn joinCode={String(joinCode || "").trim()} />;

  // Signed in, in the room, but with no PIN: the students who signed in before
  // PIN sign-in existed, whose old session carried them past the sign-in screen
  // entirely. Claiming re-signs them in as the same person, so the only visible
  // effect is that they now have a PIN — and the join runs again by itself.
  if (pinRequired) {
    return (
      <div class="stack" style="max-width: 30rem; margin: 0 auto; width: 100%;">
        <div>
          <p class="eyebrow">{t("join.eyebrow")}</p>
          <h1>{t("join.pinRequired.title")}</h1>
          <p class="hint">{t("join.pinRequired.body")}</p>
        </div>
        <PinForm
          joinCode={String(joinCode || "").trim()}
          startClaiming
          onSignedIn={async () => {
            await refreshSessionAndContext();
            setPinRequired(false);
            setAttempt((n) => n + 1);
          }}
        />
      </div>
    );
  }

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
