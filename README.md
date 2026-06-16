# Amphibiárium · Vzdálený přístup

CMS pro správu obsahu displejů pavilonu Amphibiárium, ZOO Ostrava.
Obsah nahraný přes web **nebo** přetažený do složky na disku se reálně uloží do
struktury složek a zobrazí v náhledu tabletu.

## Stack

- **/server** – Fastify + TypeScript, reálné file I/O nad `/data`, žádná databáze.
  V produkčním (demo) režimu servíruje i buildnutý web, takže běží **jeden proces**.
- **/web** – React + Vite + TypeScript + Tailwind + Lucide + React Router.
- **/data** – reálný datový root se složkami displejů.

## Spuštění lokálně (demo režim, jeden proces)

```bash
npm install        # nainstaluje server i web (npm workspaces)
npm run seed       # vygeneruje 37 displejů do složky data/
npm run build      # buildne web do web/dist
npm run start      # spustí Fastify, který servíruje API i web
```

Pak otevři **http://127.0.0.1:3000**

Přihlášení: projdou **jakékoliv neprázdné** údaje.

> Pořadí je důležité: nejdřív `seed` (vytvoří data), pak `build` (vytvoří web/dist),
> pak `start`. `start` čte buildnutý web z `web/dist`.

### Vývojový režim (volitelné, dva procesy s hot-reloadem)

```bash
npm run dev        # server na :3000 + Vite na :5173 (proxy /api a /data)
```

V dev režimu otevři **http://127.0.0.1:5173**.

## Kde je složka /data (sem přetahuj soubory)

```
/Users/tomasadamcik/JENOVA/zoo-cms/data
```

Struktura (přesně takhle, kvůli budoucí Unity integraci):

```
data/displeje/<cislo>/meta.json                 {"druh","stav","posledniZmena","slidy"}
data/displeje/<cislo>/cs/slide-<n>/text.md      obsahový slide
data/displeje/<cislo>/cs/slide-6/kb.md          AI slide = znalostní báze chatbota
data/displeje/<cislo>/cs/slide-<n>/<obrazky>    fotky slidu (víc fotek = galerie)
data/displeje/<cislo>/cs/slide-<n>/<video>.mp4  video slidu (jedno na slide)
data/audit.jsonl                                append-only audit log
```

Počet a pořadí slidů jsou dané složkami `slide-<n>` na disku, jejich pořadí (a pořadí
fotek a název videa) drží pole `slidy` v `meta.json`. Když `slidy` chybí (starší data),
struktura se odvodí z disku a dopíše se při první úpravě. Soubor ručně přetažený do
složky slidu se i nadále objeví v CMS i na tabletu.

## Dva toky, které lze předvést

**(a) Úprava ve webu zapíše na disk a projeví se na tabletu**
1. Otevři displej (např. #1 Axolotl), uprav text/nadpis, klikni **Uložit**.
2. Soubor `data/displeje/1/cs/slide-1/text.md` se reálně přepíše.
3. Otevři **Náhled tabletu** (tlačítko v detailu, nebo `/tablet/1`) – zobrazí novou verzi.

**(b) Ruční přetažení souboru do složky se objeví na tabletu**
1. Přetáhni obrázek do `data/displeje/1/cs/slide-1/`.
2. V náhledu tabletu klikni na ikonu **obnovit** (vpravo nahoře) – fotka se objeví.

> Tablet i CMS čtou stejné API nad stejnými soubory, takže obojí je vždy v souladu.

## API endpointy

| Metoda | Cesta | Popis |
|--------|-------|-------|
| POST | `/api/login` | přihlášení (jakékoliv neprázdné údaje), session cookie, audit |
| GET | `/api/displays` | seznam displejů |
| GET | `/api/displays/:id` | meta + 6 slidů |
| PUT | `/api/displays/:id/slides/:n` | zápis nadpisu a textu, u AI slidu celé kb.md (audit „úprava“) |
| POST | `/api/displays/:id/slides/:n/image` | multipart upload fotky, přidá do galerie (audit „upload“) |
| DELETE | `/api/displays/:id/slides/:n/images/:nazev` | smazání jedné fotky |
| PUT | `/api/displays/:id/slides/:n/images/reorder` | změna pořadí fotek (`{poradi:[...]}`) |
| POST | `/api/displays/:id/slides/:n/video` | multipart upload videa (mp4) |
| DELETE | `/api/displays/:id/slides/:n/video` | smazání videa |
| POST | `/api/displays/:id/slides` | přidání nového slidu |
| DELETE | `/api/displays/:id/slides/:n` | odebrání slidu (AI slide nelze) |
| PUT | `/api/displays/:id/slides/reorder` | změna pořadí slidů (`{poradi:[...]}`) |
| POST | `/api/displays/:id/refresh` | mock odeslání na displej (audit) |
| GET | `/api/audit` | audit log |
| GET | `/data/...` | servírování souborů (fotky, video) |

## Poznámky

- `data/audit.jsonl` je runtime artefakt (v `.gitignore`).
- Pro reset demo dat: `rm -rf data/displeje data/audit.jsonl && npm run seed`.
- Datový root lze přepsat proměnnou `DATA_ROOT`, port proměnnou `PORT`.
