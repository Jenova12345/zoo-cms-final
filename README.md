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
data/displeje/<cislo>/meta.json                 {"druh","stav","posledniZmena"}
data/displeje/<cislo>/cs/slide-<1..6>/text.md   slidy 1-5 (obsahové)
data/displeje/<cislo>/cs/slide-6/kb.md          slide 6 = AI znalostní báze
data/displeje/<cislo>/cs/slide-<n>/<obrazky>    fotky slidu
data/audit.jsonl                                append-only audit log
```

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
| PUT | `/api/displays/:id/slides/:n` | zápis nadpisu a textu (audit „úprava“) |
| POST | `/api/displays/:id/slides/:n/image` | multipart upload fotky (audit „upload“) |
| POST | `/api/displays/:id/refresh` | mock odeslání na displej (audit) |
| GET | `/api/audit` | audit log |
| GET | `/data/...` | servírování souborů (fotky) |

## Poznámky

- `data/audit.jsonl` je runtime artefakt (v `.gitignore`).
- Pro reset demo dat: `rm -rf data/displeje data/audit.jsonl && npm run seed`.
- Datový root lze přepsat proměnnou `DATA_ROOT`, port proměnnou `PORT`.
