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

Přihlášení po instalaci: **`spravce` / `Amphibiarium2026`** (účet zakládá `npm run seed`).
Heslo hned změň, viz níž.

> Pořadí je důležité: nejdřív `seed` (vytvoří data), pak `build` (vytvoří web/dist),
> pak `start`. `start` čte buildnutý web z `web/dist`.

## Účty a přihlášení

Účty kurátorů jsou v **`data/users.json`**, heslo vždy jen jako **bcrypt hash**
(nikdy v otevřené podobě). Žádná databáze, stejně jako u obsahu.

```bash
npm run useradd -- jmeno heslo                  # nový účet (heslo min. 8 znaků)
npm run useradd -- jmeno noveheslo --zmenit-heslo   # změna hesla
npm run useradd -- --smazat jmeno               # zrušení účtu
npm run userlist                                # výpis účtů
```

- Přihlášení drží **podepsaná cookie** (`httpOnly`), platnost **12 hodin**
  (přepíše se přes `SESSION_TTL_HOURS`).
- Podpisový klíč je v `data/session.key` (vyrobí se sám při prvním spuštění),
  nebo se dá zadat přes `SESSION_SECRET`.
- `data/users.json` ani `data/session.key` **nepatří do gitu** (jsou v `.gitignore`)
  a neservírují se přes HTTP.
- Neúspěšné pokusy o přihlášení se zapisují do audit logu i s IP adresou.

**Co je chráněné a co veřejné:**

| | |
|---|---|
| **Veřejné** (bez přihlášení) | `/tablet/:id`, `GET /api/displays/:id`, soubory `/data/displeje/...`, `/api/login`, `/api/logout`, `/api/me` |
| **Chráněné** (401 bez session) | všechny zápisy a mazání, `GET /api/displays`, `GET /api/audit`, `GET /api/kb-template` |

Veřejné je záměrně přesně to, co potřebuje tablet u expozice. Nový endpoint je
chráněný automaticky, dokud se vědomě nepřidá do seznamu `VEREJNE_API`
v `server/src/index.ts`.

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
data/users.json                                 účty kurátorů (bcrypt hashe hesel)
data/session.key                                klíč pro podpis session cookie
```

> `users.json`, `session.key` ani `audit.jsonl` se neservírují přes HTTP —
> přes `/data/` jde ven jen složka `displeje`.

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
| POST | `/api/login` | přihlášení proti `data/users.json` (bcrypt), podepsaná session cookie, audit |
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
| GET | `/api/analytics/questions` | dotazy návštěvníků z chatbota (proxy, `since`/`limit`/`answered`) |
| GET | `/api/analytics/summary` | souhrn dotazů z chatbota (proxy, `since`) |
| GET | `/data/...` | servírování souborů (fotky, video) |

## Poznámky

- `data/audit.jsonl` je runtime artefakt (v `.gitignore`).
- Pro reset demo dat: `rm -rf data/displeje data/audit.jsonl && npm run seed`.
- Datový root lze přepsat proměnnou `DATA_ROOT`, port proměnnou `PORT`.
- Dashboard („Přehled provozu") čte dotazy návštěvníků z analytiky chatbota.
  Adresa se nastavuje proměnnou `ANALYTICS_URL` (default `http://127.0.0.1:8000`).
  Když backend neběží, dashboard to napíše a funguje dál — viz
  `docs/provoz-a-udrzba.md`, kapitola 10.
