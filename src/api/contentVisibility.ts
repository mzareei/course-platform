const REVIEW_TYPES = new Set(["lecture", "mission", "case_file", "resource"]);

export type StudentDelivery = "viewer" | "external" | "live_only" | "internal";

export function studentDelivery(item: {
  content_type: string;
  source_kind: string;
  source_ref?: string | null;
}): StudentDelivery {
  if (["activity", "quiz_bank"].includes(item.content_type) || item.source_kind === "supabase_record") {
    return ["activity", "quiz_bank"].includes(item.content_type) ? "live_only" : "internal";
  }
  if (item.source_kind === "storage_object" && REVIEW_TYPES.has(item.content_type)) return "viewer";
  if (item.source_kind === "external_url" && REVIEW_TYPES.has(item.content_type)) return "external";
  return "internal";
}

export function canReleaseToReview(item: {
  content_type: string;
  source_kind: string;
  source_ref?: string | null;
}) {
  return ["viewer", "external"].includes(studentDelivery(item));
}
