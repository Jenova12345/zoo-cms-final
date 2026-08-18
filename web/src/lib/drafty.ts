// Rozepsaný (neuložený) obsah kurátora vs. to, co je na disku.
//
// Pravidlo: pole, do kterého kurátor sáhl, patří jemu. Přenačtení displeje
// (po nahrání fotky, smazání fotky, označení mapy, nahrání videa, přehození
// slidů) smí přepsat jen to, čeho se nedotkl. Dřív se drafty přepisovaly
// bezpodmínečně, takže nahrání fotky smazalo rozepsaný formulář.
//
// Modul je schválně bez Reactu, aby se dal otestovat samostatně.

export type Dotcena = Set<string>;

export const KLIC_KB = "kb";
export const KLIC_CELED = "celed";

export function klicPole(n: number, klic: string): string {
  return `info:${n}:${klic}`;
}

export function klicZajimavosti(n: number): string {
  return `gal:${n}`;
}

// Minimum, které z obsahu slidu potřebujeme (kvůli testovatelnosti bez API typů).
interface SlideLike {
  n: number;
  typ: string;
  pole: Record<string, string>;
  text: string;
}

export type InfoDrafty = Record<number, Record<string, string>>;
export type TextDrafty = Record<number, string>;

// Data ze serveru + zachované rozepsané hodnoty dotčených polí.
export function slucInfoDrafty(
  prev: InfoDrafty,
  slidy: SlideLike[],
  dotcena: Dotcena,
): InfoDrafty {
  const out: InfoDrafty = {};
  for (const s of slidy) {
    if (s.typ !== "info") continue;
    const draft = prev[s.n] ?? {};
    const vysledek: Record<string, string> = { ...s.pole };
    // Sjednocení klíčů: pole vyprázdněné kurátorem na disku vůbec není.
    for (const klic of new Set([...Object.keys(s.pole), ...Object.keys(draft)])) {
      if (dotcena.has(klicPole(s.n, klic))) vysledek[klic] = draft[klic] ?? "";
    }
    out[s.n] = vysledek;
  }
  return out;
}

export function slucZajimavosti(
  prev: TextDrafty,
  slidy: SlideLike[],
  dotcena: Dotcena,
): TextDrafty {
  const out: TextDrafty = {};
  for (const s of slidy) {
    if (s.typ !== "gal") continue;
    out[s.n] = dotcena.has(klicZajimavosti(s.n)) ? (prev[s.n] ?? s.text) : s.text;
  }
  return out;
}

export function slucText(prev: string, zeServeru: string, klic: string, dotcena: Dotcena): string {
  return dotcena.has(klic) ? prev : zeServeru;
}

// --- Neuložené změny ---------------------------------------------------

// Liší se rozepsaný formulář od toho, co je na disku? Porovnává se ořezaně:
// mezera navíc na konci pole není změna, o kterou by kurátor mohl přijít.
export function infoZmeneno(
  draft: Record<string, string> | undefined,
  pole: Record<string, string>,
): boolean {
  if (!draft) return false;
  for (const klic of new Set([...Object.keys(draft), ...Object.keys(pole)])) {
    if ((draft[klic] ?? "").trim() !== (pole[klic] ?? "").trim()) return true;
  }
  return false;
}

// Neuložená změna = pole, kterého se kurátor dotkl A které se zároveň liší
// od disku. Předvyplněná šablona (kb) tak „neuloženo" nedělá — kurátor do ní
// nesáhl, není o co přijít.
export function infoNeulozeno(
  n: number,
  draft: Record<string, string> | undefined,
  pole: Record<string, string>,
  dotcena: Dotcena,
): boolean {
  if (!draft) return false;
  for (const klic of new Set([...Object.keys(draft), ...Object.keys(pole)])) {
    if (!dotcena.has(klicPole(n, klic))) continue;
    if ((draft[klic] ?? "").trim() !== (pole[klic] ?? "").trim()) return true;
  }
  return false;
}

export function textZmeneno(draft: string, ulozeny: string): boolean {
  return draft.trim() !== ulozeny.trim();
}

// --- Přečíslování po změně pořadí --------------------------------------
// Server po reorderu přejmenuje složky na souvislou řadu 1..k v zadaném
// pořadí, takže slide, který byl `poradi[i]`, je nově `i + 1`. Drafty i
// značky dotčených polí se musí přestěhovat s ním, jinak by se rozepsaný
// text propsal do cizího slidu.

export function premapujDrafty<T>(zdroj: Record<number, T>, poradi: number[]): Record<number, T> {
  const out: Record<number, T> = {};
  poradi.forEach((stare, i) => {
    if (stare in zdroj) out[i + 1] = zdroj[stare];
  });
  return out;
}

export function premapujDotcena(dotcena: Dotcena, poradi: number[]): Dotcena {
  const nove: number[] = [];
  poradi.forEach((stare, i) => {
    nove[stare] = i + 1;
  });
  const out: Dotcena = new Set();
  for (const klic of dotcena) {
    const info = /^info:(\d+):(.*)$/.exec(klic);
    if (info) {
      const cil = nove[Number(info[1])];
      if (cil !== undefined) out.add(klicPole(cil, info[2]));
      continue;
    }
    const gal = /^gal:(\d+)$/.exec(klic);
    if (gal) {
      const cil = nove[Number(gal[1])];
      if (cil !== undefined) out.add(klicZajimavosti(cil));
      continue;
    }
    out.add(klic); // kb, celed — na čísle slidu nezávisí
  }
  return out;
}

// Po uložení už rozepsaná verze odpovídá disku, značky se zahodí.
export function zapomenSlide(dotcena: Dotcena, n: number): Dotcena {
  const out: Dotcena = new Set();
  for (const klic of dotcena) {
    if (klic.startsWith(`info:${n}:`) || klic === klicZajimavosti(n)) continue;
    out.add(klic);
  }
  return out;
}

export function zapomen(dotcena: Dotcena, ...klice: string[]): Dotcena {
  const out = new Set(dotcena);
  for (const k of klice) out.delete(k);
  return out;
}
