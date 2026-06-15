import { promises as fs } from "node:fs";
import path from "node:path";
import { DISPLAYS_DIR, AI_SLIDE, SLIDE_COUNT } from "./paths.js";

export interface DisplayMeta {
  druh: string;
  stav: "online" | "offline";
  posledniZmena: string;
}

export interface SlideContent {
  n: number;
  nadpis: string;
  text: string;
  obrazky: string[]; // URL do /data
  jeAi: boolean;
}

export interface DisplaySummary {
  id: string;
  druh: string;
  stav: string;
  posledniZmena: string;
  thumbnail: string | null;
}

const IMAGE_EXT = new Set([".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif"]);

export const NEPRIRAZENO = "Nepřiřazeno";

function slideFileName(n: number): string {
  return n === AI_SLIDE ? "kb.md" : "text.md";
}

function slideDir(id: string, n: number): string {
  return path.join(DISPLAYS_DIR, id, "cs", `slide-${n}`);
}

// URL, pod kterou server servíruje soubor z /data.
function dataUrl(...segments: string[]): string {
  return "/data/" + segments.map(encodeURIComponent).join("/");
}

export async function readMeta(id: string): Promise<DisplayMeta | null> {
  try {
    const raw = await fs.readFile(path.join(DISPLAYS_DIR, id, "meta.json"), "utf8");
    return JSON.parse(raw) as DisplayMeta;
  } catch {
    return null;
  }
}

async function writeMeta(id: string, meta: DisplayMeta): Promise<void> {
  await fs.writeFile(
    path.join(DISPLAYS_DIR, id, "meta.json"),
    JSON.stringify(meta, null, 2) + "\n",
    "utf8",
  );
}

// Při každé úpravě obsahu posuneme posledniZmena.
export async function touchDisplay(id: string): Promise<void> {
  const meta = await readMeta(id);
  if (!meta) return;
  meta.posledniZmena = new Date().toISOString();
  await writeMeta(id, meta);
}

async function listImages(id: string, n: number): Promise<string[]> {
  const dir = slideDir(id, n);
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  return files
    .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
    .sort()
    .map((f) => dataUrl("displeje", id, "cs", `slide-${n}`, f));
}

// Rozdělí markdown na nadpis (první "# " řádek) a tělo.
function parseSlideMarkdown(raw: string): { nadpis: string; text: string } {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  if (lines[0]?.startsWith("# ")) {
    const nadpis = lines[0].slice(2).trim();
    const text = lines.slice(1).join("\n").trim();
    return { nadpis, text };
  }
  return { nadpis: "", text: raw.trim() };
}

function serializeSlideMarkdown(nadpis: string, text: string): string {
  const head = nadpis.trim() ? `# ${nadpis.trim()}\n\n` : "";
  return head + text.trim() + "\n";
}

export async function readSlide(id: string, n: number): Promise<SlideContent> {
  const file = path.join(slideDir(id, n), slideFileName(n));
  let nadpis = "";
  let text = "";
  try {
    const raw = await fs.readFile(file, "utf8");
    ({ nadpis, text } = parseSlideMarkdown(raw));
  } catch {
    // Slide ještě nemá obsah (nepřiřazený displej).
  }
  return {
    n,
    nadpis,
    text,
    obrazky: await listImages(id, n),
    jeAi: n === AI_SLIDE,
  };
}

export async function readSlides(id: string): Promise<SlideContent[]> {
  const slides: SlideContent[] = [];
  for (let n = 1; n <= SLIDE_COUNT; n++) {
    slides.push(await readSlide(id, n));
  }
  return slides;
}

export async function writeSlide(
  id: string,
  n: number,
  nadpis: string,
  text: string,
): Promise<void> {
  const dir = slideDir(id, n);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, slideFileName(n)), serializeSlideMarkdown(nadpis, text), "utf8");
  await touchDisplay(id);
}

export async function saveImage(
  id: string,
  n: number,
  filename: string,
  data: Buffer,
): Promise<string> {
  const dir = slideDir(id, n);
  await fs.mkdir(dir, { recursive: true });
  const safe = sanitizeFilename(filename);
  await fs.writeFile(path.join(dir, safe), data);
  await touchDisplay(id);
  return dataUrl("displeje", id, "cs", `slide-${n}`, safe);
}

function sanitizeFilename(name: string): string {
  const base = path.basename(name).replace(/[^\w.\- áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/g, "_");
  return base || `obrazek-${Date.now()}`;
}

export async function listDisplays(): Promise<DisplaySummary[]> {
  let ids: string[];
  try {
    ids = await fs.readdir(DISPLAYS_DIR);
  } catch {
    return [];
  }
  const numeric = ids
    .filter((id) => /^\d+$/.test(id))
    .sort((a, b) => Number(a) - Number(b));

  const out: DisplaySummary[] = [];
  for (const id of numeric) {
    const meta = await readMeta(id);
    if (!meta) continue;
    const firstImages = await listImages(id, 1);
    out.push({
      id,
      druh: meta.druh,
      stav: meta.stav,
      posledniZmena: meta.posledniZmena,
      thumbnail: firstImages[0] ?? null,
    });
  }
  return out;
}

export async function displayExists(id: string): Promise<boolean> {
  return (await readMeta(id)) !== null;
}
