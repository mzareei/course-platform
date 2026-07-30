import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";
import { config } from "../config";

let supabase: SupabaseClient | null = null;

export function client(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
  }
  return supabase;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function getSession(): Promise<Session | null> {
  const { data, error } = await client().auth.getSession();
  if (error) throw error;
  return data.session;
}

/**
 * Call an edge function with the signed-in user's token. Every backend function
 * follows the same contract: POST, JSON body with an optional `action`, Bearer
 * user JWT, role checks done server-side against course_memberships.
 */
export async function callFn<T = unknown>(
  name: string,
  body: Record<string, unknown> = {}
): Promise<T> {
  const session = await getSession();
  if (!session) throw new ApiError("You are signed out. Sign in again to continue.", 401);

  const response = await fetch(`${config.supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ course_id: config.defaultCourseId, ...body })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorPayload = payload as { error?: string; error_code?: string };
    throw new ApiError(
      errorPayload.error || `The request to ${name} failed.`,
      response.status,
      errorPayload.error_code
    );
  }
  return payload as T;
}

/** Call an edge function with only the anon key (pre-session flows: test sign-in). */
export async function callFnAnon<T = unknown>(
  name: string,
  body: Record<string, unknown> = {}
): Promise<T> {
  const response = await fetch(`${config.supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.supabaseAnonKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ course_id: config.defaultCourseId, ...body })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorPayload = payload as { error?: string; error_code?: string };
    throw new ApiError(
      errorPayload.error || `The request to ${name} failed.`,
      response.status,
      errorPayload.error_code
    );
  }
  return payload as T;
}
