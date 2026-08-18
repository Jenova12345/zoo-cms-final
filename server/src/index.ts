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
  listDisplays,
  readMeta,
  readSlides,
  readKb,
  writeKb,
  writeInfoPole,
  writeZajimavost,
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
// stack) — detail jde do server logu. Vlastní aplikační chyby, které nesou
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
// konkrétní routy, které si o něj řeknou přes config.rateLimit — viz /api/login.
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
// platnou session — zamykáme ve výchozím stavu, takže nový endpoint je
// chráněný automaticky, dokud ho někdo vědomě nepřidá sem.
const VEREJNE_API = new Set([
  "POST /api/login",
  "POST /api/logout",
  "GET /api/me",
  "GET /api/displays/:id", // data pro /tablet/:id
]);

// Míří požadavek do /api namespace? Rozhodujeme podle SKUTEČNĚ napárované
// routy (router už cestu dekódoval a normalizoval) — ne podle syrového
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
// `npm run useradd`). Heslo se záměrně neořezává — mezera na kraji je jeho
// součástí, stejně jako při zakládání účtu.
app.post<{ Body: { username?: string; password?: string } }>(
  "/api/login",
  {
    // Tělo se validuje schématem, ale `attachValidation` nechá běžet handler i
    // při chybě (místo automatického 400) — tak se i nevalidní pokus (číslo
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
    // nebo nesedělo heslo. Do auditu NEzapisujeme zadaný řetězec doslova —
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

app.get<{ Params: { id: string } }>("/api/displays/:id", async (req, reply) => {
  const { id } = req.params;
  if (!validId(id)) return reply.code(400).send({ chyba: "Neplatné id." });
  const meta = await readMeta(id);
  if (!meta) return reply.code(404).send({ chyba: "Displej nenalezen." });
  return { id, meta, slides: await readSlides(id), kb: await readKb(id) };
});

// --- Znalostní báze (kb.md v kořeni displeje, edituje se mimo slidy) ---
app.put<{ Params: { id: string }; Body: { text?: string } }>(
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
    await writeKb(id, text);
    await appendAudit({
      uzivatel: currentUser(req),
      akce: "úprava znalostní báze",
      cil: `displej ${id}`,
    });
    return { ok: true };
  },
);

// Uložení polí info panelu. Vzniká cs/<slozka>/text.txt (Klic: Hodnota) a táž
// identita (name, latin_name, category, section) se propíše do meta.json.
app.put<{
  Params: { id: string; n: string };
  Body: { pole?: Record<string, string>; section?: string };
}>("/api/displays/:id/slides/:n", async (req, reply) => {
  const { id } = req.params;
  const n = Number(req.params.n);
  if (!validId(id) || !validSlide(n)) return reply.code(400).send({ chyba: "Neplatné parametry." });
  if (!(await displayExists(id))) return reply.code(404).send({ chyba: "Displej nenalezen." });
  if (!(await slideExists(id, n))) return reply.code(404).send({ chyba: "Slide nenalezen." });

  const pole = req.body?.pole && typeof req.body.pole === "object" ? req.body.pole : {};
  const section = typeof req.body?.section === "string" ? req.body.section : undefined;
  const res = await writeInfoPole(id, n, pole, section);
  if (!res.ok) return reply.code(400).send({ chyba: res.chyba });
  await appendAudit({
    uzivatel: currentUser(req),
    akce: "úprava info panelu",
    cil: `displej ${id}, slide ${n}`,
  });
  return { ok: true, latin: res.latin, latinCorrected: res.latinCorrected };
});

// Text zajímavosti (slide _gal): jeden dlouhý odstavec, na disku
// cs/<slozka>/text.txt jako "Popis: …".
app.put<{ Params: { id: string; n: string }; Body: { text?: string } }>(
  "/api/displays/:id/slides/:n/text",
  async (req, reply) => {
    const { id } = req.params;
    const n = Number(req.params.n);
    if (!validId(id) || !validSlide(n)) return reply.code(400).send({ chyba: "Neplatné parametry." });
    if (!(await slideExists(id, n))) return reply.code(404).send({ chyba: "Slide nenalezen." });

    // Text je povinný: chybějící nebo prázdné tělo by jinak tiše smazalo obsah.
    const text = req.body?.text;
    if (typeof text !== "string" || text.trim() === "") {
      return reply.code(400).send({ chyba: "Text zajímavosti nesmí být prázdný." });
    }
    const res = await writeZajimavost(id, n, text);
    if (!res.ok) return reply.code(400).send({ chyba: res.chyba });
    await appendAudit({
      uzivatel: currentUser(req),
      akce: "úprava zajímavosti",
      cil: `displej ${id}, slide ${n}`,
    });
    return { ok: true };
  },
);

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

// --- Analytika chatbota (Danielův backend) ---
// Frontend cizí službu neoslovuje, jde to přes nás: jedno místo na adresu,
// timeout, očištění odpovědi a hlášku, když backend ještě neběží. Endpointy
// nejsou ve VEREJNE_API, takže je chrání přihlášení jako ostatní /api.
//
// Odpověď je i při nedostupném chatbotovi HTTP 200 s obálkou
// { dostupne: false, duvod } — dashboard tak nemá důvod padat a rozliší
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

// --- Audit ---
app.get("/api/audit", async () => {
  return { entries: await readAudit() };
});

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
  if ((await pocetUzivatelu()) === 0) {
    app.log.warn(
      "Žádné účty v data/users.json — do CMS se nedá přihlásit. " +
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
