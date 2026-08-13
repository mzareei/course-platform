import { useState } from "preact/hooks";
import { config } from "../config";
import {
  finishSignIn,
  sendOtp,
  signInWithMicrosoft,
  verifyOtp,
  testSignIn,
  isEmailAllowedLocally
} from "../auth/auth";
import { classifySendFailure } from "../features/auth/signInErrors";
import { t } from "../i18n";

const COOLDOWN_KEY = "cp.auth-send-cooldown";
const COOLDOWN_MS = 60_000;

function cooldownRemaining(): number {
  try {
    const until = Number(localStorage.getItem(COOLDOWN_KEY) || 0);
    return Math.max(0, until - Date.now());
  } catch {
    return 0;
  }
}

function startCooldown() {
  try {
    localStorage.setItem(COOLDOWN_KEY, String(Date.now() + COOLDOWN_MS));
  } catch {
    // Without storage the server's own rate limit still applies.
  }
}

export function SignIn() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  const cleaned = email.trim().toLowerCase();

  async function onSend() {
    setMessage(null);
    if (!isEmailAllowedLocally(cleaned)) {
      setMessage({
        kind: "error",
        text: t("signIn.invalidEmail")
      });
      return;
    }
    const wait = cooldownRemaining();
    if (wait > 0) {
      setMessage({ kind: "info", text: t("signIn.cooldown", { seconds: Math.ceil(wait / 1000) }) });
      return;
    }
    setBusy(true);
    try {
      await sendOtp(cleaned);
      startCooldown();
      setSent(true);
      setMessage({ kind: "info", text: t("signIn.sent") });
    } catch (error) {
      const failure = classifySendFailure(error);
      if (failure.kind === "rateLimited") {
        // The code box stays hidden until a send succeeds, which locks out the
        // student whose email *did* arrive while a classmate's request was the
        // one refused. A rate limit is the one failure where that is wrong.
        setSent(true);
        setMessage({
          kind: "error",
          text: failure.seconds
            ? t("signIn.rateLimitedWait", { seconds: failure.seconds })
            : t("signIn.rateLimitedBusy")
        });
        return;
      }
      setMessage({
        kind: "error",
        text: failure.message || t("signIn.sendFailed")
      });
    } finally {
      setBusy(false);
    }
  }

  async function onVerify() {
    setMessage(null);
    setBusy(true);
    try {
      await verifyOtp(cleaned, code.trim());
      await finishSignIn();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : t("signIn.codeFailed")
      });
    } finally {
      setBusy(false);
    }
  }

  async function onMicrosoft() {
    setMessage(null);
    setBusy(true);
    try {
      // Redirects away on success, so there is no "finished" state to handle.
      await signInWithMicrosoft();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : t("signIn.microsoftFailed")
      });
      setBusy(false);
    }
  }

  async function onTestSignIn() {
    setMessage(null);
    setBusy(true);
    try {
      await testSignIn(cleaned);
      await finishSignIn();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : t("signIn.testFailed")
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="stack" style="max-width: 30rem; margin: 0 auto; width: 100%;">
      <div>
        <p class="eyebrow">{t("signIn.eyebrow")}</p>
        <h1>{t("signIn.title")}</h1>
        <p class="hint">
          {t(config.microsoftSignIn ? "signIn.ledeMicrosoft" : "signIn.lede")}
        </p>
      </div>

      {/* First, and on its own, because it is the route that actually works for
          a full class: nothing is emailed, so no rate limit applies. The email
          code below stays for accounts outside the university — QA students and
          invited instructors — who have no Microsoft account to use. */}
      {config.microsoftSignIn ? (
        <div class="card">
          <button
            class="btn primary"
            type="button"
            disabled={busy}
            onClick={() => void onMicrosoft()}
          >
            {t("signIn.microsoft")}
          </button>
          <p class="hint">{t("signIn.microsoftBody")}</p>
        </div>
      ) : null}

      <div class="card">
        {config.microsoftSignIn ? (
          <p class="eyebrow">{t("signIn.otherWays")}</p>
        ) : null}
        <label class="field">
          {t("signIn.emailLabel")}
          <input
            type="email"
            placeholder="name@example.com"
            value={email}
            onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
            autocomplete="email"
            inputmode="email"
          />
        </label>
        <button class="btn primary" type="button" disabled={busy || !cleaned} onClick={onSend}>
          {sent ? t("signIn.resend") : t("signIn.send")}
        </button>

        {sent ? (
          <>
            <hr class="divider" />
            <label class="field">
              {t("signIn.codeLabel")}
              <input
                type="text"
                inputmode="numeric"
                autocomplete="one-time-code"
                placeholder="123456"
                value={code}
                onInput={(e) => setCode((e.target as HTMLInputElement).value)}
              />
            </label>
            <button class="btn" type="button" disabled={busy || code.trim().length < 6} onClick={onVerify}>
              {t("signIn.verify")}
            </button>
          </>
        ) : null}

        {message ? (
          <p class={message.kind === "error" ? "error-text" : "hint"} role="status">
            {message.text}
          </p>
        ) : null}
      </div>

      {config.testSignIn ? (
        <div class="card muted">
          <h3>{t("signIn.testTitle")}</h3>
          <p class="hint">{t("signIn.testBody")}</p>
          <button class="btn" type="button" disabled={busy || !cleaned} onClick={onTestSignIn}>
            {t("signIn.testButton")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
