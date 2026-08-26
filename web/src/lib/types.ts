// Jazyky pavilonu. Zrcadlí server/src/displays.ts.
export const JAZYKY = ["cs", "en", "pl"] as const;
export type Jazyk = (typeof JAZYKY)[number];

export const JAZYK_LABEL: Record<Jazyk, string> = {
  cs: "Čeština",
  en: "English",
  pl: "Polski",
};

// Pole info panelu, která kurátor píše v každém jazyce zvlášť. Ostatní
// (Sekce, Latinsky) jsou společná a zadávají se jen v češtině.
export const PREKLADANA_POLE = [
  "Nazev",
  "Strava",
  "Velikost",
  "DobaLihnuti",
  "Ohrozeni",
  "DelkaZivota",
] as const;

export function jePrekladane(klic: string): boolean {
  return (PREKLADANA_POLE as readonly string[]).includes(klic);
}

export interface StavJazyka {
  jazyk: Jazyk;
  celkem: number;
  chybi: number;
  hotovo: boolean;
}

export interface DisplaySummary {
  id: string;
  druh: string;
  jazyky: Record<Jazyk, boolean>; // které jazyky jsou hotové
  category: string | null; // sekce z meta.json (kvůli filtru v přehledu)
  latin_name: string | null; // párování s analytikou chatbota (species_latin)
  cekaNaRevizi: boolean; // AI koncept z hromadného importu, kurátor ho ještě neviděl
  stav: string;
  posledniZmena: string;
  thumbnail: string | null;
}

// Typ slidu = suffix názvu složky na disku (<n>_<typ>), pořadí = číselný prefix.
// Finální struktura od Michala má pevných pět typů. Pozor: "gal" je
// ZAJÍMAVOST (dlouhý text + jedna fotka), ne galerie, suffix zůstal kvůli
// Unity. Typ "3d" má na disku suffix _3d nebo _mod, server čte obojí.
export type SlideTyp = "info" | "ai" | "3d" | "vid" | "gal" | "txt";

export interface DisplayMeta {
  druh: string;
  name?: string; // = Nazev (identifikace pro chatbota)
  latin_name?: string; // kanonizované latinské jméno (chatbot podle něj páruje)
  category?: string; // = Sekce (zóna expozice)
  section?: string; // taxonomická čeleď, např. Dendrobatidae
  // Obsah je AI koncept z hromadného importu a čeká na kontrolu kurátora.
  // Ruší se uložením znalostní báze (viz server/src/displays.ts, writeKb).
  cekaNaRevizi?: boolean;
  stav: "online" | "offline";
  posledniZmena: string;
  slidy?: { slozka: string; typ: SlideTyp }[];
}

export interface SlideContent {
  n: number; // číselný prefix složky slidu
  typ: SlideTyp;
  slozka: string; // název složky na disku (u 3D modelu i varianta <n>_mod)
  pole: Record<string, string>; // jen info: obsah text.txt ("Klic: Hodnota")
  text: string; // jen gal (zajímavost): dlouhý odstavec z text.txt
  obrazky: string[]; // URL fotek (info: fotky; gal: jedna; 3d: sekvence snímků)
  mapa: string | null; // jen info: URL mapa.png
  video: string | null; // vid: video slidu; info: volitelné video
}

export interface DisplayDetail {
  id: string;
  meta: DisplayMeta;
  slides: SlideContent[];
  kb: string; // znalostní báze kb.md v kořeni displeje
  jazyk: Jazyk; // jazyk, ve kterém je obsah v této odpovědi
  jazyky: StavJazyka[]; // co v kterém jazyce chybí
}

export interface AuditEntry {
  cas: string;
  uzivatel: string;
  akce: string;
  cil: string;
}

// --- Události z tabletů (Michalovo Unity) ---
// Tvar odpovídá server/src/udalosti.ts.

export interface StavDispleje {
  displej: number;
  navstevyDnes: number;
  navstevyTyden: number;
  navstevyMesic: number;
  prumernaDobaS: number | null;
  chatu: number;
  chyb: number;
  posledniUdalost: string | null;
  tichy: boolean;
}

export interface StavTypuSlidu {
  typ: string;
  znamy: boolean;
  otevreni: number;
  prumernaDobaS: number | null;
}

export interface PrehledUdalosti {
  od: string;
  do: string;
  maData: boolean;
  celkem: { relaci: number; udalosti: number; chatu: number; chyb: number };
  displeje: StavDispleje[];
  typySlidu: StavTypuSlidu[];
  chyby: { cas: string; displej: number; zprava: string }[];
  ticheDispleje: number[];
  kvalita: { poskozeneRadky: number; zahozenaTrvani: number; neznameTypy: string[] };
}

// --- Analytika chatbota (Danielův backend) ---
// Tvar podle jeho kontraktu; k nám to chodí přes náš proxy endpoint
// /api/analytics/... (viz server/src/analytics.ts), který zaručí, že chybějící
// pole ani nedostupný backend dashboard neshodí.

export interface AnalyticsQuestion {
  timestamp: string;
  session_id: string;
  display_id: number | null; // může být null, druh párujeme přes species_latin
  species_latin: string;
  species_name: string;
  user_message: string;
  answered: boolean;
  language: string;
  mode: string;
}

export interface AnalyticsQuestions {
  questions: AnalyticsQuestion[];
  total: number;
  since: string;
}

export interface AnalyticsSpecies {
  species_latin: string;
  species_name: string;
  display_id: number | null;
  count: number;
}

export interface AnalyticsSummary {
  since: string;
  total_questions: number;
  answered: number;
  unanswered: number;
  per_species: AnalyticsSpecies[];
}

// Buď data, nebo důvod, proč nejsou, chatbot backend nemusí běžet.
export type Analytika<T> = { dostupne: true; data: T } | { dostupne: false; duvod: string };

export const NEPRIRAZENO = "Nepřiřazeno";

// Sekce expozice pro rozbalovátko info panelu. Zrcadlí server/src/displays.ts,
// stejně jako ostatní sdílené konstanty v tomhle souboru.
export interface SekceDef {
  cislo: number; // číslo tématu na oficiální tabuli i na podlaze pavilonu
  cs: string;
  en: string;
  pl: string;
}

// Témata (sekce) pavilonu podle oficiální tabule od Michala.
//
// Do cs/<slide>/text.txt a do meta.json.category se zapisuje POUZE český
// název (`cs`). Překlady jsou zatím jen pro CMS: kontrakt s Unity ani
// s chatbotem se nemění, oba dál čtou jeden řetězec.
export const SEKCE_TEMATA: SekceDef[] = [
  {
    cislo: 1,
    cs: "Červoři, záhadní obojživelníci",
    en: "Caecilians, Mysterious Amphibians",
    pl: "Płazy beznogie, tajemnicze stworzenia",
  },
  {
    cislo: 2,
    cs: "Rozmanitost žab",
    en: "Diversity of Frogs",
    pl: "Różnorodność żab",
  },
  {
    cislo: 3,
    cs: "Pralesničky, jedovaté krásky",
    en: "Poison Dart Frogs, Poisonous Beauties",
    pl: "Drzewołazy, trujące piękności",
  },
  {
    cislo: 4,
    cs: "Šesté vymírání",
    en: "The Sixth Extinction",
    pl: "Szóste wymieranie",
  },
  {
    cislo: 5,
    cs: "Historie obojživelníků, přechod obratlovců z vody na souš",
    en: "History of Amphibians, the Transition of Vertebrates from Water to Land",
    pl: "Historia płazów, wyjście kręgowców z wody na ląd",
  },
  {
    cislo: 6,
    cs: 'Lezci, novodobí "obojživelníci"',
    en: 'Mudskippers, Modern-day "Amphibians"',
    pl: 'Poskoczki, współczesne "płazy"',
  },
  {
    cislo: 7,
    cs: "Madagaskar, žabí ráj",
    en: "Madagascar, Frog Paradise",
    pl: "Madagaskar, raj dla żab",
  },
  {
    cislo: 8,
    cs: "Listovnice, královny noci",
    en: "Leaf Frogs, Queens of the Night",
    pl: "Chwytnice, królowe nocy",
  },
  {
    cislo: 9,
    cs: "Caudata, obojživelníci s ocasem",
    en: "Caudata, Amphibians with a Tail",
    pl: "Caudata, płazy ogoniaste",
  },
  {
    cislo: 10,
    cs: "Neotenie, původ moderních obojživelníků",
    en: "Neoteny, the Origin of Modern Amphibians",
    pl: "Neotenia, pochodzenie współczesnych płazów",
  },
  {
    cislo: 11,
    cs: "Obojživelníci České republiky",
    en: "Amphibians of the Czech Republic",
    pl: "Płazy Republiki Czeskiej",
  },
];

// Platné hodnoty pole Sekce (české názvy v pořadí podle čísla tématu).
export const SEKCE = SEKCE_TEMATA.map((s) => s.cs);

// Názvy, pod kterými sekce fungovaly před srovnáním s oficiální tabulí.
// Displeje uložené dřív je mají v text.txt i v meta.json, takže musí dál
// projít validací. Klíč je starý název, hodnota nový.
export const SEKCE_STARE: Record<string, string> = {
  Listovnice: "Listovnice, královny noci",
  Caudata: "Caudata, obojživelníci s ocasem",
  Červoři: "Červoři, záhadní obojživelníci",
  Lezci: 'Lezci, novodobí "obojživelníci"',
  Madagaskar: "Madagaskar, žabí ráj",
  Neotenie: "Neotenie, původ moderních obojživelníků",
  Pralesničky: "Pralesničky, jedovaté krásky",
};

// Je hodnota platnou sekcí (nový nebo starý název)?
export function jeSekce(hodnota: string): boolean {
  return SEKCE.includes(hodnota) || hodnota in SEKCE_STARE;
}

// Sekce podle uložené hodnoty, ať je název starý nebo nový.
export function najdiSekci(hodnota: string): SekceDef | null {
  const cs = SEKCE_STARE[hodnota] ?? hodnota;
  return SEKCE_TEMATA.find((s) => s.cs === cs) ?? null;
}

// Pole info panelu: klíč přesně tak, jak se zapisuje do text.txt.
//
// `hint` je nápověda pro kurátora pod polem. Michalovo Unity má pevné
// rozvržení a dlouhý text se na tabletu ořízne, proto u polí s limitem
// hlásíme doporučenou délku (`limitZnaku`). Limit je jen doporučení: nikdy
// neblokuje uložení, jen se u počítadla rozsvítí oranžově.
export interface InfoPoleDef {
  klic: string;
  label: string;
  povinne: boolean;
  hint: string;
  limitZnaku?: number;
}

// Metadata druhu se na tablet vejdou jen heslovitě (jeden až dva krátké řádky
// v mřížce vedle fotky), proto stejný limit u všech.
const METADATA_LIMIT = 60;
const METADATA_HINT = "Pište heslovitě, ne větu (např. 3 až 4 cm).";

export const INFO_POLE: InfoPoleDef[] = [
  {
    klic: "Sekce",
    label: "Sekce",
    povinne: true,
    hint: "Vyberte sekci, určuje barvu na tabletu.",
  },
  {
    klic: "Nazev",
    label: "Název",
    povinne: true,
    hint: "Krátký název, vejde se na 1 až 2 řádky.",
    limitZnaku: 40,
  },
  {
    klic: "Latinsky",
    label: "Latinský název",
    povinne: false,
    hint: "Latinský název, systém ho upraví do správného tvaru.",
    limitZnaku: 40,
  },
  { klic: "Strava", label: "Strava", povinne: false, hint: METADATA_HINT, limitZnaku: METADATA_LIMIT },
  { klic: "Velikost", label: "Velikost", povinne: false, hint: METADATA_HINT, limitZnaku: METADATA_LIMIT },
  {
    klic: "DobaLihnuti",
    label: "Doba líhnutí",
    povinne: false,
    hint: METADATA_HINT,
    limitZnaku: METADATA_LIMIT,
  },
  { klic: "Ohrozeni", label: "Ohrožení", povinne: false, hint: METADATA_HINT, limitZnaku: METADATA_LIMIT },
  {
    klic: "DelkaZivota",
    label: "Délka života",
    povinne: false,
    hint: METADATA_HINT,
    limitZnaku: METADATA_LIMIT,
  },
];

// Doporučená délka textu zajímavosti (slide _gal). Delší text se na tabletu
// ořízne, pole neroluje.
export const ZAJIMAVOST_LIMIT_SLOV = 200;

// České názvy typů podle finální struktury (stejné popisky jako tlačítka na
// zařízení). Pořadí = pořadí v nabídce "Přidat slide".
export const SLIDE_TYPY: SlideTyp[] = ["info", "ai", "3d", "vid", "gal", "txt"];

export const SLIDE_TYP_LABEL: Record<SlideTyp, string> = {
  info: "Infopanel",
  ai: "AI otázky",
  "3d": "3D model",
  vid: "Video",
  gal: "Zajímavost",
  txt: "Obecné informace",
};

// Krátké vysvětlení pro kurátora, co který typ slidu na tabletu dělá
// (nabídka „Přidat slide").
export const SLIDE_TYP_POPIS: Record<SlideTyp, string> = {
  info: "Základní info o druhu: název, strava, velikost a fotky.",
  ai: "Chat s AI průvodcem. Nic se sem nevyplňuje.",
  "3d": "Otočení modelu ze sekvence fotek.",
  vid: "Velké video na celou obrazovku.",
  gal: "Delší text o druhu s jednou fotkou.",
  txt: "Dva delší texty o druhu. Bez fotek a videa.",
};

// --- Obecné informace (slide _txt) ---
// Dvě dlouhá textová pole, obě se překládají (sdílené s češtinou není nic).
// Klíče musí sedět na server/src/displays.ts (TEXTOVE_KLICE), zapisují se
// v tomhle tvaru do text.txt.

export interface TextovePoleDef {
  klic: string;
  label: string;
  hint: string;
  limitSlov: number;
}

export const TEXTOVA_POLE: TextovePoleDef[] = [
  {
    klic: "ObecnyText",
    label: "Obecný text",
    hint: "Souvislý text o druhu, klidně na několik odstavců.",
    limitSlov: 250,
  },
  {
    klic: "Zajimavosti",
    label: "Zajímavosti",
    hint: "Co návštěvníka zaujme. Klidně několik bodů pod sebou.",
    limitSlov: 250,
  },
];

// Je slide obecných informací prázdný? Prázdný slide nejde označit za hotový,
// stejně jako u ostatních typů.
export function textovyPrazdny(pole: Record<string, string>): boolean {
  return TEXTOVA_POLE.every((def) => !(pole[def.klic] ?? "").trim());
}

// --- Displej u deštného pralesa ---
// Samostatný displej: místo obsahu druhu ukazuje prostředí pavilonu a odpočet
// do bouřky z videomappingu. Zrcadlí server/src/prales.ts.

export interface PralesNastaveni {
  teplotaVnitrni: number;
  vlhkost: string;
  teplotaVenkovniZaloha: number;
  bourkaZapnuta: boolean;
  bourkaIntervalMin: number;
  varovaniBlikaniSvetel: boolean;
  varovaniVodniEfekty: boolean;
}

// Plochý JSON pro Unity. Anglické názvy polí jsou z kontraktu, ne z rozmaru.
export interface PralesPayload {
  countdown_seconds: number;
  temperature_internal: number;
  humidity_text: string;
  temperature_external: number;
  current_date: string;
  alert_flashing_lights: boolean;
  alert_water_effects: boolean;
}

export interface PralesPocasi {
  zdroj: "internet" | "zaloha";
  teplota: number | null; // poslední stažená; null = zatím žádná
  ziskano: string | null; // ISO čas posledního úspěšného stažení
  posledniPokus: string | null;
  chyba: string | null;
  zastarale: boolean; // stažená hodnota je starší než hodina
  souradnice: { lat: number; lon: number };
}

export interface PralesStav {
  nastaveni: PralesNastaveni;
  nahled: PralesPayload; // přesně to, co teď dostávají tablety
  pocasi: PralesPocasi;
}

// Meze validace ze serveru (server/src/prales.ts). Tady jen pro hlášky
// a atributy polí; zdroj pravdy je server, který vstup ověřuje znovu.
export const PRALES_TEPLOTA_MIN = -50;
export const PRALES_TEPLOTA_MAX = 60;
export const PRALES_VLHKOST_MAX_ZNAKU = 40;
export const PRALES_INTERVAL_MIN = 1;
export const PRALES_INTERVAL_MAX = 1440;


// --- Videomapping ---
// Dvě instalace v pavilonu, ovládané OSC zprávou přes UDP.
// Zrcadlí server/src/videomapping.ts.

export type VideomappingPovel = "start" | "stop";

// Co jsme z CMS naposledy poslali. NENÍ to stav instalace: UDP doručení
// nepotvrzuje, takže CMS skutečný stav videomappingu nezná. Drží se jen
// v paměti serveru, po jeho restartu je prázdné (historie je v audit logu).
export interface VideomappingPosledni {
  povel: VideomappingPovel;
  odeslano: string; // ISO čas odeslání
  uzivatel: string;
  ok: boolean;
}

export interface VideomappingInstalace {
  id: string;
  nazev: string; // jak instalaci zná obsluha (WaterSense, Les)
  host: string;
  port: number;
  posledni: VideomappingPosledni | null;
}

export const VIDEOMAPPING_POVEL_LABEL: Record<VideomappingPovel, string> = {
  start: "zapnout",
  stop: "vypnout",
};


// --- Díry v zemi (zapuštěné expoziční prvky) ---
// Nejsou to displeje: jen složka v datovém kořeni s jedním .mp4, které si
// Michalův přehrávač čte přímo z disku. Zrcadlí server/src/diry.ts.

export interface DiraStav {
  id: string;
  nazev: string; // s diakritikou, pro kurátora
  slozka: string; // název složky na disku (bez diakritiky)
  cesta: string; // plná cesta na disku, ať jde zkontrolovat
  soubor: string | null; // název videa, null když ještě nic nenahráno
  velikost: number | null; // v bajtech
  nahrano: string | null; // ISO čas poslední změny souboru
  vicSouboru: string[]; // víc .mp4 ve složce = přehrávač neví, co pustit
}
