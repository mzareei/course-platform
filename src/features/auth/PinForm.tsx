// The student's whole sign-in, in one form.
//
// Two modes, because there are exactly two moments in a student's life here:
// the first class, where they choose a PIN while standing in the room, and
// every class after, where they just use it.
//
// Defined at module scope. A component defined inside another gets a new
// identity on every render and remounts its subtree — which on a screen that
// re-renders would wipe what the student has typed. See pitfalls #4.
import { useState } from "preact/hooks";
import { isValidPin, pinFailureKey } from "./pinRules";
import { claimPin, signInWithPin } from "../../api/pinAuth";
import { ApiError } from "../../api/client";
import { t } from "../../i18n";

export function PinForm({
  joinCode,
  startClaiming = false,
  onSignedIn
}: {
  /** Present only when the student arrived by scanning a live class QR code.
   *  Without it there is no way to claim a PIN — by design. */
  joinCode?: string;
  /** Open straight into the choose-a-PIN branch. Set when the server has
   *  already said this student has no PIN, so the form does not ask them to
   *  type one they have never chosen and then explain why it was wrong. */
  startClaiming?: boolean;
  onSignedIn: () => void | Promise<void>;
}) {
  const canClaim = Boolean(joinCode);
  const [claiming, setClaiming] = useState(startClaiming && canClaim);
  const [studentId, setStudentId] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = studentId.trim().length > 0 && isValidPin(pin);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      if (claiming && joinCode) {
        await claimPin(studentId, pin, joinCode);
      } else {
        await signInWithPin(studentId, pin);
      }
      await onSignedIn();
    } catch (cause) {
      const code = cause instanceof ApiError ? cause.code : undefined;
      setError(t(pinFailureKey(code)));
      // Send them to the other mode when the server says which one they need,
      // rather than leaving them to work it out from an error message.
      if (code === "pin_not_set" && canClaim) setClaiming(true);
      if (code === "pin_already_set") setClaiming(false);
      setBusy(false);
    }
  }

  return (
    // A real <form> so the phone keyboard's Go/Enter key submits — without it
    // a student has to dismiss the keyboard and find the button.
    <form
      class="card stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && ready) void submit();
      }}
    >
      {claiming ? (
        <div>
          <h2>{t("pin.firstTimeTitle")}</h2>
          <p class="hint">{t("pin.firstTimeBody")}</p>
        </div>
      ) : null}

      <label class="field">
        {t("pin.studentId")}
        <input
          type="text"
          inputmode="text"
          autocomplete="username"
          autocapitalize="characters"
          placeholder="A01234567"
          value={studentId}
          onInput={(e) => setStudentId((e.target as HTMLInputElement).value)}
        />
        <span class="hint">{t("pin.studentIdHint")}</span>
      </label>

      <label class="field">
        {claiming ? t("pin.choosePin") : t("pin.pin")}
        <input
          // Numeric keypad on a phone, and the digits stay hidden from whoever
          // is sitting next to them.
          type="password"
          inputmode="numeric"
          autocomplete={claiming ? "new-password" : "current-password"}
          maxLength={6}
          placeholder="••••••"
          value={pin}
          onInput={(e) =>
            setPin((e.target as HTMLInputElement).value.replace(/[^0-9]/g, ""))}
        />
        {claiming ? <span class="hint">{t("pin.choosePinHint")}</span> : null}
      </label>

      <button class={`btn primary${busy ? " loading" : ""}`} type="submit" disabled={busy || !ready} aria-busy={busy}>
        {busy
          ? t("pin.signingIn")
          : claiming
            ? t("pin.setAndJoin")
            : t("pin.signIn")}
      </button>

      {error ? <p class="error-text" role="alert">{error}</p> : null}

      {!claiming ? (
        <p class="hint">
          {t("pin.forgotHint")}
          {canClaim ? "" : ` ${t("pin.firstTimeHint")}`}
        </p>
      ) : null}

      {/* Only offered with a live class code in hand. Off the QR path there is
          nothing to switch to, and offering it would promise something the
          server will refuse. */}
      {canClaim ? (
        <button
          class="btn quiet"
          type="button"
          disabled={busy}
          onClick={() => {
            setClaiming(!claiming);
            setError(null);
          }}
        >
          {claiming ? t("pin.haveAPin") : t("pin.needAPin")}
        </button>
      ) : null}
    </form>
  );
}
