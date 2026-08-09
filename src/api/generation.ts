// The AI pipeline: upload a lecture PDF, watch it become a deck + question
// bank, review what came out, approve it. Nothing reaches students until
// approve() runs, and even then only as a draft release.
import { callFn } from "./client";

export interface GenerationJob {
  id: string;
  status:
    | "queued" | "extracting" | "outlining" | "generating_deck"
    | "generating_questions" | "assembling" | "ready_for_review"
    | "approved" | "failed";
  lecture_title: string | null;
  lecture_slug: string | null;
  content_item_id?: string | null;
  question_bank_id?: string | null;
  error?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface GeneratedOption {
  id: string;
  option_text: string;
  option_text_es: string | null;
  is_correct: boolean;
  position: number;
}

export interface GeneratedQuestion {
  id: string;
  prompt: string;
  prompt_es: string | null;
  difficulty: "easy" | "medium" | "hard";
  segment_key: string | null;
  source_slide_numbers: number[];
  source_slide_start: number | null;
  source_slide_end: number | null;
  checkpoint_after_slide: number | null;
  status: string;
  question_options: GeneratedOption[];
}

/** Statuses where the job is still working — the screen polls while in these. */
export const IN_FLIGHT: GenerationJob["status"][] = [
  "queued", "extracting", "outlining", "generating_deck", "generating_questions", "assembling"
];

export function listJobs() {
  return callFn<{ jobs: GenerationJob[] }>("course-generation", { action: "list_jobs" });
}

export function jobStatus(jobId: string) {
  return callFn<{ job: GenerationJob }>("course-generation", { action: "status", job_id: jobId });
}

export function advanceJob(jobId: string) {
  return callFn<{ job: GenerationJob; advanced: boolean }>("course-generation", { action: "advance", job_id: jobId });
}

export function createJob(input: { upload_id: string; lecture_title: string; lecture_slug?: string }) {
  return callFn<{ job: GenerationJob }>("course-generation", { action: "create_job", ...input });
}

export function cancelJob(jobId: string) {
  return callFn<{ job: GenerationJob }>("course-generation", { action: "cancel", job_id: jobId });
}

export function reviewBundle(jobId: string) {
  return callFn<{ job: GenerationJob; deck_html: string | null; questions: GeneratedQuestion[] }>(
    "course-generation", { action: "review_bundle", job_id: jobId }
  );
}

/** A same-origin URL for the deck preview. Must not be rendered with srcdoc:
 *  that inherits the app's CSP and blocks the deck engine's inline script,
 *  leaving the deck frozen on slide one. */
export function previewUrl(jobId: string) {
  return callFn<{ token: string; expires_in: number }>("course-generation", {
    action: "preview_url", job_id: jobId
  });
}

export function approveJob(jobId: string) {
  return callFn<{ job: GenerationJob }>("course-generation", { action: "approve", job_id: jobId });
}

export function regenerateQuestions(jobId: string) {
  return callFn<{ job: GenerationJob }>("course-generation", { action: "regenerate_questions", job_id: jobId });
}

// ------------------------------------------------------------------ upload
export function createUpload(input: { filename: string; size_bytes: number }) {
  return callFn<{ upload_id: string; path: string; token: string; signed_url: string }>(
    "course-content-upload", { action: "create_upload", ...input }
  );
}

export function confirmUpload(uploadId: string) {
  return callFn<{ upload: { id: string; size_bytes: number; status: string } }>(
    "course-content-upload", { action: "confirm_upload", upload_id: uploadId }
  );
}

/** Mint a signed URL, PUT the file straight to Storage, then confirm it landed.
 *  The file never passes through an edge function, so a large PDF is fine. */
export async function uploadPdf(file: File) {
  const { upload_id, signed_url } = await createUpload({ filename: file.name, size_bytes: file.size });
  const response = await fetch(signed_url, {
    method: "PUT",
    // Match Supabase Storage's uploadToSignedUrl contract. The signed token
    // permits replacement, but Storage still expects the upsert intent header.
    headers: {
      "content-type": "application/pdf",
      "cache-control": "max-age=3600",
      "x-upsert": "true"
    },
    body: file
  });
  if (!response.ok) throw new Error(`Upload failed (${response.status}).`);
  await confirmUpload(upload_id);
  return upload_id;
}
