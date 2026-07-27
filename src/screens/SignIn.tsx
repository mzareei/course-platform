import { useState } from "preact/hooks";
import { config } from "../config";
import { sendOtp, verifyOtp, testSignIn, isEmailAllowedLocally } from "../auth/auth";
import { getSession } from "../api/client";
import { session, refreshContext } from "../state/session";

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
  } catch {}
}

export function SignIn() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  const cleaned = email.trim().toLowerCase();

  async function finishSignIn() {
    session.value = await getSession();
    await refreshContext();
  }

  async function onSend() {
    setMessage(null);
    if (!isEmailAllowedLocally(cleaned)) {
      setMessage({
        kind: "error",
        text: `Use your institutional email (${config.allowedInstitutionalDomains.map((d) => "@" + d).join(" or ")}).`
      });
      return;
    }
    const wait = cooldownRemaining();
    if (wait > 0) {
      setMessage({ kind: "info", text: `A sign-in email was just sent. You can request another in ${Math.ceil(wait / 1000)}s.` });
      return;
    }
    setBusy(true);
    try {
      await sendOtp(cleaned);
      startCooldown();
      setSent(true);
      setMessage({ kind: "info", text: "Check your inbox. Open the link on this device, or type the 6-digit code below." });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Could not send the email." });
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
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "That code didn't work. Check it and try again." });
    } finally {
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
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Test sign-in failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="stack" style="max-width: 30rem; margin: 0 auto; width: 100%;">
      <div>
        <p class="eyebrow">Course Platform</p>
        <h1>Sign in</h1>
        <p class="hint">
          No password. Enter your institutional email and we'll send you a one-time sign-in link.
        </p>
      </div>

      <div class="card">
        <label class="field">
          Institutional email
          <input
            type="email"
            placeholder={`name@${config.allowedInstitutionalDomains[0]}`}
            value={email}
            onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
            autocomplete="email"
            inputmode="email"
          />
        </label>
        <button class="btn primary" type="button" disabled={busy || !cleaned} onClick={onSend}>
          {sent ? "Resend sign-in email" : "Email me a sign-in link"}
        </button>

        {sent ? (
          <>
            <hr class="divider" />
            <label class="field">
              Or type the 6-digit code from the email
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
              Verify code
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
          <h3>Testing mode</h3>
          <p class="hint">
            Email verification is off during the testing period. Rostered students can sign in
            without proving mailbox ownership. This disappears before the semester starts.
          </p>
          <button class="btn" type="button" disabled={busy || !cleaned} onClick={onTestSignIn}>
            Sign in without email (testing)
          </button>
        </div>
      ) : null}
    </div>
  );
}
