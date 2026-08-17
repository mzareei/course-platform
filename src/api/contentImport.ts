import { callFn } from "./client";
import type { NormalizedQuestion } from "../features/import/questionFile";

export interface DeckProblem {
  kind: "relative" | "forbidden_host" | "undeclared_host" | "no_title";
  reference?: string;
  host?: string;
}

export interface ImportResult {
  bank: { ok: boolean; question_bank_id?: string; error?: string };
  deck: {
    ok: boolean;
    content_item_id?: string;
    error?: string;
    /** Blocking findings — present only when ok is false. */
    problems?: DeckProblem[];
    /** Non-blocking findings, reported alongside a successful import. An
     *  outbound link to an undeclared host lands here rather than in
     *  `problems`: the deck uploads, and the professor is told where it
     *  points. */
    notices?: DeckProblem[];
  };
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
