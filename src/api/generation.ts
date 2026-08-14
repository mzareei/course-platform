// The AI pipeline: upload a lecture PDF, watch it become a deck + question
// bank, review what came out, approve it. Nothing reaches students until
// approve() runs, and even then only as a draft release.
import { callFn } from "./client";

export type GenerationMode = "deck_and_bank" | "bank_only";

export type TeachingBrief = {
  generation_mode: GenerationMode;
  instructions: string;
  live_checkpoint_goal: number | null;
  candidates_per_checkpoint: number | null;
  end_quiz_question_goal: number | null;
  checkpoint_preferences: string;
};

export type TeachingPlan = {
  source_pages: Array<{
    source_pdf_page: number;
    topic: string;
    topic_es: string;
    evidence: string;
  }>;
  checkpoints: Array<{
    key: string;
    topic: string;
    source_pdf_pages: number[];
    suggested_after_pdf_page: number | null;
    candidate_goal: number | null;
  }>;
  end_quiz_goal: number | null;
};

export interface GenerationJob {
  id: string;
  generation_mode: GenerationMode;
  status:
    | "queued" | "extracting" | "outlining" | "generating_deck"
    | "generating_questions" | "grounding" | "assembling"
    | "ready_for_plan_review" | "ready_for_review"
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
  "queued", "extracting", "outlining", "generating_deck", "generating_questions", "grounding", "assembling"
];

export function isGenerationInFlight(status: GenerationJob["status"]) {
  return IN_FLIGHT.includes(status);
}

export function hasGenerationProgress(status: GenerationJob["status"]) {
  return isGenerationInFlight(status) || status === "ready_for_plan_review";
}

export function generationReviewCapabilities(mode: GenerationMode) {
  return mode === "deck_and_bank"
    ? {
      showsDeck: true,
      requestsDeckPreview: true,
      showsCheckpointMappings: true,
      createsDraftRelease: true
    }
    : {
      showsDeck: false,
      requestsDeckPreview: false,
      showsCheckpointMappings: false,
      createsDraftRelease: false
    };
}

function requireGenerationJob(job: unknown): GenerationJob {
  const generationMode = (job as { generation_mode?: unknown } | null)?.generation_mode;
  if (generationMode !== "deck_and_bank" && generationMode !== "bank_only") {
    throw new Error("A generation job is missing a valid generation mode.");
  }
  return job as GenerationJob;
}

export async function listJobs() {
  const result = await callFn<{ jobs: unknown[] }>("course-generation", { action: "list_jobs" });
  return { jobs: result.jobs.map(requireGenerationJob) };
}

export function jobStatus(jobId: string) {
  return callFn<{ job: GenerationJob }>("course-generation", { action: "status", job_id: jobId });
}

export function advanceJob(jobId: string) {
  return callFn<{ job: GenerationJob; advanced: boolean }>("course-generation", { action: "advance", job_id: jobId });
}

export function createJob(input: {
  upload_id: string;
  lecture_title: string;
  lecture_slug?: string;
  teaching_brief: TeachingBrief;
}) {
  return callFn<{ job: GenerationJob }>("course-generation", { action: "create_job", ...input });
}

export function reviewPlan(jobId: string) {
  return callFn<{
    job: Pick<GenerationJob, "id" | "status"> & {
      teaching_brief: TeachingBrief;
      proposed_plan: TeachingPlan;
    };
  }>("course-generation", { action: "review_plan", job_id: jobId });
}

export function approvePlan(input: { job_id: string; approved_plan: TeachingPlan }) {
  return callFn<{ job: GenerationJob }>("course-generation", { action: "approve_plan", ...input });
}

export function cancelJob(jobId: string) {
  return callFn<{ job: GenerationJob }>("course-generation", { action: "cancel", job_id: jobId });
}

export function reviewBundle(jobId: string) {
  return callFn<{
    job: GenerationJob & { generation_mode: GenerationMode };
    deck_html: string | null;
    questions: GeneratedQuestion[];
  }>(
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
