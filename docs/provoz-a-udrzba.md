# Provoz a údržba. CMS Amphibiárium

Technická dokumentace k provozu CMS pavilonu Amphibiárium (ZOO Ostrava).
Popisuje **skutečný stav kódu na větvi `dev`**, ne stav popsaný v `README.md`
(ten je v části API a struktury dat zastaralý, mluví ještě o `slide-1..6`,
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
11. [Displej u deštného pralesa](#11-displej-u-deštného-pralesa)
12. [Videomapping](#12-videomapping)
13. [API a ochrana endpointů](#13-api-a-ochrana-endpointů)
14. [Údržbové skripty](#14-údržbové-skripty)
15. [Zálohování a obnova](#15-zálohování-a-obnova)
16. [Řešení potíží](#16-řešení-potíží)
17. [Známá omezení](#17-známá-omezení)

---

## 1. Architektura v kostce

| Část | Technologie | Poznámka |
|---|---|---|
| `server/` | Fastify 5 + TypeScript, běží přes `tsx` | Reálné file I/O nad datovou složkou. **Žádná databáze.** |
| `web/` | React 18 + Vite 6 + TypeScript + Tailwind | SPA, buildí se do `web/dist`. |
| datová složka | soubory a složky na disku | Zdroj pravdy pro CMS, tablet i Unity. |

V produkčním režimu běží **jeden proces**: Fastify servíruje API, statické
soubory displejů i buildnutý web.

Server se **nekompiluje**, `npm run start` spouští TypeScript přímo přes
`tsx`. Buildí se jen web. Vyžaduje Node.js 20 LTS nebo novější (ověřeno na
Node 26); `sharp` se instaluje jako předkompilovaná binárka pro danou platformu.

---

## 2. Spuštění

### Produkční (demo) režim, jeden proces

```bash
npm install     # nainstaluje server i web (npm workspaces)
npm run seed    # POZOR: přepíše data/displeje, jen při prvním rozjezdu
npm run build   # tsc + vite build → web/dist
npm run start   # Fastify: API + statická data + web
```

Pak otevřít **http://127.0.0.1:3000** (respektive `HOST:PORT`, viz níž).

Pořadí je podstatné: `start` čte buildnutý web z `web/dist`. Když složka
neexistuje, server nastartuje, ale do logu napíše varování a na `/` vrátí 404,
API i `/data/displeje/...` fungují dál.

> `npm run seed` maže a znovu generuje `data/displeje/<id>` pro všech 37 displejů.
> **Na ostrých datech ho nikdy nespouštějte.** Účtů v `users.json` se nedotýká.

### Vývojový režim, dva procesy s hot-reloadem

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
| `HOST` | `127.0.0.1` | Adresa, na které Fastify poslouchá. **Pro přístup z jiného počítače je potřeba `0.0.0.0`**, výchozí `127.0.0.1` pustí dovnitř jen lokální stroj. |
| `PORT` | `3000` | Port HTTP serveru. |
| `SESSION_SECRET` |, | Klíč pro podpis session cookie. Použije se, jen když má **aspoň 16 znaků**; jinak se sáhne po `<DATA_ROOT>/session.key`. |
| `SESSION_TTL_HOURS` | `12` | Platnost přihlášení v hodinách. Musí být kladné číslo, jinak se použije výchozí hodnota. |
| `REINGEST_ENABLED` | `false` | Řetězec `"true"` zapne odesílání reingest signálu chatbotovi. |
| `REINGEST_URL` |, | Cílová URL reingest webhooku. Bez ní se nic neodesílá ani při `REINGEST_ENABLED=true`. |
| `REINGEST_TOKEN` | prázdný | Posílá se v hlavičce `X-Reingest-Token`. |
| `ANALYTICS_URL` | `http://127.0.0.1:8000` | Adresa analytického backendu chatbota (Daniel). **Tohle je ta jedna proměnná, která se nastaví, až bude adresa známá.** Koncové lomítko se ořeže. |
| `ANALYTICS_TIMEOUT_MS` | `4000` | Kolik milisekund se čeká na odpověď analytiky. Neplatná nebo nekladná hodnota = výchozí. |
| `POCASI_LAT` | `49.8265` | Zeměpisná šířka pro venkovní teplotu (ZOO Ostrava), viz [kapitola 11](#11-displej-u-deštného-pralesa). Neplatná hodnota = výchozí + varování v logu. |
| `POCASI_LON` | `18.3242` | Zeměpisná délka pro venkovní teplotu. |
| `POCASI_TIMEOUT_MS` | `5000` | Kolik milisekund se čeká na open-meteo.com. Stahuje se na pozadí, takže timeout nezdrží odpověď tabletům. |
| `VIDEOMAPPING_WATERSENSE_HOST` | `10.10.10.51` | Adresa počítače instalace WaterSense, viz [kapitola 12](#12-videomapping). Neplatná hodnota = výchozí + varování v logu. |
| `VIDEOMAPPING_WATERSENSE_PORT` | `7000` | Port, na kterém WaterSense poslouchá OSC. |
| `VIDEOMAPPING_LES_HOST` | `10.10.10.52` | Adresa počítače instalace Les. |
| `VIDEOMAPPING_LES_PORT` | `7000` | Port, na kterém Les poslouchá OSC. |
| `OSC_TIMEOUT_MS` | `3000` | Strop pro dokončení odeslání UDP datagramu. Pojistka pro zaseknutý překlad DNS, zápis do socketu je jinak okamžitý. |

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

- **Jméno:** 2 až 32 znaků, povolena písmena (včetně diakritiky), číslice, tečka,
  pomlčka a podtržítko. Porovnává se **bez ohledu na velikost písmen**
  (`Spravce` == `spravce`), ukládá se ale ve tvaru, jak ho zadal správce.
- **Heslo:** minimálně 8 znaků. Neořezává se, mezera na kraji je jeho součástí
  (stejně při zakládání i při přihlášení).
- **Poslední účet nejde smazat**, systém by se stal nepřístupným.
- Heslo se ukládá výhradně jako **bcrypt hash (cost 12)**, nikdy otevřeně.

> Heslo zadané na příkazové řádce zůstává v historii shellu a v seznamu
> procesů. Po založení účtu je vhodné historii vyčistit.

### Výchozí účet

`npm run seed` založí účet `spravce` / `Amphibiarium2026`, ale **jen když je
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
- Cookie **nemá příznak `secure`**, funguje tedy i na čistém HTTP v pavilonové
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
        4_gal/                  Informace (NE galerie!)
          text.txt              "ObecnyText:", "Zajimavosti:", "Taxonomie:"
          foto-*.png            jedna fotka (na zařízení vpravo)
        5_vid/                  GALERIE fotek i videí (NE jen video!)
          01.jpg, 02.mp4, …     jedna číslovaná řada, Unity ji řadí abecedně
        6_txt/                  Obecné informace (pozůstalý typ, nový nejde založit)
          text.txt              "ObecnyText: …" a "Zajimavosti: …"
  audit.jsonl                   append-only audit log
  prales.json                   nastavení displeje u deštného pralesa (kapitola 11)
  users.json                    účty kurátorů (bcrypt hashe), práva 0600
  session.key                   klíč pro podpis session cookie, práva 0600
```

**Servírování přes HTTP** je zúžené na `displeje/`: `@fastify/static` má root
`<DATA_ROOT>/displeje` a prefix `/data/displeje/`. `users.json`, `session.key`
ani `audit.jsonl` proto přes `/data/...` stáhnout nejdou.

`audit.jsonl`, `users.json` a `session.key` jsou v `.gitignore`, do repozitáře
nepatří.

### Ruční zásah do složek

Soubor přetažený přímo do složky slidu se objeví v CMS i na tabletu bez
restartu. API čte disk při každém požadavku. Musí ale splňovat konvenci:
fotky `.png` (jiné přípony se ignorují; v galerii `_vid` projde i `.jpg`),
video `.mp4`, název složky slidu `<číslo>_<typ>`.

V galerii `_vid` navíc platí, že položky mají být číslované s vodící nulou
a **se stejným počtem cifer** (`01`, `02`, … nebo `001`, `002`, …). Ručně
přidaný soubor s jiným názvem se zobrazí, ale zařadí se až za očíslované;
srovná se sám, jakmile do slidu kurátor v CMS něco přidá nebo z něj smaže.

---

## 6. Formáty souborů

### `text.txt`, pole info panelu

Řádky ve tvaru `Klic: Hodnota`, kódování UTF-8. Zapisují se v pevném pořadí a
**prázdná pole se nezapisují vůbec**:

```
Sekce: Neotenie — původ moderních obojživelníků
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
  jedna z **jedenácti** hodnot podle oficiální tabule v pavilonu (definováno
  v `SEKCE_TEMATA` v `server/src/displays.ts` a v `web/src/lib/types.ts`,
  seznamy je nutné držet shodné):

  1. Červoři — záhadní obojživelníci
  2. Rozmanitost žab
  3. Pralesničky — jedovaté krásky
  4. Šesté vymírání
  5. Historie obojživelníků — přechod obratlovců z vody na souš
  6. Lezci — novodobí „obojživelníci"
  7. Madagaskar — žabí ráj
  8. Listovnice — královny noci
  9. Caudata — obojživelníci s ocasem
  10. Neotenie — původ moderních obojživelníků
  11. Obojživelníci České republiky

  Porovnává se **tolerantně k oddělovači**: čárka, em dash, en dash i
  spojovník jsou zaměnitelné, takže `Neotenie, původ moderních obojživelníků`
  i `Neotenie — původ moderních obojživelníků` projdou jako táž sekce. Do
  souboru se zapisuje kanonický tvar s em dashem. Krátké názvy z doby před
  srovnáním s tabulí (`Caudata`, `Neotenie`, …) dál projdou přes `SEKCE_STARE`.
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
    { "slozka": "4_gal",  "typ": "gal"  },
    { "slozka": "5_vid",  "typ": "vid"  },
    { "slozka": "6_txt",  "typ": "txt"  }
  ],
  "name": "Axolotl mexický",
  "latin_name": "Ambystoma mexicanum",
  "category": "Neotenie — původ moderních obojživelníků",
  "section": "Ambystomatidae"
}
```

| Pole | Význam |
|---|---|
| `druh` | Interní název pro přehled CMS. Hodnota `Nepřiřazeno` = prázdný displej. Při uložení info panelu se přepíše hodnotou `Nazev`. |
| `stav` | `online` / `offline`. **Zapisuje ho jen `seed` a `migrate`**, za běhu se neaktualizuje, není to živý monitoring. |
| `posledniZmena` | ISO datum, posouvá ho každá změna obsahu. |
| `slidy` | Doplňkový přehled složek. Přepisuje se podle skutečného stavu disku; Unity ho nepotřebuje. |
| `name` | = `Nazev`, identifikace pro chatbota. |
| `latin_name` | Kanonizované latinské jméno; chatbot podle něj páruje druh. |
| `category` | = `Sekce` (zóna expozice). |
| `section` | Taxonomická čeleď latinsky (např. `Dendrobatidae`). Existuje **jen v `meta.json`**, do `text.txt` se nezapisuje a na tabletu se nezobrazuje: je to identifikace pro chatbota. Zařazení druhu, které vidí návštěvník, je jinde, viz `Taxonomie:` u slidu `_gal`. |

Displej bez čitelného `meta.json` se v seznamu `GET /api/displays` vůbec
neobjeví, soubor je tedy povinný.

### `text.txt`, textový slide (slide `_gal`)

Pozor: **`_gal` není galerie.** Je to textový slide: dva dlouhé texty,
zařazení druhu a jedna fotka. Suffix zůstal, protože ho tak čte Unity.

```
ObecnyText: Axolotl mexický je ocasatý obojživelník, který si po celý život
zachovává larvální podobu včetně vnějších keříčkovitých žaber.
Zajimavosti: Dokáže regenerovat končetiny, ocas i části srdce.
Taxonomie: Třída: Obojživelníci | Řád: Mloci | Čeleď: Axolotlovití
```

- **Klíče jsou `ObecnyText`, `Zajimavosti` a `Taxonomie`**, bez diakritiky
  (ASCII) a case-sensitive. `ObecnyText` a `Zajimavosti` čte Unity DataLoader
  beze změny, jsou to tytéž klíče jako u pozůstalého `_txt`.
- **Hodnota obou textů smí pokračovat na dalších řádcích.** Blok končí až
  dalším klíčem nebo koncem souboru. Důsledek: řádek uvnitř textu, který sám
  začíná `Zajimavosti:`, by se přečetl jako začátek druhého bloku.
- **`Taxonomie` je jeden řádek**, který skládá server ze tří polí editoru
  (Třída, Řád, Čeleď). Oddělovač je ` | `, nevyplněná část se vynechá i s
  popiskem, všechny tři prázdné = řádek se nezapíše vůbec.
- **Popisky uvnitř `Taxonomie` se překládají**, klíč `Taxonomie:` zůstává ve
  všech jazycích stejný, aby ho Unity našlo:

  | Jazyk | Tvar hodnoty |
  |---|---|
  | cs | `Třída: … \| Řád: … \| Čeleď: …` |
  | en | `Class: … \| Order: … \| Family: …` |
  | pl | `Gromada: … \| Rząd: … \| Rodzina: …` |

  Při čtení je parser tolerantní: rozpozná popisky ve všech třech jazycích,
  bez ohledu na diakritiku a velikost písmen. Co rozpozná nedokáže, nezahodí
  tiše, ale ukáže kurátorovi v editoru s poznámkou, že to uložení přepíše.
- **Zpětná kompatibilita:** soubory z doby, kdy `_gal` byla „zajímavost"
  s jediným odstavcem pod klíčem `Popis:` (nebo `Text:`), se dál načtou,
  obsah spadne do `ObecnyText`. Prvním uložením přejde soubor do nového tvaru.
- Soubor **bez klíče** (ruční zásah) se přečte celý jako `ObecnyText`.
- **Nevyplněné pole se nezapisuje.** Prázdný slide = prázdný soubor.
- **Všechno se překládá**, sdílené s češtinou tu není nic (na rozdíl od info
  panelu, kde se sekce a latinské jméno doplňují z češtiny). Fotka je naopak
  společná, leží v `cs/`.
- Píše se přes `PUT /api/displays/:id/slides/:n/text` (tělo `{pole, jazyk}`,
  kde `pole` nese `ObecnyText`, `Zajimavosti`, `Trida`, `Rad`, `Celed`).
  Do jednoho řádku `Taxonomie:` je složí **až server**, aby tvar, který čte
  Unity, vznikal na jednom místě.
- Text se na displeji **neroluje**, doporučený limit je 250 slov na pole,
  editor průběžně počítá slova.

### `text.txt`, obecné informace (slide `_txt`, pozůstalý typ)

**Nový slide tohoto typu už nejde založit**: v cílové struktuře od Michala
není, chybí proto v nabídce „Přidat slide" i v serverové validaci
(`SLIDE_TYPY_NABIDKA`). Existující složky se dál čtou i editují, aby se
nikomu neztratil rozepsaný obsah. Nástupcem je slide `_gal`, který má tytéž
dva klíče a k nim zařazení druhu a fotku.

Dva dlouhé texty o druhu, každý pod svým klíčem, ve stejném tvaru
`Klic: Hodnota` jako info panel:

```
ObecnyText: Axolotl mexický je ocasatý obojživelník, který si po celý život
zachovává larvální podobu včetně vnějších keříčkovitých žaber.
Zajimavosti: Dokáže regenerovat končetiny, ocas i části srdce.
```

- **Klíče jsou `ObecnyText` a `Zajimavosti`**, bez diakritiky (ASCII), aby
  soubor přečetlo Unity i skripty. Zapisují se vždy v tomhle tvaru, při čtení
  je server tolerantní k velikosti písmen.
- **Hodnota smí pokračovat na dalších řádcích** (dlouhý text, odstavce). Blok
  končí až dalším klíčem nebo koncem souboru, stejná úmluva jako u `_gal`.
  Důsledek: řádek uvnitř textu, který sám začíná `Zajimavosti:`, by se přečetl
  jako začátek druhého bloku.
- Soubor **bez klíče** (ruční zásah) se přečte celý jako `ObecnyText`, ať se
  obsah neztratí.
- **Nevyplněné pole se nezapisuje.** Prázdný slide = prázdný soubor, podle toho
  se pozná, že ještě není hotový.
- **Oba texty se překládají**, sdílené s češtinou tu není nic (na rozdíl od
  info panelu, kde se sekce a latinské jméno doplňují z češtiny).
- Píše se přes `PUT /api/displays/:id/slides/:n/txt` (tělo `{pole, jazyk}`).
- Slide **nemá žádná média**: fotku, video ani mapu server odmítne.

### Sekvence 3D modelu (slide `_3d`)

- Snímky se ukládají jako **`001.png`, `002.png`, …** (tři a víc číslic),
  Unity je řadí podle čísla.
- Pořadí = pořadí nahrání. Když se nahraje víc souborů najednou, seřadí se
  podle názvu (snímky z renderu bývají `frame_001…`).
- Po smazání snímku se zbytek **přečísluje** na souvislou řadu (dvoufázově,
  přes `.tmp-*`).
- Soubor s jiným názvem než `NNN.png` se do sekvence nepočítá a ignoruje se.

### `kb.md`, znalostní báze

Markdown v **kořeni složky displeje**, ne ve slidu. Čte ho chatbot, CMS ho jen
edituje. Při zápisu se normalizují konce řádků na `\n` a doplňuje se koncový
nový řádek. Výchozí šablonu (`server/src/kbTemplate.ts`) nabízí editor přes
`GET /api/kb-template`, když je `kb.md` prázdný; vyplněný soubor se nikdy
nepřepisuje automaticky.

### Fotky

- Každý upload projde přes `sharp` (`.rotate()` srovná orientaci podle EXIF,
  strop 40 Mpx na vstupu, zmenšení na 4096 px, SVG se odmítá). Když zpracování
  selže, API vrátí 400 a nic se neuloží.
- Mimo galerii se výstup vždy převádí do **PNG**. **V galerii (`_vid`) si fotka
  drží příponu** (JPG zůstane JPG), protože tam Unity řadí abecedně a na
  formátu nezáleží; co není JPG ani PNG, převede se na PNG.
- Název je vždy unikátní: `foto-<base36 čas>-<6 hex znaků>.png`. (Safari
  pojmenovává přetažené obrázky `Unknown.jpeg`, bez unikátního jména by se
  soubory přepisovaly.)
- **Mapa výskytu** se ukládá přesně jako `mapa.png`. Označení mapy soubor
  přejmenuje; předchozí `mapa.png` se vrátí mezi běžné fotky pod novým názvem.
  Mapa je jen na slidu typu `info`.
- Fotky se čtou jen s příponou `.png`, řazené abecedně podle názvu souboru.
- **Textový slide (`_gal`) má právě jednu fotku**, nová nahraná předchozí smaže.
- **3D model (`_3d`)** má místo unikátních názvů číslovanou sekvenci, viz výš.
- **Galerie (`_vid`)** má taky číslovanou sekvenci, viz níž.

### Video

- Přijímá se **jen MP4** (kontroluje se MIME `video/mp4` nebo přípona `.mp4`),
  konverze se nedělá.
- Video patří do galerie **`_vid`** a volitelně na **`_info`** (Michal ho na
  zařízení řadí na začátek galerie fotek info panelu).
- **Na info panelu je vždy jedno** video, starší `.mp4` se před zápisem smažou.
  Název souboru se očistí (ponechá písmena včetně české diakritiky, číslice,
  tečku, pomlčku, podtržítko a mezeru) a přípona se vynutí na `.mp4`.
- **V galerii jich může být víc**, nové se přidá na konec řady a dostane
  pořadové číslo; původní název souboru se zahazuje, viz níž.
- Limit uploadu je **200 MB** (`@fastify/multipart`).

### Galerie (slide `_vid`)

Pozor: **`_vid` není jen video.** Je to galerie fotek a videí dohromady,
v jedné číslované řadě. Suffix zůstal, protože ho tak čte Unity.

- Položky se ukládají jako **`01.jpg`, `02.mp4`, `03.png`, …**: pořadové číslo
  s vodící nulou a původní přípona. **Unity je řadí abecedně**, ne číselně.
- Proto mají všechny položky **stejný počet cifer**. Šířka se počítá z počtu
  položek, takže při přechodu přes stovku se celá řada přečísluje z `01`
  na `001` (jinak by se `100` abecedně zařadilo před `99`).
- Pořadí = pořadí nahrání. Když se nahraje víc souborů najednou, seřadí se
  podle názvu.
- Po přidání i smazání se řada **přečísluje** na souvislou (dvoufázově, přes
  `.tmp-*`), takže v ní nezůstane díra.
- Maže se **po jedné položce** přes `DELETE .../slides/:n/images/:nazev`
  (v galerii projde i `.mp4`). `DELETE .../slides/:n/video` je jen pro info
  panel, v galerii by smazal všechna videa najednou.
- Soubor s neočíslovaným názvem (obsah nahraný starším CMS) se **nezahazuje**:
  zobrazí se a zařadí se za očíslované, kam ho zařadí i Unity. Do konvence se
  dostane při první změně ve slidu. **Žádná dávková migrace se nekoná.**

---

## 7. Struktura pro Unity

Fáze A (kompatibilita s Unity) je hotová a ověřená naživo. Unity načte
strukturu bez ručního zásahu. Kontrakt je:

**Zdrojem pravdy jsou složky a názvy souborů, ne `meta.json`.**

```
cs/<pořadí>_<typ>/
```

- **Typ slidu** = suffix názvu složky. Finální struktura od Michala měla pevných
  **pět typů**, `_txt` je pozůstatek (nový už nejde založit):

  | Suffix | Typ v CMS | Obsah složky |
  |---|---|---|
  | `_info` | Infopanel | `text.txt` (Klic: Hodnota), fotky `.png`, volitelně `mapa.png` a jedno `.mp4` |
  | `_ai` | AI otázky | prázdná složka |
  | `_3d` (i `_mod`) | 3D model | sekvence `001.png`, `002.png`, … |
  | `_vid` | Galerie | fotky i videa v jedné řadě: `01.jpg`, `02.mp4`, `03.png`, … |
  | `_gal` | Informace | `text.txt` (`ObecnyText:`, `Zajimavosti:`, `Taxonomie:`) + jedna `.png` |
  | `_txt` | Obecné informace | `text.txt` (`ObecnyText: …`, `Zajimavosti: …`), **žádná média** |

- **Pořadí** = číselný prefix. Složka musí odpovídat regulárnímu výrazu
  `^(\d+)_(info|vid|gal|ai|3d|mod|txt)$`, jinak ji server ignoruje.
- **Dva suffixy neodpovídají svému obsahu.** Zůstaly kvůli tomu, že je tak čte
  Unity: **`_gal` není galerie**, ale textový slide (dva texty, zařazení druhu
  a jedna fotka), a **`_vid` není jen video**, ale galerie fotek i videí.
- **`_3d` i `_mod`** znamenají 3D model. Nově zakládaný slide dostane `_3d`;
  existující `_mod` se zachová i při změně pořadí (nepřejmenovává se).
- **AI slide** je prázdná složka `<n>_ai`, její existence říká tabletu, že se
  na tomto místě má zobrazit AI průvodce. Žádný obsah nemá.
- **`_txt` je jen text.** Fotku, video ani mapu na něj server nepřijme
  (vrátí 400), takže ve složce nikdy nebude nic než `text.txt`. Nový slide
  tohoto typu už nejde založit, viz kapitola 6.
- **`kb.md` a `meta.json`** jsou v kořeni displeje, mimo `cs/`.

Operace se slidy:

| Operace | Co se stane na disku |
|---|---|
| přidání | vznikne `cs/<max+1>_<typ>/`; ostatní se nepřečíslují |
| odebrání | složka se smaže i s obsahem, zbytek se přečísluje na souvislou řadu 1..k |
| změna pořadí | složky se přejmenují na novou souvislou řadu |

Přečíslování je **dvoufázové**, nejdřív na dočasné názvy `.tmp-<n>_<typ>`, pak
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
  záznamy **od nejnovějšího**. Rotace ani stránkování nejsou, soubor roste
  neomezeně a při každém požadavku se celý načte do paměti. Při velkém objemu
  ho lze bezpečně archivovat: zastavit server, přesunout soubor stranou,
  spustit znovu (nový se založí sám).

Zaznamenávané akce (řetězce, na které se váže i obarvení v UI):

| Akce | `cil` |
|---|---|
| `přihlášení`, `odhlášení` | `systém, IP <adresa>` (u odhlášení jen `systém`) |
| `neúspěšné přihlášení` | `systém, IP <adresa>`, `uzivatel` = zadané jméno (ořezáno na 64 znaků) |
| `úprava info panelu` | `displej <id>, slide <n>` |
| `úprava textového slidu` | `displej <id>, slide <n> (<jazyk>)` |
| `úprava obecných informací` | `displej <id>, slide <n> (<jazyk>)` |
| `úprava znalostní báze` | `displej <id>` |
| `upload`, `smazání souboru` | `displej <id>, slide <n>: <soubor>` |
| `označení mapy výskytu`, `zrušení mapy výskytu` | `displej <id>, slide <n>` |
| `upload videa`, `smazání videa` | `displej <id>, slide <n>` |
| `přidání slidu`, `odebrání slidu`, `pořadí slidů` | `displej <id>` |
| `odesláno na displej` | `displej <id>` |
| `odeslán povel videomappingu` | `<instalace> (<host>:<port>): <povel> (/<osc>)` |
| `povel videomappingu selhal` | totéž a za pomlčkou důvod |

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
[reingest] VYPNUTO, poslal bych POST na '(nenastavená URL)' s tělem {"displej":1,"soubor":"displeje/1/kb.md"}
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
  Selhání se jen zaloguje varováním, nikdy neshodí server ani nezruší zápis.

### Kdy se signál posílá

| Akce | Odeslané soubory |
|---|---|
| uložení polí info panelu | `cs/<n>_info/text.txt` **a** `meta.json` (dva samostatné požadavky) |
| uložení znalostní báze | `kb.md` |

Upload fotek, videí ani změny struktury slidů reingest **nespouštějí**, pro
chatbota jsou relevantní jen fakta a identifikace druhu.

---

## 10. Analytika chatbota v dashboardu

Dashboard („Přehled provozu") ukazuje reálné dotazy návštěvníků na AI. Data
nepočítáme my, dodává je **analytický backend chatbota (Daniel)**, který běží
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
displej, dashboard nezamlčí, napíše ho pod heat mapou, ať se dá opravit
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
důvodem a jinak funguje dál, stránka se normálně otevře, heat mapa ukáže
displeje z CMS bez intenzity, KPI karty se nezobrazí (radši nic než vymyšlené
číslo). Do konzole serveru se zapíše `[analytika] … selhalo: …`.

Prázdná odpověď (chatbot běží, ale za období nejsou dotazy) se hlásí jako
„Zatím žádné dotazy.", ne jako nula bez kontextu.

### Heat mapa nad půdorysem pavilonu

Mapa dotazů kreslí body na **oficiální půdorys pavilonu od ZOO**:
`web/public/pavilon-pudorys.png` (kopie `podklady/Amphibiarium_mapa 1.png`,
6459 × 6434 px, verze s čísly displejů). Obrázek se servíruje jako statický soubor z `web/dist`, mapa
i body drží poměr stran a škálují se se šířkou okna (souřadnice jsou v %).

**Souřadnice displejů jsou v `web/src/pages/Dashboard.tsx` v poli
`PUDORYS_BODY`**, jeden řádek na displej:

```ts
{ displej: 8, x: 13.5, y: 77.7 },
```

`x`, `y` = procenta šířky a výšky obrázku (levý horní roh = 0, 0). Ruční
doladění je otázka změny čísla, nic dalšího se nepřepočítává. Skupiny jsou
v komentářích označené barvou a číslem sekce z plánku, jen pro orientaci.

#### Jak souřadnice vznikly

Aktuální plánek (od 17. 8. 2026) má **u každé vitríny natištěné číslo
displeje 1 až 31**, takže se nic nedohaduje:

1. Detekcí barevných ploch v obrázku se našly středy všech obdélníčků (spojité
   komponenty jedné barvy; vyřazená kolečka sekcí, tenké linky a obrysy).
2. Z výřezů kolem každého středu se přečetlo natištěné číslo a přiřadilo se
   k souřadnici. Každé číslo 1 až 31 padlo právě jednou, nic nechybí a nic
   nepřebývá.
3. Kontrola: body se s čísly vykreslily zpět na plánek a porovnaly s natištěnými
   čísly (i naživo v prohlížeči nad neztlumeným plánkem).

**Kolečka s čísly 1 až 11 jsou sekce** (skupiny displejů), ne displeje, body
nemají. Bez čísla jsou na plánku tři tvary, které tedy displeje nejsou:
kruhová nádrž u sekce 1, tenký zelený pruh u stěny a **prostřední box
fialového trojbloku** u sekce 8.

> Starší verze plánku čísla neměla a pozice se odhadovaly z pořadí sekcí. Tahle
> verze ten odhad ruší, pokud se v mapě někdy objeví bod mimo vitrínu, je to
> chyba souřadnice, ne domněnky.

#### Vzhled mapy

- Plánek je na pozadí **odbarvený a ztlumený** (`grayscale(1)`, `opacity 0.35`),
  aby jeho barevné zóny nepřebíjely body návštěvnosti. Ladí se u `<img>`
  v sekci mapy.
- Body mají bílý okraj a velikost podle počtu dotazů (2,2 % až 5 % šířky mapy),
  barvu podle intenzity: **nízká zelená → vysoká červená** (`heatColor`,
  legendu drží stejné zastávky v `HEAT_GRADIENT`).

#### Intenzita a stavy

- Intenzita (barva i velikost bodu) jde ze stejného zdroje jako dřív:
  `per_species.count` z `/analytics/summary`, napárováno na displeje.
- Bez dat z chatbota se body kreslí **neutrálně**, žádná vymyšlená intenzita.
- Displeje, které v CMS jsou, ale na plánku nejsou (v CMS je 37 složek, plánek
  má 31), dashboard vypíše pod mapou. Stejně tak obráceně.

### Co dashboard nezobrazuje

**Stav tabletů (online/offline) v dashboardu není.** Monitoring zařízení nemáme
z čeho číst (přijde od Michala), takže se nesimuluje, proužek displejů je
označený jako přehled z CMS a rozlišuje jen „obsah přiřazen" / „nepřiřazeno“.
`stav` v `meta.json` je editovatelný příznak CMS, **ne** živý stav zařízení.

---

## 11. Displej u deštného pralesa

Jeden displej v pavilonu neukazuje obsah druhu ze složek `data/displeje`, ale
**prostředí pavilonu a odpočet do bouřky z videomappingu**. Je to samostatná
věc: vlastní modul (`server/src/prales.ts`), vlastní soubor
(`<DATA_ROOT>/prales.json`), vlastní endpoint a vlastní stránka v CMS.
**Struktury `data/displeje` ani ostatních displejů se nijak netýká.**

### Endpoint pro Unity

```
GET /api/prales        veřejný, bez přihlášení
```

```json
{
  "countdown_seconds": 724,
  "temperature_internal": 20,
  "humidity_text": "80-100%",
  "temperature_external": 23,
  "current_date": "12.8.26",
  "alert_flashing_lights": true,
  "alert_water_effects": false
}
```

Veřejný je proto, že ho čtou tablety u expozice stejně jako
`GET /api/displays/:id` (viz `VEREJNE_API` v `server/src/index.ts`). Unity si ho
tahá **každých pět sekund z 31 tabletů**, tedy zhruba šest požadavků za sekundu
nepřetržitě.

**Odpověď proto nikdy nesahá na disk ani na síť.** Nastavení i venkovní teplota
jsou v paměti procesu; požadavek je jen výpočet odpočtu a poskládání objektu
(naměřeno pod 1 ms). Z disku se čte při startu a při změně souboru, z internetu
nejvýš jednou za deset minut na pozadí.

| Pole | Odkud se bere |
|---|---|
| `countdown_seconds` | dopočítává se z intervalu, viz níž; `0` = odpočet vypnutý |
| `temperature_internal` | nastavuje kurátor v CMS |
| `humidity_text` | nastavuje kurátor v CMS, **text** (smí být rozsah „80-100%") |
| `temperature_external` | open-meteo.com, viz níž |
| `current_date` | systémový čas serveru, formát `D.M.RR` bez vedoucích nul |
| `alert_flashing_lights` | přepínač v CMS |
| `alert_water_effects` | přepínač v CMS |

### Odpočet do bouřky

Kurátor zadá **interval opakování v minutách**; server z něj počítá, kolik
sekund zbývá do další bouřky, a cyklus se pořád opakuje.

Odpočet je odvozený od **půlnoci** (lokální čas serveru), ne od startu procesu:

```
zbývá = interval − ((teď − dnešní půlnoc) mod interval)
```

Při intervalu 15 min padnou bouřky na 0:15, 0:30, 0:45, 1:00 a tak dál. To je
podstatné pro provoz: **po restartu serveru odpočet naváže tam, kde má být**, a
nerozejde se s videomappingem. Kdyby se počítalo od startu procesu, každý
restart by rastr posunul.

Zaokrouhluje se **nahoru**, takže zapnutý odpočet nikdy nepošle `0` (nejmenší
hodnota je 1). Nula je vyhrazená pro „kurátor odpočet vypnul".

Interval, který se do dne nevejde beze zbytku (například 7 min), má poslední
cyklus před půlnocí kratší. Pavilon je v tu dobu zavřený.

### Venkovní teplota

Zdroj je **open-meteo.com**, veřejné API bez klíče a bez registrace:

```
GET https://api.open-meteo.com/v1/forecast?latitude=<lat>&longitude=<lon>&current=temperature_2m
```

Souřadnice jsou v konfiguraci (`POCASI_LAT`, `POCASI_LON`, výchozí ZOO
Ostrava), ne natvrdo v kódu. Timeout přes `POCASI_TIMEOUT_MS`.

- Stahuje se **časovačem na pozadí, nejvýš jednou za deset minut** (interval je
  konstanta, schválně se nedá zkrátit konfigurací).
- Hodnota se zaokrouhluje na celé stupně, protože displej ukazuje celé stupně.
- **Když stažení selže, použije se poslední známá hodnota z paměti.**
- Když žádná není (třeba po restartu serveru bez internetu), použije se
  **záloha, kterou nastavil kurátor v CMS**.
- Selhání se nikdy nevyhazuje jako výjimka a nikdy nezdrží odpověď tabletu.
  Cizí služba nesmí shodit ani zpomalit náš server, stejný přístup jako
  u analytiky chatbota (kapitola 10).

Poslední známá hodnota **nevyprší**; displej ji ukazuje dál, dokud se nepodaří
stáhnout novou. V CMS se ale po hodině označí jako zastaralá, ať je poznat, že
internet delší dobu nejede.

### Nastavení v CMS

Stránka **Deštný prales** v levém menu (`/prales`). Nastavuje se vnitřní
teplota, vlhkost, záložní venkovní teplota, interval bouřky včetně vypnutí a
dva přepínače varování. U každého pole je napsané, kde se na displeji projeví a
jak se jmenuje v odpovědi endpointu.

Vpravo je **náhled toho, co endpoint posílá teď**, obnovovaný každých pět
sekund (stejný rytmus jako Unity), včetně toho, jestli venkovní teplota přišla
z internetu, nebo je to záloha, a kdy naposledy. Náhled ukazuje **uložený**
stav, ne rozepsané změny ve formuláři.

Změny se zapisují do audit logu jako všechno ostatní, akce
`úprava nastavení deštného pralesa`, cíl vyjmenovává, co se změnilo z čeho na
co. Uložení beze změny se do logu nepíše.

### `prales.json`

```json
{
  "teplotaVnitrni": 20,
  "vlhkost": "80-100%",
  "teplotaVenkovniZaloha": 20,
  "bourkaZapnuta": true,
  "bourkaIntervalMin": 15,
  "varovaniBlikaniSvetel": false,
  "varovaniVodniEfekty": false
}
```

Zapisuje se atomicky (tmp + rename) jako `meta.json`. Soubor se dá editovat
i ručně: server sleduje složku `DATA_ROOT` a změnu převezme do sekundy, bez
restartu. Ruční editace ale **neprojde přes audit log** ani přes validaci
formuláře, takže se hodí spíš pro ladění.

Tolerance k rozbitému souboru:

- **Chybí** (první spuštění): použijí se výchozí hodnoty z tabulky výše.
- **Není platný JSON za běhu**: server **nechá to, co má v paměti**, a zapíše
  varování do logu. Displej jede dál na posledních dobrých hodnotách.
- **Jednotlivá hodnota je nesmysl** (text místo čísla, interval 0): spadne na
  výchozí, ostatní se převezmou. Přes CMS se takový vstup neuloží, formulář
  i server ho odmítnou hláškou.

Meze validace: teplota −50 až 60 °C, vlhkost nejvýš 40 znaků na jednom řádku,
interval celé číslo 1 až 1440 minut.

---

## 12. Videomapping

V pavilonu jsou dvě instalace videomappingu od firmy, která je dodala. Kurátor
je zapíná a vypíná ze stránky **Videomapping** (`/videomapping`).

### Jak se to ovládá

Instalace poslouchají **OSC přes UDP**, každá na svém počítači. Stačí poslat
jednu zprávu bez argumentů, zbytek si řídí samy:

| Instalace | Výchozí adresa | Zprávy |
|---|---|---|
| WaterSense | `10.10.10.51:7000` | `/start`, `/stop` |
| Les | `10.10.10.52:7000` | `/start`, `/stop` |

Adresy a porty jsou v proměnných prostředí (`VIDEOMAPPING_*`, viz
[kapitola 3](#3-proměnné-prostředí)), **ne v kódu**. Když je firma změní, stačí
přepsat proměnnou a restartovat službu; aplikace se kvůli tomu nepřekládá.
Nesmyslná hodnota (prázdno, port mimo rozsah) se nepoužije, spadne se na
výchozí a do logu jde varování, aby se tiše nemačkala tlačítka naprázdno.

### Co CMS neví a proč to tak zůstane

**UDP je jednosměrné a nikdo ho nepotvrzuje.** Odeslání datagramu neříká nic
o tom, jestli dorazil, jestli ho instalace přečetla ani jestli se rozeběhla.
Zpráva poslaná na vypnutý počítač nebo na špatnou IP odejde úplně stejně
úspěšně jako ta správná.

Z toho plyne, jak se systém chová:

- CMS **nikde neukazuje stav instalace** a nikdy nenapíše „zapnuto“. Píše
  „odeslán povel k zapnutí“ a čas odeslání.
- **Chyba se zobrazí jen tehdy, když selže naše strana**: neplatná nebo
  nepřeložitelná adresa, síť je dole, socket nešel otevřít. Endpoint na to
  vrací `502` a hlášku, kterou CMS ukáže u příslušné instalace.
- Přehled „naposledy odesláno z CMS“ drží server **v paměti** a jen za svůj
  běh. Není to stav mappingu, je to poslední povel, který odsud odešel. Po
  restartu je prázdný, celá historie zůstává v audit logu.

Jestli mapping opravdu běží, se pozná **jen pohledem do pavilonu**. Kdyby bylo
potřeba skutečný stav zobrazovat, musela by firma poslat zpátky zprávu (OSC
odpověď nebo jiný kanál), a to zatím není domluvené.

### Kódování OSC zprávy

Kvůli dvěma zprávám bez argumentů se netahá knihovna, zpráva má dvanáct bajtů
(`server/src/osc.ts`). OSC string je text + aspoň jedna nula + doplnění nulami
na násobek čtyř; typový řetězec (samotná čárka) je povinný i bez argumentů:

```
/start  2f 73 74 61 72 74 00 00   "/start" + 2 nuly (6+1 → 8)
        2c 00 00 00               ","      + 3 nuly (1+1 → 4)

/stop   2f 73 74 6f 70 00 00 00   "/stop"  + 3 nuly (5+1 → 8)
        2c 00 00 00               ","      + 3 nuly
```

Odesílá se přes `node:dgram` (`udp4`), socket se otevře a zavře pro každý povel
zvlášť. Do adresy se nikdy nedostane nic jiného než `/start` a `/stop`; kontrola
platnosti OSC adresy je v `jePlatnaOscAdresa`.

### Audit

Do audit logu jde **každý** pokus, i neúspěšný:

| Akce | Cíl |
|---|---|
| `odeslán povel videomappingu` | `WaterSense (10.10.10.51:7000): zapnout (/start)` |
| `povel videomappingu selhal` | totéž + důvod selhání |

---

## 13. API a ochrana endpointů

Hook `onRequest` se vztahuje **jen na cesty začínající `/api`**. Ve výchozím
stavu je vše zamčené; veřejné je pouze to, co je vyjmenované v množině
`VEREJNE_API` v `server/src/index.ts`. Nový endpoint je tedy chráněný
automaticky, dokud ho někdo vědomě nepřidá do seznamu.

**Veřejné (bez přihlášení):**

- `POST /api/login`, `POST /api/logout`, `GET /api/me`
- `GET /api/displays/:id`, data pro náhled tabletu u expozice
- `GET /api/prales`, data pro displej u deštného pralesa, viz [kapitola 11](#11-displej-u-deštného-pralesa)
- `/data/displeje/...` (statické soubory) a SPA včetně `/tablet/:id`, hookem
  neprocházejí vůbec

**Chráněné (bez platné session vrací `401 {"chyba":"Přihlaste se prosím."}`):**

| Metoda | Cesta | Popis |
|---|---|---|
| GET | `/api/displays` | seznam displejů (id, druh, `latin_name`, stav, poslední změna, náhledová fotka) |
| PUT | `/api/displays/:id/slides/:n` | uložení polí info panelu, tělo `{pole, section}`, vrací `{ok, latin, latinCorrected}` |
| PUT | `/api/displays/:id/kb` | zápis `kb.md`, tělo `{text}` |
| PUT | `/api/displays/:id/slides/:n/text` | texty a zařazení druhu (`_gal`), tělo `{pole, jazyk}` s klíči `ObecnyText`, `Zajimavosti`, `Trida`, `Rad`, `Celed`; řádek `Taxonomie:` skládá server |
| PUT | `/api/displays/:id/slides/:n/txt` | obecné informace (`_txt`), tělo `{pole, jazyk}` s klíči `ObecnyText` a `Zajimavosti` |
| POST | `/api/displays/:id/slides/:n/image` | multipart upload fotky; `_gal` nahradí jedinou fotku, `_3d` přidá snímek na konec sekvence, `_vid` položku na konec galerie (tam se drží přípona, jinde konverze na PNG) |
| DELETE | `/api/displays/:id/slides/:n/images/:nazev` | smazání jedné položky (v galerii i `.mp4`) |
| PUT | `/api/displays/:id/slides/:n/images/mapa` | označení mapy, tělo `{nazev}`, `null` značení zruší |
| POST | `/api/displays/:id/slides/:n/video` | multipart upload MP4; v galerii `_vid` přibude jako další položka, na `_info` nahradí to jediné |
| DELETE | `/api/displays/:id/slides/:n/video` | smazání videa info panelu (galerie se maže po položkách) |
| POST | `/api/displays/:id/slides` | přidání slidu, tělo `{typ}` (`info`/`ai`/`3d`/`vid`/`gal`; `txt` už ne) |
| DELETE | `/api/displays/:id/slides/:n` | odebrání slidu |
| PUT | `/api/displays/:id/slides/reorder` | změna pořadí, tělo `{poradi: [n, …]}` |
| POST | `/api/displays/:id/refresh` | odeslání na displej |
| GET | `/api/videomapping` | instalace videomappingu + poslední odeslaný povel (z paměti serveru) |
| POST | `/api/videomapping/:id/:povel` | OSC povel instalaci; `:id` = `watersense`/`les`, `:povel` = `start`/`stop`. `200 {ok, odeslano}` = předáno systému, **ne** potvrzení doručení; `502` = odeslání selhalo u nás |
| GET | `/api/audit` | audit log |
| GET | `/api/kb-template` | výchozí šablona `kb.md` |
| GET | `/api/analytics/questions` | dotazy návštěvníků z chatbota, `since`, `limit`, `answered`, viz [kapitola 10](#10-analytika-chatbota-v-dashboardu) |
| GET | `/api/analytics/summary` | souhrn dotazů z chatbota, `since` |
| GET | `/api/prales/nastaveni` | nastavení deštného pralesa + náhled odpovědi + stav stahování venkovní teploty |
| PUT | `/api/prales/nastaveni` | uložení nastavení deštného pralesa, vrací stejný tvar jako GET |

Chyby se vrací jako JSON `{"chyba": "..."}`; frontend tuto hlášku zobrazuje
uživateli. Na `401` klient smaže lokální stav a přesměruje na `/login` (kromě
veřejného náhledu tabletu).

**`POST /api/displays/:id/refresh` je zatím mock**, zapíše jen záznam do audit
logu (`odesláno na displej`). Skutečné vypuzení obsahu na tablet přijde s Unity
integrací. Fyzicky je obsah na disku už ve chvíli uložení, takže tablet ho
načte při dalším čtení tak jako tak.

**SPA fallback:** cokoliv mimo `/api` a `/data` vrací `index.html` (aby fungovaly
adresy typu `/displeje/12`). Nenalezené cesty pod `/api` a `/data` vrací
`404 {"chyba":"Nenalezeno."}`.

---

## 14. Údržbové skripty

Spouštějí se z kořene repozitáře a **respektují `DATA_ROOT`**.

| Příkaz | Co dělá |
|---|---|
| `npm run seed` | **Destruktivní.** Smaže a znovu vygeneruje `data/displeje/1..37`. Displeje 1 až 3 dostanou obsah (`1_info`, `2_vid` prázdná galerie, `3_gal` s texty a fotkou, `4_ai`, `kb.md`), 4 až 37 jsou `Nepřiřazeno` bez slidů. Displeje s číslem dělitelným 11 dostanou `stav: "offline"`. Zakládá výchozí účet, pokud žádný neexistuje. |
| `npm run migrate` | Jednorázová migrace staré struktury (`cs/slide-1..6`, `text.md`, `kb.md` uvnitř slidu) na formát pro Unity. Zachová média (obrázky se převedou na PNG, první MP4 jde do `2_vid`), texty starých slidů připojí do `kb.md`. **Idempotentní**, displej bez složek `slide-*` přeskočí. |
| `npm run backfill --workspace server` | Doplní do existujících `meta.json` identifikaci pro chatbota (`name`, `druh`, `latin_name`, `category`) z `text.txt`. Idempotentní, médií ani textů se nedotýká. `section` (čeleď) nezná, tu doplní kurátor v UI. V kořenovém `package.json` zkratka není. |
| `npm run prevod-obsahu -- <vstup.txt> <vystup>` | Převede blokový textový soubor (`=== ČESKY === / === ENGLISH === / === POLSKI ===`, uvnitř číslo displeje a řádky `Klic: Hodnota` nebo `Klic - Hodnota`) na zdrojovou strukturu pro import plus `mapovani.json`. **Na datovou složku CMS nesahá.** Umí infopanel i textový slide a typ pozná podle klíčů v každém bloku (`--typ=info\|gal` to vynutí). Výchozí je nanečisto, zapíše se až s `--zapsat`. |
| `npm run import-obsahu -- <zdroj> <mapovani.json>` | Hromadný import infopanelu, textového slidu a `kb.md` do CMS, ve všech třech jazycích. Výchozí je **nanečisto**, zapíše se až s `--zapsat`; displej, který už obsah daného typu má, se přeskočí, pokud se nepřidá `--prepsat`. Zapisuje výhradně přes `writeInfoPole()`/`writeGalPole()`/`writeKb()`, takže projde validací, kanonizací latiny, atomickým zápisem i auditem. Viz varování níž. |
| `npm run useradd -- …` / `npm run userlist` | Správa účtů, viz [kapitola 4](#4-účty-a-přihlašování). |

Reset demo dat:

```bash
rm -rf data/displeje data/audit.jsonl && npm run seed
```
### Formát zdrojové složky

```
zdroj/07-testus-testus/
  meta.json                 name, latin_name, section (LATINSKÁ čeleď)
  kb.md                     VOLITELNÉ, viz níž
  cs/1_info/text.txt        infopanel
  cs/1_gal/text.txt         textový slide „Informace"
  en/1_gal/text.txt         překlady, cs je povinná, en/pl volitelné
  pl/1_gal/text.txt
```

Číslo ve složce (`1_info`, `1_gal`) je **jen štítek**. Cílový slide se na
displeji hledá **podle typu**, ne podle čísla: existující `_info`/`_gal` se
přepíše, chybějící se založí na konci. Když má displej textových slidů víc
(na disku třeba `3_gal` i `4_gal`), zapíše se do prvního a plán to hlásí.

Zdrojová složka nemusí mít obojí. **Zdroj jen s textovým slidem nepotřebuje
latinské jméno ani sekci** a `writeInfoPole()` se u něj vůbec nezavolá, takže
se identita druhu v `meta.json` nemá jak změnit; na displej se páruje názvem
složky (importér ho bere jako druhý párovací klíč vedle latinského jména).

**Pozor na klíč `Celed`, který je v obou sadách a znamená pokaždé něco jiného:**

| Kde | Význam | Kam na disku |
|---|---|---|
| infopanel | **latinská** čeleď pro chatbota (`Ambystomatidae`) | `meta.json`, pole `section` |
| textový slide | **česká** čeleď pro návštěvníka (`Rosničkovití`) | řádek `Taxonomie:` v `text.txt` |

Blok, ve kterém je `Celed` sám a žádný jiný klíč, se nedá zařadit; převodník
ho odmítne a vyzve k `--typ`. Nikdy netipuje.

### Co import PŘEPÍŠE a co ne

Ověřeno na kopii dat. `--prepsat` **nemaže** galerie, videa, fotky, 3D sekvence
ani ostatní slidy: importér nikde nevolá `removeSlide()`, `deleteMedia()` ani
`deleteVideo()`, jen odemyká zámek „displej už má obsah, přeskakuji".

Zámek je **typově citlivý**: ptá se jen na typy obsahu, které zdroj opravdu
nese. Přidat textový slide na displej, který má vyplněný infopanel, proto
`--prepsat` nevyžaduje — nic se nepřepisuje. Kurátor tak nemusí odemykat
přepis všeho jen kvůli tomu, aby doplnil jeden typ obsahu.

Přepisuje se tohle, a je to potřeba vědět dopředu:

1. **`<jazyk>/<n>_info/text.txt` se přepíše CELÝ, nemerguje se.** Pole, které
   ve zdroji chybí, na displeji zmizí. Zdroj proto musí nést všech osm polí,
   i ta, která se nemění. Totéž platí pro `<n>_gal/text.txt`.
2. **`meta.section` se SMAŽE**, když zdrojový `meta.json` nemá `section`
   (`writeInfoPole()` prázdnou hodnotu maže). Tiše, bez hlášky. Vždycky proto
   `section` do zdroje dejte, i beze změny. **Zdroje jen s textovým slidem se
   to netýká**, ty `writeInfoPole()` nevolají.
3. **`kb.md` se přepíše**, ale jen když zdrojová složka má neprázdné `kb.md`.
   Když ho ve zdroji vynecháte, znalostní báze na disku zůstane nedotčená.

Fotka textového slidu, galerie ani video se nepřepisují nikdy: import řeší
jen texty. Plán u každého displeje vypisuje řádek `nedotčeno zůstane: …`.

Importér nemá přepínač „jen displej N": jede přes všechny podsložky zdroje.
Rozsah se omezuje tím, co ve zdrojové složce je.


---

## 15. Zálohování a obnova

Celý stav systému je **jedna složka**, `DATA_ROOT`. Záloha je tedy prosté
zkopírování:

```bash
tar czf amphibiarium-$(date +%F).tar.gz -C /srv/amphibiarium data
```

Zálohovat je vhodné se zastaveným serverem, nebo aspoň počítat s tím, že
souběžný upload může skončit v záloze rozepsaný.

Ve složce jsou i **citlivé soubory**, `users.json` (bcrypt hashe hesel) a
`session.key`. Zálohu je proto potřeba držet stejně chráněnou jako produkci.

Obnova = nakopírovat složku zpět a nastavit `DATA_ROOT`. Pokud se obnovuje
i `session.key`, zůstanou platné i dosud vydané session cookies; bez něj se
všichni odhlásí.

---

## 16. Řešení potíží

**`Web build nenalezen (…/web/dist). Spusť 'npm run build'.`**
Chybí buildnutý web. API běží, ale `/` vrátí 404. Řešení: `npm run build`
a restart (respektive v dev režimu pracovat na portu 5173).

**`Datová složka nenalezena (…/displeje).`**
`DATA_ROOT` ukazuje jinam, než kde data jsou, nebo se ještě neseedovalo.
Zkontrolujte hodnotu, kterou server vypíše při startu (`Datová složka: …`).

**`Žádné účty v data/users.json, do CMS se nedá přihlásit.`**
Založte účet: `npm run useradd -- <jmeno> <heslo>`. Pozor na shodný `DATA_ROOT`
mezi skriptem a serverem.

**Nejde se přihlásit, přestože heslo je správné.**
Ověřte `npm run userlist`, že účet je v té datové složce, nad kterou běží
server. Zkontrolujte také, jestli se v hesle neztratila mezera na kraji,
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
`sharp` daný formát nepřečetl. Typicky HEIC z iPhonu, ověření, jestli HEIC
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

## 17. Známá omezení

Stav k srpnu 2026, otevřené body jsou i v `handoff.md`.

- **Odeslání na displej je mock**, `/api/displays/:id/refresh` jen zapíše audit.
- **Reingest chatbota je vypnutý**, dokud se nedomluví rozhraní s chatbotem.
- **`stav` (online/offline) není živý**, hodnotu zapisuje jen `seed`/`migrate`,
  žádný monitoring tablety nekontroluje. **Přehled provozu proto stav zařízení
  vůbec neukazuje** (dřív ho simuloval); monitoring přijde od Michala.
- **Čísla v Přehledu provozu jsou reálná, ale ze chatbota**, dokud jeho
  analytika neběží, stránka to napíše a zbytek CMS funguje bez omezení, viz
  [kapitola 10](#10-analytika-chatbota-v-dashboardu).
- **Náhled tabletu není v poměru 3:2.** Unity jede fix 1200 × 800; přizpůsobení
  náhledu a servírování fotek ve vhodném rozměru je fáze B.
- **Správa účtů je jen z příkazové řádky**, v UI zatím není.
- **Přihlašování nemá rate limiting**, neúspěšné pokusy se pouze zapisují do
  auditu i s IP adresou.
- **Server nedělá HTTPS** a session cookie nemá příznak `secure`. Pro provoz
  mimo důvěryhodnou síť patří za reverzní proxy s TLS.
- **Audit log neroste omezeně řízeně**, bez rotace, `GET /api/audit` načítá
  celý soubor.
- **Vícejazyčnost není hotová.** Na disku existuje jen větev `cs/`; ostatní
  jazyky jsou v UI označené „brzy" a nejdou vybrat.
- **Seznam sekcí je zdvojený** v `server/src/displays.ts` a `web/src/lib/types.ts`
  - při změně je nutné upravit obě místa, jinak editor nabídne hodnotu, kterou
  server odmítne.
