import { useEffect, useMemo, useState } from "react";
import { Info, Loader2, RefreshCw } from "lucide-react";
import { api, formatDateTime } from "../lib/api";
import { canonicalizeLatin } from "../lib/latin";
import { NEPRIRAZENO } from "../lib/types";
import type {
  Analytika,
  AnalyticsQuestion,
  AnalyticsQuestions,
  AnalyticsSpecies,
  AnalyticsSummary,
  DisplaySummary,
} from "../lib/types";

// Data dashboardu jsou reálná: displeje z našeho /api/displays (meta.json na
// disku) a dotazy návštěvníků z analytiky chatbota přes náš proxy endpoint
// /api/analytics/... Chatbot backend nemusí běžet — pak se místo čísel píše
// hláška, stránka se normálně otevře.

const LIMIT_POSLEDNI = 200; // kolik dotazů stáhnout
const VYPSAT_POSLEDNI = 15; // kolik jich vypsat
const LIMIT_NEZVLADNUTE = 50;
const VYPSAT_NEZVLADNUTE = 12;

const NEPRIPOJENO = "Analytika chatbota zatím není připojená.";
const BEZ_DOTAZU = "Zatím žádné dotazy.";

// Klidná hláška místo čísla, chyby nebo prázdné plochy.
function Hlaska({ text, detail }: { text: string; detail?: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-dashed border-line bg-canvas px-4 py-3">
      <Info className="h-4 w-4 mt-0.5 shrink-0 text-fg-dim" strokeWidth={1.75} />
      <div className="min-w-0">
        <div className="text-sm text-fg-muted">{text}</div>
        {detail && <div className="text-[11px] text-fg-dim mt-0.5">{detail}</div>}
      </div>
    </div>
  );
}

function Cekam({ text = "Načítám…" }: { text?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-fg-dim">
      <Loader2 className="h-4 w-4 animate-spin" />
      {text}
    </div>
  );
}

function Divider() {
  return <div className="border-t border-line" />;
}

function cisloCs(n: number): string {
  return n.toLocaleString("cs-CZ");
}

function druhLabel(q: { species_name: string; species_latin: string }): string {
  return q.species_name || q.species_latin || "neurčený druh";
}

// Nejnovější dotazy první; kontrakt pořadí negarantuje, tak si ho srovnáme sami.
function nejnovejsi(questions: AnalyticsQuestion[], kolik: number): AnalyticsQuestion[] {
  return [...questions]
    .sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0))
    .slice(0, kolik);
}

// --- Heat mapa: čistý půdorys haly, bez rámečku ---

interface HeatNode {
  id: string;
  n: number; // číslo displeje
  popis: string; // druh (z analytiky, jinak z CMS)
  x: number;
  y: number;
  count: number; // dotazů za sledované období
  score: number; // 0–1, intenzita pro barvu a velikost
}

// Schematické rozmístění displejů: vnější obvod haly + expoziční ostrov
// uprostřed. Jsou to orientační pozice pro čtení mapy, ne zaměřené souřadnice —
// skutečné rozmístění tabletů v pavilonu nikde v datech nemáme.
function pozice(pocet: number): { x: number; y: number }[] {
  const nodes: { x: number; y: number }[] = [];
  const ring = (count: number, x0: number, y0: number, x1: number, y1: number) => {
    const w = x1 - x0;
    const h = y1 - y0;
    const per = 2 * (w + h);
    for (let i = 0; i < count; i++) {
      const t = (i / count) * per;
      let x: number, y: number;
      if (t < w) {
        x = x0 + t;
        y = y0;
      } else if (t < w + h) {
        x = x1;
        y = y0 + (t - w);
      } else if (t < 2 * w + h) {
        x = x1 - (t - w - h);
        y = y1;
      } else {
        x = x0;
        y = y1 - (t - 2 * w - h);
      }
      x += Math.sin(i * 2.3 + 1) * 1.6;
      y += Math.cos(i * 1.7) * 1.8;
      nodes.push({ x, y });
    }
  };
  const vnejsi = Math.min(pocet, 24);
  ring(vnejsi, 8, 12, 92, 86);
  if (pocet > vnejsi) ring(pocet - vnejsi, 33, 33, 67, 67);
  return nodes;
}

function heatColor(score: number): string {
  const stops: [number, [number, number, number]][] = [
    [0.0, [199, 224, 218]],
    [0.45, [15, 118, 110]],
    [0.75, [194, 116, 12]],
    [1.0, [220, 38, 38]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [s0, c0] = stops[i];
    const [s1, c1] = stops[i + 1];
    if (score <= s1) {
      const t = (score - s0) / (s1 - s0);
      const c = c0.map((v, k) => Math.round(v + (c1[k] - v) * t));
      return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    }
  }
  return "rgb(220, 38, 38)";
}

// Bez analytiky se body kreslí neutrálně — heat mapa bez dat nemá co barvit.
const NEUTRAL = "#DDE3E1";

interface MapaData {
  nodes: HeatNode[];
  maxNode: HeatNode | null; // displej s nejvíc dotazy
  nenaparovano: AnalyticsSpecies[]; // druhy z analytiky bez displeje u nás
}

// Párování analytiky na displeje: primárně přes species_latin proti latin_name
// z našich meta.json (obojí kanonizované stejnými pravidly), display_id jen
// jako záloha — podle kontraktu může být null.
function naparuj(displays: DisplaySummary[], summary: AnalyticsSummary | null): MapaData {
  const body = pozice(displays.length);

  const podleLatiny = new Map<string, { count: number; species_name: string }>();
  const podleId = new Map<number, { count: number; species_name: string }>();
  for (const s of summary?.per_species ?? []) {
    const latin = canonicalizeLatin(s.species_latin);
    if (latin) {
      const drive = podleLatiny.get(latin);
      podleLatiny.set(latin, {
        count: (drive?.count ?? 0) + s.count,
        species_name: s.species_name || drive?.species_name || "",
      });
    }
    if (s.display_id !== null) {
      const drive = podleId.get(s.display_id);
      podleId.set(s.display_id, {
        count: (drive?.count ?? 0) + s.count,
        species_name: s.species_name || drive?.species_name || "",
      });
    }
  }

  const pouziteLatiny = new Set<string>();
  const pouziteId = new Set<number>();

  const bezScore = displays.map((d, i) => {
    const latin = canonicalizeLatin(d.latin_name ?? "");
    const podleJmena = latin ? podleLatiny.get(latin) : undefined;
    const zaloha = podleJmena ? undefined : podleId.get(Number(d.id));
    if (podleJmena) pouziteLatiny.add(latin);
    if (zaloha) pouziteId.add(Number(d.id));
    const zasah = podleJmena ?? zaloha;
    const cmsDruh = d.druh === NEPRIRAZENO ? "" : d.druh;
    return {
      id: d.id,
      n: Number(d.id),
      popis: zasah?.species_name || cmsDruh || NEPRIRAZENO,
      x: body[i]?.x ?? 50,
      y: body[i]?.y ?? 50,
      count: zasah?.count ?? 0,
    };
  });

  const max = bezScore.reduce((a, b) => Math.max(a, b.count), 0);
  const nodes: HeatNode[] = bezScore.map((n) => ({
    ...n,
    score: max > 0 && n.count > 0 ? Math.max(0.08, n.count / max) : 0,
  }));

  const nenaparovano = (summary?.per_species ?? []).filter((s) => {
    const latin = canonicalizeLatin(s.species_latin);
    if (latin && pouziteLatiny.has(latin)) return false;
    if (s.display_id !== null && pouziteId.has(s.display_id)) return false;
    return true;
  });

  return {
    nodes,
    maxNode: max > 0 ? nodes.reduce((a, b) => (b.count > a.count ? b : a), nodes[0]) : null,
    nenaparovano,
  };
}

export default function Dashboard() {
  const [displays, setDisplays] = useState<DisplaySummary[] | null>(null);
  const [chybaDispleju, setChybaDispleju] = useState<string | null>(null);
  const [summary, setSummary] = useState<Analytika<AnalyticsSummary> | null>(null);
  const [posledni, setPosledni] = useState<Analytika<AnalyticsQuestions> | null>(null);
  const [nezvladnute, setNezvladnute] = useState<Analytika<AnalyticsQuestions> | null>(null);
  const [nacitani, setNacitani] = useState(true);
  const [hover, setHover] = useState<HeatNode | null>(null);

  // Každý zdroj se vykreslí, jak dorazí — na nedostupný chatbot se čeká do
  // timeoutu a stránka by kvůli němu neměla stát u kolečka. Analytika
  // nevyhazuje výjimku (vrací obálku), seznam displejů ano.
  async function load() {
    setNacitani(true);
    await Promise.all([
      api.displays().then(
        (data) => {
          setDisplays(data);
          setChybaDispleju(null);
        },
        (e: unknown) => {
          setChybaDispleju(
            e instanceof Error ? e.message : "Seznam displejů se nepodařilo načíst.",
          );
        },
      ),
      api.analyticsSummary().then(setSummary),
      api.analyticsQuestions({ limit: LIMIT_POSLEDNI }).then(setPosledni),
      api.analyticsQuestions({ answered: false, limit: LIMIT_NEZVLADNUTE }).then(setNezvladnute),
    ]);
    setNacitani(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const summaryData = summary?.dostupne ? summary.data : null;
  const mapa = useMemo(() => naparuj(displays ?? [], summaryData), [displays, summaryData]);

  const obdobi = summaryData?.since ? formatDateTime(summaryData.since) : null;
  const prazdnaAnalytika = summaryData !== null && summaryData.total_questions === 0;

  // Kolečko jen dokud nejsou displeje (ty jsou z našeho disku, tedy hned);
  // analytika se dolije do sekcí sama.
  if (!displays && !chybaDispleju) {
    return (
      <div className="grid place-items-center py-24 text-fg-dim">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Titulek */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-fg">Přehled provozu</h1>
          <p className="text-sm text-fg-muted mt-1.5">
            Pavilon Amphibiárium, ZOO Ostrava
            {obdobi && <span className="text-fg-dim"> · dotazy od {obdobi}</span>}
          </p>
        </div>
        <button onClick={() => void load()} className="btn-ghost" disabled={nacitani}>
          {nacitani ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" strokeWidth={1.75} />
          )}
          Obnovit
        </button>
      </div>

      {/* KPI ze summary; co z dat nejde spočítat, tady není */}
      {summaryData && !prazdnaAnalytika && (
        <div className="grid grid-cols-3 divide-x divide-line border-y border-line">
          {[
            { label: "Dotazů na AI", value: summaryData.total_questions },
            { label: "Odpovězeno", value: summaryData.answered },
            { label: "Bez odpovědi", value: summaryData.unanswered },
          ].map((s) => (
            <div key={s.label} className="px-6 py-5 first:pl-0">
              <div className="kicker">{s.label}</div>
              <div className="mt-2 font-display text-4xl font-bold text-fg tnum leading-none">
                {cisloCs(s.value)}
              </div>
            </div>
          ))}
        </div>
      )}
      {!summary && <Cekam text="Načítám analytiku chatbota…" />}
      {summary && !summary.dostupne && <Hlaska text={NEPRIPOJENO} detail={summary.duvod} />}
      {prazdnaAnalytika && (
        <Hlaska
          text={BEZ_DOTAZU}
          detail={`Chatbot je připojený, za sledované období${obdobi ? ` (od ${obdobi})` : ""} ale nezaznamenal žádný dotaz.`}
        />
      )}

      {/* Mapa dotazů: hero na ploše, bez rámečku */}
      <section className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="kicker">Mapa dotazů na AI</div>
            <h2 className="font-display text-lg font-semibold text-fg mt-1.5">
              Půdorys haly, schéma
            </h2>
          </div>
          {mapa.maxNode && (
            <div className="text-right">
              <div className="font-display text-xl font-bold text-fg tnum leading-none">
                {cisloCs(mapa.maxNode.count)}
              </div>
              <div className="text-[11px] text-fg-dim mt-1">
                špička · displej {mapa.maxNode.n}
              </div>
            </div>
          )}
        </div>

        {chybaDispleju && <Hlaska text="Seznam displejů se nepodařilo načíst." detail={chybaDispleju} />}

        {displays && displays.length === 0 && (
          <Hlaska
            text="V CMS zatím nejsou žádné displeje."
            detail="Datová složka je prázdná — displeje vytvoří `npm run seed`."
          />
        )}

        {displays && displays.length > 0 && (
          <>
            <div
              className="relative mx-auto w-full"
              style={{ aspectRatio: "16 / 7" }}
              onMouseLeave={() => setHover(null)}
            >
              {/* obrys haly a expozičního ostrova jen vlasovými linkami */}
              <div className="absolute inset-[5%] rounded-[20px] border border-line" />
              <div className="absolute inset-[34%] rounded-xl border border-lineSoft" />

              {mapa.nodes.map((node) => {
                const jsouData = summaryData !== null;
                const r = 9 + node.score * 16;
                const color = jsouData && node.count > 0 ? heatColor(node.score) : NEUTRAL;
                const active = hover?.id === node.id;
                return (
                  <button
                    key={node.id}
                    onMouseEnter={() => setHover(node)}
                    className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform"
                    style={{
                      left: `${node.x}%`,
                      top: `${node.y}%`,
                      width: r,
                      height: r,
                      background: color,
                      boxShadow:
                        jsouData && node.count > 0
                          ? `0 0 ${5 + node.score * 14}px ${node.score * 3}px ${color}55`
                          : "none",
                      border: active ? "2px solid #0F766E" : "1px solid rgba(16,40,34,0.10)",
                      transform: `translate(-50%, -50%) scale(${active ? 1.3 : 1})`,
                      zIndex: active ? 20 : 1,
                    }}
                    aria-label={
                      summaryData
                        ? `Displej ${node.n}, ${node.popis}, ${node.count} dotazů`
                        : `Displej ${node.n}, ${node.popis}`
                    }
                  />
                );
              })}

              {hover && (
                <div
                  className="absolute z-30 pointer-events-none -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-surface px-3 py-2 shadow-cardHover"
                  style={{ left: `${hover.x}%`, top: `calc(${hover.y}% - 14px)` }}
                >
                  <div className="font-display text-sm font-semibold text-fg tnum">
                    Displej {hover.n}
                  </div>
                  <div className="text-[11px] text-fg-muted">{hover.popis}</div>
                  {summaryData && (
                    <div className="text-[11px] text-fg-muted tnum">
                      {cisloCs(hover.count)} dotazů
                    </div>
                  )}
                </div>
              )}
            </div>

            {summaryData ? (
              <>
                <div className="flex items-center gap-3 text-[11px] text-fg-dim max-w-md">
                  <span>Méně</span>
                  <div
                    className="h-1.5 flex-1 rounded-full"
                    style={{
                      background:
                        "linear-gradient(90deg, #C7E0DA, #0F766E 45%, #C2740C 75%, #DC2626)",
                    }}
                  />
                  <span>Více</span>
                </div>
                {mapa.nenaparovano.length > 0 && (
                  <p className="text-[11px] text-fg-dim">
                    {mapa.nenaparovano.length}{" "}
                    {mapa.nenaparovano.length === 1 ? "druh z analytiky" : "druhů z analytiky"} se
                    nepodařilo napárovat na displej (
                    {mapa.nenaparovano
                      .slice(0, 3)
                      .map((s) => s.species_latin || s.species_name || "?")
                      .join(", ")}
                    {mapa.nenaparovano.length > 3 ? ", …" : ""}). Zkontrolujte latinský název v
                    info panelu displeje.
                  </p>
                )}
              </>
            ) : !summary ? (
              <Cekam />
            ) : (
              <Hlaska
                text={NEPRIPOJENO}
                detail="Body ukazují displeje z CMS, intenzita se dokreslí, až začne chatbot vracet dotazy."
              />
            )}
          </>
        )}
      </section>

      <Divider />

      {/* Dvousloupcový editorial spread: poslední dotazy | co AI nezvládla */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <section>
          <div className="flex items-baseline justify-between gap-3 mb-5">
            <div className="kicker">Poslední dotazy návštěvníků</div>
            {posledni?.dostupne && posledni.data.total > VYPSAT_POSLEDNI && (
              <span className="text-[11px] text-fg-dim tnum">
                {VYPSAT_POSLEDNI} z {cisloCs(posledni.data.total)}
              </span>
            )}
          </div>
          {!posledni && <Cekam />}
          {/* Důvod nedostupnosti je jednou nahoře, tady by se jen opakoval. */}
          {posledni && !posledni.dostupne && <Hlaska text={NEPRIPOJENO} />}
          {posledni?.dostupne && posledni.data.questions.length === 0 && (
            <Hlaska text={BEZ_DOTAZU} />
          )}
          {posledni?.dostupne && posledni.data.questions.length > 0 && (
            <ul className="divide-y divide-lineSoft">
              {nejnovejsi(posledni.data.questions, VYPSAT_POSLEDNI).map((q, i) => (
                <li key={`${q.session_id}-${q.timestamp}-${i}`} className="py-3">
                  <div className="text-sm text-fg">{q.user_message}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-fg-dim">
                    <span>{druhLabel(q)}</span>
                    <span>·</span>
                    <span className="tnum">{formatDateTime(q.timestamp)}</span>
                    {!q.answered && <span className="text-amber">· bez odpovědi</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="lg:border-l lg:border-line lg:pl-10">
          <div className="flex items-baseline justify-between gap-3 mb-5">
            <div className="kicker">Co AI nezvládla</div>
            {nezvladnute?.dostupne && nezvladnute.data.total > VYPSAT_NEZVLADNUTE && (
              <span className="text-[11px] text-fg-dim tnum">
                {VYPSAT_NEZVLADNUTE} z {cisloCs(nezvladnute.data.total)}
              </span>
            )}
          </div>
          {!nezvladnute && <Cekam />}
          {nezvladnute && !nezvladnute.dostupne && <Hlaska text={NEPRIPOJENO} />}
          {nezvladnute?.dostupne && nezvladnute.data.questions.length === 0 && (
            <Hlaska
              text="Zatím žádné nezvládnuté dotazy."
              detail="Všechny zaznamenané dotazy chatbot odpověděl."
            />
          )}
          {nezvladnute?.dostupne && nezvladnute.data.questions.length > 0 && (
            <ul className="divide-y divide-lineSoft">
              {nejnovejsi(nezvladnute.data.questions, VYPSAT_NEZVLADNUTE).map((q, i) => (
                <li key={`${q.session_id}-${q.timestamp}-${i}`} className="py-3">
                  <div className="text-sm text-fg">{q.user_message}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-fg-dim">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber" />
                    <span>{druhLabel(q)}</span>
                    <span>·</span>
                    <span className="tnum">{formatDateTime(q.timestamp)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Divider />

      {/* Displeje z CMS. Stav zařízení (online/offline) tu záměrně NENÍ:
          monitoring tabletů zatím nemáme z čeho číst, přijde od Michala. */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div className="kicker">
            Displeje v CMS{displays ? ` · ${displays.length}` : ""}
          </div>
          <div className="flex items-center gap-4 text-[11px] text-fg-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-accent-soft border border-accent/30" /> obsah
              přiřazen
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-lineSoft border border-line" /> nepřiřazeno
            </span>
          </div>
        </div>
        <Hlaska
          text="Monitoring tabletů zatím není napojený."
          detail="Online/offline stav zařízení v pavilonu nemáme z čeho číst (přijde od Michala). Proužek níž je přehled displejů založených v CMS, ne živý stav zařízení."
        />
        {displays && displays.length > 0 && (
          <div className="flex items-end gap-1.5 mt-4">
            {displays.map((d) => {
              const prirazeno = d.druh !== NEPRIRAZENO;
              return (
                <div
                  key={d.id}
                  title={`Displej ${d.id}: ${d.druh}`}
                  className="flex-1 flex flex-col items-center gap-1.5"
                >
                  <span
                    className={`w-full h-6 rounded-full border ${
                      prirazeno ? "bg-accent-soft border-accent/30" : "bg-lineSoft border-line"
                    }`}
                  />
                  <span className="text-[9px] text-fg-dim tnum">{d.id}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
