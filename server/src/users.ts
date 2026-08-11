import { promises as fs } from "node:fs";
import path from "node:path";
import { compare, hash } from "bcryptjs";
import { DATA_ROOT } from "./paths.js";
import { writeFileAtomic } from "./atomic.js";

// Účty kurátorů. Stejná filozofie jako zbytek CMS: žádná databáze, jen soubor
// na disku — data/users.json vedle složek displejů.
//
//   {
//     "verze": 1,
//     "uzivatele": [
//       { "jmeno": "spravce", "hash": "$2b$12$...", "vytvoreno": "2026-07-31T..." }
//     ]
//   }
//
// Heslo se NIKDY neukládá v otevřené podobě, v souboru je jen bcrypt hash.
// users.json se záměrně neservíruje přes HTTP: statické servírování je zúžené
// na data/displeje (viz index.ts), takže se soubor nedá stáhnout přes /data.

export const USERS_FILE = path.join(DATA_ROOT, "users.json");

// Cena bcryptu. 12 = zhruba čtvrt sekundy na běžném CPU: dost na to, aby
// hádání hesel po síti nemělo smysl, málo na to, aby to kurátor poznal.
const BCRYPT_COST = 12;

// Hash, který nikdy nepatří žádnému heslu. Porovnáváme proti němu i tehdy,
// když jméno neexistuje — přihlášení pak trvá stejně dlouho jako u
// existujícího účtu a z doby odpovědi nejde vyčíst, které jméno existuje.
const SLEPY_HASH = "$2b$12$wQ2QEip4bXbP0dmo.8xdweEgNMO5VdOFPOwiwycinyRuCTUJWs0da";

export const MIN_DELKA_HESLA = 8;

// Písmena (včetně diakritiky), číslice, tečka, pomlčka, podtržítko.
const JMENO_RE = /^[\p{L}\p{N}._-]{2,32}$/u;

export interface User {
  jmeno: string; // v podobě, jak ho zadal správce (porovnává se bez ohledu na velikost písmen)
  hash: string; // bcrypt hash hesla
  vytvoreno: string; // ISO datum
  zmeneno?: string; // ISO datum poslední změny hesla
}

interface UsersFile {
  verze: number;
  uzivatele: User[];
}

// Jména porovnáváme bez ohledu na velikost písmen, ať se kurátor nemusí
// trefovat do "Spravce" vs "spravce".
function klic(jmeno: string): string {
  return jmeno.trim().toLocaleLowerCase("cs");
}

export function validujJmeno(jmeno: string): string | null {
  const j = jmeno.trim();
  if (!j) return "Zadejte uživatelské jméno.";
  if (!JMENO_RE.test(j)) {
    return "Jméno smí mít 2 až 32 znaků: písmena, číslice, tečka, pomlčka nebo podtržítko.";
  }
  return null;
}

export function validujHeslo(heslo: string): string | null {
  if (heslo.length < MIN_DELKA_HESLA) {
    return `Heslo musí mít aspoň ${MIN_DELKA_HESLA} znaků.`;
  }
  return null;
}

export async function readUsers(): Promise<User[]> {
  try {
    const raw = await fs.readFile(USERS_FILE, "utf8");
    const data = JSON.parse(raw) as UsersFile;
    return Array.isArray(data.uzivatele) ? data.uzivatele : [];
  } catch {
    return [];
  }
}

// Zápis přes dočasný soubor + rename (writeFileAtomic), ať se users.json
// nerozbije, když proces spadne uprostřed zápisu. Práva 0600 (na Windows se
// ignorují, na Linuxu/macOS soubor schovají před ostatními účty).
async function writeUsers(uzivatele: User[]): Promise<void> {
  await fs.mkdir(DATA_ROOT, { recursive: true });
  const data: UsersFile = { verze: 1, uzivatele };
  await writeFileAtomic(USERS_FILE, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
}

export async function najdiUzivatele(jmeno: string): Promise<User | null> {
  const k = klic(jmeno);
  return (await readUsers()).find((u) => klic(u.jmeno) === k) ?? null;
}

export async function pocetUzivatelu(): Promise<number> {
  return (await readUsers()).length;
}

// Ověření přihlašovacích údajů. Vrací účet, nebo null — volající se nikdy
// nedozví, jestli selhalo jméno, nebo heslo.
export async function overUdaje(jmeno: string, heslo: string): Promise<User | null> {
  const user = await najdiUzivatele(jmeno);
  if (!user) {
    // Účet neexistuje: stejně spálíme čas na bcryptu, ať odpověď netrvá jinak.
    await compare(heslo, SLEPY_HASH);
    return null;
  }
  const sedi = await compare(heslo, user.hash);
  return sedi ? user : null;
}

export async function pridejUzivatele(
  jmeno: string,
  heslo: string,
): Promise<{ ok: boolean; chyba?: string }> {
  const chybaJmena = validujJmeno(jmeno);
  if (chybaJmena) return { ok: false, chyba: chybaJmena };
  const chybaHesla = validujHeslo(heslo);
  if (chybaHesla) return { ok: false, chyba: chybaHesla };

  const uzivatele = await readUsers();
  const k = klic(jmeno);
  if (uzivatele.some((u) => klic(u.jmeno) === k)) {
    return { ok: false, chyba: `Účet "${jmeno.trim()}" už existuje.` };
  }
  uzivatele.push({
    jmeno: jmeno.trim(),
    hash: await hash(heslo, BCRYPT_COST),
    vytvoreno: new Date().toISOString(),
  });
  await writeUsers(uzivatele);
  return { ok: true };
}

export async function zmenHeslo(
  jmeno: string,
  heslo: string,
): Promise<{ ok: boolean; chyba?: string }> {
  const chybaHesla = validujHeslo(heslo);
  if (chybaHesla) return { ok: false, chyba: chybaHesla };

  const uzivatele = await readUsers();
  const k = klic(jmeno);
  const user = uzivatele.find((u) => klic(u.jmeno) === k);
  if (!user) return { ok: false, chyba: `Účet "${jmeno.trim()}" neexistuje.` };

  user.hash = await hash(heslo, BCRYPT_COST);
  user.zmeneno = new Date().toISOString();
  await writeUsers(uzivatele);
  return { ok: true };
}

export async function smazUzivatele(jmeno: string): Promise<{ ok: boolean; chyba?: string }> {
  const uzivatele = await readUsers();
  const k = klic(jmeno);
  const zbyle = uzivatele.filter((u) => klic(u.jmeno) !== k);
  if (zbyle.length === uzivatele.length) {
    return { ok: false, chyba: `Účet "${jmeno.trim()}" neexistuje.` };
  }
  if (zbyle.length === 0) {
    return { ok: false, chyba: "Nelze smazat poslední účet — do CMS by se nikdo nedostal." };
  }
  await writeUsers(zbyle);
  return { ok: true };
}

// Výchozí účet, aby se dalo přihlásit hned po instalaci. Zakládá se jen když
// users.json neexistuje nebo je prázdný; existující účty se nikdy nepřepisují.
export const VYCHOZI_JMENO = "spravce";
export const VYCHOZI_HESLO = "Amphibiarium2026";

export async function zalozVychoziUcet(): Promise<boolean> {
  if ((await pocetUzivatelu()) > 0) return false;
  const res = await pridejUzivatele(VYCHOZI_JMENO, VYCHOZI_HESLO);
  return res.ok;
}
