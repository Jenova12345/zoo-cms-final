export interface DisplaySummary {
  id: string;
  druh: string;
  latin_name: string | null; // párování s analytikou chatbota (species_latin)
  stav: string;
  posledniZmena: string;
  thumbnail: string | null;
}

// Typ slidu = suffix názvu složky na disku (<n>_<typ>), pořadí = číselný prefix.
export type SlideTyp = "info" | "vid" | "gal" | "ai";

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
  pole: Record<string, string>; // jen info: obsah text.txt ("Klic: Hodnota")
  obrazky: string[]; // URL fotek (info: hlavní fotky, gal: galerie)
  mapa: string | null; // jen info: URL mapa.png
  video: string | null; // jen vid: URL mp4
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
export interface InfoPoleDef {
  klic: string;
  label: string;
  povinne: boolean;
}

export const INFO_POLE: InfoPoleDef[] = [
  { klic: "Sekce", label: "Sekce", povinne: true },
  { klic: "Nazev", label: "Název", povinne: true },
  { klic: "Latinsky", label: "Latinský název", povinne: false },
  { klic: "Strava", label: "Strava", povinne: false },
  { klic: "Velikost", label: "Velikost", povinne: false },
  { klic: "DobaLihnuti", label: "Doba líhnutí", povinne: false },
  { klic: "Ohrozeni", label: "Ohrožení", povinne: false },
  { klic: "DelkaZivota", label: "Délka života", povinne: false },
];

export const SLIDE_TYP_LABEL: Record<SlideTyp, string> = {
  info: "Info panel",
  vid: "Video",
  gal: "Galerie",
  ai: "AI slide",
};
