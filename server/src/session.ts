import { promises as fs } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { DATA_ROOT } from "./paths.js";

// Přihlašovací session. Cookie je podepsaná tajným klíčem (HMAC přes
// @fastify/cookie), takže si ji nikdo nemůže vyrobit ani přepsat na cizí
// jméno — na rozdíl od původního stavu, kdy v cookie bylo jen URL-encoded
// jméno a stačilo ho přepsat v prohlížeči.
//
// V cookie je: { u: jméno, exp: čas vypršení }. Platnost se kontroluje i na
// serveru, ne jen přes maxAge v prohlížeči (to si klient může nastavit sám).

export const SESSION_COOKIE = "amph_session";

// Klíč pro podpis. Přednost má SESSION_SECRET z prostředí; jinak se jednou
// vygeneruje do data/session.key a dál se používá, aby přihlášení přežilo
// restart serveru. Soubor se neservíruje přes HTTP (viz index.ts).
const SECRET_FILE = path.join(DATA_ROOT, "session.key");

const VYCHOZI_TTL_HODIN = 12;

function ttlHodin(): number {
  const raw = Number(process.env.SESSION_TTL_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : VYCHOZI_TTL_HODIN;
}

export const SESSION_TTL_MS = ttlHodin() * 60 * 60 * 1000;
export const SESSION_TTL_S = Math.floor(SESSION_TTL_MS / 1000);

export async function nactiNeboZalozKlic(): Promise<string> {
  const zProstredi = (process.env.SESSION_SECRET ?? "").trim();
  if (zProstredi.length >= 16) return zProstredi;

  try {
    const ulozeny = (await fs.readFile(SECRET_FILE, "utf8")).trim();
    if (ulozeny.length >= 16) return ulozeny;
  } catch {
    // klíč ještě neexistuje, vyrobíme ho níž
  }

  const novy = randomBytes(32).toString("hex");
  await fs.mkdir(DATA_ROOT, { recursive: true });
  await fs.writeFile(SECRET_FILE, novy + "\n", { encoding: "utf8", mode: 0o600 });
  try {
    await fs.chmod(SECRET_FILE, 0o600);
  } catch {
    // na Windows nebo síťovém disku nemusí jít, není to kritické
  }
  return novy;
}

interface SessionData {
  u: string; // jméno přihlášeného
  exp: number; // čas vypršení (ms od epochy)
}

// Obsah cookie (ještě před podpisem, ten přidá @fastify/cookie).
export function vytvorSession(jmeno: string): string {
  const data: SessionData = { u: jmeno, exp: Date.now() + SESSION_TTL_MS };
  return Buffer.from(JSON.stringify(data), "utf8").toString("base64url");
}

// Vrátí jméno z platné (nevypršené) session, jinak null.
export function prectiSession(hodnota: string): string | null {
  try {
    const data = JSON.parse(Buffer.from(hodnota, "base64url").toString("utf8")) as SessionData;
    if (typeof data.u !== "string" || !data.u) return null;
    if (typeof data.exp !== "number" || Date.now() > data.exp) return null;
    return data.u;
  } catch {
    return null;
  }
}
