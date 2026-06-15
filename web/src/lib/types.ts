export interface DisplaySummary {
  id: string;
  druh: string;
  stav: string;
  posledniZmena: string;
  thumbnail: string | null;
}

export interface DisplayMeta {
  druh: string;
  stav: "online" | "offline";
  posledniZmena: string;
}

export interface SlideContent {
  n: number;
  nadpis: string;
  text: string;
  obrazky: string[];
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
