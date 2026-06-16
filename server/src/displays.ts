import { promises as fs } from "node:fs";
import path from "node:path";
import { DISPLAYS_DIR, AI_SLIDE } from "./paths.js";

// Pořadí slidů i pořadí fotek držíme v meta.json (pole `slidy`), zatímco
// samotná existence slidu a souborů je dána strukturou složek na disku.
// Když `slidy` chybí (starší data), odvodíme strukturu z disku a při první
// strukturální změně se sama dopíše do meta.json.

export interface SlideMeta {
  klic: string; // např. "slide-1" = název složky slidu
  ai: boolean; // AI slide (kb.md pro chatbota)
  obrazky: string[]; // názvy souborů v pořadí
  video: string | null; // název video souboru
}

export interface DisplayMeta {
  druh: string;
  stav: "online" | "offline";
  posledniZmena: string;
  slidy?: SlideMeta[];
}

export interface SlideContent {
  n: number; // číselný klíč slidu (složka slide-<n>), používá se v routách
  nadpis: string;
  text: string;
  obrazky: string[]; // URL do /data v pořadí
  video: string | null; // URL do /data nebo null
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
const VIDEO_EXT = new Set([".mp4", ".webm", ".m4v", ".mov", ".ogg"]);

export const NEPRIRAZENO = "Nepřiřazeno";

function klicToN(klic: string): number {
  const m = /^slide-(\d+)$/.exec(klic);
  return m ? Number(m[1]) : NaN;
}

function nToKlic(n: number): string {
  return `slide-${n}`;
}

function displayDir(id: string): string {
  return path.join(DISPLAYS_DIR, id);
}

function csDir(id: string): string {
  return path.join(displayDir(id), "cs");
}

function slideDirByKlic(id: string, klic: string): string {
  return path.join(csDir(id), klic);
}

function slideDir(id: string, n: number): string {
  return slideDirByKlic(id, nToKlic(n));
}

// URL, pod kterou server servíruje soubor z /data.
function dataUrl(...segments: string[]): string {
  return "/data/" + segments.map(encodeURIComponent).join("/");
}

function slideFileUrl(id: string, klic: string, soubor: string): string {
  return dataUrl("displeje", id, "cs", klic, soubor);
}

export async function readMeta(id: string): Promise<DisplayMeta | null> {
  try {
    const raw = await fs.readFile(path.join(displayDir(id), "meta.json"), "utf8");
    return JSON.parse(raw) as DisplayMeta;
  } catch {
    return null;
  }
}

async function writeMeta(id: string, meta: DisplayMeta): Promise<void> {
  await fs.writeFile(
    path.join(displayDir(id), "meta.json"),
    JSON.stringify(meta, null, 2) + "\n",
    "utf8",
  );
}

// Při každé úpravě obsahu posuneme posledniZmena (nemění strukturu slidů).
export async function touchDisplay(id: string): Promise<void> {
  const meta = await readMeta(id);
  if (!meta) return;
  meta.posledniZmena = new Date().toISOString();
  await writeMeta(id, meta);
}

// --- Čtení struktury z disku ---

async function listSlideKlice(id: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(csDir(id), { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && /^slide-\d+$/.test(e.name))
      .map((e) => e.name)
      .sort((a, b) => klicToN(a) - klicToN(b));
  } catch {
    return [];
  }
}

async function diskImages(id: string, klic: string): Promise<string[]> {
  try {
    const files = await fs.readdir(slideDirByKlic(id, klic));
    return files.filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()));
  } catch {
    return [];
  }
}

async function diskVideos(id: string, klic: string): Promise<string[]> {
  try {
    const files = await fs.readdir(slideDirByKlic(id, klic));
    return files.filter((f) => VIDEO_EXT.has(path.extname(f).toLowerCase()));
  } catch {
    return [];
  }
}

async function hasKb(id: string, klic: string): Promise<boolean> {
  try {
    await fs.access(path.join(slideDirByKlic(id, klic), "kb.md"));
    return true;
  } catch {
    return false;
  }
}

async function isAiSlide(id: string, klic: string): Promise<boolean> {
  if (klicToN(klic) === AI_SLIDE) return true;
  return hasKb(id, klic);
}

// Sloučí pořadí z meta s realitou na disku pro jeden slide.
async function reconcileSlide(
  id: string,
  klic: string,
  sm: SlideMeta | null,
): Promise<SlideMeta> {
  const disk = await diskImages(id, klic);
  const diskSet = new Set(disk);
  const ordered: string[] = [];
  const seen = new Set<string>();
  if (sm?.obrazky) {
    for (const f of sm.obrazky) {
      if (diskSet.has(f) && !seen.has(f)) {
        ordered.push(f);
        seen.add(f);
      }
    }
  }
  // Soubory přetažené ručně do složky (nejsou v meta) přidáme na konec.
  for (const f of disk.sort()) {
    if (!seen.has(f)) {
      ordered.push(f);
      seen.add(f);
    }
  }

  let video: string | null = null;
  const videos = await diskVideos(id, klic);
  if (sm?.video && videos.includes(sm.video)) {
    video = sm.video;
  } else if (videos.length > 0) {
    video = videos.sort()[0];
  }

  const ai = sm?.ai ?? (await isAiSlide(id, klic));
  return { klic, ai, obrazky: ordered, video };
}

// Normalizovaný seznam slidů: pořadí z meta, doplněné o složky na disku.
async function resolveSlides(id: string, meta: DisplayMeta): Promise<SlideMeta[]> {
  const diskKlice = await listSlideKlice(id);
  const diskSet = new Set(diskKlice);
  const out: SlideMeta[] = [];
  const seen = new Set<string>();

  for (const sm of meta.slidy ?? []) {
    if (!sm || typeof sm.klic !== "string") continue;
    if (!diskSet.has(sm.klic) || seen.has(sm.klic)) continue;
    out.push(await reconcileSlide(id, sm.klic, sm));
    seen.add(sm.klic);
  }
  for (const klic of diskKlice) {
    if (seen.has(klic)) continue;
    out.push(await reconcileSlide(id, klic, null));
    seen.add(klic);
  }
  return out;
}

// Centrální mutace: načte, normalizuje, nechá callback upravit, zapíše zpět.
async function mutateDisplay(
  id: string,
  fn: (slides: SlideMeta[], meta: DisplayMeta) => SlideMeta[] | void,
): Promise<void> {
  const meta = await readMeta(id);
  if (!meta) throw new Error("Displej nenalezen.");
  let slides = await resolveSlides(id, meta);
  const res = fn(slides, meta);
  if (Array.isArray(res)) slides = res;
  meta.slidy = slides;
  meta.posledniZmena = new Date().toISOString();
  await writeMeta(id, meta);
}

// --- Markdown obsah slidu ---

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

// AI slide čteme/zapisujeme jako celé kb.md (kurátor edituje celou znalostní bázi).
async function readSlideText(
  id: string,
  klic: string,
  ai: boolean,
): Promise<{ nadpis: string; text: string }> {
  const file = path.join(slideDirByKlic(id, klic), ai ? "kb.md" : "text.md");
  try {
    const raw = await fs.readFile(file, "utf8");
    if (ai) return { nadpis: "", text: raw.replace(/\r\n/g, "\n").replace(/\n+$/, "") };
    return parseSlideMarkdown(raw);
  } catch {
    return { nadpis: "", text: "" };
  }
}

async function toContent(id: string, sm: SlideMeta): Promise<SlideContent> {
  const { nadpis, text } = await readSlideText(id, sm.klic, sm.ai);
  return {
    n: klicToN(sm.klic),
    nadpis,
    text,
    obrazky: sm.obrazky.map((f) => slideFileUrl(id, sm.klic, f)),
    video: sm.video ? slideFileUrl(id, sm.klic, sm.video) : null,
    jeAi: sm.ai,
  };
}

export async function readSlides(id: string): Promise<SlideContent[]> {
  const meta = await readMeta(id);
  if (!meta) return [];
  const slides = await resolveSlides(id, meta);
  return Promise.all(slides.map((sm) => toContent(id, sm)));
}

export async function displayExists(id: string): Promise<boolean> {
  return (await readMeta(id)) !== null;
}

export async function slideExists(id: string, n: number): Promise<boolean> {
  try {
    const st = await fs.stat(slideDir(id, n));
    return st.isDirectory();
  } catch {
    return false;
  }
}

// --- Zápis textu slidu (obsah i AI znalostní báze) ---

export async function writeSlide(
  id: string,
  n: number,
  nadpis: string,
  text: string,
): Promise<void> {
  const klic = nToKlic(n);
  const dir = slideDirByKlic(id, klic);
  await fs.mkdir(dir, { recursive: true });
  if (await isAiSlide(id, klic)) {
    const body = text.replace(/\r\n/g, "\n");
    await fs.writeFile(path.join(dir, "kb.md"), body.endsWith("\n") ? body : body + "\n", "utf8");
  } else {
    await fs.writeFile(path.join(dir, "text.md"), serializeSlideMarkdown(nadpis, text), "utf8");
  }
  await touchDisplay(id);
}

// --- Fotky ---

function sanitizeFilename(name: string): string {
  const base = path
    .basename(name)
    .replace(/[^\w.\- áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/g, "_");
  return base || `soubor-${Date.now()}`;
}

export async function saveImage(
  id: string,
  n: number,
  filename: string,
  data: Buffer,
): Promise<string> {
  const klic = nToKlic(n);
  const dir = slideDirByKlic(id, klic);
  await fs.mkdir(dir, { recursive: true });
  const safe = sanitizeFilename(filename);
  await fs.writeFile(path.join(dir, safe), data);
  await mutateDisplay(id, (slides) => {
    const s = slides.find((x) => x.klic === klic);
    if (s && !s.obrazky.includes(safe)) s.obrazky.push(safe);
  });
  return slideFileUrl(id, klic, safe);
}

export async function deleteImage(id: string, n: number, filename: string): Promise<boolean> {
  const klic = nToKlic(n);
  const safe = path.basename(filename);
  if (!IMAGE_EXT.has(path.extname(safe).toLowerCase())) return false;
  try {
    await fs.unlink(path.join(slideDirByKlic(id, klic), safe));
  } catch {
    // Soubor už neexistuje, jen vyčistíme meta.
  }
  await mutateDisplay(id, (slides) => {
    const s = slides.find((x) => x.klic === klic);
    if (s) s.obrazky = s.obrazky.filter((f) => f !== safe);
  });
  return true;
}

export async function reorderImages(id: string, n: number, poradi: string[]): Promise<void> {
  const klic = nToKlic(n);
  const wanted = poradi.map((p) => path.basename(p));
  await mutateDisplay(id, (slides) => {
    const s = slides.find((x) => x.klic === klic);
    if (!s) return;
    const current = new Set(s.obrazky);
    const next = wanted.filter((f) => current.has(f));
    // Cokoliv, co kurátor nevyjmenoval, necháme na konci ve stávajícím pořadí.
    for (const f of s.obrazky) if (!next.includes(f)) next.push(f);
    s.obrazky = next;
  });
}

// --- Video ---

export async function saveVideo(
  id: string,
  n: number,
  filename: string,
  data: Buffer,
): Promise<string> {
  const klic = nToKlic(n);
  const dir = slideDirByKlic(id, klic);
  await fs.mkdir(dir, { recursive: true });
  // Jedno video na slide: starší soubory odstraníme.
  for (const old of await diskVideos(id, klic)) {
    try {
      await fs.unlink(path.join(dir, old));
    } catch {
      // ignore
    }
  }
  let safe = sanitizeFilename(filename);
  if (!VIDEO_EXT.has(path.extname(safe).toLowerCase())) safe = `${safe}.mp4`;
  await fs.writeFile(path.join(dir, safe), data);
  await mutateDisplay(id, (slides) => {
    const s = slides.find((x) => x.klic === klic);
    if (s) s.video = safe;
  });
  return slideFileUrl(id, klic, safe);
}

export async function deleteVideo(id: string, n: number): Promise<void> {
  const klic = nToKlic(n);
  for (const v of await diskVideos(id, klic)) {
    try {
      await fs.unlink(path.join(slideDirByKlic(id, klic), v));
    } catch {
      // ignore
    }
  }
  await mutateDisplay(id, (slides) => {
    const s = slides.find((x) => x.klic === klic);
    if (s) s.video = null;
  });
}

// --- Správa slidů ---

export async function addSlide(id: string): Promise<number> {
  const klice = await listSlideKlice(id);
  const nums = klice.map(klicToN).filter((x) => Number.isFinite(x));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  const klic = nToKlic(next);
  const dir = slideDirByKlic(id, klic);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "text.md"), "", "utf8");
  await mutateDisplay(id, (slides) => {
    if (!slides.some((s) => s.klic === klic)) {
      slides.push({ klic, ai: false, obrazky: [], video: null });
    }
  });
  return next;
}

export async function removeSlide(id: string, n: number): Promise<{ ok: boolean; chyba?: string }> {
  const klic = nToKlic(n);
  if (await isAiSlide(id, klic)) {
    return { ok: false, chyba: "AI slide nelze odebrat." };
  }
  const klice = await listSlideKlice(id);
  if (klice.length <= 1) {
    return { ok: false, chyba: "Displej musí mít aspoň jeden slide." };
  }
  if (!klice.includes(klic)) {
    return { ok: false, chyba: "Slide nenalezen." };
  }
  await fs.rm(slideDirByKlic(id, klic), { recursive: true, force: true });
  await mutateDisplay(id, (slides) => slides.filter((s) => s.klic !== klic));
  return { ok: true };
}

export async function reorderSlides(id: string, poradi: number[]): Promise<void> {
  const wanted = poradi.map(nToKlic);
  await mutateDisplay(id, (slides) => {
    const byKlic = new Map(slides.map((s) => [s.klic, s]));
    const next: SlideMeta[] = [];
    for (const klic of wanted) {
      const s = byKlic.get(klic);
      if (s && !next.includes(s)) next.push(s);
    }
    // Nevyjmenované slidy zachováme na konci.
    for (const s of slides) if (!next.includes(s)) next.push(s);
    return next;
  });
}

// --- Přehled displejů ---

async function thumbnailFor(id: string, meta: DisplayMeta): Promise<string | null> {
  const slides = await resolveSlides(id, meta);
  for (const s of slides) {
    if (s.obrazky.length > 0) return slideFileUrl(id, s.klic, s.obrazky[0]);
  }
  return null;
}

export async function listDisplays(): Promise<DisplaySummary[]> {
  let ids: string[];
  try {
    ids = await fs.readdir(DISPLAYS_DIR);
  } catch {
    return [];
  }
  const numeric = ids.filter((id) => /^\d+$/.test(id)).sort((a, b) => Number(a) - Number(b));

  const out: DisplaySummary[] = [];
  for (const id of numeric) {
    const meta = await readMeta(id);
    if (!meta) continue;
    out.push({
      id,
      druh: meta.druh,
      stav: meta.stav,
      posledniZmena: meta.posledniZmena,
      thumbnail: await thumbnailFor(id, meta),
    });
  }
  return out;
}
