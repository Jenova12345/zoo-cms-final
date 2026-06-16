export interface DisplaySummary {
  id: string;
  druh: string;
  stav: string;
  posledniZmena: string;
  thumbnail: string | null;
}

export interface SlideMeta {
  klic: string;
  ai: boolean;
  obrazky: string[];
  video: string | null;
}

export interface DisplayMeta {
  druh: string;
  stav: "online" | "offline";
  posledniZmena: string;
  slidy?: SlideMeta[];
}

export interface SlideContent {
  n: number; // číselný klíč slidu (složka slide-<n>)
  nadpis: string;
  text: string;
  obrazky: string[];
  video: string | null;
  jeAi: boolean;
}

export interface DisplayDetail {
  id: string;
  meta: DisplayMeta;
  slides: SlideContent[];
}

export interface AuditEntry {
  cas: string;
  uzivatel: string;
  akce: string;
  cil: string;
}

export const NEPRIRAZENO = "Nepřiřazeno";
