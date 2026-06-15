import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

// server/src -> repo root. Lze přepsat přes DATA_ROOT (kvůli budoucímu nasazení).
const repoRoot = path.resolve(here, "..", "..");

export const DATA_ROOT = process.env.DATA_ROOT
  ? path.resolve(process.env.DATA_ROOT)
  : path.join(repoRoot, "data");

export const DISPLAYS_DIR = path.join(DATA_ROOT, "displeje");
export const AUDIT_FILE = path.join(DATA_ROOT, "audit.jsonl");

// Buildnutý web (vzniká přes `npm run build`). Servíruje ho stejný proces.
export const WEB_DIST = path.join(repoRoot, "web", "dist");

export const SLIDE_COUNT = 6;
export const AI_SLIDE = 6;
export const DISPLAY_COUNT = 37;
