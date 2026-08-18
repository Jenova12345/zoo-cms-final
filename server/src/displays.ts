import { promises as fs } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { DISPLAYS_DIR } from "./paths.js";
import { canonicalizeLatin } from "./latin.js";
import { notifyReingest } from "./reingest.js";
import { writeFileAtomic } from "./atomic.js";

// Zdroj pravdy pro Unity je struktura složek na disku. Finální struktura od
// Michala: pevných pět typů slidů (_info, _ai, _3d, _vid, _gal).
//
//   data/displeje/<id>/
//     kb.md                 znalostní báze pro chatbota (NENÍ slide)
//     meta.json             doplněk (druh, stav, poslední změna, přehled slidů)
//     cs/
//       1_info/text.txt     info panel: řádky "Klic: Hodnota" + fotky .png
//       1_info/mapa.png     volitelná mapa výskytu (přesně tento název)
//       1_info/<video>.mp4  volitelné video (Michal ho řadí na začátek galerie)
//       2_ai/               prázdná složka = AI slide
//       3_3d/001.png…       3D model: sekvence snímků, číslovaná od 001
//       4_vid/<video>.mp4   jedno video
//       5_gal/text.txt      zajímavost: "Popis: <dlouhý odstavec>"
//       5_gal/<fotka>.png   zajímavost: jedna fotka (na zařízení vpravo)
//
// Typ slidu určuje suffix názvu složky, pořadí číslo na začátku. Při změně
// pořadí nebo odebrání slidu se prefixy složek přečíslují na souvislou řadu.
//
// POZOR: `_gal` je podle finální struktury ZAJÍMAVOST (text + jedna fotka),
// ne galerie fotek. Název suffixu zůstal kvůli kompatibilitě s Unity.

export type SlideTyp = "info" | "ai" | "3d" | "vid" | "gal";

// Pořadí = pořadí v nabídce "Přidat slide".
export const SLIDE_TYPY: SlideTyp[] = ["info", "ai", "3d", "vid", "gal"];

// Suffix složky pro nově zakládaný slide. Pro 3D model bere Michalovo Unity
// obojí (`_3d` i `_mod`); zakládáme `_3d`, existující `_mod` se zachová.
const SUFFIX_ALIAS: Record<string, SlideTyp> = {
  info: "info",
  ai: "ai",
  "3d": "3d",
  mod: "3d",
  vid: "vid",
  gal: "gal",
};

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

// Zajímavost (_gal): text.txt s jedním klíčem. Zapisujeme "Popis", při čtení
// bereme i "Text" — Michal používá obojí.
export const ZAJIMAVOST_KLIC = "Popis";
const ZAJIMAVOST_RE = /^\s*(?:Popis|Text)\s*:\s?(.*)$/i;

// 3D model (_3d): sekvence snímků 001.png, 002.png, … Unity je řadí podle čísla.
const SEKVENCE_RE = /^(\d{3,})\.png$/i;

function sekvencniNazev(poradi: number): string {
  return `${String(poradi).padStart(3, "0")}.png`;
}

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
  slozka: string; // skutečný název složky na disku (kvůli variantě _mod)
  pole: Record<string, string>; // jen info: obsah text.txt
  text: string; // jen gal (zajímavost): dlouhý odstavec z text.txt
  obrazky: string[]; // URL do /data (info: fotky bez mapy; gal: jedna; 3d: sekvence)
  mapa: string | null; // jen info: URL mapa.png
  video: string | null; // vid: video slidu; info: volitelné video
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

const SLIDE_DIR_RE = /^(\d+)_(info|vid|gal|ai|3d|mod)$/;

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
  suffix: string; // suffix složky na disku ("3d" i "mod" znamenají typ "3d")
  slozka: string; // název složky, např. "1_info"
}

async function listSlides(id: string): Promise<SlideDirInfo[]> {
  try {
    const entries = await fs.readdir(csDir(id), { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => {
        const m = SLIDE_DIR_RE.exec(e.name);
        if (!m) return null;
        const suffix = m[2].toLowerCase();
        return { n: Number(m[1]), typ: SUFFIX_ALIAS[suffix], suffix, slozka: e.name };
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

// --- text.txt zajímavosti (_gal): jeden dlouhý odstavec pod klíčem Popis ---

// Zapisujeme "Popis: <text>", čteme i "Text:". Odstavec může na disku
// pokračovat na dalších řádcích — bereme všechno za klíčem. Soubor bez klíče
// (ruční zásah) čteme celý jako holý odstavec, ať se obsah neztratí.
export function parseZajimavostText(raw: string): string {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const idx = lines.findIndex((l) => ZAJIMAVOST_RE.test(l));
  if (idx === -1) return raw.replace(/\r\n/g, "\n").trim();
  const prvni = ZAJIMAVOST_RE.exec(lines[idx])![1];
  return [prvni, ...lines.slice(idx + 1)].join("\n").trim();
}

export function serializeZajimavostText(text: string): string {
  const t = text.replace(/\r\n/g, "\n").trim();
  return t ? `${ZAJIMAVOST_KLIC}: ${t}\n` : "";
}

async function readZajimavost(id: string, slozka: string): Promise<string> {
  try {
    return parseZajimavostText(await fs.readFile(path.join(slideDirPath(id, slozka), "text.txt"), "utf8"));
  } catch {
    return "";
  }
}

export async function writeZajimavost(
  id: string,
  n: number,
  text: string,
): Promise<{ ok: boolean; chyba?: string }> {
  const slide = await findSlide(id, n);
  if (!slide || slide.typ !== "gal") {
    return { ok: false, chyba: "Slide není typu zajímavost." };
  }
  await writeFileAtomic(
    path.join(slideDirPath(id, slide.slozka), "text.txt"),
    serializeZajimavostText(text),
  );
  await touchDisplay(id);
  // Zajímavost je souvislý text o druhu, chatbot ho může použít jako podklad.
  void notifyReingest(id, `cs/${slide.slozka}/text.txt`);
  return { ok: true };
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

// Snímky 3D sekvence seřazené podle čísla v názvu (001.png, 002.png, …).
// Soubor s jiným názvem se ignoruje, ať se do sekvence nedostane nepořádek.
async function sekvence(id: string, slozka: string): Promise<string[]> {
  const files = await listFiles(id, slozka, ".png");
  return files
    .map((f) => ({ f, m: SEKVENCE_RE.exec(f) }))
    .filter((x): x is { f: string; m: RegExpExecArray } => x.m !== null)
    .sort((a, b) => Number(a.m[1]) - Number(b.m[1]))
    .map((x) => x.f);
}

async function toContent(id: string, s: SlideDirInfo): Promise<SlideContent> {
  const content: SlideContent = {
    n: s.n,
    typ: s.typ,
    slozka: s.slozka,
    pole: {},
    text: "",
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
    // Volitelné video info panelu (Michal ho řadí na začátek galerie fotek).
    const videa = await listFiles(id, s.slozka, ".mp4");
    content.video = videa.length ? slideFileUrl(id, s.slozka, videa[0]) : null;
  } else if (s.typ === "gal") {
    // Zajímavost: dlouhý text a jedna fotka.
    content.text = await readZajimavost(id, s.slozka);
    const pngs = await listFiles(id, s.slozka, ".png");
    content.obrazky = pngs.length ? [slideFileUrl(id, s.slozka, pngs[0])] : [];
  } else if (s.typ === "3d") {
    content.obrazky = (await sekvence(id, s.slozka)).map((f) => slideFileUrl(id, s.slozka, f));
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
  // 40 Mpx strop vstupu (výchozí sharp limit je ~268 Mpx) — brzda proti
  // obřím dekódovaným rastrům. SVG odmítáme úplně: renderuje se přes librsvg
  // a i pár set bajtů (feTurbulence) může vyrobit desítky MB a spálit minuty
  // CPU; navíc ho na displeji nepotřebujeme.
  const img = sharp(data, { limitInputPixels: 40_000_000 });
  const meta = await img.metadata();
  if (meta.format === "svg") {
    throw new Error("SVG se nepřijímá, nahrajte JPG nebo PNG.");
  }
  // Výstup se navíc zmenší na rozumný strop, ať jedno velké foto nenafoukne
  // PNG do stovek MB.
  return img
    .rotate()
    .resize({ width: 4096, height: 4096, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
}

function uniquePngName(): string {
  return `foto-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}.png`;
}

// Sekvence 3D modelu musí být souvislá řada od 001 — po přidání i smazání
// snímku ji srovnáme. Dvoufázově (přes dočasné názvy), ať se nesrazí cíle.
async function renumberSequence(id: string, slozka: string): Promise<void> {
  const dir = slideDirPath(id, slozka);
  const soubory = await sekvence(id, slozka);
  const cile = soubory.map((f, i) => ({ from: f, to: sekvencniNazev(i + 1) }));
  const meni = cile.filter((t) => t.from !== t.to);
  if (meni.length === 0) return;
  for (const t of meni) {
    await fs.rename(path.join(dir, t.from), path.join(dir, `.tmp-${t.to}`));
  }
  for (const t of meni) {
    await fs.rename(path.join(dir, `.tmp-${t.to}`), path.join(dir, t.to));
  }
}

export async function saveImage(
  id: string,
  n: number,
  data: Buffer,
): Promise<{ ok: boolean; url?: string; chyba?: string }> {
  const slide = await findSlide(id, n);
  if (!slide || (slide.typ !== "info" && slide.typ !== "gal" && slide.typ !== "3d")) {
    return { ok: false, chyba: "Fotky patří jen na info panel, zajímavost nebo 3D model." };
  }
  let png: Buffer;
  try {
    png = await convertToPng(data);
  } catch {
    return { ok: false, chyba: "Obrázek se nepodařilo převést do PNG. Použijte JPG nebo PNG." };
  }

  const dir = slideDirPath(id, slide.slozka);
  let nazev: string;

  if (slide.typ === "3d") {
    // Snímek jde na konec sekvence; číslo bereme z nejvyššího, ne z počtu,
    // ať se netrefíme do existujícího souboru po ručním zásahu do složky.
    const cisla = (await sekvence(id, slide.slozka)).map((f) => Number(SEKVENCE_RE.exec(f)![1]));
    nazev = sekvencniNazev((cisla.length ? Math.max(...cisla) : 0) + 1);
  } else {
    // Zajímavost má právě jednu fotku — předchozí nahradíme.
    if (slide.typ === "gal") {
      for (const old of await listFiles(id, slide.slozka, ".png")) {
        try {
          await fs.unlink(path.join(dir, old));
        } catch {
          // soubor mezitím zmizel, nevadí
        }
      }
    }
    nazev = uniquePngName();
  }

  await fs.writeFile(path.join(dir, nazev), png);
  if (slide.typ === "3d") await renumberSequence(id, slide.slozka);
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
  // Po vyjmutí snímku ze sekvence srovnáme čísla zpět na souvislou řadu.
  if (slide.typ === "3d") await renumberSequence(id, slide.slozka);
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

// --- Video (jedno MP4 ve složce _vid, volitelně i na info panelu) ---

// Rezervovaná jména zařízení na Windows (i s příponou, např. CON.mp4) —
// zápis pod nimi na Windows selže nebo míří na zařízení, ne na soubor.
const WIN_REZERVOVANA = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

function sanitizeFilename(name: string): string {
  let base = path
    .basename(name)
    .replace(/[^\w.\- áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/g, "_")
    .replace(/[. ]+$/g, ""); // Windows zahazuje koncové tečky a mezery
  if (!base || WIN_REZERVOVANA.test(base)) base = `video-${Date.now()}`;
  return base;
}

export async function saveVideo(
  id: string,
  n: number,
  filename: string,
  data: Buffer,
): Promise<{ ok: boolean; url?: string; chyba?: string }> {
  const slide = await findSlide(id, n);
  if (!slide || (slide.typ !== "vid" && slide.typ !== "info")) {
    return { ok: false, chyba: "Video patří jen na video slide nebo info panel." };
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
    // Suffix se zachová takový, jaký je na disku (kvůli variantě _mod).
    tmp.push({ from: s.slozka, to: `${i + 1}_${s.suffix}` });
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
