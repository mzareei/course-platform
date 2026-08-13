// Student sign-in: student ID + a PIN the student chose.
//
// No email is sent at any point, which is the whole reason this exists — the
// project's mailer is capped at 2/hour and tec.mx refuses every third-party
// sender, so a room of thirty students could never be signed in by email.
//
// The server returns a one-time token, which is exchanged here for an ordinary
// Supabase session. Nothing downstream can tell the difference between a session
// obtained this way and one from an emailed code.
import { callFnAnon } from "./client";
import { verifyOtp } from "../auth/auth";

// The rules themselves live in features/auth/pinRules.ts, free of imports, so a
// verifier can load and exercise them directly.
export { isValidPin, pinFailureKey } from "../features/auth/pinRules";
export type { PinFailure, PinFailureKey } from "../features/auth/pinRules";

interface PinResponse {
  email: string;
  otp: string;
  claimed: boolean;
}

/** Returning student, anywhere — no QR code needed. */
export async function signInWithPin(studentIdentifier: string, pin: string) {
  const payload = await callFnAnon<PinResponse>("course-pin-auth", {
    action: "signin",
    student_identifier: studentIdentifier.trim(),
    pin: pin.trim()
  });
  return verifyOtp(payload.email, payload.otp);
}

/**
 * First time only. The join code is required and must belong to a class that is
 * live right now: that is what puts the student physically in the room, and it
 * is the only thing standing between a claim and someone taking a classmate's
 * account. Do not make it optional.
 */
export async function claimPin(
  studentIdentifier: string,
  pin: string,
  joinCode: string
) {
  const payload = await callFnAnon<PinResponse>("course-pin-auth", {
    action: "claim",
    student_identifier: studentIdentifier.trim(),
    pin: pin.trim(),
    join_code: joinCode.trim().toUpperCase()
  });
  return verifyOtp(payload.email, payload.otp);
}
