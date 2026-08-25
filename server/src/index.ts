import { existsSync } from "node:fs";
import path from "node:path";
import Fastify, { type FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCookie from "@fastify/cookie";
import fastifyMultipart from "@fastify/multipart";
import fastifyRateLimit from "@fastify/rate-limit";

import { DATA_ROOT, DISPLAYS_DIR, WEB_DIST } from "./paths.js";
import { appendAudit, readAudit } from "./audit.js";
import {
  jazykNeboVychozi,
  listDisplays,
  oznacRevizi,
  stavJazyku,
  uklidDocasneSoubory,
  readMeta,
  readSlides,
  readKb,
  writeKb,
  writeInfoPole,
  writeZajimavost,
  writeTextSlide,
  saveImage,
  deleteImage,
  setMapa,
  saveVideo,
  deleteVideo,
  addSlide,
  removeSlide,
  reorderSlides,
  displayExists,
  slideExists,
  SLIDE_TYPY,
  type SlideTyp,
} from "./displays.js";
import { KB_TEMPLATE } from "./kbTemplate.js";
import { LIMIT_MAX, ziskejQuestions, ziskejSummary } from "./analytics.js";
import { prehled as prehledUdalosti } from "./udalosti.js";
import {
  popisZmen,
  sestavPayload,
  spustPrales,
  ulozNastaveni,
  validujNastaveni,
  ziskejNastaveni,
} from "./prales.js";
import { LAT, LON, ZASTARALE_PO_MS, spustPocasi, stavPocasi } from "./pocasi.js";
import {
  SESSION_COOKIE,
  SESSION_TTL_S,
  nactiNeboZalozKlic,
  prectiSession,
  vytvorSession,
} from "./session.js";
import { najdiUzivatele, overUdaje, pocetUzivatelu } from "./users.js";

// Jméno přihlášeného kurátora zjištěné v onRequest hooku (viz níž). Chráněné
// handlery ho čtou přes currentUser() do auditu, ať se users.json nečte podruhé.
declare module "fastify" {
  interface FastifyRequest {
    uzivatel: string | null;
  }
}

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";

const app = Fastify({ logger: { level: "info" } });
app.decorateRequest("uzivatel", null);

// Chybové odpovědi ven jen jako obecná hláška (žádné interní kódy, cesty ani
// stack), detail jde do server logu. Vlastní aplikační chyby, které nesou
// pole `chyba` (např. 429 z rate limitu), se pošlou tak, jak jsou.
app.setErrorHandler((err, req, reply) => {
  const e = err as { statusCode?: number; chyba?: unknown };
  const statusCode = typeof e.statusCode === "number" ? e.statusCode : 500;
  if (statusCode >= 500) req.log.error(err);
  else req.log.info({ err }, "klientská chyba");
  if (typeof e.chyba === "string") {
    return reply.code(statusCode).send({ chyba: e.chyba });
  }
  return reply.code(statusCode).send({
    chyba: statusCode < 500 ? "Neplatný požadavek." : "Chyba serveru, zkuste to prosím znovu.",
  });
});

// Klíč pro podpis session cookie (SESSION_SECRET, jinak data/session.key).
await app.register(fastifyCookie, { secret: await nactiNeboZalozKlic(app.log) });
await app.register(fastifyMultipart, {
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB, aby prošlo i mp4 video na slide
});
// Rate limit se NEaplikuje globálně (tablety pollují veřejné čtení), jen na
// konkrétní routy, které si o něj řeknou přes config.rateLimit, viz /api/login.
await app.register(fastifyRateLimit, { global: false });

// Servírování reálných souborů slidů (fotky, videa) pro CMS i tablet.
// Root je záměrně jen DISPLAYS_DIR, ne celý DATA_ROOT: users.json,
// session.key ani audit.jsonl se přes HTTP stáhnout nedají. Adresy souborů
// (/data/displeje/...) zůstávají stejné jako dřív.
await app.register(fastifyStatic, {
  root: DISPLAYS_DIR,
  prefix: "/data/displeje/",
  decorateReply: false,
});

// --- Session ---

// Jméno z platné podepsané session, jinak null. Kromě podpisu a expirace se
// ověřuje i proti users.json: účet musí pořád existovat a jeho serial
// (zmeneno/vytvoreno) sedět se serialem v session. Tím se smazání účtu i změna
// hesla propíšou do zneplatnění dosud vydaných cookies.
async function prihlasenyUzivatel(req: FastifyRequest): Promise<string | null> {
  const raw = req.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const odpodepsano = req.unsignCookie(raw);
  if (!odpodepsano.valid || !odpodepsano.value) return null;
  const data = prectiSession(odpodepsano.value);
  if (!data) return null;
  const user = await najdiUzivatele(data.u);
  if (!user) return null; // účet mezitím smazán
  if (data.v !== (user.zmeneno ?? user.vytvoreno)) return null; // heslo změněno
  return user.jmeno;
}

// Jméno do auditu. Na chráněných cestách je vždy vyplněné, protože hook níž ho
// po ověření uloží na request; fallback je pojistka pro veřejné cesty.
function currentUser(req: FastifyRequest): string {
  return req.uzivatel ?? "neznámý";
}

const COOKIE_NASTAVENI = {
  path: "/",
  httpOnly: true, // JavaScript v prohlížeči se k session nedostane
  sameSite: "lax" as const,
  signed: true,
  maxAge: SESSION_TTL_S,
};

// Veřejné API: přihlašovací tok a čtení obsahu displeje pro náhled tabletu
// (ten u expozice běží bez přihlášení). Všechno ostatní pod /api vyžaduje
// platnou session, zamykáme ve výchozím stavu, takže nový endpoint je
// chráněný automaticky, dokud ho někdo vědomě nepřidá sem.
const VEREJNE_API = new Set([
  "POST /api/login",
  "POST /api/logout",
  "GET /api/me",
  "GET /api/displays/:id", // data pro /tablet/:id
  "GET /api/prales", // data pro displej u deštného pralesa (Unity, každých 5 s)
]);

// Míří požadavek do /api namespace? Rozhodujeme podle SKUTEČNĚ napárované
// routy (router už cestu dekódoval a normalizoval), ne podle syrového
// req.url. Jinak by šlo autorizaci obejít procentním kódováním písmen
// (`/%61pi/...` = `/api/...`), zdvojeným lomítkem nebo velkými písmeny, protože
// router takovou cestu na chráněný handler napáruje, ale `req.url.startsWith`
// ji nepozná. Nenapárovanou cestu (404 pod /api) posuzujeme z dekódovaného
// tvaru, ať skončí v 401, ne v SPA fallbacku.
function miriNaApi(req: FastifyRequest): boolean {
  if ((req.routeOptions?.url ?? "").startsWith("/api")) return true;
  let cesta = req.url.split("?")[0].split("#")[0];
  for (let i = 0; i < 3; i++) {
    let dekod: string;
    try {
      dekod = decodeURIComponent(cesta);
    } catch {
      break; // nerozkódovatelná cesta: posuď ji v tom tvaru, jaký máme
    }
    if (dekod === cesta) break;
    cesta = dekod;
  }
  cesta = cesta.replace(/\/{2,}/g, "/").toLowerCase();
  return cesta.startsWith("/api");
}

app.addHook("onRequest", async (req, reply) => {
  if (!miriNaApi(req)) return; // statické soubory a SPA
  // HEAD se routuje na stejný handler jako GET.
  const metoda = req.method === "HEAD" ? "GET" : req.method;
  const cesta = req.routeOptions?.url ?? "";
  if (VEREJNE_API.has(`${metoda} ${cesta}`)) return;
  const jmeno = await prihlasenyUzivatel(req);
  if (jmeno) {
    req.uzivatel = jmeno; // pro audit v chráněných handlerech
    return;
  }
  return reply.code(401).send({ chyba: "Přihlaste se prosím." });
});

function validId(id: string): boolean {
  return /^\d+$/.test(id);
}

// Slide se adresuje číselným prefixem složky (<n>_<typ>). Po přečíslování se
// čísla mění, klient si po každé strukturální změně načte detail znovu.
function validSlide(n: number): boolean {
  return Number.isInteger(n) && n >= 1;
}

// --- Auth ---
// Ověřuje se proti bcrypt hashům v data/users.json (účty zakládá
// `npm run useradd`). Heslo se záměrně neořezává, mezera na kraji je jeho
// součástí, stejně jako při zakládání účtu.
app.post<{ Body: { username?: string; password?: string } }>(
  "/api/login",
  {
    // Tělo se validuje schématem, ale `attachValidation` nechá běžet handler i
    // při chybě (místo automatického 400), tak se i nevalidní pokus (číslo
    // místo řetězce apod.) zapíše do auditu a vrátí 400, ne 500.
    attachValidation: true,
    schema: {
      body: {
        type: "object",
        required: ["username", "password"],
        properties: {
          username: { type: "string" },
          password: { type: "string" },
        },
      },
    },
    // Brzda proti hádání hesel i proti DoS (bcrypt blokuje event loop): 5 pokusů
    // za 15 minut na kombinaci IP + přihlašovací jméno. `hook: preHandler`, ať
    // je při počítání klíče už rozparsované tělo requestu. 429 vrací stejný tvar
    // { chyba } jako ostatní chyby, takže ho klient zobrazí jako běžnou hlášku.
    config: {
      rateLimit: {
        max: 5,
        timeWindow: "15 minutes",
        hook: "preHandler",
        keyGenerator: (req: FastifyRequest) => {
          const telo = req.body as { username?: unknown } | undefined;
          const jmeno = typeof telo?.username === "string" ? telo.username.trim().toLowerCase() : "";
          return `${req.ip}:${jmeno}`;
        },
        errorResponseBuilder: (_req, ctx) => ({
          // Plugin tenhle objekt vyhodí; statusCode z kontextu (429) drží
          // správný HTTP kód, `chyba` čte klient stejně jako u jiných chyb.
          statusCode: ctx.statusCode,
          chyba: "Příliš mnoho pokusů o přihlášení, zkuste to za pár minut.",
        }),
      },
    },
  },
  async (req, reply) => {
    if (req.validationError) {
      await appendAudit({
        uzivatel: "(neplatný požadavek)",
        akce: "neúspěšné přihlášení",
        cil: `systém, IP ${req.ip}`,
      });
      return reply.code(400).send({ ok: false, chyba: "Vyplňte jméno i heslo." });
    }
    const username = (req.body?.username ?? "").trim();
  const password = req.body?.password ?? "";
  if (!username || !password) {
    return reply.code(400).send({ ok: false, chyba: "Vyplňte jméno i heslo." });
  }

  const user = await overUdaje(username, password);
  if (!user) {
    // Jedna společná hláška: z odpovědi nejde poznat, jestli neexistuje jméno,
    // nebo nesedělo heslo. Do auditu NEzapisujeme zadaný řetězec doslova,
    // kurátor si mohl splést pole a napsat do "jména" heslo. Pro existující
    // účet logujeme jeho jméno, jinak neutrální značku.
    const existujici = await najdiUzivatele(username);
    await appendAudit({
      uzivatel: existujici ? existujici.jmeno : "(neznámé jméno)",
      akce: "neúspěšné přihlášení",
      cil: `systém, IP ${req.ip}`,
    });
    return reply.code(401).send({ ok: false, chyba: "Neplatné přihlašovací údaje." });
  }

  reply.setCookie(SESSION_COOKIE, vytvorSession(user.jmeno, user.zmeneno ?? user.vytvoreno), COOKIE_NASTAVENI);
  await appendAudit({ uzivatel: user.jmeno, akce: "přihlášení", cil: `systém, IP ${req.ip}` });
  return { ok: true, username: user.jmeno };
});

app.post("/api/logout", async (req, reply) => {
  const jmeno = await prihlasenyUzivatel(req);
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
  if (jmeno) {
    await appendAudit({ uzivatel: jmeno, akce: "odhlášení", cil: "systém" });
  }
  return { ok: true };
});

app.get("/api/me", async (req) => {
  return { username: await prihlasenyUzivatel(req) };
});

// Výchozí šablona znalostní báze (nabízí ji editor u prázdného kb.md).
app.get("/api/kb-template", async () => {
  return { text: KB_TEMPLATE };
});

// --- Displeje ---
app.get("/api/displays", async () => {
  return { displays: await listDisplays() };
});

// `jazyk` je volitelný a výchozí je cs, takže klient, který ho neposílá
// (Unity, chatbot, tablet u expozice), dostane přesně to co dřív. Neznámá
// hodnota spadne zpátky na cs, do cesty se tak nikdy nedostane nic jiného
// než cs, en nebo pl.
app.get<{ Params: { id: string }; Querystring: { jazyk?: string } }>(
  "/api/displays/:id",
  async (req, reply) => {
    const { id } = req.params;
    if (!validId(id)) return reply.code(400).send({ chyba: "Neplatné id." });
    const meta = await readMeta(id);
    if (!meta) return reply.code(404).send({ chyba: "Displej nenalezen." });

    const jazyk = jazykNeboVychozi(req.query.jazyk);
    return {
      id,
      meta,
      slides: await readSlides(id, jazyk),
      kb: await readKb(id, jazyk),
      // Doplňková pole pro CMS; klienti, kteří je neznají, je ignorují.
      jazyk,
      jazyky: await stavJazyku(id),
    };
  },
);

// --- Znalostní báze (kb.md v kořeni displeje, edituje se mimo slidy) ---
app.put<{ Params: { id: string }; Body: { text?: string; jazyk?: string } }>(
  "/api/displays/:id/kb",
  async (req, reply) => {
    const { id } = req.params;
    if (!validId(id)) return reply.code(400).send({ chyba: "Neplatné id." });
    if (!(await displayExists(id))) return reply.code(404).send({ chyba: "Displej nenalezen." });

    // Text je povinný: chybějící nebo prázdné tělo by jinak tiše smazalo kb.md.
    const text = req.body?.text;
    if (typeof text !== "string" || text.trim() === "") {
      return reply.code(400).send({ chyba: "Text znalostní báze nesmí být prázdný." });
    }
    const jazyk = jazykNeboVychozi(req.body?.jazyk);
    await writeKb(id, text, jazyk);
    await appendAudit({
      uzivatel: currentUser(req),
      akce: "úprava znalostní báze",
      cil: `displej ${id} (${jazyk})`,
    });
    return { ok: true };
  },
);

// Uložení polí info panelu. Vzniká cs/<slozka>/text.txt (Klic: Hodnota) a táž
// identita (name, latin_name, category, section) se propíše do meta.json.
app.put<{
  Params: { id: string; n: string };
  Body: { pole?: Record<string, string>; section?: string; jazyk?: string };
}>("/api/displays/:id/slides/:n", async (req, reply) => {
  const { id } = req.params;
  const n = Number(req.params.n);
  if (!validId(id) || !validSlide(n)) return reply.code(400).send({ chyba: "Neplatné parametry." });
  if (!(await displayExists(id))) return reply.code(404).send({ chyba: "Displej nenalezen." });
  if (!(await slideExists(id, n))) return reply.code(404).send({ chyba: "Slide nenalezen." });

  const pole = req.body?.pole && typeof req.body.pole === "object" ? req.body.pole : {};
  const section = typeof req.body?.section === "string" ? req.body.section : undefined;
  const jazyk = jazykNeboVychozi(req.body?.jazyk);
  const res = await writeInfoPole(id, n, pole, section, jazyk);
  if (!res.ok) return reply.code(400).send({ chyba: res.chyba });
  await appendAudit({
    uzivatel: currentUser(req),
    akce: "úprava info panelu",
    cil: `displej ${id}, slide ${n} (${jazyk})`,
  });
  return { ok: true, latin: res.latin, latinCorrected: res.latinCorrected };
});

// Text zajímavosti (slide _gal): jeden dlouhý odstavec, na disku
// cs/<slozka>/text.txt jako "Popis: …".
app.put<{ Params: { id: string; n: string }; Body: { text?: string; jazyk?: string } }>(
  "/api/displays/:id/slides/:n/text",
  async (req, reply) => {
    const { id } = req.params;
    const n = Number(req.params.n);
    if (!validId(id) || !validSlide(n)) return reply.code(400).send({ chyba: "Neplatné parametry." });
    if (!(await slideExists(id, n))) return reply.code(404).send({ chyba: "Slide nenalezen." });

    // Prázdný text projde: kurátor si slide založí a text dopíše později,
    // je to legitimní rozdělaná práce (za hotový takový slide označit nejde,
    // to hlídá editor). Chybějící pole ale ne, to by znamenalo špatně
    // poskládaný požadavek a tiché smazání obsahu.
    const text = req.body?.text;
    if (typeof text !== "string") {
      return reply.code(400).send({ chyba: "Chybí text zajímavosti." });
    }
    const res = await writeZajimavost(id, n, text, jazykNeboVychozi(req.body?.jazyk));
    if (!res.ok) return reply.code(400).send({ chyba: res.chyba });
    await appendAudit({
      uzivatel: currentUser(req),
      akce: "úprava zajímavosti",
      cil: `displej ${id}, slide ${n}`,
    });
    return { ok: true };
  },
);

// Obecné informace (slide _txt): dva dlouhé texty, na disku
// cs/<slozka>/text.txt jako "ObecnyText: …" a "Zajimavosti: …".
//
// Vlastní cesta, ne rozšíření endpointu info panelu: ten má jinou validaci
// (povinná sekce a název) i jiná sdílená pole, a chování stávajících typů
// se měnit nemá. Oba texty se překládají, takže se posílá i `jazyk`.
app.put<{
  Params: { id: string; n: string };
  Body: { pole?: Record<string, string>; jazyk?: string };
}>("/api/displays/:id/slides/:n/txt", async (req, reply) => {
  const { id } = req.params;
  const n = Number(req.params.n);
  if (!validId(id) || !validSlide(n)) return reply.code(400).send({ chyba: "Neplatné parametry." });
  if (!(await slideExists(id, n))) return reply.code(404).send({ chyba: "Slide nenalezen." });

  // Prázdné texty projdou (rozdělaná práce), chybějící objekt `pole` ne:
  // to by znamenalo špatně poskládaný požadavek a tiché smazání obsahu.
  // Stejné pravidlo jako u zajímavosti.
  const pole = req.body?.pole;
  if (!pole || typeof pole !== "object" || Array.isArray(pole)) {
    return reply.code(400).send({ chyba: "Chybí texty slidu." });
  }
  for (const hodnota of Object.values(pole)) {
    if (typeof hodnota !== "string") {
      return reply.code(400).send({ chyba: "Texty slidu musí být řetězce." });
    }
  }

  const jazyk = jazykNeboVychozi(req.body?.jazyk);
  const res = await writeTextSlide(id, n, pole, jazyk);
  if (!res.ok) return reply.code(400).send({ chyba: res.chyba });
  await appendAudit({
    uzivatel: currentUser(req),
    akce: "úprava obecných informací",
    cil: `displej ${id}, slide ${n} (${jazyk})`,
  });
  return { ok: true };
});

// Upload fotky (info panel, zajímavost, snímek 3D sekvence). Vždy se převádí
// do PNG kvůli Unity.
app.post<{ Params: { id: string; n: string } }>(
  "/api/displays/:id/slides/:n/image",
  async (req, reply) => {
    const { id } = req.params;
    const n = Number(req.params.n);
    if (!validId(id) || !validSlide(n)) return reply.code(400).send({ chyba: "Neplatné parametry." });
    if (!(await slideExists(id, n))) return reply.code(404).send({ chyba: "Slide nenalezen." });

    const file = await req.file();
    if (!file) return reply.code(400).send({ chyba: "Chybí soubor." });
    const buffer = await file.toBuffer();
    const res = await saveImage(id, n, buffer);
    if (!res.ok) return reply.code(400).send({ chyba: res.chyba });

    await appendAudit({
      uzivatel: currentUser(req),
      akce: "upload",
      cil: `displej ${id}, slide ${n}: ${path.basename(res.url!)}`,
    });
    return { ok: true, url: res.url };
  },
);

// Smazání jedné fotky slidu.
app.delete<{ Params: { id: string; n: string; nazev: string } }>(
  "/api/displays/:id/slides/:n/images/:nazev",
  async (req, reply) => {
    const { id } = req.params;
    const n = Number(req.params.n);
    if (!validId(id) || !validSlide(n)) return reply.code(400).send({ chyba: "Neplatné parametry." });
    if (!(await slideExists(id, n))) return reply.code(404).send({ chyba: "Slide nenalezen." });

    // Fastify parametr už dekóduje; druhé decodeURIComponent zbytečně padalo
    // na URIError u samotného "%". Stačí basename.
    const nazev = path.basename(req.params.nazev);
    const ok = await deleteImage(id, n, nazev);
    if (!ok) return reply.code(400).send({ chyba: "Fotku se nepodařilo smazat." });

    await appendAudit({
      uzivatel: currentUser(req),
      akce: "smazání fotky",
      cil: `displej ${id}, slide ${n}: ${nazev}`,
    });
    return { ok: true };
  },
);

// Označení fotky info panelu jako mapa výskytu (přejmenuje se na mapa.png).
// Body { nazev: null } značení zruší.
app.put<{ Params: { id: string; n: string }; Body: { nazev?: string | null } }>(
  "/api/displays/:id/slides/:n/images/mapa",
  async (req, reply) => {
    const { id } = req.params;
    const n = Number(req.params.n);
    if (!validId(id) || !validSlide(n)) return reply.code(400).send({ chyba: "Neplatné parametry." });
    if (!(await slideExists(id, n))) return reply.code(404).send({ chyba: "Slide nenalezen." });

    // Název přichází z JSON těla jako holé jméno souboru (ne URL-encoded);
    // decodeURIComponent tu nemá co dělat a padal na "%".
    const nazev = typeof req.body?.nazev === "string" ? req.body.nazev : null;
    const res = await setMapa(id, n, nazev);
    if (!res.ok) return reply.code(400).send({ chyba: res.chyba });

    await appendAudit({
      uzivatel: currentUser(req),
      akce: nazev ? "označení mapy výskytu" : "zrušení mapy výskytu",
      cil: `displej ${id}, slide ${n}${nazev ? `: ${path.basename(nazev)}` : ""}`,
    });
    return { ok: true };
  },
);

// Nahrání videa (jen video slide, ukládá se jako mp4).
app.post<{ Params: { id: string; n: string } }>(
  "/api/displays/:id/slides/:n/video",
  async (req, reply) => {
    const { id } = req.params;
    const n = Number(req.params.n);
    if (!validId(id) || !validSlide(n)) return reply.code(400).send({ chyba: "Neplatné parametry." });
    if (!(await slideExists(id, n))) return reply.code(404).send({ chyba: "Slide nenalezen." });

    const file = await req.file();
    if (!file) return reply.code(400).send({ chyba: "Chybí soubor." });
    const ext = path.extname(file.filename).toLowerCase();
    const jeMp4 = file.mimetype === "video/mp4" || ext === ".mp4";
    if (!jeMp4) return reply.code(400).send({ chyba: "Nahrajte prosím video ve formátu MP4." });

    const buffer = await file.toBuffer();
    const res = await saveVideo(id, n, file.filename, buffer);
    if (!res.ok) return reply.code(400).send({ chyba: res.chyba });
    await appendAudit({
      uzivatel: currentUser(req),
      akce: "upload videa",
      cil: `displej ${id}, slide ${n}: ${path.basename(res.url!)}`,
    });
    return { ok: true, url: res.url };
  },
);

// Smazání videa slidu.
app.delete<{ Params: { id: string; n: string } }>(
  "/api/displays/:id/slides/:n/video",
  async (req, reply) => {
    const { id } = req.params;
    const n = Number(req.params.n);
    if (!validId(id) || !validSlide(n)) return reply.code(400).send({ chyba: "Neplatné parametry." });
    if (!(await slideExists(id, n))) return reply.code(404).send({ chyba: "Slide nenalezen." });

    await deleteVideo(id, n);
    await appendAudit({
      uzivatel: currentUser(req),
      akce: "smazání videa",
      cil: `displej ${id}, slide ${n}`,
    });
    return { ok: true };
  },
);

// Přidání nového slidu zvoleného typu na konec displeje.
app.post<{ Params: { id: string }; Body: { typ?: string } }>(
  "/api/displays/:id/slides",
  async (req, reply) => {
    const { id } = req.params;
    if (!validId(id)) return reply.code(400).send({ chyba: "Neplatné id." });
    if (!(await displayExists(id))) return reply.code(404).send({ chyba: "Displej nenalezen." });

    const typ = req.body?.typ;
    if (!typ || !SLIDE_TYPY.includes(typ as SlideTyp)) {
      return reply.code(400).send({ chyba: "Neplatný typ slidu." });
    }
    const n = await addSlide(id, typ as SlideTyp);
    await appendAudit({
      uzivatel: currentUser(req),
      akce: "přidání slidu",
      cil: `displej ${id}, slide ${n} (${typ})`,
    });
    return { ok: true, n };
  },
);

// Odebrání slidu; zbylé složky se přečíslují na souvislou řadu.
app.delete<{ Params: { id: string; n: string } }>(
  "/api/displays/:id/slides/:n",
  async (req, reply) => {
    const { id } = req.params;
    const n = Number(req.params.n);
    if (!validId(id) || !validSlide(n)) return reply.code(400).send({ chyba: "Neplatné parametry." });
    if (!(await displayExists(id))) return reply.code(404).send({ chyba: "Displej nenalezen." });

    const res = await removeSlide(id, n);
    if (!res.ok) return reply.code(400).send({ chyba: res.chyba });
    await appendAudit({
      uzivatel: currentUser(req),
      akce: "odebrání slidu",
      cil: `displej ${id}, slide ${n}`,
    });
    return { ok: true };
  },
);

// Změna pořadí slidů: přejmenují se číselné prefixy složek.
app.put<{ Params: { id: string }; Body: { poradi?: number[] } }>(
  "/api/displays/:id/slides/reorder",
  async (req, reply) => {
    const { id } = req.params;
    if (!validId(id)) return reply.code(400).send({ chyba: "Neplatné id." });
    if (!(await displayExists(id))) return reply.code(404).send({ chyba: "Displej nenalezen." });

    const poradi = Array.isArray(req.body?.poradi)
      ? req.body!.poradi.map(Number).filter((x) => Number.isInteger(x))
      : [];
    await reorderSlides(id, poradi);
    await appendAudit({
      uzivatel: currentUser(req),
      akce: "pořadí slidů",
      cil: `displej ${id}`,
    });
    return { ok: true };
  },
);

// Kurátor potvrzuje, že AI texty z hromadného importu přečetl a schvaluje je.
// Je to záznam o převzetí odpovědnosti za text o živém zvířeti, který uvidí
// veřejnost, proto vlastní endpoint a vlastní řádek v auditu se jménem a
// časem, ne vedlejší efekt uložení kb.md.
app.post<{ Params: { id: string } }>("/api/displays/:id/revize", async (req, reply) => {
  const { id } = req.params;
  if (!validId(id)) return reply.code(400).send({ chyba: "Neplatné id." });
  const meta = await readMeta(id);
  if (!meta) return reply.code(404).send({ chyba: "Displej nenalezen." });
  if (!meta.cekaNaRevizi) {
    return reply.code(400).send({ chyba: "Tento displej na revizi nečeká." });
  }

  await oznacRevizi(id, false);
  await appendAudit({
    uzivatel: currentUser(req),
    akce: "potvrzení revize AI textů",
    cil: `displej ${id}${meta.druh ? ` (${meta.druh})` : ""}`,
  });
  return { ok: true };
});

app.post<{ Params: { id: string } }>("/api/displays/:id/refresh", async (req, reply) => {
  const { id } = req.params;
  if (!validId(id)) return reply.code(400).send({ chyba: "Neplatné id." });
  if (!(await displayExists(id))) return reply.code(404).send({ chyba: "Displej nenalezen." });
  // Mock: skutečné odeslání na tablet přijde s Unity integrací.
  await appendAudit({
    uzivatel: currentUser(req),
    akce: "odesláno na displej",
    cil: `displej ${id}`,
  });
  return { ok: true };
});

// --- Displej u deštného pralesa ---
//
// Samostatná věc pro jeden displej: neukazuje obsah druhu, ale prostředí
// pavilonu a odpočet do bouřky z videomappingu. Se strukturou data/displeje
// nemá nic společného, nastavení leží v data/prales.json.
//
// GET /api/prales je VEŘEJNÝ (viz VEREJNE_API), stejně jako čtení obsahu pro
// tablet u expozice: Unity si ho tahá každých pět sekund z 31 tabletů a
// přihlašovat se nemá jak. Odpověď je proto celá z paměti, bez čtení z disku
// a bez čekání na síť, viz prales.ts a pocasi.ts.

app.get("/api/prales", async () => {
  return sestavPayload().payload;
});

// Podklad pro nastavovací stránku v CMS: uložené hodnoty, přesně to, co
// zrovna dostávají tablety, a stav stahování venkovní teploty (odkud je a
// kdy přišla). Stejný tvar vrací i PUT, ať si stránka po uložení jen
// vymění stav a nemusí se ptát podruhé.
function stavPraleseProCms() {
  const { payload, zdrojTeploty } = sestavPayload();
  const p = stavPocasi();
  const stariMs = p.ziskano ? Date.now() - Date.parse(p.ziskano) : null;
  return {
    nastaveni: ziskejNastaveni(),
    nahled: payload,
    pocasi: {
      zdroj: zdrojTeploty, // "internet" = stažená hodnota, "zaloha" = od kurátora
      teplota: p.teplota,
      ziskano: p.ziskano,
      posledniPokus: p.posledniPokus,
      chyba: p.chyba,
      // Hodnota se používá dál (podle zadání), tohle je jen upozornění pro
      // kurátora, že internet delší dobu nejede.
      zastarale: stariMs !== null && stariMs > ZASTARALE_PO_MS,
      souradnice: { lat: LAT, lon: LON },
    },
  };
}

// Chráněné přihlášením jako ostatní /api.
app.get("/api/prales/nastaveni", async () => {
  return stavPraleseProCms();
});

app.put<{ Body: unknown }>("/api/prales/nastaveni", async (req, reply) => {
  const res = validujNastaveni(req.body);
  if (!res.ok) return reply.code(400).send({ chyba: res.chyba });

  const stare = ziskejNastaveni();
  const zmeny = popisZmen(stare, res.nastaveni);
  await ulozNastaveni(res.nastaveni);

  // Uložení beze změny (kurátor otevřel stránku a klikl na Uložit) se do
  // auditu nepíše, jen by ho zaplevelilo. Skutečné změny ano, i s tím,
  // co se změnilo z čeho na co.
  if (zmeny.length > 0) {
    await appendAudit({
      uzivatel: currentUser(req),
      akce: "úprava nastavení deštného pralesa",
      cil: zmeny.join(", "),
    });
  }

  return { ok: true, ...stavPraleseProCms() };
});

// --- Analytika chatbota (Danielův backend) ---
// Frontend cizí službu neoslovuje, jde to přes nás: jedno místo na adresu,
// timeout, očištění odpovědi a hlášku, když backend ještě neběží. Endpointy
// nejsou ve VEREJNE_API, takže je chrání přihlášení jako ostatní /api.
//
// Odpověď je i při nedostupném chatbotovi HTTP 200 s obálkou
// { dostupne: false, duvod }, dashboard tak nemá důvod padat a rozliší
// "analytika zatím není" od skutečné chyby požadavku (400/401).

// Volitelný ISO čas; nesmyslnou hodnotu odmítáme, ať se nehádá s backendem.
function neplatneSince(raw: string | undefined): boolean {
  return raw !== undefined && raw !== "" && Number.isNaN(Date.parse(raw));
}

app.get<{ Querystring: { since?: string; limit?: string; answered?: string } }>(
  "/api/analytics/questions",
  async (req, reply) => {
    const { since, limit, answered } = req.query;
    if (neplatneSince(since)) return reply.code(400).send({ chyba: "Neplatný parametr since." });

    let cislo: number | undefined;
    if (limit !== undefined && limit !== "") {
      cislo = Number(limit);
      if (!Number.isFinite(cislo) || cislo < 1) {
        return reply.code(400).send({ chyba: "Neplatný parametr limit." });
      }
      cislo = Math.min(Math.trunc(cislo), LIMIT_MAX); // strop z kontraktu
    }

    if (answered !== undefined && answered !== "" && answered !== "true" && answered !== "false") {
      return reply.code(400).send({ chyba: "Neplatný parametr answered." });
    }

    return ziskejQuestions({
      since: since || undefined,
      limit: cislo,
      answered: answered === "true" ? true : answered === "false" ? false : undefined,
    });
  },
);

app.get<{ Querystring: { since?: string } }>("/api/analytics/summary", async (req, reply) => {
  const { since } = req.query;
  if (neplatneSince(since)) return reply.code(400).send({ chyba: "Neplatný parametr since." });
  return ziskejSummary(since || undefined);
});

// --- Události z tabletů (zapisuje Michalovo Unity, my jen čteme) ---
//
// `dny` je okno zpět (výchozí 30), `displej` volitelný filtr. Soubory se
// nečtou pokaždé znovu, modul si drží výsledky v paměti a přepočítá jen den,
// jehož soubor se změnil.
app.get<{ Querystring: { dny?: string; displej?: string } }>(
  "/api/udalosti/prehled",
  async (req, reply) => {
    const { dny, displej } = req.query;

    let oknoDnu: number | undefined;
    if (dny !== undefined && dny !== "") {
      oknoDnu = Number(dny);
      if (!Number.isFinite(oknoDnu) || oknoDnu < 1) {
        return reply.code(400).send({ chyba: "Neplatný parametr dny." });
      }
    }
    let cisloDispleje: number | undefined;
    if (displej !== undefined && displej !== "") {
      cisloDispleje = Number(displej);
      if (!Number.isInteger(cisloDispleje) || cisloDispleje < 1) {
        return reply.code(400).send({ chyba: "Neplatný parametr displej." });
      }
    }

    // Seznam displejů z CMS: podle něj se pozná i displej, ze kterého
    // nepřišla ani jedna událost (tichý tablet).
    const vsechnyDispleje = (await listDisplays()).map((d) => Number(d.id));

    return prehledUdalosti({ dny: oknoDnu, displej: cisloDispleje, vsechnyDispleje });
  },
);

// --- Audit ---
// `limit` a `before` (ISO čas) umožní donačítat starší záznamy po stránkách;
// bez nich se vrátí nejnovější stránka. Tvar odpovědi { entries } zůstává.
app.get<{ Querystring: { limit?: string; before?: string; preskoc?: string } }>(
  "/api/audit",
  async (req, reply) => {
    const { limit, before, preskoc } = req.query;

    let pocet: number | undefined;
    if (limit !== undefined && limit !== "") {
      pocet = Number(limit);
      if (!Number.isFinite(pocet) || pocet < 1) {
        return reply.code(400).send({ chyba: "Neplatný parametr limit." });
      }
    }
    if (before !== undefined && before !== "" && Number.isNaN(Date.parse(before))) {
      return reply.code(400).send({ chyba: "Neplatný parametr before." });
    }
    let preskocit: number | undefined;
    if (preskoc !== undefined && preskoc !== "") {
      preskocit = Number(preskoc);
      if (!Number.isFinite(preskocit) || preskocit < 0) {
        return reply.code(400).send({ chyba: "Neplatný parametr preskoc." });
      }
    }

    return {
      entries: await readAudit({
        limit: pocet,
        before: before || undefined,
        preskoc: preskocit,
      }),
    };
  },
);

// --- Frontend (buildnutý web) ---
if (existsSync(WEB_DIST)) {
  await app.register(fastifyStatic, {
    root: WEB_DIST,
    prefix: "/",
  });
  // SPA fallback: vše mimo /api a /data vrací index.html.
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api") || req.url.startsWith("/data")) {
      return reply.code(404).send({ chyba: "Nenalezeno." });
    }
    return reply.sendFile("index.html");
  });
} else {
  app.log.warn(`Web build nenalezen (${WEB_DIST}). Spusť 'npm run build'. V dev módu běží Vite zvlášť.`);
}

try {
  if (!existsSync(DISPLAYS_DIR)) {
    app.log.warn(`Datová složka nenalezena (${DISPLAYS_DIR}). Spusť 'npm run seed'.`);
  }
  // Zbytky po přerušeném přejmenování nebo zápisu (`.tmp-*`). Uklízí se při
  // startu, kdy se souborami nikdo jiný nepracuje.
  const uklizeno = await uklidDocasneSoubory();
  if (uklizeno.length > 0) {
    app.log.warn(
      `Uklizeny dočasné zbytky po předchozím běhu (${uklizeno.length}): ${uklizeno.slice(0, 5).join(", ")}`,
    );
  }
  // Displej u deštného pralesa: nastavení do paměti a start stahování
  // venkovní teploty na pozadí. První stažení se nečeká, aby start serveru
  // nezdržel výpadek internetu.
  await spustPrales(app.log);
  spustPocasi(app.log);
  if ((await pocetUzivatelu()) === 0) {
    app.log.warn(
      "Žádné účty v data/users.json, do CMS se nedá přihlásit. " +
        "Založ účet: npm run useradd -- <jmeno> <heslo>",
    );
  }
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`Amphibiárium · Vzdálený přístup běží na http://${HOST}:${PORT}`);
  app.log.info(`Datová složka: ${DATA_ROOT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
