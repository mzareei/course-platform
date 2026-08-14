// Where the backend repo (mzareei/mzareei.github.io) lives, for verifiers that
// read its migrations and edge functions.
//
// On this machine it sits beside this repo, so `../mzareei.github.io` works.
// CI checks it out into a path of its own choosing and announces it in
// COURSE_PLATFORM_BACKEND_ROOT. A verifier that hardcodes the sibling path
// passes here and either crashes or silently skips there — so every verifier
// asks this module instead.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const frontendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

export const backendRoot = process.env.COURSE_PLATFORM_BACKEND_ROOT
  ? path.resolve(process.env.COURSE_PLATFORM_BACKEND_ROOT)
  : path.resolve(frontendRoot, "../mzareei.github.io");

// An absolute path, so it does not matter what directory the verifier ran from.
export const backendPath = (relative) => path.join(backendRoot, relative);

// For dynamic import(), which needs a URL rather than a path.
export const backendUrl = (relative) => pathToFileURL(backendPath(relative));

export const hasBackend = (relative = "supabase/functions/_shared") =>
  existsSync(backendPath(relative));

// A verifier that needs the backend and cannot find it says so and stops,
// rather than crashing on ENOENT halfway through its checks.
export function skipWithoutBackend(verifierName, relative) {
  if (hasBackend(relative)) return false;
  console.log(
    `${verifierName}: backend repo not checked out at ${backendRoot}, skipping`
  );
  return true;
}
