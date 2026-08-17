export interface DisplaySummary {
  id: string;
  druh: string;
  latin_name: string | null; // párování s analytikou chatbota (species_latin)
  stav: string;
  posledniZmena: string;
  thumbnail: string | null;
}

// Typ slidu = suffix názvu složky na disku (<n>_<typ>), pořadí = číselný prefix.
// Finální struktura od Michala má pevných pět typů. Pozor: "gal" je
// ZAJÍMAVOST (dlouhý text + jedna fotka), ne galerie — suffix zůstal kvůli
// Unity. Typ "3d" má na disku suffix _3d nebo _mod, server čte obojí.
export type SlideTyp = "info" | "ai" | "3d" | "vid" | "gal";

export interface DisplayMeta {
  druh: string;
  name?: string; // = Nazev (identifikace pro chatbota)
  latin_name?: string; // kanonizované latinské jméno (chatbot podle něj páruje)
  category?: string; // = Sekce (zóna expozice)
  section?: string; // taxonomická čeleď, např. Dendrobatidae
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
}

export interface AuditEntry {
  cas: string;
  uzivatel: string;
  akce: string;
  cil: string;
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

// Buď data, nebo důvod, proč nejsou — chatbot backend nemusí běžet.
export type Analytika<T> = { dostupne: true; data: T } | { dostupne: false; duvod: string };

export const NEPRIRAZENO = "Nepřiřazeno";

// Sekce expozice (dropdown info panelu; hodnota jde do text.txt beze změny).
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

// Pole info panelu: klíč přesně tak, jak se zapisuje do text.txt.
//
// `hint` je nápověda pro kurátora pod polem — Michalovo Unity má pevné
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
// ořízne — pole neroluje.
export const ZAJIMAVOST_LIMIT_SLOV = 200;

// České názvy typů podle finální struktury (stejné popisky jako tlačítka na
// zařízení). Pořadí = pořadí v nabídce "Přidat slide".
export const SLIDE_TYPY: SlideTyp[] = ["info", "ai", "3d", "vid", "gal"];

export const SLIDE_TYP_LABEL: Record<SlideTyp, string> = {
  info: "Infopanel",
  ai: "AI otázky",
  "3d": "3D model",
  vid: "Video",
  gal: "Zajímavost",
};

// Krátké vysvětlení pro kurátora, co který typ slidu na tabletu dělá
// (nabídka „Přidat slide").
export const SLIDE_TYP_POPIS: Record<SlideTyp, string> = {
  info: "Základní info o druhu: název, strava, velikost a fotky.",
  ai: "Chat s AI průvodcem. Nic se sem nevyplňuje.",
  "3d": "Otočení modelu ze sekvence fotek.",
  vid: "Velké video na celou obrazovku.",
  gal: "Delší text o druhu s jednou fotkou.",
};
