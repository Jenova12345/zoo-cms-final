import { useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";

// VŠECHNO na této stránce jsou demo data. Reálná data přijdou s chatbotem.
function DemoNote() {
  return (
    <span className="text-[11px] text-fg-dim">Demo data, reálná data přijdou s chatbotem</span>
  );
}

// --- Heat mapa: čistý půdorys haly, bez rámečku ---
interface HeatNode {
  n: number;
  x: number;
  y: number;
  score: number;
  interakce: number;
}

function buildHall(): HeatNode[] {
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
  ring(24, 8, 12, 92, 86);
  ring(13, 33, 33, 67, 67);
  return nodes.map((p, i) => {
    const n = i + 1;
    const score = Math.min(1, Math.max(0.08, Math.sin(n * 1.7) * 0.5 + 0.5));
    return { n, x: p.x, y: p.y, score, interakce: Math.round(40 + score * 460) };
  });
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

function Sparkline({ values }: { values: number[] }) {
  const w = 120;
  const h = 32;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / span) * (h - 4) - 2;
    return [x, y] as const;
  });
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden="true">
      <path d={d} fill="none" stroke="#0F766E" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.4" fill="#0F766E" />
    </svg>
  );
}

const STATS = [
  { label: "Návštěvníků dnes", value: "1 284", delta: "+8,2 %" },
  { label: "Dotazů na AI", value: "612", delta: "+14 %" },
  { label: "Úspěšnost odpovědí", value: "87 %", delta: "+3 %" },
  { label: "Tablety online", value: "34/37", delta: "92 %" },
];

const VISITORS_TREND = [38, 41, 37, 46, 52, 49, 58, 63, 61, 72, 78, 84];

const QUESTIONS = [
  { q: "Je axolotl ryba, nebo žába?", count: 142 },
  { q: "Proč mlok svítí žlutě?", count: 118 },
  { q: "Kde žije rosnička?", count: 97 },
  { q: "Jsou tihle obojživelníci jedovatí?", count: 83 },
  { q: "Co axolotl jí?", count: 64 },
];

const AI_FAILS = [
  { q: "Kolik váží největší axolotl na světě?", reason: "Mimo znalostní bázi" },
  { q: "Můžu si sáhnout na mloka?", reason: "Chybí provozní pravidlo" },
  { q: "Kde je nejbližší WC?", reason: "Mimo téma displeje" },
  { q: "Jak dlouho žije rosnička v zajetí?", reason: "Neúplná data v KB" },
];

const TABLETS = Array.from({ length: 37 }, (_, i) => {
  const n = i + 1;
  const offline = n % 11 === 0;
  const warn = !offline && n % 7 === 0;
  return { n, stav: offline ? "offline" : warn ? "warn" : "online" };
});

function Divider() {
  return <div className="border-t border-line" />;
}

export default function Dashboard() {
  const hall = useMemo(buildHall, []);
  const hottest = useMemo(() => hall.reduce((a, b) => (b.score > a.score ? b : a), hall[0]), [hall]);
  const [hover, setHover] = useState<HeatNode | null>(null);

  return (
    <div className="space-y-10">
      {/* Titulek */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-fg">Přehled provozu</h1>
          <p className="text-sm text-fg-muted mt-1.5">Pavilon Amphibiárium, ZOO Ostrava</p>
        </div>
        <DemoNote />
      </div>

      {/* Stat ribbon: velká čísla na ploše, oddělená jen linkami */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-line border-y border-line">
        {STATS.map((s) => (
          <div key={s.label} className="px-6 py-5 first:pl-0">
            <div className="kicker">{s.label}</div>
            <div className="mt-2 font-display text-4xl font-bold text-fg tnum leading-none">
              {s.value}
            </div>
            <div className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent">
              <ArrowUpRight className="h-3 w-3" strokeWidth={2.2} />
              {s.delta}
            </div>
          </div>
        ))}
      </div>

      {/* Mapa návštěvnosti: hero na ploše, bez rámečku */}
      <section className="space-y-5">
        <div className="flex items-end justify-between">
          <div>
            <div className="kicker">Mapa návštěvnosti</div>
            <h2 className="font-display text-lg font-semibold text-fg mt-1.5">Půdorys haly</h2>
          </div>
          <div className="text-right">
            <div className="font-display text-xl font-bold text-fg tnum leading-none">
              {hottest.interakce}
            </div>
            <div className="text-[11px] text-fg-dim mt-1">špička · displej {hottest.n}</div>
          </div>
        </div>

        <div
          className="relative mx-auto w-full"
          style={{ aspectRatio: "16 / 7" }}
          onMouseLeave={() => setHover(null)}
        >
          {/* obrys haly a expozičního ostrova jen vlasovými linkami */}
          <div className="absolute inset-[5%] rounded-[20px] border border-line" />
          <div className="absolute inset-[34%] rounded-xl border border-lineSoft" />

          {hall.map((node) => {
            const r = 9 + node.score * 16;
            const color = heatColor(node.score);
            const active = hover?.n === node.n;
            return (
              <button
                key={node.n}
                onMouseEnter={() => setHover(node)}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform"
                style={{
                  left: `${node.x}%`,
                  top: `${node.y}%`,
                  width: r,
                  height: r,
                  background: color,
                  boxShadow: `0 0 ${5 + node.score * 14}px ${node.score * 3}px ${color}55`,
                  border: active ? "2px solid #0F766E" : "1px solid rgba(16,40,34,0.10)",
                  transform: `translate(-50%, -50%) scale(${active ? 1.3 : 1})`,
                  zIndex: active ? 20 : 1,
                }}
                aria-label={`Displej ${node.n}, ${node.interakce} interakcí`}
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
              <div className="text-[11px] text-fg-muted tnum">{hover.interakce} interakcí</div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 text-[11px] text-fg-dim max-w-md">
          <span>Méně</span>
          <div
            className="h-1.5 flex-1 rounded-full"
            style={{ background: "linear-gradient(90deg, #C7E0DA, #0F766E 45%, #C2740C 75%, #DC2626)" }}
          />
          <span>Více</span>
        </div>
      </section>

      <Divider />

      {/* Dvousloupcový editorial spread: otázky | co AI nezvládla */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <section>
          <div className="flex items-center justify-between mb-5">
            <div className="kicker">Nejčastější otázky návštěvníků</div>
            <DemoNote />
          </div>
          <ol className="divide-y divide-lineSoft">
            {QUESTIONS.map((item, i) => (
              <li key={item.q} className="flex items-baseline gap-4 py-3">
                <span className="font-display text-sm font-bold text-fg-dim tnum w-4 shrink-0">
                  {i + 1}
                </span>
                <span className="flex-1 text-sm text-fg">{item.q}</span>
                <span className="text-sm font-semibold text-fg-muted tnum shrink-0">
                  {item.count}×
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="lg:border-l lg:border-line lg:pl-10">
          <div className="flex items-center justify-between mb-5">
            <div className="kicker">Co AI nezvládla</div>
            <DemoNote />
          </div>
          <ul className="divide-y divide-lineSoft">
            {AI_FAILS.map((f) => (
              <li key={f.q} className="py-3">
                <div className="text-sm text-fg">{f.q}</div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber" />
                  <span className="text-xs text-fg-dim">{f.reason}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <Divider />

      {/* Status board jako tenký proužek, žádné dlaždice */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="kicker">Status board · 37 tabletů</div>
          <div className="flex items-center gap-4 text-[11px] text-fg-muted">
            <span className="flex items-center gap-1.5">
              <span className="dot-online" /> online
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber" /> upozornění
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-danger" /> offline
            </span>
          </div>
        </div>
        <div className="flex items-end gap-1.5">
          {TABLETS.map((t) => (
            <div
              key={t.n}
              title={`Tablet ${t.n}: ${t.stav}`}
              className="group flex-1 flex flex-col items-center gap-1.5"
            >
              <span
                className={`w-full rounded-full ${
                  t.stav === "online"
                    ? "bg-accent h-8"
                    : t.stav === "warn"
                      ? "bg-amber h-6"
                      : "bg-danger/70 h-4"
                }`}
              />
              <span className="text-[9px] text-fg-dim tnum">{t.n}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Mini trend pod ribbon (návštěvnost) */}
      <div className="flex items-center gap-3 text-xs text-fg-dim">
        <span className="kicker">Trend návštěvnosti, 12 h</span>
        <Sparkline values={VISITORS_TREND} />
      </div>
    </div>
  );
}
