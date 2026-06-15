import { promises as fs } from "node:fs";
import { AUDIT_FILE, DATA_ROOT } from "./paths.js";

export interface AuditEntry {
  cas: string; // ISO datum
  uzivatel: string;
  akce: string;
  cil: string;
}

// Append-only zápis jednoho řádku do data/audit.jsonl.
export async function appendAudit(entry: Omit<AuditEntry, "cas">): Promise<void> {
  await fs.mkdir(DATA_ROOT, { recursive: true });
  const record: AuditEntry = { cas: new Date().toISOString(), ...entry };
  await fs.appendFile(AUDIT_FILE, JSON.stringify(record) + "\n", "utf8");
}

// Načte celý audit log. Vrací nejnovější záznamy první.
export async function readAudit(): Promise<AuditEntry[]> {
  let raw: string;
  try {
    raw = await fs.readFile(AUDIT_FILE, "utf8");
  } catch {
    return [];
  }
  const entries = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as AuditEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is AuditEntry => e !== null);

  return entries.reverse();
}
