// Public platform configuration. Everything here ships to the browser by design:
// the anon key is the publishable key and every table is deny-all to it (RLS on,
// zero policies) — all authorization happens inside the edge functions.
export const config = {
  supabaseUrl: "https://ojmbupftdikwmlqvibwt.supabase.co",
  supabaseAnonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qbWJ1cGZ0ZGlrd21scXZpYnd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2Mzk3MzUsImV4cCI6MjA5NzIxNTczNX0.X05-dMgmvXTiqha_NLnwjPg7UWvd5xoByYmKq29B4M4",

  // Default course while the platform hosts a single course. The admin surface
  // (Phase 5) makes this a per-user course list from course-auth-context.
  defaultCourseId: "tc2007b",

  allowedInstitutionalDomains: ["tec.mx", "itesm.mx"],

  // Testing only. Mirrors the server's COURSE_TEST_SIGNIN_UNTIL gate: this flag
  // alone grants nothing — the server refuses unless the secret names a future
  // date. Set to false before the semester starts.
  testSignIn: true,

  /**
   * "Sign in with Microsoft" — the institutional login students already use.
   *
   * Why this exists at all: emailed codes cannot work here. The built-in mailer
   * is capped at 2/hour for the whole project, and tec.mx publishes
   * `DMARC p=reject`, so no third-party service may send as a tec.mx address.
   * Tec also blocks app passwords and app registration in their own tenant.
   * Letting Microsoft do the verifying is the only route that needs nothing
   * from their IT department and sends no mail at all.
   *
   * Off until the Azure provider is actually configured in Supabase — a button
   * that opens a provider-not-enabled error is worse than no button. Flip this
   * to true in the same change that enables the provider, never before.
   */
  microsoftSignIn: false,

  // Per-device unlock for QA addresses (see qa-test-accounts.md in the old repo).
  testAccessStorageKey: "cp.test-access-emails",
  themeStorageKey: "cp.theme"
} as const;
