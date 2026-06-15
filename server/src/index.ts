import { existsSync } from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCookie from "@fastify/cookie";
import fastifyMultipart from "@fastify/multipart";

import { DATA_ROOT, DISPLAYS_DIR, WEB_DIST, SLIDE_COUNT } from "./paths.js";
import { appendAudit, readAudit } from "./audit.js";
import {
  listDisplays,
  readMeta,
  readSlides,
  writeSlide,
  saveImage,
  displayExists,
} from "./displays.js";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";
const SESSION_COOKIE = "amph_session";

const app = Fastify({ logger: { level: "info" } });

await app.register(fastifyCookie);
await app.register(fastifyMultipart, {
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB na fotku stačí
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

function validSlide(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= SLIDE_COUNT;
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
  return { id, meta, slides: await readSlides(id) };
});

app.put<{ Params: { id: string; n: string }; Body: { nadpis?: string; text?: string } }>(
  "/api/displays/:id/slides/:n",
  async (req, reply) => {
    const { id } = req.params;
    const n = Number(req.params.n);
    if (!validId(id) || !validSlide(n)) return reply.code(400).send({ chyba: "Neplatné parametry." });
    if (!(await displayExists(id))) return reply.code(404).send({ chyba: "Displej nenalezen." });

    const nadpis = req.body?.nadpis ?? "";
    const text = req.body?.text ?? "";
    await writeSlide(id, n, nadpis, text);
    await appendAudit({
      uzivatel: currentUser(req),
      akce: "úprava",
      cil: `displej ${id}, slide ${n}`,
    });
    return { ok: true };
  },
);

app.post<{ Params: { id: string; n: string } }>(
  "/api/displays/:id/slides/:n/image",
  async (req, reply) => {
    const { id } = req.params;
    const n = Number(req.params.n);
    if (!validId(id) || !validSlide(n)) return reply.code(400).send({ chyba: "Neplatné parametry." });
    if (!(await displayExists(id))) return reply.code(404).send({ chyba: "Displej nenalezen." });

    const file = await req.file();
    if (!file) return reply.code(400).send({ chyba: "Chybí soubor." });
    const buffer = await file.toBuffer();
    const url = await saveImage(id, n, file.filename, buffer);

    await appendAudit({
      uzivatel: currentUser(req),
      akce: "upload",
      cil: `displej ${id}, slide ${n}: ${path.basename(url)}`,
    });
    return { ok: true, url };
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
