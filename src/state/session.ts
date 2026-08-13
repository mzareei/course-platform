// Global session + course context state. One load on boot, one surface decision.
import { signal, computed } from "@preact/signals";
import type { Session } from "@supabase/supabase-js";
import { client, callFn, getSession } from "../api/client";
import { apiErrorText } from "../i18n";
import type { CourseContext, Role } from "../api/types";

export const session = signal<Session | null>(null);
export const context = signal<CourseContext | null>(null);
export const booting = signal(true);
export const contextError = signal<string | null>(null);

export type Surface = "student" | "instructor" | "admin";

export const activeRoles = computed<Role[]>(() =>
  (context.value?.memberships ?? [])
    .filter((m) => m.status === "active")
    .map((m) => m.role)
);

/** The surface a person lands on. No role picker: highest role decides, and
 *  instructors can still open the student surface explicitly. */
export const surface = computed<Surface>(() => {
  const roles = activeRoles.value;
  if (roles.includes("platform_owner") || roles.includes("instructor") || roles.includes("teaching_assistant")) {
    return "instructor";
  }
  return "student";
});

export const isTeacher = computed(() => surface.value === "instructor");
export const isOwner = computed(() => activeRoles.value.includes("platform_owner"));

export async function refreshContext(): Promise<void> {
  contextError.value = null;
  if (!session.value) {
    context.value = null;
    return;
  }
  try {
    context.value = await callFn<CourseContext>("course-auth-context");
  } catch (error) {
    context.value = null;
    contextError.value = apiErrorText(error, "errors.courseLoadFailed");
  }
}

export async function refreshSessionAndContext(): Promise<void> {
  session.value = await getSession();
  await refreshContext();
}

export async function boot(): Promise<void> {
  booting.value = true;
  try {
    await refreshSessionAndContext();
  } finally {
    booting.value = false;
  }
  // Keep the signal in sync with token refreshes / magic-link redemptions.
  client().auth.onAuthStateChange((_event, next) => {
    const hadSession = Boolean(session.value);
    session.value = next;
    if (Boolean(next) !== hadSession) void refreshContext();
  });
}
