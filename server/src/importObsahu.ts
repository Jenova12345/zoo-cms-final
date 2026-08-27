import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { DATA_ROOT } from "./paths.js";
import { appendAudit } from "./audit.js";
import { DEFAULT_KB } from "./content.js";
import { canonicalizeLatin } from "./latin.js";
import {
  NEPRIRAZENO,
  addSlide,
  displayExists,
  oznacRevizi,
  parseInfoText,
  readKb,
  readMeta,
  readSlides,
  validateInfoPole,
  writeInfoPole,
  writeKb,
} from "./displays.js";

// Hromadný import obsahu do CMS (kb.md + pole info panelu) z připravené
// složky, kde má každý druh vlastní podsložku.
//
//   npm run import-obsahu -- <zdroj> <mapovani.json>              nanečisto (výchozí)
//   npm run import-obsahu -- <zdroj> <mapovani.json> --zapsat     opravdu zapsat
//   npm run import-obsahu -- <zdroj> <mapovani.json> --zapsat --prepsat
//
// ZÁSADNÍ: nic se nezapisuje přes holé fs. Všechno jde stejnou cestou jako
// když obsah uloží kurátor v CMS, přes writeInfoPole() a writeKb() z
// displays.ts. Tím projde validace povinných polí, kanonizace latinského
// jména, atomický zápis (tmp + rename kvůli file watcheru chatbota),
// propsání identity do meta.json i signál k reingestu. Import navíc zapisuje
// vlastní řádky do audit logu, aby šlo poznat, co je hromadný import a co
// ruční práce kurátora.

const NAPOVEDA = `
Hromadný import obsahu do CMS Amphibiárium

  npm run import-obsahu -- <zdrojova-slozka> <mapovani.json> [prepinace]

Zdrojová složka: pro každý druh jedna podsložka s
  meta.json          (name, latin_name; volitelně section a příznak AI konceptu)
  kb.md              znalostní báze pro chatbota
  cs/1_info/text.txt pole info panelu ve tvaru "Klic: Hodnota"

Mapovací soubor: JSON { "<klíč>": <číslo displeje> }, kde klíč je
  latinský název druhu (párovací klíč), nebo název zdrojové podsložky.
  Příklad: { "Dendrobates tinctorius": 12, "axolotl": 1 }

Přepínače
  --nanecisto   jen vypíše, co by se stalo (VÝCHOZÍ, nic nezapíše)
  --zapsat      opravdu zapsat do datové složky
  --prepsat     přepsat i displeje, které už obsah mají (jinak se přeskočí)
`;

interface ZdrojovaMeta {
  name?: string;
  latin_name?: string;
  section?: string;
  status?: string;
  ai_draft_pending_curator_review?: boolean;
}

type Duvod = string;

interface Polozka {
  slozka: string;
  latin: string;
  nazev: string;
  displej?: string;
  kb: string;
  pole: Record<string, string>;
  section: string;
  cekaNaRevizi: boolean;
  novySlide: boolean; // displej ještě nemá info panel, bude se zakládat
  prepisuje: string[]; // co na cílovém displeji dnes je (jen s --prepsat)
  preskocit?: Duvod;
}

// --- Čtení zdroje ------------------------------------------------------

async function nactiZdroj(korenn: string, slozka: string): Promise<Polozka> {
  const zaklad: Polozka = {
    slozka,
    latin: "",
    nazev: "",
    kb: "",
    pole: {},
    section: "",
    cekaNaRevizi: false,
    novySlide: false,
    prepisuje: [],
  };
  const cesta = path.join(korenn, slozka);

  let meta: ZdrojovaMeta;
  try {
    meta = JSON.parse(await fs.readFile(path.join(cesta, "meta.json"), "utf8")) as ZdrojovaMeta;
  } catch {
    return { ...zaklad, preskocit: "meta.json chybí nebo není platný JSON" };
  }

  // Bez latinského názvu druh nenajde chatbot ani analytika, takový záznam
  // se zásadně neimportuje, jen nahlásí.
  const latin = canonicalizeLatin((meta.latin_name ?? "").trim());
  if (!latin) {
    return { ...zaklad, nazev: meta.name ?? "", preskocit: "v meta.json chybí latin_name" };
  }

  const kb = await precti(path.join(cesta, "kb.md"));
  const infoRaw = await precti(path.join(cesta, "cs", "1_info", "text.txt"));
  const pole = parseInfoText(infoRaw);

  // Identita z meta.json doplní to, co v text.txt chybí (zdrojem pravdy pro
  // pole zůstává text.txt, protože přesně to čte tablet).
  if (!(pole.Nazev ?? "").trim() && meta.name) pole.Nazev = meta.name.trim();
  if (!(pole.Latinsky ?? "").trim()) pole.Latinsky = latin;

  return {
    ...zaklad,
    latin,
    nazev: (pole.Nazev ?? meta.name ?? "").trim(),
    kb,
    pole,
    section: (meta.section ?? "").trim(),
    cekaNaRevizi: jeAiKoncept(meta, kb),
  };
}

async function precti(cesta: string): Promise<string> {
  try {
    return await fs.readFile(cesta, "utf8");
  } catch {
    return "";
  }
}

// Příznak AI konceptu bereme odkudkoliv, kde ho generátor může nechat,
// z meta.json (boolean nebo status) i z textu kb.md.
function jeAiKoncept(meta: ZdrojovaMeta, kb: string): boolean {
  const PRIZNAK = "ai_draft_pending_curator_review";
  if (meta.ai_draft_pending_curator_review === true) return true;
  if (typeof meta.status === "string" && meta.status.includes(PRIZNAK)) return true;
  return kb.includes(PRIZNAK);
}

// --- Mapování zdroj → displej -----------------------------------------

function normalizuj(klic: string): string {
  return klic.trim().toLowerCase().replace(/\s+/g, " ");
}

async function nactiMapovani(soubor: string): Promise<Map<string, string>> {
  const raw = JSON.parse(await fs.readFile(soubor, "utf8")) as Record<string, unknown>;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Mapovací soubor musí být JSON objekt { \"klíč\": číslo displeje }.");
  }
  const mapa = new Map<string, string>();
  for (const [klic, hodnota] of Object.entries(raw)) {
    const id = String(hodnota).trim();
    if (!/^\d+$/.test(id)) {
      throw new Error(`Mapování "${klic}": "${String(hodnota)}" není číslo displeje.`);
    }
    mapa.set(normalizuj(klic), id);
    // Klíčem smí být i latinský název v jiném tvaru než kanonickém.
    mapa.set(normalizuj(canonicalizeLatin(klic)), id);
  }
  return mapa;
}

// --- Stav cílového displeje -------------------------------------------

// Co na displeji je. Prázdný displej pozná import podle toho, že nemá druh,
// znalostní bázi ani vyplněný obsah slidů.
async function coJeNaDispleji(id: string): Promise<string[]> {
  const nalezeno: string[] = [];
  const meta = await readMeta(id);
  if (meta && meta.druh !== NEPRIRAZENO) nalezeno.push(`druh „${meta.druh}"`);
  // Seed zakládá u nepřiřazených displejů zástupný text, ten se nepočítá
  // jako obsah, jinak by import nemohl obsadit žádný volný displej.
  const kb = (await readKb(id)).trim();
  if (kb && kb !== DEFAULT_KB.trim()) nalezeno.push("znalostní bázi");
  for (const s of await readSlides(id)) {
    if (s.typ === "info" && Object.values(s.pole).some((v) => v.trim())) {
      nalezeno.push("vyplněný info panel");
    }
    // Textový slide i obecné informace drží texty v `pole` stejně jako info
    // panel; bez téhle větve by import považoval vyplněný slide za prázdný
    // a přepsal ho.
    if (s.typ === "gal" && Object.values(s.pole).some((v) => v.trim())) {
      nalezeno.push("vyplněný textový slide");
    }
    if (s.typ === "txt" && Object.values(s.pole).some((v) => v.trim())) {
      nalezeno.push("vyplněné obecné informace");
    }
    if (s.obrazky.length) nalezeno.push(`${s.obrazky.length}× obrázek`);
    if (s.media.length) nalezeno.push(`galerii (${s.media.length} položek)`);
    if (s.video) nalezeno.push("video");
  }
  return nalezeno;
}

// --- Výpis -------------------------------------------------------------

function radek(p: Polozka): string {
  const zdroj = p.slozka.padEnd(28);
  if (p.preskocit) return `  ⤫ ${zdroj} PŘESKOČENO: ${p.preskocit}`;
  const cil = `→ displej ${p.displej}`.padEnd(16);
  const co = [
    p.novySlide ? "založí se info panel" : "zapíše se info panel",
    p.kb.trim() ? "znalostní báze" : "bez znalostní báze",
    p.cekaNaRevizi ? "označí se jako AI koncept k revizi" : "bez příznaku revize",
  ].join(", ");
  const prepis = p.prepisuje.length
    ? `\n      PŘEPÍŠE, co tam dnes je: ${p.prepisuje.join(", ")}`
    : "";
  return `  ✓ ${zdroj} ${cil} ${p.latin}\n      ${co}${prepis}`;
}

// --- Hlavní běh --------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const zapsat = argv.includes("--zapsat");
  const prepsat = argv.includes("--prepsat");
  const nanecisto = argv.includes("--nanecisto");
  const pozicni = argv.filter((a) => !a.startsWith("--"));

  if (pozicni.length < 2) {
    console.error(NAPOVEDA.trim());
    process.exit(1);
  }
  if (zapsat && nanecisto) {
    console.error("Chyba: --zapsat a --nanecisto se vylučují. Vyberte jedno.");
    process.exit(1);
  }

  const [zdrojovaSlozka, mapovaciSoubor] = pozicni;
  console.log(`Datová složka: ${DATA_ROOT}`);
  console.log(`Zdroj:         ${path.resolve(zdrojovaSlozka)}`);
  console.log(`Mapování:      ${path.resolve(mapovaciSoubor)}`);
  console.log(
    zapsat
      ? prepsat
        ? "Režim:         ZÁPIS + PŘEPIS existujícího obsahu"
        : "Režim:         ZÁPIS"
      : "Režim:         NANEČISTO (nic se nezapíše, spusťte s --zapsat)",
  );
  console.log("");

  let mapa: Map<string, string>;
  try {
    mapa = await nactiMapovani(mapovaciSoubor);
  } catch (e) {
    console.error(`Chyba mapovacího souboru: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }

  let podslozky: string[];
  try {
    const entries = await fs.readdir(zdrojovaSlozka, { withFileTypes: true });
    podslozky = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    console.error(`Chyba: zdrojovou složku ${zdrojovaSlozka} se nepodařilo přečíst.`);
    process.exit(1);
  }
  if (podslozky.length === 0) {
    console.error("Chyba: ve zdrojové složce nejsou žádné podsložky druhů.");
    process.exit(1);
  }

  // 1) Načtení a kontrola všeho dopředu, ať se nezapisuje polovina.
  const polozky: Polozka[] = [];
  const obsazeneDispleje = new Map<string, string>(); // id -> zdrojová složka
  for (const slozka of podslozky) {
    const p = await nactiZdroj(zdrojovaSlozka, slozka);
    if (!p.preskocit) {
      const id = mapa.get(normalizuj(p.latin)) ?? mapa.get(normalizuj(p.slozka));
      if (!id) {
        p.preskocit = `v mapovacím souboru není „${p.latin}" ani „${p.slozka}"`;
      } else if (obsazeneDispleje.has(id)) {
        p.preskocit = `displej ${id} už v tomhle běhu obsadil zdroj „${obsazeneDispleje.get(id)}"`;
      } else if (!(await displayExists(id))) {
        p.preskocit = `displej ${id} v datové složce neexistuje`;
      } else {
        p.displej = id;
        const chyba = validateInfoPole(p.pole);
        const uz = await coJeNaDispleji(id);
        if (chyba) {
          p.preskocit = `info panel neprojde validací: ${chyba.toLowerCase()}`;
        } else if (uz.length > 0 && !prepsat) {
          p.preskocit = `displej ${id} už má obsah (${uz.join(", ")}), přepis jen s --prepsat`;
        } else {
          p.prepisuje = uz; // prázdné = displej je volný
          p.novySlide = !(await readSlides(id)).some((s) => s.typ === "info");
          // Displej si rezervuje až zdroj, který se opravdu zapíše.
          obsazeneDispleje.set(id, p.slozka);
        }
      }
    }
    polozky.push(p);
  }

  // 2) Výpis plánu.
  for (const p of polozky) console.log(radek(p));
  console.log("");

  const kZapsani = polozky.filter((p) => !p.preskocit);
  const preskocene = polozky.filter((p) => p.preskocit);

  if (!zapsat) {
    console.log(`NANEČISTO: zapsalo by se ${kZapsani.length}, přeskočilo ${preskocene.length}.`);
    if (preskocene.length) {
      console.log("Důvody přeskočení:");
      for (const p of preskocene) console.log(`  • ${p.slozka}: ${p.preskocit}`);
    }
    console.log("\nOstrý běh: stejný příkaz s --zapsat");
    return;
  }

  // 3) Zápis, vždy přes funkce z displays.ts, nikdy přes holé fs.
  const kdo = `import-obsahu (${os.userInfo().username})`;
  let hotovo = 0;
  const selhalo: { slozka: string; duvod: string }[] = [];

  for (const p of kZapsani) {
    const id = p.displej!;
    try {
      const slidy = await readSlides(id);
      const info = slidy.find((s) => s.typ === "info");
      const n = info ? info.n : await addSlide(id, "info");

      const res = await writeInfoPole(id, n, p.pole, p.section);
      if (!res.ok) throw new Error(res.chyba ?? "zápis info panelu selhal");

      if (p.kb.trim()) await writeKb(id, p.kb);

      // Značka se ruší jen vědomým schválením kurátora v CMS, takže na pořadí
      // vůči zápisu obsahu nezáleží, nastavuje se na konci, ať je jasné, že
      // platí pro celý naimportovaný obsah.
      if (p.cekaNaRevizi) await oznacRevizi(id, true);

      await appendAudit({
        uzivatel: kdo,
        akce: "hromadný import",
        cil:
          `displej ${id} ← ${p.slozka} (${p.latin})` +
          (p.cekaNaRevizi ? ", označeno k revizi kurátorem" : ""),
      });
      hotovo++;
      console.log(`  zapsáno: displej ${id} ← ${p.slozka}`);
    } catch (e) {
      const duvod = e instanceof Error ? e.message : String(e);
      selhalo.push({ slozka: p.slozka, duvod });
      console.error(`  CHYBA u ${p.slozka}: ${duvod}`);
    }
  }

  await appendAudit({
    uzivatel: kdo,
    akce: "hromadný import",
    cil: `souhrn: naimportováno ${hotovo}, přeskočeno ${preskocene.length + selhalo.length}`,
  });

  // 4) Souhrn.
  console.log("");
  console.log(`Naimportováno: ${hotovo}`);
  console.log(`Přeskočeno:    ${preskocene.length + selhalo.length}`);
  for (const p of preskocene) console.log(`  • ${p.slozka}: ${p.preskocit}`);
  for (const s of selhalo) console.log(`  • ${s.slozka}: zápis selhal, ${s.duvod}`);
  const kRevizi = kZapsani.filter((p) => p.cekaNaRevizi).length;
  if (hotovo > 0) {
    console.log("");
    console.log(`Čeká na revizi kurátora: ${kRevizi} (v CMS je vidět v přehledu displejů).`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
