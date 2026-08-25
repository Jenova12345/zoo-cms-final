import { promises as fs } from "node:fs";
import path from "node:path";
import { UDALOSTI_DIR } from "./paths.js";

// Události z tabletů u expozice. Zapisuje je Michalovo Unity do
// <DATA_ROOT>/udalosti/unity/RRRR-MM-DD.jsonl, jeden JSON na řádek.
//
// Čtení je schválně tolerantní. Je to cizí formát, který se ještě může měnit,
// a data z provozu bývají špinavá: poškozený řádek se přeskočí a spočítá,
// neznámý typ slidu se zahodit nesmí, nesmyslné trvání se nesmí započítat
// do průměrů. Co všechno se přeskočilo, jde do dashboardu jako poznámka,
// ať se na tichou chybu nepřijde až za půl roku.

export interface Udalost {
  casMs: number;
  cas: string;
  displej: number;
  relace: string;
  akce: string;
  typSurovy?: string; // typ slidu tak, jak přišel z tabletu
  typCms?: string; // namapovaný na typy CMS, když se povedlo
  cislo?: number; // číslo slidu přečíslované na řadu od 1 (Unity čísluje od 0)
  trvaniS?: number;
  zprava?: string;
}

// Unity posílá typy slidů anglicky a jinak, než je zná CMS. Mapa je
// schválně širší, než co dnes chodí (bere i naše vlastní názvy), a klíče se
// porovnávají malými písmeny bez podtržítek. Co v mapě není, se nezahazuje:
// projde dál jako `typSurovy` a dashboard to ukáže tak, jak to přišlo.
const TYP_MAPA: Record<string, string> = {
  info: "info",
  model3d: "3d",
  model: "3d",
  mod: "3d",
  "3d": "3d",
  gallery: "gal",
  gal: "gal",
  zajimavost: "gal",
  ai: "ai",
  chat: "ai",
  video: "vid",
  vid: "vid",
  txt: "txt",
  text: "txt",
};

export function namapujTyp(surovy: unknown): string | undefined {
  if (typeof surovy !== "string") return undefined;
  const klic = surovy.trim().toLowerCase().replace(/[\s_-]/g, "");
  return TYP_MAPA[klic];
}

const DEN_RE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;

interface NactenyDen {
  mtimeMs: number;
  velikost: number;
  udalosti: Udalost[];
  poskozene: number;
}

// Soubory se nečtou při každém požadavku znovu. Den, který se od minule
// nezměnil (stejný čas úpravy i velikost), se vezme z paměti; dnešní soubor
// se přečte znovu, protože do něj tablety pořád přisypávají.
const cache = new Map<string, NactenyDen>();

function cislo(x: unknown): number | undefined {
  return typeof x === "number" && Number.isFinite(x) ? x : undefined;
}

function parsujRadek(radek: string): Udalost | null {
  let syrovy: Record<string, unknown>;
  try {
    syrovy = JSON.parse(radek) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!syrovy || typeof syrovy !== "object") return null;

  const cas = typeof syrovy.cas === "string" ? syrovy.cas : "";
  const casMs = Date.parse(cas);
  const displej = cislo(syrovy.displej);
  const akce = typeof syrovy.akce === "string" ? syrovy.akce : "";
  // Bez času, displeje nebo akce nejde událost k ničemu použít.
  if (!Number.isFinite(casMs) || displej === undefined || !akce) return null;

  const typSurovy = typeof syrovy.typ === "string" ? syrovy.typ : undefined;
  const cisloUnity = cislo(syrovy.cislo);

  return {
    casMs,
    cas,
    displej,
    relace: typeof syrovy.relace === "string" ? syrovy.relace : "",
    akce,
    typSurovy,
    typCms: namapujTyp(typSurovy),
    // Unity čísluje slidy od nuly, složky na disku od jedničky.
    cislo: cisloUnity === undefined ? undefined : cisloUnity + 1,
    trvaniS: cislo(syrovy.trvani_s),
    zprava:
      typeof syrovy.zprava === "string"
        ? syrovy.zprava
        : typeof syrovy.chyba === "string"
          ? syrovy.chyba
          : undefined,
  };
}

async function nactiDen(soubor: string): Promise<NactenyDen> {
  const cesta = path.join(UDALOSTI_DIR, soubor);
  let stat;
  try {
    stat = await fs.stat(cesta);
  } catch {
    cache.delete(soubor);
    return { mtimeMs: 0, velikost: 0, udalosti: [], poskozene: 0 };
  }

  const ulozeny = cache.get(soubor);
  if (ulozeny && ulozeny.mtimeMs === stat.mtimeMs && ulozeny.velikost === stat.size) {
    return ulozeny;
  }

  let obsah: string;
  try {
    obsah = await fs.readFile(cesta, "utf8");
  } catch {
    return { mtimeMs: 0, velikost: 0, udalosti: [], poskozene: 0 };
  }

  const udalosti: Udalost[] = [];
  let poskozene = 0;
  for (const radek of obsah.split("\n")) {
    if (!radek.trim()) continue;
    const u = parsujRadek(radek);
    if (u) udalosti.push(u);
    else poskozene++;
  }

  const novy: NactenyDen = { mtimeMs: stat.mtimeMs, velikost: stat.size, udalosti, poskozene };
  cache.set(soubor, novy);
  return novy;
}

// Soubory dnů v rozsahu (včetně krajů). Bere se z názvu souboru, ne z obsahu.
async function souboryVRozsahu(od: string, doDne: string): Promise<string[]> {
  let vse: string[];
  try {
    vse = await fs.readdir(UDALOSTI_DIR);
  } catch {
    return []; // složka ještě neexistuje, tablety zatím nic neposlaly
  }
  return vse
    .filter((f) => {
      const m = DEN_RE.exec(f);
      return m !== null && m[1] >= od && m[1] <= doDne;
    })
    .sort();
}

// --- Souhrn pro dashboard ---------------------------------------------

export interface StavDispleje {
  displej: number;
  navstevyDnes: number;
  navstevyTyden: number;
  navstevyMesic: number;
  prumernaDobaS: number | null;
  chatu: number;
  chyb: number;
  posledniUdalost: string | null;
  tichy: boolean; // 24 hodin bez jediné události, nejspíš spadlý tablet
}

export interface StavTypuSlidu {
  typ: string; // typ CMS, nebo surový název z tabletu, když ho neznáme
  znamy: boolean;
  otevreni: number;
  prumernaDobaS: number | null;
}

export interface Prehled {
  od: string;
  do: string;
  maData: boolean;
  celkem: { relaci: number; udalosti: number; chatu: number; chyb: number };
  displeje: StavDispleje[];
  typySlidu: StavTypuSlidu[];
  chyby: { cas: string; displej: number; zprava: string }[];
  ticheDispleje: number[];
  kvalita: {
    poskozeneRadky: number;
    zahozenaTrvani: number;
    neznameTypy: string[];
  };
}

// Trvání delší než celá relace je zbytek stopek z minulé relace. Tolerance
// je kvůli krátkým relacím, kde se poslední slide počítá ještě po poslední
// zaznamenané události.
const TOLERANCE_S = 60;
const MAX_CHYB = 20;

function den(datum: Date): string {
  const y = datum.getFullYear();
  const m = String(datum.getMonth() + 1).padStart(2, "0");
  const d = String(datum.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function prehled(opts: {
  dny?: number;
  displej?: number;
  vsechnyDispleje?: number[];
  ted?: number; // kvůli testovatelnosti
}): Promise<Prehled> {
  const dny = Math.min(Math.max(Math.trunc(opts.dny ?? 30), 1), 366);
  const ted = opts.ted ?? Date.now();
  const doDne = den(new Date(ted));
  const od = den(new Date(ted - (dny - 1) * 86400000));

  const soubory = await souboryVRozsahu(od, doDne);
  const udalosti: Udalost[] = [];
  let poskozeneRadky = 0;
  for (const soubor of soubory) {
    const dn = await nactiDen(soubor);
    poskozeneRadky += dn.poskozene;
    for (const u of dn.udalosti) {
      if (opts.displej !== undefined && u.displej !== opts.displej) continue;
      udalosti.push(u);
    }
  }

  // Relace: potřebujeme její skutečné rozpětí, podle něj se pozná nesmyslné
  // trvání slidu i doba strávená u displeje.
  const relace = new Map<string, { displej: number; od: number; do: number }>();
  for (const u of udalosti) {
    const klic = `${u.displej}:${u.relace || u.cas}`;
    const r = relace.get(klic);
    if (!r) relace.set(klic, { displej: u.displej, od: u.casMs, do: u.casMs });
    else {
      r.od = Math.min(r.od, u.casMs);
      r.do = Math.max(r.do, u.casMs);
    }
  }

  const hraniceDnes = new Date(ted);
  hraniceDnes.setHours(0, 0, 0, 0);
  const zacatekDnes = hraniceDnes.getTime();
  const pred7 = ted - 7 * 86400000;
  const pred30 = ted - 30 * 86400000;
  const pred24h = ted - 86400000;

  const podleDispleje = new Map<number, StavDispleje & { dobyS: number[] }>();
  const dej = (n: number) => {
    let s = podleDispleje.get(n);
    if (!s) {
      s = {
        displej: n,
        navstevyDnes: 0,
        navstevyTyden: 0,
        navstevyMesic: 0,
        prumernaDobaS: null,
        chatu: 0,
        chyb: 0,
        posledniUdalost: null,
        tichy: true,
        dobyS: [],
      };
      podleDispleje.set(n, s);
    }
    return s;
  };

  // Návštěva = jedna relace. Počítá se podle jejího začátku.
  for (const r of relace.values()) {
    const s = dej(r.displej);
    if (r.od >= zacatekDnes) s.navstevyDnes++;
    if (r.od >= pred7) s.navstevyTyden++;
    if (r.od >= pred30) s.navstevyMesic++;
    const doba = Math.round((r.do - r.od) / 1000);
    if (doba > 0) s.dobyS.push(doba);
  }

  const typy = new Map<string, { znamy: boolean; otevreni: number; doby: number[] }>();
  const chyby: Prehled["chyby"] = [];
  const neznameTypy = new Set<string>();
  let zahozenaTrvani = 0;
  let chatu = 0;

  for (const u of udalosti) {
    const s = dej(u.displej);
    if (!s.posledniUdalost || u.cas > s.posledniUdalost) s.posledniUdalost = u.cas;
    if (u.casMs >= pred24h) s.tichy = false;

    if (u.akce === "otevren_chat") {
      s.chatu++;
      chatu++;
    }
    if (u.akce === "chyba") {
      s.chyb++;
      chyby.push({ cas: u.cas, displej: u.displej, zprava: u.zprava ?? "Tablet nahlásil chybu." });
    }

    if (u.akce !== "zobrazen_slide") continue;

    const klic = u.typCms ?? (u.typSurovy ? u.typSurovy.trim() : "neurčeno");
    if (!u.typCms && u.typSurovy) neznameTypy.add(u.typSurovy.trim());
    let t = typy.get(klic);
    if (!t) {
      t = { znamy: !!u.typCms, otevreni: 0, doby: [] };
      typy.set(klic, t);
    }
    t.otevreni++;

    if (u.trvaniS === undefined) continue;
    const r = relace.get(`${u.displej}:${u.relace || u.cas}`);
    const strop = r ? Math.round((r.do - r.od) / 1000) + TOLERANCE_S : TOLERANCE_S;
    // Zbytek stopek z minulé relace: delší, než trvala celá relace.
    if (u.trvaniS < 0 || u.trvaniS > strop) {
      zahozenaTrvani++;
      continue;
    }
    t.doby.push(u.trvaniS);
  }

  const prumer = (pole: number[]): number | null =>
    pole.length ? Math.round(pole.reduce((a, b) => a + b, 0) / pole.length) : null;

  // Displeje, které v datech nejsou vůbec, jsou taky "tiché": tablet se
  // neozval ani jednou.
  for (const n of opts.vsechnyDispleje ?? []) {
    if (opts.displej !== undefined && n !== opts.displej) continue;
    dej(n);
  }

  const displeje: StavDispleje[] = [...podleDispleje.values()]
    .map(({ dobyS, ...zbytek }) => ({ ...zbytek, prumernaDobaS: prumer(dobyS) }))
    .sort((a, b) => b.navstevyMesic - a.navstevyMesic || a.displej - b.displej);

  const typySlidu: StavTypuSlidu[] = [...typy.entries()]
    .map(([typ, t]) => ({
      typ,
      znamy: t.znamy,
      otevreni: t.otevreni,
      prumernaDobaS: prumer(t.doby),
    }))
    .sort((a, b) => b.otevreni - a.otevreni);

  return {
    od,
    do: doDne,
    maData: udalosti.length > 0,
    celkem: {
      relaci: relace.size,
      udalosti: udalosti.length,
      chatu,
      chyb: chyby.length,
    },
    displeje,
    typySlidu,
    chyby: chyby.sort((a, b) => b.cas.localeCompare(a.cas)).slice(0, MAX_CHYB),
    ticheDispleje: displeje.filter((d) => d.tichy).map((d) => d.displej),
    kvalita: {
      poskozeneRadky,
      zahozenaTrvani,
      neznameTypy: [...neznameTypy].sort(),
    },
  };
}
