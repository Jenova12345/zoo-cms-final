import { promises as fs } from "node:fs";
import path from "node:path";

import { canonicalizeLatin } from "./latin.js";
import { INFO_KLICE, JAZYKY, SEKCE, jeSekce, serializeInfoText, type Jazyk } from "./displays.js";

// Převod obsahu z blokového textového souboru do struktury složek, kterou
// čte importObsahu.ts. Sám na datovou složku CMS NESAHÁ: čte jeden textový
// soubor a vyrábí novou složku se zdrojem plus mapovani.json.
//
//   npm run prevod-obsahu -- <vstup.txt> <vystupni-slozka>            nanečisto
//   npm run prevod-obsahu -- <vstup.txt> <vystupni-slozka> --zapsat   opravdu zapsat
//
// Vstupní formát (tolerantní, viz NAPOVEDA):
//
//   === ČESKY ===
//
//   27
//   Sekce: Neotenie, původ moderních obojživelníků
//   Nazev: Axolotl mexický
//   Latinsky: Ambystoma mexicanum
//   Celed: Ambystomatidae
//   Strava: vodní bezobratlí
//   ...
//
//   28
//   ...
//
//   === ENGLISH ===
//
//   27
//   Nazev: Mexican axolotl
//   ...
//
// Po převodu se výsledek předává importéru:
//   npm run import-obsahu -- <vystupni-slozka> <vystupni-slozka>/mapovani.json

const NAPOVEDA = `
Převod blokového textu do zdrojové struktury pro import

  npm run prevod-obsahu -- <vstup.txt> <vystupni-slozka> [--zapsat]

Vstupní soubor
  Sekce jazyků odděluje řádek "=== ČESKY ===" (bere i ENGLISH, POLSKI,
  CS/EN/PL). Uvnitř sekce začíná blok displeje řádkem se samotným číslem
  ("27", "#27", "Displej 27"). Pak následují řádky "Klic: Hodnota".

Klíče
  Sekce, Nazev, Latinsky, Celed, Strava, Velikost, DobaLihnuti, Ohrozeni,
  DelkaZivota. Porovnávají se bez ohledu na diakritiku a velikost písmen,
  takže projde i "Čeleď:" nebo "Délka života:". Neznámý klíč se nahlásí
  a přeskočí.

Co kam jde
  Celed              -> meta.json, pole "section" (latinská čeleď pro chatbota)
  ostatní klíče      -> <jazyk>/1_info/text.txt
  Sekce a Latinsky   -> jen z ČESKÉHO bloku (server si je do překladů doplní sám)

Přepínače
  --zapsat   opravdu vytvořit výstupní složku (bez něj se jen vypíše plán)
`;

// --- Rozpoznávání názvů jazyků a klíčů ---------------------------------

function normalizuj(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s_-]/g, "");
}

const JAZYK_ALIAS: Record<string, Jazyk> = {
  cesky: "cs",
  cestina: "cs",
  cs: "cs",
  czech: "cs",
  english: "en",
  anglicky: "en",
  en: "en",
  polski: "pl",
  polsky: "pl",
  polstina: "pl",
  pl: "pl",
  polish: "pl",
};

// Klíč `Celed` není pole info panelu (do text.txt nepatří), míří do
// meta.json jako `section`. Ostatní klíče jsou INFO_KLICE.
const KLIC_CELED = "Celed";

const KLIC_ALIAS: Record<string, string> = {
  sekce: "Sekce",
  section: "Sekce",
  tema: "Sekce",
  nazev: "Nazev",
  jmeno: "Nazev",
  name: "Nazev",
  latinsky: "Latinsky",
  latinskynazev: "Latinsky",
  latin: "Latinsky",
  latinname: "Latinsky",
  celed: KLIC_CELED,
  family: KLIC_CELED,
  strava: "Strava",
  potrava: "Strava",
  diet: "Strava",
  food: "Strava",
  velikost: "Velikost",
  size: "Velikost",
  dobalihnuti: "DobaLihnuti",
  lihnuti: "DobaLihnuti",
  incubation: "DobaLihnuti",
  ohrozeni: "Ohrozeni",
  threat: "Ohrozeni",
  status: "Ohrozeni",
  delkazivota: "DelkaZivota",
  lifespan: "DelkaZivota",
};

// --- Parser ------------------------------------------------------------

const SEKCE_JAZYKA_RE = /^\s*={2,}\s*(.+?)\s*={2,}\s*$/;
// Blok displeje: samotné číslo, případně s běžnou omáčkou kolem
// ("27", "#27", "27:", "Displej 27", "Displej č. 27").
const CISLO_BLOKU_RE = /^\s*(?:displej\s*)?(?:č\.?\s*)?#?\s*(\d{1,3})\s*[:.]?\s*$/i;
const POLE_RE = /^\s*([^:]+?)\s*:\s*(.*)$/;

interface Blok {
  id: string;
  jazyk: Jazyk;
  pole: Record<string, string>;
  radek: number; // kvůli hlášení chyb
}

interface Problem {
  radek: number;
  zprava: string;
}

function parsuj(raw: string): { bloky: Blok[]; problemy: Problem[] } {
  const bloky: Blok[] = [];
  const problemy: Problem[] = [];
  const radky = raw.replace(/\r\n/g, "\n").split("\n");

  let jazyk: Jazyk | null = null;
  let aktualni: Blok | null = null;

  radky.forEach((radek, i) => {
    const cislo = i + 1;
    if (!radek.trim()) return;

    const hlavicka = SEKCE_JAZYKA_RE.exec(radek);
    if (hlavicka) {
      const nalezeny = JAZYK_ALIAS[normalizuj(hlavicka[1])];
      if (!nalezeny) {
        problemy.push({ radek: cislo, zprava: `neznámý jazyk „${hlavicka[1].trim()}"` });
        jazyk = null;
      } else {
        jazyk = nalezeny;
      }
      aktualni = null;
      return;
    }

    const cisloBloku = CISLO_BLOKU_RE.exec(radek);
    if (cisloBloku) {
      if (!jazyk) {
        problemy.push({
          radek: cislo,
          zprava: `blok displeje ${cisloBloku[1]} je před první hlavičkou jazyka, přeskočen`,
        });
        aktualni = null;
        return;
      }
      aktualni = { id: String(Number(cisloBloku[1])), jazyk, pole: {}, radek: cislo };
      bloky.push(aktualni);
      return;
    }

    const pole = POLE_RE.exec(radek);
    if (!pole) {
      problemy.push({ radek: cislo, zprava: `řádek nedává smysl: „${radek.trim()}"` });
      return;
    }
    if (!aktualni) {
      problemy.push({
        radek: cislo,
        zprava: `pole „${pole[1].trim()}" je mimo blok displeje, přeskočeno`,
      });
      return;
    }

    const klic = KLIC_ALIAS[normalizuj(pole[1])];
    if (!klic) {
      problemy.push({ radek: cislo, zprava: `neznámý klíč „${pole[1].trim()}", přeskočen` });
      return;
    }
    const hodnota = pole[2].trim();
    if (hodnota) aktualni.pole[klic] = hodnota;
  });

  return { bloky, problemy };
}

// --- Skládání druhů ----------------------------------------------------

interface Druh {
  id: string;
  slozka: string;
  latin: string;
  nazev: string;
  celed: string;
  jazyky: Partial<Record<Jazyk, Record<string, string>>>;
  chyby: string[]; // druh se nevyexportuje
  varovani: string[]; // vyexportuje se, ale kurátor to má vidět
}

function slug(text: string): string {
  const zaklad = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return zaklad || "druh";
}

function sestav(bloky: Blok[]): Druh[] {
  const podleId = new Map<string, Blok[]>();
  for (const b of bloky) {
    const seznam = podleId.get(b.id) ?? [];
    seznam.push(b);
    podleId.set(b.id, seznam);
  }

  const druhy: Druh[] = [];
  for (const [id, jeho] of [...podleId].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const chyby: string[] = [];
    const varovani: string[] = [];
    const jazyky: Druh["jazyky"] = {};

    for (const jazyk of JAZYKY) {
      const vJazyce = jeho.filter((b) => b.jazyk === jazyk);
      if (vJazyce.length === 0) continue;
      if (vJazyce.length > 1) {
        varovani.push(
          `blok pro ${jazyk} je v souboru ${vJazyce.length}×, beru poslední (řádek ${vJazyce[vJazyce.length - 1].radek})`,
        );
      }
      jazyky[jazyk] = vJazyce[vJazyce.length - 1].pole;
    }

    const cs = jazyky.cs ?? {};
    // Bez češtiny se druh naimportovat nedá: identita (název, latinské jméno,
    // sekce) se bere z ní a překlady si z ní server doplňuje sdílená pole.
    if (!jazyky.cs) {
      chyby.push("chybí český blok, z něj se bere identita druhu");
    }

    const latin = canonicalizeLatin(cs.Latinsky ?? "");
    if (!latin) chyby.push("chybí Latinsky, bez něj druh nenajde chatbot");

    const nazev = (cs.Nazev ?? "").trim();
    if (!nazev) chyby.push("chybí Nazev");

    const sekce = (cs.Sekce ?? "").trim();
    if (!sekce) chyby.push("chybí Sekce, bez ní import neprojde validací");
    else if (!jeSekce(sekce)) {
      chyby.push(`Sekce „${sekce}" není platná, import by displej přeskočil`);
    }

    const celed = (cs[KLIC_CELED] ?? "").trim();
    // Prázdná čeleď není chyba, ale při importu s --prepsat by SMAZALA
    // meta.section, které na displeji dnes je. To musí kurátor vidět.
    if (!celed) {
      varovani.push("chybí Celed: import s --prepsat smaže čeleď, kterou displej dnes má");
    }

    for (const jazyk of JAZYKY) {
      const pole = jazyky[jazyk];
      if (!pole || jazyk === "cs") continue;
      if (!(pole.Nazev ?? "").trim()) {
        varovani.push(`překlad ${jazyk} nemá Nazev, import ho přeskočí`);
      }
    }

    druhy.push({
      id,
      slozka: `${id.padStart(2, "0")}-${slug(latin || nazev || id)}`,
      latin,
      nazev,
      celed,
      jazyky,
      chyby,
      varovani,
    });
  }
  return druhy;
}

// --- Zápis výstupu -----------------------------------------------------

// Do text.txt jdou jen pole info panelu, Celed ne (ten patří do meta.json).
// Sekce a Latinsky se zapisují jen v češtině: do překladů si je server
// doplní sám podle SEKCE_TEMATA, případná hodnota ze zdroje by se stejně
// přepsala.
function textProJazyk(pole: Record<string, string>, jazyk: Jazyk): string {
  const kZapisu: Record<string, string> = {};
  for (const klic of INFO_KLICE) {
    if (jazyk !== "cs" && (klic === "Sekce" || klic === "Latinsky")) continue;
    const hodnota = (pole[klic] ?? "").trim();
    if (hodnota) kZapisu[klic] = hodnota;
  }
  return serializeInfoText(kZapisu);
}

async function zapis(druhy: Druh[], vystup: string): Promise<void> {
  await fs.mkdir(vystup, { recursive: true });

  for (const d of druhy) {
    const koren = path.join(vystup, d.slozka);
    const meta: Record<string, string> = { name: d.nazev, latin_name: d.latin };
    // Prázdnou čeleď do meta.json nepíšeme vůbec: prázdný řetězec by při
    // importu meta.section smazal stejně jako chybějící klíč, ale takhle je
    // aspoň v souboru vidět, že hodnotu nemáme.
    if (d.celed) meta.section = d.celed;
    await fs.mkdir(koren, { recursive: true });
    await fs.writeFile(
      path.join(koren, "meta.json"),
      JSON.stringify(meta, null, 2) + "\n",
      "utf8",
    );

    for (const jazyk of JAZYKY) {
      const pole = d.jazyky[jazyk];
      if (!pole) continue;
      const text = textProJazyk(pole, jazyk);
      if (!text.trim()) continue;
      const dir = path.join(koren, jazyk, "1_info");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "text.txt"), text, "utf8");
    }
  }

  // Mapování na čísla displejů. Klíč je latinské jméno, importér ho páruje
  // kanonizovaně. Leží uvnitř výstupní složky, importéru to nevadí: ten si
  // ze zdroje bere jen podsložky, souborů si nevšímá.
  const mapovani: Record<string, number> = {};
  for (const d of druhy) mapovani[d.latin] = Number(d.id);
  await fs.writeFile(
    path.join(vystup, "mapovani.json"),
    JSON.stringify(mapovani, null, 2) + "\n",
    "utf8",
  );
}

// --- Hlavní běh --------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const zapsat = argv.includes("--zapsat");
  const pozicni = argv.filter((a) => !a.startsWith("--"));

  if (pozicni.length < 2) {
    console.error(NAPOVEDA.trim());
    process.exit(1);
  }
  const [vstupniSoubor, vystupniSlozka] = pozicni;

  let raw: string;
  try {
    raw = await fs.readFile(vstupniSoubor, "utf8");
  } catch {
    console.error(`Chyba: vstupní soubor ${vstupniSoubor} se nepodařilo přečíst.`);
    process.exit(1);
  }

  console.log(`Vstup:   ${path.resolve(vstupniSoubor)}`);
  console.log(`Výstup:  ${path.resolve(vystupniSlozka)}`);
  console.log(
    zapsat ? "Režim:   ZÁPIS" : "Režim:   NANEČISTO (nic se nezapíše, spusťte s --zapsat)",
  );
  console.log("");

  const { bloky, problemy } = parsuj(raw);
  if (bloky.length === 0) {
    console.error("Chyba: ve vstupu nejsou žádné bloky displejů.");
    console.error("Zkontrolujte, že soubor má hlavičky jazyků a čísla displejů.");
    if (problemy.length) {
      console.error("\nCo se nepodařilo přečíst:");
      for (const p of problemy) console.error(`  řádek ${p.radek}: ${p.zprava}`);
    }
    process.exit(1);
  }

  const druhy = sestav(bloky);
  const dobre = druhy.filter((d) => d.chyby.length === 0);
  const spatne = druhy.filter((d) => d.chyby.length > 0);

  for (const d of druhy) {
    const jazyky = JAZYKY.filter((j) => d.jazyky[j]).join(" + ");
    if (d.chyby.length) {
      console.log(`  ⤫ displej ${d.id.padEnd(3)} NEVYEXPORTUJE SE`);
      for (const ch of d.chyby) console.log(`      • ${ch}`);
      continue;
    }
    console.log(`  ✓ displej ${d.id.padEnd(3)} ${d.latin} (${jazyky})`);
    console.log(`      složka ${d.slozka}, čeleď ${d.celed || "—"}`);
    for (const v of d.varovani) console.log(`      ! ${v}`);
  }

  if (problemy.length) {
    console.log("");
    console.log("Řádky, které se nepodařilo přečíst:");
    for (const p of problemy) console.log(`  řádek ${p.radek}: ${p.zprava}`);
  }

  console.log("");
  console.log(`Vyexportovat: ${dobre.length}, s chybou: ${spatne.length}`);
  console.log(`Platné sekce: ${SEKCE.length} (viz seznam v server/src/displays.ts)`);

  if (!zapsat) {
    console.log("\nOstrý běh: stejný příkaz s --zapsat");
    return;
  }
  if (dobre.length === 0) {
    console.error("\nNení co zapsat, všechny druhy mají chybu.");
    process.exit(1);
  }

  await zapis(dobre, vystupniSlozka);
  console.log("");
  console.log(`Zapsáno do ${path.resolve(vystupniSlozka)}`);
  console.log("Další krok (nanečisto, nic nezapíše):");
  console.log(
    `  npm run import-obsahu -- ${vystupniSlozka} ${path.join(vystupniSlozka, "mapovani.json")}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
