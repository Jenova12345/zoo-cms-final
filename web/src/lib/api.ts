import { NAHRAVANI_MAX_MB } from "./limity";
import type {
  Analytika,
  AnalyticsQuestions,
  AnalyticsSummary,
  AuditEntry,
  DisplayDetail,
  DisplaySummary,
  SlideTyp,
} from "./types";

// Jméno přihlášeného v localStorage (jen kvůli okamžitému vykreslení; zdrojem
// pravdy je podepsaná session cookie na serveru).
export const STORAGE_KEY = "amph_user";

// Session vypršela nebo chybí: zahoď lokální stav a pošli na přihlášení.
// Náhled tabletu je veřejný, ten nepřesměrováváme.
function sessionVyprsela() {
  const cesta = window.location.pathname;
  if (cesta.startsWith("/tablet") || cesta === "/login") return;
  localStorage.removeItem(STORAGE_KEY);
  window.location.href = "/login";
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "same-origin",
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body?.chyba ?? detail;
    } catch {
      // ignore
    }
    if (res.status === 401) sessionVyprsela();
    // 413 utne multipart ještě v přenosu, takže ze serveru chodí jen obecná
    // hláška. Kurátor ale potřebuje vědět, co s tím — proto vlastní text.
    if (res.status === 413) {
      throw new Error(`Soubor je moc velký, maximum je ${NAHRAVANI_MAX_MB} MB.`);
    }
    throw new Error(detail || `Chyba ${res.status}`);
  }
  return (await res.json()) as T;
}

export const api = {
  async login(username: string, password: string): Promise<{ ok: boolean; username: string }> {
    return request("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
  },

  async logout(): Promise<void> {
    await request("/api/logout", { method: "POST" });
  },

  async me(): Promise<{ username: string | null }> {
    return request("/api/me");
  },

  async displays(): Promise<DisplaySummary[]> {
    const data = await request<{ displays: DisplaySummary[] }>("/api/displays");
    return data.displays;
  },

  async display(id: string): Promise<DisplayDetail> {
    return request<DisplayDetail>(`/api/displays/${id}`);
  },

  // Uloží pole info panelu (na disku vznikne text.txt s řádky "Klic: Hodnota")
  // a identita se propíše i do meta.json. Vrací kanonizované latinské jméno a
  // příznak, jestli ho server musel opravit.
  async saveInfo(
    id: string,
    n: number,
    pole: Record<string, string>,
    section: string,
  ): Promise<{ latin: string; latinCorrected: boolean }> {
    return request<{ ok: boolean; latin: string; latinCorrected: boolean }>(
      `/api/displays/${id}/slides/${n}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pole, section }),
      },
    );
  },

  // Text zajímavosti (slide _gal). Na disku vznikne text.txt s "Popis: …".
  async saveSlideText(id: string, n: number, text: string): Promise<void> {
    await request(`/api/displays/${id}/slides/${n}/text`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  },

  // Výchozí šablona znalostní báze (kb.md) pro nový/prázdný druh.
  async kbTemplate(): Promise<string> {
    const d = await request<{ text: string }>("/api/kb-template");
    return d.text;
  },

  // Uloží znalostní bázi (kb.md v kořeni displeje).
  async saveKb(id: string, text: string): Promise<void> {
    await request(`/api/displays/${id}/kb`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  },

  async uploadImage(id: string, n: number, file: File): Promise<{ url: string }> {
    const form = new FormData();
    form.append("file", file);
    return request<{ ok: boolean; url: string }>(`/api/displays/${id}/slides/${n}/image`, {
      method: "POST",
      body: form,
    });
  },

  async deleteImage(id: string, n: number, nazev: string): Promise<void> {
    await request(`/api/displays/${id}/slides/${n}/images/${encodeURIComponent(nazev)}`, {
      method: "DELETE",
    });
  },

  // Označí fotku info panelu jako mapu výskytu (mapa.png); nazev=null značení zruší.
  async setMapa(id: string, n: number, nazev: string | null): Promise<void> {
    await request(`/api/displays/${id}/slides/${n}/images/mapa`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nazev }),
    });
  },

  async uploadVideo(id: string, n: number, file: File): Promise<{ url: string }> {
    const form = new FormData();
    form.append("file", file);
    return request<{ ok: boolean; url: string }>(`/api/displays/${id}/slides/${n}/video`, {
      method: "POST",
      body: form,
    });
  },

  async deleteVideo(id: string, n: number): Promise<void> {
    await request(`/api/displays/${id}/slides/${n}/video`, { method: "DELETE" });
  },

  async addSlide(id: string, typ: SlideTyp): Promise<{ n: number }> {
    return request<{ ok: boolean; n: number }>(`/api/displays/${id}/slides`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ typ }),
    });
  },

  async deleteSlide(id: string, n: number): Promise<void> {
    await request(`/api/displays/${id}/slides/${n}`, { method: "DELETE" });
  },

  async reorderSlides(id: string, poradi: number[]): Promise<void> {
    await request(`/api/displays/${id}/slides/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ poradi }),
    });
  },

  async refresh(id: string): Promise<void> {
    await request(`/api/displays/${id}/refresh`, { method: "POST" });
  },

  async audit(): Promise<AuditEntry[]> {
    const data = await request<{ entries: AuditEntry[] }>("/api/audit");
    return data.entries;
  },

  // Souhrn dotazů na chatbota (KPI karty a intenzita heat mapy).
  async analyticsSummary(): Promise<Analytika<AnalyticsSummary>> {
    return analytika<AnalyticsSummary>("/api/analytics/summary");
  },

  // Jednotlivé dotazy. answered=false = co AI nezvládla.
  async analyticsQuestions(
    filtr: { limit?: number; answered?: boolean } = {},
  ): Promise<Analytika<AnalyticsQuestions>> {
    const params = new URLSearchParams();
    if (filtr.limit !== undefined) params.set("limit", String(filtr.limit));
    if (filtr.answered !== undefined) params.set("answered", String(filtr.answered));
    const qs = params.toString();
    return analytika<AnalyticsQuestions>(`/api/analytics/questions${qs ? `?${qs}` : ""}`);
  },
};

// Analytika chatbota se nikdy nevrací jako výjimka: náš server posílá obálku
// { dostupne } i když Danielův backend neběží, a když selže i naše strana
// (nebo síť), udělá se obálka tady. Dashboard tak vždycky jen vypíše hlášku.
async function analytika<T>(url: string): Promise<Analytika<T>> {
  try {
    return await request<Analytika<T>>(url);
  } catch (e) {
    return {
      dostupne: false,
      duvod: e instanceof Error ? e.message : "Analytiku se nepodařilo načíst.",
    };
  }
}

// Z URL fotky (/data/.../soubor.jpg) vytáhne čistý název souboru.
export function nazevSouboru(url: string): string {
  const last = url.split("/").pop() ?? url;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

// Formátování českého data a času.
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" });
}
