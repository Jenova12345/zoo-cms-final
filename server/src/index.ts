import { existsSync } from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCookie from "@fastify/cookie";
import fastifyMultipart from "@fastify/multipart";

import { DATA_ROOT, DISPLAYS_DIR, WEB_DIST } from "./paths.js";
import { appendAudit, readAudit } from "./audit.js";
import {
  listDisplays,
  readMeta,
  readSlides,
  readKb,
  writeKb,
  writeInfoPole,
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

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";
const SESSION_COOKIE = "amph_session";

const app = Fastify({ logger: { level: "info" } });

await app.register(fastifyCookie);
await app.register(fastifyMultipart, {
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB, aby prošlo i mp4 video na slide
});

// Servírování reálných souborů z /data (obrázky slidů).
await app.register(fastifyStatic, {
  root: DATA_ROOT,
  prefix: "/data/",
  decorateReply: false,
});

// Aktuálně přihlášený uživatel z cookie (pro audit). Demo: bez ověřování.
function currentUser(req: { cookies: Record<string, string | undefined> }): string {
  const raw = req.cookies[SESSION_COOKIE];
  if (!raw) return "neznámý";
  try {
    return decodeURIComponent(raw);
  } catch {
    return "neznámý";
  }
}

function validId(id: string): boolean {
  return /^\d+$/.test(id);
}

// Slide se adresuje číselným prefixem složky (<n>_<typ>). Po přečíslování se
// čísla mění, klient si po každé strukturální změně načte detail znovu.
function validSlide(n: number): boolean {
  return Number.isInteger(n) && n >= 1;
}

// --- Auth ---
app.post<{ Body: { username?: string; password?: string } }>("/api/login", async (req, reply) => {
  const username = (req.body?.username ?? "").trim();
  const password = (req.body?.password ?? "").trim();
  if (!username || !password) {
    return reply.code(400).send({ ok: false, chyba: "Vyplňte jméno i heslo." });
  }
  reply.setCookie(SESSION_COOKIE, encodeURIComponent(username), {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
  });
  await appendAudit({ uzivatel: username, akce: "přihlášení", cil: "systém" });
  return { ok: true, username };
});

app.post("/api/logout", async (req, reply) => {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
  return { ok: true };
});

app.get("/api/me", async (req) => {
  const user = currentUser(req);
  return { username: user === "neznámý" ? null : user };
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

    await writeKb(id, req.body?.text ?? "");
    await appendAudit({
      uzivatel: currentUser(req),
      akce: "úprava znalostní báze",
      cil: `displej ${id}`,
    });
    return { ok: true };
  },
);

// Uložení polí info panelu (text.txt jako řádky "Klic: Hodnota").
app.put<{ Params: { id: string; n: string }; Body: { pole?: Record<string, string> } }>(
  "/api/displays/:id/slides/:n",
  async (req, reply) => {
    const { id } = req.params;
    const n = Number(req.params.n);
    if (!validId(id) || !validSlide(n)) return reply.code(400).send({ chyba: "Neplatné parametry." });
    if (!(await displayExists(id))) return reply.code(404).send({ chyba: "Displej nenalezen." });
    if (!(await slideExists(id, n))) return reply.code(404).send({ chyba: "Slide nenalezen." });

    const pole = req.body?.pole && typeof req.body.pole === "object" ? req.body.pole : {};
    const res = await writeInfoPole(id, n, pole);
    if (!res.ok) return reply.code(400).send({ chyba: res.chyba });
    await appendAudit({
      uzivatel: currentUser(req),
      akce: "úprava info panelu",
      cil: `displej ${id}, slide ${n}`,
    });
    return { ok: true };
  },
);

// Upload fotky (info panel a galerie). Vždy se převádí do PNG kvůli Unity.
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

    const nazev = path.basename(decodeURIComponent(req.params.nazev));
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

    const nazev = typeof req.body?.nazev === "string" ? decodeURIComponent(req.body.nazev) : null;
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
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`Amphibiárium · Vzdálený přístup běží na http://${HOST}:${PORT}`);
  app.log.info(`Datová složka: ${DATA_ROOT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
