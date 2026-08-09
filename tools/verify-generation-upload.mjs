import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/api/generation.ts", import.meta.url), "utf8");

assert.match(
  source,
  /"x-upsert"\s*:\s*"true"/,
  "signed PDF uploads must request Storage upsert support"
);
assert.match(
  source,
  /"cache-control"\s*:\s*"max-age=3600"/,
  "signed PDF uploads must send the normal Storage cache header"
);

console.log("verify-generation-upload: OK");
