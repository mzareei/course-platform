// Passwordless auth, ported from the Gen-2 app's auth-api.js. Identity is the
// institutional email; sign-in only opens the door — course access still requires
// an active roster profile (course-auth-context decides).
import type { Session } from "@supabase/supabase-js";
import { client, callFnAnon } from "../api/client";
import { config } from "../config";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanEmailList(values: unknown[]): string[] {
  const cleaned = (Array.isArray(values) ? values : [])
    .map((entry) => String(entry ?? "").trim().toLowerCase())
    .filter((entry) => EMAIL_PATTERN.test(entry));
  return Array.from(new Set(cleaned));
}

// QA test accounts sign in from outside the institutional domains. Addresses are
// held per device only; the server (COURSE_TEST_EMAILS secret or an external
// access grant) is the real gate and fails closed.
export function testAccessEmails(): string[] {
  let stored: unknown[] = [];
  try {
    stored = JSON.parse(localStorage.getItem(config.testAccessStorageKey) || "[]");
  } catch {
    stored = [];
  }
  return cleanEmailList(Array.isArray(stored) ? stored : []);
}

export function isTestAccessEmail(email: string): boolean {
  const cleaned = email.trim().toLowerCase();
  return Boolean(cleaned) && testAccessEmails().includes(cleaned);
}

export function rememberTestAccessEmail(email: string): void {
  const cleaned = email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(cleaned)) return;
  const next = cleanEmailList([...testAccessEmails(), cleaned]);
  try {
    localStorage.setItem(config.testAccessStorageKey, JSON.stringify(next));
  } catch {
    // Private browsing: the sign-in guard simply stays strict.
  }
}

// Enrolling a device: open the app once as ...?test-access=<email>.
export function captureTestAccessFromUrl(): void {
  const params = new URLSearchParams(location.search);
  const requested = params.get("test-access");
  if (!requested) return;
  rememberTestAccessEmail(requested);
  params.delete("test-access");
  const query = params.toString();
  history.replaceState({}, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
}

export function isInstitutionalEmail(email: string): boolean {
  const cleaned = email.trim().toLowerCase();
  return config.allowedInstitutionalDomains.some((domain) => cleaned.endsWith(`@${domain}`));
}

export function isEmailAllowedLocally(email: string): boolean {
  // Client-side convenience check only; the server re-validates and fails closed.
  return isInstitutionalEmail(email) || isTestAccessEmail(email);
}

function redirectUrl(): string {
  const url = new URL(location.href);
  url.hash = "";
  url.search = "";
  return url.href;
}

export async function sendOtp(email: string): Promise<void> {
  const { error } = await client().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: redirectUrl() }
  });
  if (error) throw error;
}

export async function verifyOtp(email: string, token: string): Promise<Session> {
  const { data, error } = await client().auth.verifyOtp({ email, token, type: "email" });
  if (error) throw error;
  if (!data.session) throw new Error("Sign-in did not produce a session. Try again.");
  return data.session;
}

// Test sign-in trades a rostered address for a one-time token generated server
// side, then verifies it here for an ordinary session. The server refuses unless
// COURSE_TEST_SIGNIN_UNTIL names a future date, and always refuses instructors.
export async function testSignIn(email: string): Promise<Session> {
  const payload = await callFnAnon<{ email?: string; otp?: string }>("course-test-signin", {
    email
  });
  if (!payload.otp) throw new Error("Test sign-in did not return a usable token.");
  return verifyOtp(payload.email || email, payload.otp);
}

export async function signOut(): Promise<void> {
  const { error } = await client().auth.signOut();
  if (error) throw error;
}
