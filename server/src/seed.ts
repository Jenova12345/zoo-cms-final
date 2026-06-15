import { promises as fs } from "node:fs";
import path from "node:path";
import { DISPLAYS_DIR, SLIDE_COUNT, AI_SLIDE, DISPLAY_COUNT } from "./paths.js";
import { SEED_DISPLAYS, placeholderSvg, type SeedDisplay } from "./content.js";

// Vygeneruje reálnou strukturu složek pro všech 37 displejů na disku.
// Displeje 1-3 s obsahem, 4-37 jako "Nepřiřazeno" s prázdnými slidy.

async function writeSlideFile(id: number, n: number, nadpis: string, text: string) {
  const dir = path.join(DISPLAYS_DIR, String(id), "cs", `slide-${n}`);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, n === AI_SLIDE ? "kb.md" : "text.md");
  const body = n === AI_SLIDE ? text : (nadpis ? `# ${nadpis}\n\n` : "") + text;
  await fs.writeFile(file, body.endsWith("\n") ? body : body + "\n", "utf8");
}

async function seedDisplay(id: number, seed: SeedDisplay | null) {
  const root = path.join(DISPLAYS_DIR, String(id));
  await fs.mkdir(root, { recursive: true });

  const druh = seed ? seed.druh : "Nepřiřazeno";
  // Pár displejů offline kvůli realistickému status boardu.
  const stav: "online" | "offline" = id % 11 === 0 ? "offline" : "online";

  const meta = {
    druh,
    stav,
    posledniZmena: new Date().toISOString(),
  };
  await fs.writeFile(path.join(root, "meta.json"), JSON.stringify(meta, null, 2) + "\n", "utf8");

  for (let n = 1; n <= SLIDE_COUNT; n++) {
    if (n === AI_SLIDE) {
      const kb = seed
        ? seed.kb
        : "# Znalostní báze\n\nDisplej zatím není přiřazen. Po přiřazení druhu sem doplňte podklady pro AI průvodce.\n";
      await writeSlideFile(id, n, "", kb);
    } else if (seed) {
      const slide = seed.slides[n - 1];
      await writeSlideFile(id, n, slide.nadpis, slide.text);
    } else {
      // Prázdný obsahový slide u nepřiřazeného displeje.
      await writeSlideFile(id, n, "", "");
    }
  }

  // Úvodní SVG placeholder do slide-1 (slouží jako thumbnail).
  if (seed) {
    const slide1 = path.join(root, "cs", "slide-1");
    await fs.mkdir(slide1, { recursive: true });
    await fs.writeFile(path.join(slide1, "uvod.svg"), placeholderSvg(seed.druh, seed.barva), "utf8");
  }
}

async function main() {
  console.log(`Generuji ${DISPLAY_COUNT} displejů do ${DISPLAYS_DIR} ...`);
  await fs.mkdir(DISPLAYS_DIR, { recursive: true });
  for (let id = 1; id <= DISPLAY_COUNT; id++) {
    await seedDisplay(id, SEED_DISPLAYS[id] ?? null);
  }
  console.log("Hotovo. Displeje 1-3 mají reálný obsah, 4-37 jsou Nepřiřazeno.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
