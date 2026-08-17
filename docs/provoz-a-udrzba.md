# Provoz a údržba — CMS Amphibiárium

Technická dokumentace k provozu CMS pavilonu Amphibiárium (ZOO Ostrava).
Popisuje **skutečný stav kódu na větvi `dev`**, ne stav popsaný v `README.md`
(ten je v části API a struktury dat zastaralý — mluví ještě o `slide-1..6`,
`text.md` a endpointu pro pořadí fotek, který v kódu není).

Uživatelskou část najdete v [prirucka-kurator.md](prirucka-kurator.md).

---

## Obsah

1. [Architektura v kostce](#1-architektura-v-kostce)
2. [Spuštění](#2-spuštění)
3. [Proměnné prostředí](#3-proměnné-prostředí)
4. [Účty a přihlašování](#4-účty-a-přihlašování)
5. [Data na disku](#5-data-na-disku)
6. [Formáty souborů](#6-formáty-souborů)
7. [Struktura pro Unity](#7-struktura-pro-unity)
8. [Audit log](#8-audit-log)
9. [Reingest signál pro chatbota](#9-reingest-signál-pro-chatbota)
10. [Analytika chatbota v dashboardu](#10-analytika-chatbota-v-dashboardu)
11. [API a ochrana endpointů](#11-api-a-ochrana-endpointů)
12. [Údržbové skripty](#12-údržbové-skripty)
13. [Zálohování a obnova](#13-zálohování-a-obnova)
14. [Řešení potíží](#14-řešení-potíží)
15. [Známá omezení](#15-známá-omezení)

---

## 1. Architektura v kostce

| Část | Technologie | Poznámka |
|---|---|---|
| `server/` | Fastify 5 + TypeScript, běží přes `tsx` | Reálné file I/O nad datovou složkou. **Žádná databáze.** |
| `web/` | React 18 + Vite 6 + TypeScript + Tailwind | SPA, buildí se do `web/dist`. |
| datová složka | soubory a složky na disku | Zdroj pravdy pro CMS, tablet i Unity. |

V produkčním režimu běží **jeden proces**: Fastify servíruje API, statické
soubory displejů i buildnutý web.

Server se **nekompiluje** — `npm run start` spouští TypeScript přímo přes
`tsx`. Buildí se jen web. Vyžaduje Node.js 20 LTS nebo novější (ověřeno na
Node 26); `sharp` se instaluje jako předkompilovaná binárka pro danou platformu.

---

## 2. Spuštění

### Produkční (demo) režim — jeden proces

```bash
npm install     # nainstaluje server i web (npm workspaces)
npm run seed    # POZOR: přepíše data/displeje — jen při prvním rozjezdu
npm run build   # tsc + vite build → web/dist
npm run start   # Fastify: API + statická data + web
```

Pak otevřít **http://127.0.0.1:3000** (respektive `HOST:PORT`, viz níž).

Pořadí je podstatné: `start` čte buildnutý web z `web/dist`. Když složka
neexistuje, server nastartuje, ale do logu napíše varování a na `/` vrátí 404 —
API i `/data/displeje/...` fungují dál.

> `npm run seed` maže a znovu generuje `data/displeje/<id>` pro všech 37 displejů.
> **Na ostrých datech ho nikdy nespouštějte.** Účtů v `users.json` se nedotýká.

### Vývojový režim — dva procesy s hot-reloadem

```bash
npm run dev     # Fastify (tsx watch) na :3000 + Vite na :5173
```

V dev režimu se pracuje na **http://127.0.0.1:5173**. Vite proxuje `/api`
a `/data` na `http://127.0.0.1:3000` (viz `web/vite.config.ts`), takže
`SESSION_TTL_HOURS`, `DATA_ROOT` a spol. platí stejně.

Jednotlivé části se dají spustit i zvlášť: `npm run dev:server`, `npm run dev:web`.

---

## 3. Proměnné prostředí

Všechny se čtou při startu procesu; konfigurační soubor systém nemá.

| Proměnná | Výchozí | Význam |
|---|---|---|
| `DATA_ROOT` | `<repo>/data` | Kořen datové složky. Cesta se převádí na absolutní (`path.resolve`). |
| `HOST` | `127.0.0.1` | Adresa, na které Fastify poslouchá. **Pro přístup z jiného počítače je potřeba `0.0.0.0`** — výchozí `127.0.0.1` pustí dovnitř jen lokální stroj. |
| `PORT` | `3000` | Port HTTP serveru. |
| `SESSION_SECRET` | — | Klíč pro podpis session cookie. Použije se, jen když má **aspoň 16 znaků**; jinak se sáhne po `<DATA_ROOT>/session.key`. |
| `SESSION_TTL_HOURS` | `12` | Platnost přihlášení v hodinách. Musí být kladné číslo, jinak se použije výchozí hodnota. |
| `REINGEST_ENABLED` | `false` | Řetězec `"true"` zapne odesílání reingest signálu chatbotovi. |
| `REINGEST_URL` | — | Cílová URL reingest webhooku. Bez ní se nic neodesílá ani při `REINGEST_ENABLED=true`. |
| `REINGEST_TOKEN` | prázdný | Posílá se v hlavičce `X-Reingest-Token`. |
| `ANALYTICS_URL` | `http://127.0.0.1:8000` | Adresa analytického backendu chatbota (Daniel). **Tohle je ta jedna proměnná, která se nastaví, až bude adresa známá.** Koncové lomítko se ořeže. |
| `ANALYTICS_TIMEOUT_MS` | `4000` | Kolik milisekund se čeká na odpověď analytiky. Neplatná nebo nekladná hodnota = výchozí. |

Příklad nasazení na síť s daty mimo repozitář:

```bash
DATA_ROOT=/srv/amphibiarium/data \
HOST=0.0.0.0 \
PORT=3000 \
SESSION_SECRET="$(openssl rand -hex 32)" \
SESSION_TTL_HOURS=12 \
npm run start
```

**Pozor na dvě věci:**

- `DATA_ROOT` platí i pro CLI skripty (`useradd`, `userlist`, `seed`, `migrate`,
  `backfill`). Když se účet zakládá bez `DATA_ROOT`, zapíše se do `<repo>/data`
  a server běžící nad jinou složkou o něm nebude vědět. Skripty proto vždycky
  vypisují, se kterou datovou složkou pracují.
- `DATA_ROOT` **neovlivňuje** umístění buildnutého webu. `web/dist` se hledá
  vždy relativně k repozitáři.

---

## 4. Účty a přihlašování

### Správa účtů z příkazové řádky

```bash
npm run useradd -- <jmeno> <heslo>                  # nový účet
npm run useradd -- <jmeno> <heslo> --zmenit-heslo   # změna hesla
npm run useradd -- --smazat <jmeno>                 # zrušení účtu
npm run userlist                                    # výpis účtů
npm run useradd -- --help                           # nápověda
```

Pravidla, která vynucuje `server/src/users.ts`:

- **Jméno:** 2–32 znaků, povolena písmena (včetně diakritiky), číslice, tečka,
  pomlčka a podtržítko. Porovnává se **bez ohledu na velikost písmen**
  (`Spravce` == `spravce`), ukládá se ale ve tvaru, jak ho zadal správce.
- **Heslo:** minimálně 8 znaků. Neořezává se — mezera na kraji je jeho součástí
  (stejně při zakládání i při přihlášení).
- **Poslední účet nejde smazat** — systém by se stal nepřístupným.
- Heslo se ukládá výhradně jako **bcrypt hash (cost 12)**, nikdy otevřeně.

> Heslo zadané na příkazové řádce zůstává v historii shellu a v seznamu
> procesů. Po založení účtu je vhodné historii vyčistit.

### Výchozí účet

`npm run seed` založí účet `spravce` / `Amphibiarium2026` — ale **jen když je
`users.json` prázdný nebo neexistuje**. Existující účty se nikdy nepřepisují.
Po prvním přihlášení heslo změňte:

```bash
npm run useradd -- spravce <noveheslo> --zmenit-heslo
```

Když v `users.json` není žádný účet, server při startu zapíše varování do logu
a do CMS se nedá přihlásit.

### Jak funguje session

- Po úspěšném přihlášení se nastaví cookie **`amph_session`**: `httpOnly`,
  `sameSite=lax`, **podepsaná** (HMAC přes `@fastify/cookie`), `maxAge` podle
  `SESSION_TTL_HOURS`.
- Obsah cookie je base64url JSON `{ u: jméno, exp: čas vypršení }`. Platnost se
  ověřuje **na serveru**, ne jen přes `maxAge` v prohlížeči. Podvržená nebo
  vypršelá cookie se bere jako nepřihlášený uživatel.
- Podpisový klíč: `SESSION_SECRET` (≥ 16 znaků), jinak `<DATA_ROOT>/session.key`.
  Soubor se při prvním startu vygeneruje (32 náhodných bajtů, práva `0600`) a
  díky němu přežije přihlášení restart serveru. **Smazání `session.key` odhlásí
  všechny.**
- Neúspěšné přihlášení vrací jednu společnou hlášku (nejde poznat, jestli
  selhalo jméno, nebo heslo) a zapisuje se do audit logu **včetně IP adresy**.
  Neexistující jméno se porovnává proti slepému hashi, aby doba odpovědi
  neprozradila existenci účtu.
- Cookie **nemá příznak `secure`** — funguje tedy i na čistém HTTP v pavilonové
  síti. Při vystavení do internetu patří server za reverzní proxy s HTTPS.

---

## 5. Data na disku

Vše je pod `DATA_ROOT` (výchozí `<repo>/data`):

```
<DATA_ROOT>/
  displeje/
    <n>/                        n = číslo displeje (1..37), jen číselné názvy
      meta.json                 metadata displeje
      kb.md                     znalostní báze pro chatbota (NENÍ slide)
      cs/
        1_info/                 Infopanel
          text.txt              pole "Klic: Hodnota"
          mapa.png              volitelná mapa výskytu (přesně tento název)
          foto-*.png            ostatní fotky info panelu
          <nazev>.mp4           volitelné video (řadí se před fotky)
        2_ai/                   prázdná složka = AI otázky
        3_3d/                   3D model (i varianta 3_mod)
          001.png, 002.png, …   sekvence snímků, číslovaná od 001
        4_vid/
          <nazev>.mp4           jedno video
        5_gal/                  Zajímavost (NE galerie)
          text.txt              "Popis: <dlouhý odstavec>"
          foto-*.png            jedna fotka (na zařízení vpravo)
  audit.jsonl                   append-only audit log
  users.json                    účty kurátorů (bcrypt hashe), práva 0600
  session.key                   klíč pro podpis session cookie, práva 0600
```

**Servírování přes HTTP** je zúžené na `displeje/`: `@fastify/static` má root
`<DATA_ROOT>/displeje` a prefix `/data/displeje/`. `users.json`, `session.key`
ani `audit.jsonl` proto přes `/data/...` stáhnout nejdou.

`audit.jsonl`, `users.json` a `session.key` jsou v `.gitignore` — do repozitáře
nepatří.

### Ruční zásah do složek

Soubor přetažený přímo do složky slidu se objeví v CMS i na tabletu bez
restartu — API čte disk při každém požadavku. Musí ale splňovat konvenci:
fotky `.png` (jiné přípony se ignorují), video `.mp4`, název složky slidu
`<číslo>_<typ>`.

---

## 6. Formáty souborů

### `text.txt` — pole info panelu

Řádky ve tvaru `Klic: Hodnota`, kódování UTF-8. Zapisují se v pevném pořadí a
**prázdná pole se nezapisují vůbec**:

```
Sekce: Neotenie
Nazev: Axolotl mexický
Latinsky: Ambystoma mexicanum
Strava: vodní bezobratlí, larvy hmyzu, drobní korýši
Velikost: 25 až 30 cm
DobaLihnuti: 14 až 21 dní
Ohrozeni: kriticky ohrožený
DelkaZivota: 10 až 15 let
```

- Povolené klíče (jiné parser zahodí): `Sekce`, `Nazev`, `Latinsky`, `Strava`,
  `Velikost`, `DobaLihnuti`, `Ohrozeni`, `DelkaZivota`. Klíče jsou bez
  diakritiky a case-sensitive.
- **Povinné:** `Sekce` a `Nazev`. Validuje server i editor; `Sekce` musí být
  jedna z deseti hodnot seznamu (`Listovnice`, `Caudata`, `Červoři`, `Lezci`,
  `Madagaskar`, `Neotenie`, `Obojživelníci České republiky`, `Pralesničky`,
  `Rozmanitost žab`, `Šesté vymírání` — definováno v `server/src/displays.ts`
  a v `web/src/lib/types.ts`, seznamy je nutné držet shodné).
- Parser toleruje CRLF i mezery kolem hodnoty; při zápisu se hodnoty ořezávají.
- `Latinsky` se před zápisem **kanonizuje** (`server/src/latin.ts`): pryč
  uvozovky a koncová tečka, kolaps mezer, první písmeno velké, zbytek malými.
  `dendrobates tinctorius "azureus".` → `Dendrobates tinctorius azureus`.
  API vrací `{ latin, latinCorrected }`, aby editor mohl na úpravu upozornit.

### `meta.json`

```json
{
  "druh": "Axolotl mexický",
  "stav": "online",
  "posledniZmena": "2026-07-08T09:11:15.267Z",
  "slidy": [
    { "slozka": "1_info", "typ": "info" },
    { "slozka": "2_ai",   "typ": "ai"   },
    { "slozka": "3_3d",   "typ": "3d"   },
    { "slozka": "4_vid",  "typ": "vid"  },
    { "slozka": "5_gal",  "typ": "gal"  }
  ],
  "name": "Axolotl mexický",
  "latin_name": "Ambystoma mexicanum",
  "category": "Neotenie",
  "section": "Ambystomatidae"
}
```

| Pole | Význam |
|---|---|
| `druh` | Interní název pro přehled CMS. Hodnota `Nepřiřazeno` = prázdný displej. Při uložení info panelu se přepíše hodnotou `Nazev`. |
| `stav` | `online` / `offline`. **Zapisuje ho jen `seed` a `migrate`** — za běhu se neaktualizuje, není to živý monitoring. |
| `posledniZmena` | ISO datum, posouvá ho každá změna obsahu. |
| `slidy` | Doplňkový přehled složek. Přepisuje se podle skutečného stavu disku; Unity ho nepotřebuje. |
| `name` | = `Nazev`, identifikace pro chatbota. |
| `latin_name` | Kanonizované latinské jméno; chatbot podle něj páruje druh. |
| `category` | = `Sekce` (zóna expozice). |
| `section` | Taxonomická čeleď (např. `Dendrobatidae`). Existuje **jen v `meta.json`**, do `text.txt` se nezapisuje a na tabletu se nezobrazuje. |

Displej bez čitelného `meta.json` se v seznamu `GET /api/displays` vůbec
neobjeví — soubor je tedy povinný.

### `text.txt` — zajímavost (slide `_gal`)

Jeden dlouhý odstavec o druhu, na zařízení vlevo vedle fotky:

```
Popis: Axolotl má mimořádnou schopnost regenerace: dokáže obnovit ztracené
končetiny, ocas, části srdce i míchy bez vzniku jizev…
```

- **Zapisuje se vždy klíč `Popis:`**, při čtení se bere i `Text:` (Michal
  používá obojí). Text může na disku pokračovat na dalších řádcích — server
  bere všechno za klíčem.
- Soubor **bez klíče** (ruční zásah) se přečte celý jako holý odstavec, ať se
  obsah neztratí.
- Prázdný text = prázdný soubor.
- Píše se přes `PUT /api/displays/:id/slides/:n/text` (tělo `{text}`).
- Text se na displeji **neroluje** — doporučený limit je 150–200 slov, editor
  průběžně počítá slova.

### Sekvence 3D modelu (slide `_3d`)

- Snímky se ukládají jako **`001.png`, `002.png`, …** (tři a víc číslic),
  Unity je řadí podle čísla.
- Pořadí = pořadí nahrání. Když se nahraje víc souborů najednou, seřadí se
  podle názvu (snímky z renderu bývají `frame_001…`).
- Po smazání snímku se zbytek **přečísluje** na souvislou řadu (dvoufázově,
  přes `.tmp-*`).
- Soubor s jiným názvem než `NNN.png` se do sekvence nepočítá a ignoruje se.

### `kb.md` — znalostní báze

Markdown v **kořeni složky displeje**, ne ve slidu. Čte ho chatbot, CMS ho jen
edituje. Při zápisu se normalizují konce řádků na `\n` a doplňuje se koncový
nový řádek. Výchozí šablonu (`server/src/kbTemplate.ts`) nabízí editor přes
`GET /api/kb-template`, když je `kb.md` prázdný; vyplněný soubor se nikdy
nepřepisuje automaticky.

### Fotky

- Každý upload se převádí přes `sharp` do **PNG** (`.rotate()` srovná orientaci
  podle EXIF). Když převod selže, API vrátí 400 a nic se neuloží.
- Název je vždy unikátní: `foto-<base36 čas>-<6 hex znaků>.png`. (Safari
  pojmenovává přetažené obrázky `Unknown.jpeg`, bez unikátního jména by se
  soubory přepisovaly.)
- **Mapa výskytu** se ukládá přesně jako `mapa.png`. Označení mapy soubor
  přejmenuje; předchozí `mapa.png` se vrátí mezi běžné fotky pod novým názvem.
  Mapa je jen na slidu typu `info`.
- Fotky se čtou jen s příponou `.png`, řazené abecedně podle názvu souboru.
- **Zajímavost (`_gal`) má právě jednu fotku** — nová nahraná předchozí smaže.
- **3D model (`_3d`)** má místo unikátních názvů číslovanou sekvenci, viz výš.

### Video

- Přijímá se **jen MP4** (kontroluje se MIME `video/mp4` nebo přípona `.mp4`),
  konverze se nedělá.
- Video patří na slide **`_vid`** a nově i volitelně na **`_info`** (Michal ho
  na zařízení řadí na začátek galerie fotek info panelu).
- Na slidu je vždy **jedno** video — starší `.mp4` se před zápisem smažou.
- Název souboru se očistí (ponechá písmena včetně české diakritiky, číslice,
  tečku, pomlčku, podtržítko a mezeru) a přípona se vynutí na `.mp4`.
- Limit uploadu je **200 MB** (`@fastify/multipart`).

---

## 7. Struktura pro Unity

Fáze A (kompatibilita s Unity) je hotová a ověřená naživo — Unity načte
strukturu bez ručního zásahu. Kontrakt je:

**Zdrojem pravdy jsou složky a názvy souborů, ne `meta.json`.**

```
cs/<pořadí>_<typ>/
```

- **Typ slidu** = suffix názvu složky. Finální struktura od Michala má pevných
  **pět typů**:

  | Suffix | Typ v CMS | Obsah složky |
  |---|---|---|
  | `_info` | Infopanel | `text.txt` (Klic: Hodnota), fotky `.png`, volitelně `mapa.png` a jedno `.mp4` |
  | `_ai` | AI otázky | prázdná složka |
  | `_3d` (i `_mod`) | 3D model | sekvence `001.png`, `002.png`, … |
  | `_vid` | Video | jedno `.mp4` |
  | `_gal` | Zajímavost | `text.txt` (`Popis: …`) + jedna `.png` |

- **Pořadí** = číselný prefix. Složka musí odpovídat regulárnímu výrazu
  `^(\d+)_(info|vid|gal|ai|3d|mod)$`, jinak ji server ignoruje.
- **`_gal` je Zajímavost, ne galerie fotek.** Suffix zůstal kvůli Unity, obsah
  se ale změnil na finální strukturu: dlouhý text vlevo, jedna fotka vpravo.
- **`_3d` i `_mod`** znamenají 3D model. Nově zakládaný slide dostane `_3d`;
  existující `_mod` se zachová i při změně pořadí (nepřejmenovává se).
- **AI slide** je prázdná složka `<n>_ai` — její existence říká tabletu, že se
  na tomto místě má zobrazit AI průvodce. Žádný obsah nemá.
- **`kb.md` a `meta.json`** jsou v kořeni displeje, mimo `cs/`.

Operace se slidy:

| Operace | Co se stane na disku |
|---|---|
| přidání | vznikne `cs/<max+1>_<typ>/`; ostatní se nepřečíslují |
| odebrání | složka se smaže i s obsahem, zbytek se přečísluje na souvislou řadu 1..k |
| změna pořadí | složky se přejmenují na novou souvislou řadu |

Přečíslování je **dvoufázové** — nejdřív na dočasné názvy `.tmp-<n>_<typ>`, pak
na cílové, aby se názvy nesrazily. Když proces spadne mezi fázemi, zůstanou na
disku složky s prefixem `.tmp-`; server je ignoruje (neodpovídají regexu) a je
potřeba je přejmenovat ručně.

Protože se čísla slidů po každé strukturální změně mění, klient si po přidání,
odebrání i přesunu načítá detail displeje znovu.

---

## 8. Audit log

- Soubor: `<DATA_ROOT>/audit.jsonl`, formát **JSONL** (jeden JSON objekt na
  řádek), append-only.
- Záznam: `{"cas": ISO, "uzivatel": string, "akce": string, "cil": string}`.
- `GET /api/audit` načte **celý soubor**, přeskočí nečitelné řádky a vrátí
  záznamy **od nejnovějšího**. Rotace ani stránkování nejsou — soubor roste
  neomezeně a při každém požadavku se celý načte do paměti. Při velkém objemu
  ho lze bezpečně archivovat: zastavit server, přesunout soubor stranou,
  spustit znovu (nový se založí sám).

Zaznamenávané akce (řetězce, na které se váže i obarvení v UI):

| Akce | `cil` |
|---|---|
| `přihlášení`, `odhlášení` | `systém, IP <adresa>` (u odhlášení jen `systém`) |
| `neúspěšné přihlášení` | `systém, IP <adresa>`, `uzivatel` = zadané jméno (ořezáno na 64 znaků) |
| `úprava info panelu` | `displej <id>, slide <n>` |
| `úprava zajímavosti` | `displej <id>, slide <n>` |
| `úprava znalostní báze` | `displej <id>` |
| `upload`, `smazání fotky` | `displej <id>, slide <n>: <soubor>` |
| `označení mapy výskytu`, `zrušení mapy výskytu` | `displej <id>, slide <n>` |
| `upload videa`, `smazání videa` | `displej <id>, slide <n>` |
| `přidání slidu`, `odebrání slidu`, `pořadí slidů` | `displej <id>` |
| `odesláno na displej` | `displej <id>` |

Jméno uživatele bere server z platné session; na chráněných cestách je vždy
vyplněné (fallback `neznámý` se uplatní jen u veřejných cest).

---

## 9. Reingest signál pro chatbota

Po uložení obsahu, který chatbot čte, dá CMS chatbotovi vědět, že si má obsah
displeje načíst znovu (`server/src/reingest.ts`).

**Ve výchozím stavu je vypnutý.** Dokud není synchronizace s chatbotem
domluvená, běží na sucho: nikam se nevolá, jen se do konzole zaloguje, co by se
odeslalo:

```
[reingest] VYPNUTO — poslal bych POST na '(nenastavená URL)' s tělem {"displej":1,"soubor":"displeje/1/kb.md"}
```

### Zapnutí

```bash
REINGEST_ENABLED=true
REINGEST_URL=https://chatbot.example/reingest
REINGEST_TOKEN=<tajný token>
```

Zapne se, jen když je `REINGEST_ENABLED` přesně `"true"` **a zároveň** je
vyplněná `REINGEST_URL`.

### Chování

- **Metoda:** `POST`, `Content-Type: application/json`, hlavička
  `X-Reingest-Token: <REINGEST_TOKEN>`.
- **Tělo:** `{ "displej": <číslo>, "soubor": "displeje/<id>/<cesta>" }`,
  cesta je relativní k datové složce.
- **Timeout:** 5 sekund (`AbortSignal.timeout`).
- **Fire-and-forget:** volá se přes `void`, uložení obsahu na odpověď nečeká.
  Selhání se jen zaloguje varováním — nikdy neshodí server ani nezruší zápis.

### Kdy se signál posílá

| Akce | Odeslané soubory |
|---|---|
| uložení polí info panelu | `cs/<n>_info/text.txt` **a** `meta.json` (dva samostatné požadavky) |
| uložení znalostní báze | `kb.md` |

Upload fotek, videí ani změny struktury slidů reingest **nespouštějí** — pro
chatbota jsou relevantní jen fakta a identifikace druhu.

---

## 10. Analytika chatbota v dashboardu

Dashboard („Přehled provozu") ukazuje reálné dotazy návštěvníků na AI. Data
nepočítáme my — dodává je **analytický backend chatbota (Daniel)**, který běží
na stejném serveru. Naše strana je jen čtení (`server/src/analytics.ts`).

### Adresa a zapnutí

Nic se nezapíná, stačí adresa:

```bash
ANALYTICS_URL=http://127.0.0.1:8000   # výchozí, chatbot na stejném stroji
```

Výchozí hodnota počítá s tím, že chatbot poslouchá na portu 8000 lokálně. Když
poběží jinde, nastaví se celá adresa včetně portu (např.
`ANALYTICS_URL=http://192.168.1.50:8000`).

### Kontrakt, který čteme

| Metoda | Cesta na straně chatbota | Parametry |
|---|---|---|
| GET | `/analytics/questions` | `since` (ISO, volitelný, default 24 h), `limit` (default 500, max 2000), `answered` (`true`/`false`) |
| GET | `/analytics/summary` | `since` (ISO, volitelný) |

Bez autentizace. `questions` vrací `{questions[], total, since}`, `summary`
vrací `{since, total_questions, answered, unanswered, per_species[]}`.

**`display_id` může být `null`.** Druh se proto páruje primárně přes
`species_latin` proti `latin_name` v našich `meta.json` (obě strany se
kanonizují stejnými pravidly, viz [kapitola 6](#6-formáty-souborů)), a
`display_id` je až záložní klíč. Druh, který se nepodaří napárovat na žádný
displej, dashboard nezamlčí — napíše ho pod heat mapou, ať se dá opravit
latinský název v info panelu.

### Proxy na naší straně

Prohlížeč cizí službu nevolá. Náš server má vlastní endpointy
`GET /api/analytics/questions` a `GET /api/analytics/summary`, které jsou
**chráněné přihlášením** jako ostatní `/api`, a navíc:

- ověří vstupní parametry (nesmyslné `since`, `limit`, `answered` → `400`),
- srazí `limit` na strop 2000 z kontraktu,
- ohlídají timeout (`ANALYTICS_TIMEOUT_MS`),
- očistí odpověď, aby chybějící pole na straně chatbota neshodilo dashboard.

### Když chatbot neběží

Odpověď je **vždy `HTTP 200`** s obálkou, ne chyba:

```json
{ "dostupne": true, "data": { … } }
{ "dostupne": false, "duvod": "Analytika chatbota není dostupná na http://127.0.0.1:8000." }
```

Dashboard z toho vykreslí hlášku „Analytika chatbota zatím není připojená" i s
důvodem a jinak funguje dál — stránka se normálně otevře, heat mapa ukáže
displeje z CMS bez intenzity, KPI karty se nezobrazí (radši nic než vymyšlené
číslo). Do konzole serveru se zapíše `[analytika] … selhalo: …`.

Prázdná odpověď (chatbot běží, ale za období nejsou dotazy) se hlásí jako
„Zatím žádné dotazy.", ne jako nula bez kontextu.

### Co dashboard nezobrazuje

**Stav tabletů (online/offline) v dashboardu není.** Monitoring zařízení nemáme
z čeho číst (přijde od Michala), takže se nesimuluje — proužek displejů je
označený jako přehled z CMS a rozlišuje jen „obsah přiřazen" / „nepřiřazeno“.
`stav` v `meta.json` je editovatelný příznak CMS, **ne** živý stav zařízení.

---

## 11. API a ochrana endpointů

Hook `onRequest` se vztahuje **jen na cesty začínající `/api`**. Ve výchozím
stavu je vše zamčené; veřejné je pouze to, co je vyjmenované v množině
`VEREJNE_API` v `server/src/index.ts`. Nový endpoint je tedy chráněný
automaticky, dokud ho někdo vědomě nepřidá do seznamu.

**Veřejné (bez přihlášení):**

- `POST /api/login`, `POST /api/logout`, `GET /api/me`
- `GET /api/displays/:id` — data pro náhled tabletu u expozice
- `/data/displeje/...` (statické soubory) a SPA včetně `/tablet/:id` — hookem
  neprocházejí vůbec

**Chráněné (bez platné session vrací `401 {"chyba":"Přihlaste se prosím."}`):**

| Metoda | Cesta | Popis |
|---|---|---|
| GET | `/api/displays` | seznam displejů (id, druh, `latin_name`, stav, poslední změna, náhledová fotka) |
| PUT | `/api/displays/:id/slides/:n` | uložení polí info panelu — tělo `{pole, section}`, vrací `{ok, latin, latinCorrected}` |
| PUT | `/api/displays/:id/kb` | zápis `kb.md` — tělo `{text}` |
| PUT | `/api/displays/:id/slides/:n/text` | text zajímavosti (`_gal`) — tělo `{text}`, na disk jako `Popis: …` |
| POST | `/api/displays/:id/slides/:n/image` | multipart upload fotky (konverze na PNG); `_gal` nahradí jedinou fotku, `_3d` přidá snímek na konec sekvence |
| DELETE | `/api/displays/:id/slides/:n/images/:nazev` | smazání fotky |
| PUT | `/api/displays/:id/slides/:n/images/mapa` | označení mapy — tělo `{nazev}`, `null` značení zruší |
| POST | `/api/displays/:id/slides/:n/video` | multipart upload MP4 (slide `_vid` i `_info`) |
| DELETE | `/api/displays/:id/slides/:n/video` | smazání videa |
| POST | `/api/displays/:id/slides` | přidání slidu — tělo `{typ}` (`info`/`ai`/`3d`/`vid`/`gal`) |
| DELETE | `/api/displays/:id/slides/:n` | odebrání slidu |
| PUT | `/api/displays/:id/slides/reorder` | změna pořadí — tělo `{poradi: [n, …]}` |
| POST | `/api/displays/:id/refresh` | odeslání na displej |
| GET | `/api/audit` | audit log |
| GET | `/api/kb-template` | výchozí šablona `kb.md` |
| GET | `/api/analytics/questions` | dotazy návštěvníků z chatbota — `since`, `limit`, `answered`, viz [kapitola 10](#10-analytika-chatbota-v-dashboardu) |
| GET | `/api/analytics/summary` | souhrn dotazů z chatbota — `since` |

Chyby se vrací jako JSON `{"chyba": "..."}`; frontend tuto hlášku zobrazuje
uživateli. Na `401` klient smaže lokální stav a přesměruje na `/login` (kromě
veřejného náhledu tabletu).

**`POST /api/displays/:id/refresh` je zatím mock** — zapíše jen záznam do audit
logu (`odesláno na displej`). Skutečné vypuzení obsahu na tablet přijde s Unity
integrací. Fyzicky je obsah na disku už ve chvíli uložení, takže tablet ho
načte při dalším čtení tak jako tak.

**SPA fallback:** cokoliv mimo `/api` a `/data` vrací `index.html` (aby fungovaly
adresy typu `/displeje/12`). Nenalezené cesty pod `/api` a `/data` vrací
`404 {"chyba":"Nenalezeno."}`.

---

## 12. Údržbové skripty

Spouštějí se z kořene repozitáře a **respektují `DATA_ROOT`**.

| Příkaz | Co dělá |
|---|---|
| `npm run seed` | **Destruktivní.** Smaže a znovu vygeneruje `data/displeje/1..37`. Displeje 1–3 dostanou obsah (`1_info`, `2_vid`, `3_gal` se zajímavostí, `4_ai`, `kb.md`), 4–37 jsou `Nepřiřazeno` bez slidů. Displeje s číslem dělitelným 11 dostanou `stav: "offline"`. Zakládá výchozí účet, pokud žádný neexistuje. |
| `npm run migrate` | Jednorázová migrace staré struktury (`cs/slide-1..6`, `text.md`, `kb.md` uvnitř slidu) na formát pro Unity. Zachová média (obrázky se převedou na PNG, první MP4 jde do `2_vid`), texty starých slidů připojí do `kb.md`. **Idempotentní** — displej bez složek `slide-*` přeskočí. |
| `npm run backfill --workspace server` | Doplní do existujících `meta.json` identifikaci pro chatbota (`name`, `druh`, `latin_name`, `category`) z `text.txt`. Idempotentní, médií ani textů se nedotýká. `section` (čeleď) nezná — tu doplní kurátor v UI. V kořenovém `package.json` zkratka není. |
| `npm run useradd -- …` / `npm run userlist` | Správa účtů, viz [kapitola 4](#4-účty-a-přihlašování). |

Reset demo dat:

```bash
rm -rf data/displeje data/audit.jsonl && npm run seed
```

---

## 13. Zálohování a obnova

Celý stav systému je **jedna složka** — `DATA_ROOT`. Záloha je tedy prosté
zkopírování:

```bash
tar czf amphibiarium-$(date +%F).tar.gz -C /srv/amphibiarium data
```

Zálohovat je vhodné se zastaveným serverem, nebo aspoň počítat s tím, že
souběžný upload může skončit v záloze rozepsaný.

Ve složce jsou i **citlivé soubory** — `users.json` (bcrypt hashe hesel) a
`session.key`. Zálohu je proto potřeba držet stejně chráněnou jako produkci.

Obnova = nakopírovat složku zpět a nastavit `DATA_ROOT`. Pokud se obnovuje
i `session.key`, zůstanou platné i dosud vydané session cookies; bez něj se
všichni odhlásí.

---

## 14. Řešení potíží

**`Web build nenalezen (…/web/dist). Spusť 'npm run build'.`**
Chybí buildnutý web. API běží, ale `/` vrátí 404. Řešení: `npm run build`
a restart (respektive v dev režimu pracovat na portu 5173).

**`Datová složka nenalezena (…/displeje).`**
`DATA_ROOT` ukazuje jinam, než kde data jsou, nebo se ještě neseedovalo.
Zkontrolujte hodnotu, kterou server vypíše při startu (`Datová složka: …`).

**`Žádné účty v data/users.json — do CMS se nedá přihlásit.`**
Založte účet: `npm run useradd -- <jmeno> <heslo>`. Pozor na shodný `DATA_ROOT`
mezi skriptem a serverem.

**Nejde se přihlásit, přestože heslo je správné.**
Ověřte `npm run userlist`, že účet je v té datové složce, nad kterou běží
server. Zkontrolujte také, jestli se v hesle neztratila mezera na kraji —
neořezává se.

**Všichni se najednou odhlásili.**
Změnil se podpisový klíč: buď se nastavil/odebral `SESSION_SECRET`, nebo se
smazal `session.key`. Původní cookies se tím zneplatní.

**Server nejde otevřít z jiného počítače.**
Výchozí `HOST=127.0.0.1` poslouchá jen lokálně. Nastavte `HOST=0.0.0.0`
a povolte port ve firewallu.

**`EADDRINUSE` při startu.**
Port 3000 už někdo drží (typicky předchozí instance). Ukončete ji, nebo nastavte
jiný `PORT`.

**Fotka se nenahraje, API vrací „Obrázek se nepodařilo převést do PNG."**
`sharp` daný formát nepřečetl. Typicky HEIC z iPhonu — ověření, jestli HEIC
projde, je na seznamu otevřených bodů (viz `handoff.md`). Řešení pro provoz:
převést na JPG před nahráním.

**Video se nenahraje.**
Přijímá se jen MP4 a maximálně 200 MB.

**Na disku zůstaly složky `.tmp-<n>_<typ>`.**
Proces spadl uprostřed přečíslování slidů. Server je ignoruje. Přejmenujte je
ručně na správné `<n>_<typ>` (nebo smažte, pokud jde o kopii).

**Slide se v CMS nezobrazuje.**
Název složky musí přesně odpovídat `<číslo>_<info|vid|gal|ai>`. Cokoliv jiného
(překlep, mezera, jiný typ) server přeskočí.

**Displej v seznamu chybí.**
Chybí nebo je poškozený `meta.json`, případně složka nemá čistě číselný název.

---

## 15. Známá omezení

Stav k srpnu 2026, otevřené body jsou i v `handoff.md`.

- **Odeslání na displej je mock** — `/api/displays/:id/refresh` jen zapíše audit.
- **Reingest chatbota je vypnutý**, dokud se nedomluví rozhraní s chatbotem.
- **`stav` (online/offline) není živý** — hodnotu zapisuje jen `seed`/`migrate`,
  žádný monitoring tablety nekontroluje. **Přehled provozu proto stav zařízení
  vůbec neukazuje** (dřív ho simuloval); monitoring přijde od Michala.
- **Čísla v Přehledu provozu jsou reálná, ale ze chatbota** — dokud jeho
  analytika neběží, stránka to napíše a zbytek CMS funguje bez omezení, viz
  [kapitola 10](#10-analytika-chatbota-v-dashboardu).
- **Náhled tabletu není v poměru 3:2.** Unity jede fix 1200 × 800; přizpůsobení
  náhledu a servírování fotek ve vhodném rozměru je fáze B.
- **Správa účtů je jen z příkazové řádky**, v UI zatím není.
- **Přihlašování nemá rate limiting** — neúspěšné pokusy se pouze zapisují do
  auditu i s IP adresou.
- **Server nedělá HTTPS** a session cookie nemá příznak `secure`. Pro provoz
  mimo důvěryhodnou síť patří za reverzní proxy s TLS.
- **Audit log neroste omezeně řízeně** — bez rotace, `GET /api/audit` načítá
  celý soubor.
- **Vícejazyčnost není hotová.** Na disku existuje jen větev `cs/`; ostatní
  jazyky jsou v UI označené „brzy" a nejdou vybrat.
- **Seznam sekcí je zdvojený** v `server/src/displays.ts` a `web/src/lib/types.ts`
  — při změně je nutné upravit obě místa, jinak editor nabídne hodnotu, kterou
  server odmítne.
