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
// Strop platnosti session. I když někdo nastaví SESSION_TTL_HOURS na víc,
// session nevydrží déle než 12 h — ukradená cookie tím má omezené okno.
const MAX_TTL_HODIN = 12;

function ttlHodin(): number {
  const raw = Number(process.env.SESSION_TTL_HOURS);
  if (!Number.isFinite(raw) || raw <= 0) return VYCHOZI_TTL_HODIN;
  return Math.min(raw, MAX_TTL_HODIN);
}

export const SESSION_TTL_MS = ttlHodin() * 60 * 60 * 1000;
export const SESSION_TTL_S = Math.floor(SESSION_TTL_MS / 1000);

// Podpisový klíč. Když je SESSION_SECRET v prostředí, použije se a soubor
// data/session.key se VŮBEC nezakládá (v produkci má klíč patřit do prostředí,
// ne do datové složky, kterou sdílí Unity/chatbot). Když v prostředí není,
// hlasitě to zalogujeme a spadneme zpět na data/session.key (server nespadne).
export async function nactiNeboZalozKlic(log: { warn: (msg: string) => void }): Promise<string> {
  const raw = process.env.SESSION_SECRET;
  if (raw !== undefined && raw.trim() !== "") {
    const s = raw.trim();
    if (s.length < 16) {
      // Env je nastavený, ale nepoužitelně slabý. Radši nenastartovat, než tiše
      // podepisovat session krátkým tajemstvím — a session.key nezakládat.
      throw new Error(
        "SESSION_SECRET je nastavený, ale kratší než 16 znaků. Zvol silnější " +
          "(např. `openssl rand -hex 32`), nebo proměnnou odeber a použije se data/session.key.",
      );
    }
    return s;
  }

  log.warn(
    `SESSION_SECRET není nastavený — používá se klíč v ${SECRET_FILE}. ` +
      "V produkci nastav SESSION_SECRET v prostředí (viz .env.example).",
  );
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

export interface SessionData {
  u: string; // jméno přihlášeného
  exp: number; // čas vypršení (ms od epochy)
  v: string; // serial účtu (zmeneno/vytvoreno) — zneplatní session po změně hesla
}

// Obsah cookie (ještě před podpisem, ten přidá @fastify/cookie). `serial` je
// razítko účtu z users.json; při ověření se porovnává, takže změna hesla i
// smazání účtu starou session zneplatní.
export function vytvorSession(jmeno: string, serial: string): string {
  const data: SessionData = { u: jmeno, exp: Date.now() + SESSION_TTL_MS, v: serial };
  return Buffer.from(JSON.stringify(data), "utf8").toString("base64url");
}

// Vrátí data platné (nevypršené) session, jinak null. Ověření proti účtu
// (existence + serial) dělá volající, protože k tomu potřebuje users.json.
export function prectiSession(hodnota: string): SessionData | null {
  try {
    const data = JSON.parse(Buffer.from(hodnota, "base64url").toString("utf8")) as SessionData;
    if (typeof data.u !== "string" || !data.u) return null;
    if (typeof data.exp !== "number" || Date.now() > data.exp) return null;
    if (typeof data.v !== "string") return null; // starší cookie bez serialu = neplatná
    return data;
  } catch {
    return null;
  }
}
