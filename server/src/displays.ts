import { promises as fs } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { DISPLAYS_DIR } from "./paths.js";
import { canonicalizeLatin } from "./latin.js";
import { notifyReingest } from "./reingest.js";
import { writeFileAtomic } from "./atomic.js";

// Zdroj pravdy pro Unity je struktura složek na disku:
//
//   data/displeje/<id>/
//     kb.md                 znalostní báze pro chatbota (NENÍ slide)
//     meta.json             doplněk (druh, stav, poslední změna, přehled slidů)
//     cs/
//       1_info/text.txt     info panel: řádky "Klic: Hodnota" + fotky .png
//       1_info/mapa.png     volitelná mapa výskytu (přesně tento název)
//       2_vid/<video>.mp4   jedno video
//       3_gal/<fotky>.png   galerie
//       4_ai/               prázdná složka = AI slide
//
// Typ slidu určuje suffix názvu složky, pořadí číslo na začátku. Při změně
// pořadí nebo odebrání slidu se prefixy složek přečíslují na souvislou řadu.

export type SlideTyp = "info" | "vid" | "gal" | "ai";

export const SLIDE_TYPY: SlideTyp[] = ["info", "vid", "gal", "ai"];

// Klíče polí info panelu v pořadí, ve kterém se zapisují do text.txt.
export const INFO_KLICE = [
  "Sekce",
  "Nazev",
  "Latinsky",
  "Strava",
  "Velikost",
  "DobaLihnuti",
  "Ohrozeni",
  "DelkaZivota",
] as const;

export const SEKCE = [
  "Listovnice",
  "Caudata",
  "Červoři",
  "Lezci",
  "Madagaskar",
  "Neotenie",
  "Obojživelníci České republiky",
  "Pralesničky",
  "Rozmanitost žab",
  "Šesté vymírání",
];

export const MAPA_SOUBOR = "mapa.png";

export interface DisplayMeta {
  druh: string; // CMS-interní český název (řídí přehled a stav "Nepřiřazeno")
  // Identifikace pro chatbota (Daniel). Jeden zdroj = pole info panelu; při
  // uložení se sem propíšou, ať se nerozejdou s cs/1_info/text.txt.
  name?: string; // = Nazev (český název)
  latin_name?: string; // = kanonizovaný Latinsky (chatbot podle něj páruje druh)
  category?: string; // = Sekce (zóna expozice)
  section?: string; // taxonomická čeleď, např. Dendrobatidae (jen v meta.json)
  stav: "online" | "offline";
  posledniZmena: string;
  // Doplněk pro rychlou orientaci; Unity čte jen složky.
  slidy?: { slozka: string; typ: SlideTyp }[];
}

export interface SlideContent {
  n: number; // pořadí = číselný prefix složky
  typ: SlideTyp;
  pole: Record<string, string>; // jen info: obsah text.txt
  obrazky: string[]; // URL do /data (info: hlavní fotky bez mapy; gal: galerie)
  mapa: string | null; // jen info: URL mapa.png
  video: string | null; // jen vid: URL videa
}

export interface DisplaySummary {
  id: string;
  druh: string;
  // Kvůli párování s analytikou chatbota (jeho species_latin proti našemu
  // latin_name); u nepřiřazeného displeje chybí, proto null.
  latin_name: string | null;
  stav: string;
  posledniZmena: string;
  thumbnail: string | null;
}

export const NEPRIRAZENO = "Nepřiřazeno";

const SLIDE_DIR_RE = /^(\d+)_(info|vid|gal|ai)$/;

function displayDir(id: string): string {
  return path.join(DISPLAYS_DIR, id);
}

function csDir(id: string): string {
  return path.join(displayDir(id), "cs");
}

// URL, pod kterou server servíruje soubor z /data.
function dataUrl(...segments: string[]): string {
  return "/data/" + segments.map(encodeURIComponent).join("/");
}

function slideFileUrl(id: string, slozka: string, soubor: string): string {
  return dataUrl("displeje", id, "cs", slozka, soubor);
}

export async function readMeta(id: string): Promise<DisplayMeta | null> {
  try {
    const raw = await fs.readFile(path.join(displayDir(id), "meta.json"), "utf8");
    return JSON.parse(raw) as DisplayMeta;
  } catch {
    return null;
  }
}

// Atomicky (tmp + rename): meta.json čte chatbot přes file watcher, useknutý
// JSON by mu spadl na JSON.parse.
async function writeMeta(id: string, meta: DisplayMeta): Promise<void> {
  await writeFileAtomic(
    path.join(displayDir(id), "meta.json"),
    JSON.stringify(meta, null, 2) + "\n",
  );
}

// Po každé změně obsahu: posune posledniZmena a přepíše doplňkový přehled
// slidů v meta.json podle skutečného stavu složek.
export async function touchDisplay(id: string): Promise<void> {
  const meta = await readMeta(id);
  if (!meta) return;
  meta.posledniZmena = new Date().toISOString();
  meta.slidy = (await listSlides(id)).map((s) => ({ slozka: s.slozka, typ: s.typ }));
  await writeMeta(id, meta);
}

// --- Struktura slidů na disku ---

interface SlideDirInfo {
  n: number;
  typ: SlideTyp;
  slozka: string; // název složky, např. "1_info"
}

async function listSlides(id: string): Promise<SlideDirInfo[]> {
  try {
    const entries = await fs.readdir(csDir(id), { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => {
        const m = SLIDE_DIR_RE.exec(e.name);
        return m ? { n: Number(m[1]), typ: m[2] as SlideTyp, slozka: e.name } : null;
      })
      .filter((s): s is SlideDirInfo => s !== null)
      .sort((a, b) => a.n - b.n);
  } catch {
    return [];
  }
}

async function findSlide(id: string, n: number): Promise<SlideDirInfo | null> {
  return (await listSlides(id)).find((s) => s.n === n) ?? null;
}

export async function slideExists(id: string, n: number): Promise<boolean> {
  return (await findSlide(id, n)) !== null;
}

export async function slideTyp(id: string, n: number): Promise<SlideTyp | null> {
  return (await findSlide(id, n))?.typ ?? null;
}

function slideDirPath(id: string, slozka: string): string {
  return path.join(csDir(id), slozka);
}

async function listFiles(id: string, slozka: string, ext: string): Promise<string[]> {
  try {
    const files = await fs.readdir(slideDirPath(id, slozka));
    return files.filter((f) => path.extname(f).toLowerCase() === ext).sort();
  } catch {
    return [];
  }
}

// --- text.txt info panelu: řádky "Klic: Hodnota" ---

export function parseInfoText(raw: string): Record<string, string> {
  const pole: Record<string, string> = {};
  for (const line of raw.replace(/\r\n/g, "\n").split("\n")) {
    const m = /^([A-Za-z]+):\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    if ((INFO_KLICE as readonly string[]).includes(m[1])) pole[m[1]] = m[2].trim();
  }
  return pole;
}

export function serializeInfoText(pole: Record<string, string>): string {
  const lines: string[] = [];
  for (const klic of INFO_KLICE) {
    const v = (pole[klic] ?? "").trim();
    if (v) lines.push(`${klic}: ${v}`);
  }
  return lines.join("\n") + (lines.length ? "\n" : "");
}

async function readInfoPole(id: string, slozka: string): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(path.join(slideDirPath(id, slozka), "text.txt"), "utf8");
    return parseInfoText(raw);
  } catch {
    return {};
  }
}

// Validace povinných polí; vrací text chyby, nebo null když je vše v pořádku.
export function validateInfoPole(pole: Record<string, string>): string | null {
  const sekce = (pole.Sekce ?? "").trim();
  const nazev = (pole.Nazev ?? "").trim();
  if (!sekce) return "Vyplňte prosím sekci.";
  if (!SEKCE.includes(sekce)) return "Neplatná sekce.";
  if (!nazev) return "Vyplňte prosím název.";
  return null;
}

export async function writeInfoPole(
  id: string,
  n: number,
  pole: Record<string, string>,
  section?: string,
): Promise<{ ok: boolean; chyba?: string; latin: string; latinCorrected: boolean }> {
  const slide = await findSlide(id, n);
  if (!slide || slide.typ !== "info") {
    return { ok: false, chyba: "Slide není typu info.", latin: "", latinCorrected: false };
  }

  // Kanonizace latinského jména (chatbot podle něj páruje druh).
  const rawLatin = (pole.Latinsky ?? "").trim();
  const latin = canonicalizeLatin(rawLatin);
  const latinCorrected = latin !== rawLatin;

  const cleaned: Record<string, string> = { ...pole };
  if (latin) cleaned.Latinsky = latin;
  else delete cleaned.Latinsky;

  const chyba = validateInfoPole(cleaned);
  if (chyba) return { ok: false, chyba, latin, latinCorrected };

  // 1) Fakta do cs/<slozka>/text.txt (formát Klic: Hodnota), atomicky.
  await writeFileAtomic(
    path.join(slideDirPath(id, slide.slozka), "text.txt"),
    serializeInfoText(cleaned),
  );

  // 2) Táž identita se propíše do meta.json, ať se soubory nerozejdou.
  const meta = await readMeta(id);
  if (meta) {
    const nazev = (cleaned.Nazev ?? "").trim();
    meta.druh = nazev; // validace zaručuje, že Nazev není prázdný
    meta.name = nazev;
    if (latin) meta.latin_name = latin;
    else delete meta.latin_name;
    const kategorie = (cleaned.Sekce ?? "").trim();
    if (kategorie) meta.category = kategorie;
    else delete meta.category;
    const celed = (section ?? "").trim();
    if (celed) meta.section = celed;
    else delete meta.section;
    meta.posledniZmena = new Date().toISOString();
    meta.slidy = (await listSlides(id)).map((s) => ({ slozka: s.slozka, typ: s.typ }));
    await writeMeta(id, meta);
  }

  // 3) Signál chatbotu, že se změnila fakta i identifikace (zatím vypnuto).
  void notifyReingest(id, `cs/${slide.slozka}/text.txt`);
  void notifyReingest(id, "meta.json");

  return { ok: true, latin, latinCorrected };
}

// --- Obsah slidů pro API ---

async function toContent(id: string, s: SlideDirInfo): Promise<SlideContent> {
  const content: SlideContent = {
    n: s.n,
    typ: s.typ,
    pole: {},
    obrazky: [],
    mapa: null,
    video: null,
  };
  if (s.typ === "info") {
    content.pole = await readInfoPole(id, s.slozka);
    const pngs = await listFiles(id, s.slozka, ".png");
    content.obrazky = pngs
      .filter((f) => f !== MAPA_SOUBOR)
      .map((f) => slideFileUrl(id, s.slozka, f));
    if (pngs.includes(MAPA_SOUBOR)) content.mapa = slideFileUrl(id, s.slozka, MAPA_SOUBOR);
  } else if (s.typ === "gal") {
    content.obrazky = (await listFiles(id, s.slozka, ".png")).map((f) =>
      slideFileUrl(id, s.slozka, f),
    );
  } else if (s.typ === "vid") {
    const videos = await listFiles(id, s.slozka, ".mp4");
    content.video = videos.length ? slideFileUrl(id, s.slozka, videos[0]) : null;
  }
  return content;
}

export async function readSlides(id: string): Promise<SlideContent[]> {
  const slides = await listSlides(id);
  return Promise.all(slides.map((s) => toContent(id, s)));
}

export async function displayExists(id: string): Promise<boolean> {
  return (await readMeta(id)) !== null;
}

// --- Znalostní báze (kb.md v kořeni displeje) ---

export async function readKb(id: string): Promise<string> {
  try {
    const raw = await fs.readFile(path.join(displayDir(id), "kb.md"), "utf8");
    return raw.replace(/\r\n/g, "\n").replace(/\n+$/, "");
  } catch {
    return "";
  }
}

export async function writeKb(id: string, text: string): Promise<void> {
  const body = text.replace(/\r\n/g, "\n");
  await writeFileAtomic(
    path.join(displayDir(id), "kb.md"),
    body.endsWith("\n") ? body : body + "\n",
  );
  await touchDisplay(id);
  // Signál chatbotu, že se změnila znalostní báze (zatím vypnuto).
  void notifyReingest(id, "kb.md");
}

// --- Fotky (vždy PNG, aby je přečetlo Unity) ---

// Unity čte fotky jako .png, proto každý upload převedeme přes sharp.
// Název je vždy unikátní (Safari pojmenovává přetažené obrázky "Unknown.jpeg",
// bez unikátního jména by se soubory přepisovaly).
export async function convertToPng(data: Buffer): Promise<Buffer> {
  return sharp(data).rotate().png().toBuffer();
}

function uniquePngName(): string {
  return `foto-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}.png`;
}

export async function saveImage(
  id: string,
  n: number,
  data: Buffer,
): Promise<{ ok: boolean; url?: string; chyba?: string }> {
  const slide = await findSlide(id, n);
  if (!slide || (slide.typ !== "info" && slide.typ !== "gal")) {
    return { ok: false, chyba: "Fotky lze nahrát jen na info panel nebo do galerie." };
  }
  let png: Buffer;
  try {
    png = await convertToPng(data);
  } catch {
    return { ok: false, chyba: "Obrázek se nepodařilo převést do PNG. Použijte JPG nebo PNG." };
  }
  const nazev = uniquePngName();
  await fs.writeFile(path.join(slideDirPath(id, slide.slozka), nazev), png);
  await touchDisplay(id);
  return { ok: true, url: slideFileUrl(id, slide.slozka, nazev) };
}

export async function deleteImage(id: string, n: number, filename: string): Promise<boolean> {
  const slide = await findSlide(id, n);
  if (!slide) return false;
  const safe = path.basename(filename);
  if (path.extname(safe).toLowerCase() !== ".png") return false;
  try {
    await fs.unlink(path.join(slideDirPath(id, slide.slozka), safe));
  } catch {
    return false;
  }
  await touchDisplay(id);
  return true;
}

// Označení fotky jako "mapa výskytu": soubor se přejmenuje na mapa.png.
// Dosavadní mapa (pokud existuje) se vrátí mezi běžné fotky. `nazev: null`
// značení zruší (mapa.png se stane běžnou fotkou).
export async function setMapa(
  id: string,
  n: number,
  nazev: string | null,
): Promise<{ ok: boolean; chyba?: string }> {
  const slide = await findSlide(id, n);
  if (!slide || slide.typ !== "info") {
    return { ok: false, chyba: "Mapa výskytu patří jen na info panel." };
  }
  const dir = slideDirPath(id, slide.slozka);
  const mapaPath = path.join(dir, MAPA_SOUBOR);

  const demote = async () => {
    try {
      await fs.rename(mapaPath, path.join(dir, uniquePngName()));
    } catch {
      // mapa.png neexistuje, není co vracet
    }
  };

  if (nazev === null) {
    await demote();
    await touchDisplay(id);
    return { ok: true };
  }

  const safe = path.basename(nazev);
  if (path.extname(safe).toLowerCase() !== ".png" || safe === MAPA_SOUBOR) {
    return { ok: false, chyba: "Neplatný název souboru." };
  }
  try {
    await fs.access(path.join(dir, safe));
  } catch {
    return { ok: false, chyba: "Fotka nenalezena." };
  }
  await demote();
  await fs.rename(path.join(dir, safe), mapaPath);
  await touchDisplay(id);
  return { ok: true };
}

// --- Video (jedno MP4 ve složce _vid) ---

function sanitizeFilename(name: string): string {
  const base = path
    .basename(name)
    .replace(/[^\w.\- áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/g, "_");
  return base || `video-${Date.now()}`;
}

export async function saveVideo(
  id: string,
  n: number,
  filename: string,
  data: Buffer,
): Promise<{ ok: boolean; url?: string; chyba?: string }> {
  const slide = await findSlide(id, n);
  if (!slide || slide.typ !== "vid") {
    return { ok: false, chyba: "Video patří jen na video slide." };
  }
  const dir = slideDirPath(id, slide.slozka);
  // Jedno video na slide: starší mp4 odstraníme.
  for (const old of await listFiles(id, slide.slozka, ".mp4")) {
    try {
      await fs.unlink(path.join(dir, old));
    } catch {
      // ignore
    }
  }
  let safe = sanitizeFilename(filename);
  if (path.extname(safe).toLowerCase() !== ".mp4") {
    safe = safe.replace(/\.[^.]*$/, "") + ".mp4";
  }
  await fs.writeFile(path.join(dir, safe), data);
  await touchDisplay(id);
  return { ok: true, url: slideFileUrl(id, slide.slozka, safe) };
}

export async function deleteVideo(id: string, n: number): Promise<void> {
  const slide = await findSlide(id, n);
  if (!slide) return;
  for (const v of await listFiles(id, slide.slozka, ".mp4")) {
    try {
      await fs.unlink(path.join(slideDirPath(id, slide.slozka), v));
    } catch {
      // ignore
    }
  }
  await touchDisplay(id);
}

// --- Správa slidů (pořadí drží číselný prefix názvu složky) ---

// Přejmenuje složky tak, aby prefixy tvořily souvislou řadu 1..k v zadaném
// pořadí. Dvoufázově (přes dočasné názvy), aby se cílové názvy nesrazily.
async function renumberSlides(id: string, ordered: SlideDirInfo[]): Promise<void> {
  const dir = csDir(id);
  const tmp: { from: string; to: string }[] = [];
  ordered.forEach((s, i) => {
    tmp.push({ from: s.slozka, to: `${i + 1}_${s.typ}` });
  });
  const changing = tmp.filter((t) => t.from !== t.to);
  if (changing.length === 0) return;
  for (const t of changing) {
    await fs.rename(path.join(dir, t.from), path.join(dir, `.tmp-${t.to}`));
  }
  for (const t of changing) {
    await fs.rename(path.join(dir, `.tmp-${t.to}`), path.join(dir, t.to));
  }
}

export async function addSlide(id: string, typ: SlideTyp): Promise<number> {
  const slides = await listSlides(id);
  const next = (slides.length ? Math.max(...slides.map((s) => s.n)) : 0) + 1;
  await fs.mkdir(path.join(csDir(id), `${next}_${typ}`), { recursive: true });
  await touchDisplay(id);
  return next;
}

export async function removeSlide(id: string, n: number): Promise<{ ok: boolean; chyba?: string }> {
  const slides = await listSlides(id);
  const slide = slides.find((s) => s.n === n);
  if (!slide) return { ok: false, chyba: "Slide nenalezen." };
  await fs.rm(slideDirPath(id, slide.slozka), { recursive: true, force: true });
  await renumberSlides(
    id,
    slides.filter((s) => s.n !== n),
  );
  await touchDisplay(id);
  return { ok: true };
}

export async function reorderSlides(id: string, poradi: number[]): Promise<void> {
  const slides = await listSlides(id);
  const byN = new Map(slides.map((s) => [s.n, s]));
  const next: SlideDirInfo[] = [];
  for (const n of poradi) {
    const s = byN.get(n);
    if (s && !next.includes(s)) next.push(s);
  }
  // Nevyjmenované slidy zachováme na konci ve stávajícím pořadí.
  for (const s of slides) if (!next.includes(s)) next.push(s);
  await renumberSlides(id, next);
  await touchDisplay(id);
}

// --- Přehled displejů ---

async function thumbnailFor(id: string): Promise<string | null> {
  for (const s of await listSlides(id)) {
    if (s.typ !== "info" && s.typ !== "gal") continue;
    const pngs = await listFiles(id, s.slozka, ".png");
    const hlavni = pngs.find((f) => f !== MAPA_SOUBOR) ?? pngs[0];
    if (hlavni) return slideFileUrl(id, s.slozka, hlavni);
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
      latin_name: meta.latin_name ?? null,
      stav: meta.stav,
      posledniZmena: meta.posledniZmena,
      thumbnail: await thumbnailFor(id),
    });
  }
  return out;
}
