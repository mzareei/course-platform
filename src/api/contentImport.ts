import { callFn } from "./client";
import type { NormalizedQuestion } from "../features/import/questionFile";

export interface DeckProblem {
  kind: "relative" | "forbidden_host" | "undeclared_host" | "no_title";
  reference?: string;
  host?: string;
}

export interface ImportResult {
  bank: { ok: boolean; question_bank_id?: string; error?: string };
  deck: { ok: boolean; content_item_id?: string; error?: string; problems?: DeckProblem[] };
}

export async function importContent(input: {
  course_id?: string;
  bank?: {
    content_slug: string;
    title: string;
    title_es: string | null;
    questions: NormalizedQuestion[];
  };
  deck?: {
    slug: string;
    title: string;
    title_es: string | null;
    html: string;
    external_links: string[];
  };
}): Promise<ImportResult> {
  return callFn("course-content-import", { action: "import_content", ...input });
}
