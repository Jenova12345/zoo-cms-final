import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Sparkles, RefreshCw, X } from "lucide-react";
import { api } from "../lib/api";
import { NEPRIRAZENO, type DisplayDetail } from "../lib/types";
import { LogoMark } from "../components/Logo";

const AUTO_ADVANCE_MS = 8000;

export default function Tablet() {
  const { id = "" } = useParams();
  const [detail, setDetail] = useState<DisplayDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.display(id);
      setDetail(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Načtení selhalo.");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const total = detail?.slides.length ?? 0;

  const next = useCallback(() => setIndex((i) => (total ? (i + 1) % total : 0)), [total]);
  const prev = useCallback(() => setIndex((i) => (total ? (i - 1 + total) % total : 0)), [total]);

  // Auto-advance.
  useEffect(() => {
    if (!total || paused) return;
    const t = setInterval(next, AUTO_ADVANCE_MS);
    return () => clearInterval(t);
  }, [total, paused, next, index]);

  // Ovládání šipkami z klávesnice.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  if (error) {
    return (
      <div className="min-h-screen grid place-items-center bg-bg text-fg-muted">
        <div className="text-center space-y-4">
          <p>{error}</p>
          <Link to="/displeje" className="underline text-accent">
            Zpět do CMS
          </Link>
        </div>
      </div>
    );
  }

  if (!detail) {
    return <div className="min-h-screen grid place-items-center bg-bg text-fg-dim">Načítám…</div>;
  }

  const slide = detail.slides[index];
  const druh = detail.meta.druh;
  const prirazeno = druh !== NEPRIRAZENO;

  return (
    <div className="fixed inset-0 bg-bg text-fg flex flex-col select-none">
      {/* Horní lišta kiosku */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-line bg-surface">
        <div className="flex items-center gap-3">
          <LogoMark size={38} />
          <div>
            <div className="font-display text-sm font-bold tracking-tight">
              {prirazeno ? druh : "Amphibiárium"}
            </div>
            <div className="text-[11px] text-fg-dim tnum">
              Displej #{detail.id} · Amphibiárium ZOO Ostrava
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            title="Načíst znovu z disku"
            className="h-9 w-9 grid place-items-center rounded-lg border border-line bg-surface text-fg-muted hover:text-fg hover:border-accent/40 transition"
          >
            <RefreshCw className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <Link
            to={`/displeje/${id}`}
            title="Zavřít náhled"
            className="h-9 w-9 grid place-items-center rounded-lg border border-line bg-surface text-fg-muted hover:text-fg hover:border-accent/40 transition"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </Link>
        </div>
      </div>

      {/* Plocha slidu */}
      <div className="flex-1 relative overflow-hidden bg-surface" onClick={() => setPaused((p) => !p)}>
        {slide.jeAi ? (
          <AiPlaceholder druh={prirazeno ? druh : null} />
        ) : (
          <ContentSlide
            nadpis={slide.nadpis}
            text={slide.text}
            obrazky={slide.obrazky}
            prirazeno={prirazeno}
          />
        )}

        {/* Navigační šipky */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            prev();
          }}
          className="absolute left-5 top-1/2 -translate-y-1/2 h-14 w-14 grid place-items-center rounded-full border border-line bg-surface/90 backdrop-blur text-fg-muted hover:text-fg hover:border-accent/40 shadow-card transition"
          aria-label="Předchozí"
        >
          <ChevronLeft className="h-7 w-7" strokeWidth={1.5} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            next();
          }}
          className="absolute right-5 top-1/2 -translate-y-1/2 h-14 w-14 grid place-items-center rounded-full border border-line bg-surface/90 backdrop-blur text-fg-muted hover:text-fg hover:border-accent/40 shadow-card transition"
          aria-label="Další"
        >
          <ChevronRight className="h-7 w-7" strokeWidth={1.5} />
        </button>
      </div>

      {/* Indikátory slidů */}
      <div className="flex items-center justify-center gap-2.5 py-5 border-t border-line bg-surface">
        {detail.slides.map((s, i) => (
          <button
            key={s.n}
            onClick={() => setIndex(i)}
            className={`h-2.5 rounded-full transition-all ${
              i === index
                ? s.jeAi
                  ? "w-8 bg-amber"
                  : "w-8 bg-accent"
                : "w-2.5 bg-line hover:bg-fg-dim"
            }`}
            aria-label={`Slide ${s.n}`}
          />
        ))}
      </div>

      {paused && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 text-xs text-fg-muted bg-surface border border-line px-3 py-1.5 rounded-full shadow-card">
          Pozastaveno · klikněte pro pokračování
        </div>
      )}
    </div>
  );
}

function ContentSlide({
  nadpis,
  text,
  obrazky,
  prirazeno,
}: {
  nadpis: string;
  text: string;
  obrazky: string[];
  prirazeno: boolean;
}) {
  const hasContent = prirazeno && (nadpis || text || obrazky.length > 0);
  if (!hasContent) {
    return (
      <div className="h-full grid place-items-center text-center px-10">
        <div className="text-fg-dim">
          <div className="font-display text-2xl font-bold text-fg-muted">
            Displej zatím nemá obsah
          </div>
          <p className="mt-2 text-sm">Obsah doplníte ve správě displejů.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-2">
      {/* Obrázek */}
      <div className="relative bg-bg grid place-items-center overflow-hidden">
        {obrazky.length > 0 ? (
          <img src={obrazky[0]} alt={nadpis} className="h-full w-full object-cover" />
        ) : (
          <div className="text-fg-dim text-sm">Bez fotky</div>
        )}
      </div>
      {/* Text */}
      <div className="flex flex-col justify-center px-10 lg:px-16 py-10">
        {nadpis && (
          <>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              Amphibiárium
            </span>
            <h2 className="mt-3 font-display text-3xl lg:text-5xl font-bold tracking-tight text-fg">
              {nadpis}
            </h2>
            <div className="mt-5 h-1 w-14 rounded-full bg-accent" />
          </>
        )}
        <p className="mt-6 text-lg lg:text-xl leading-relaxed text-fg-muted whitespace-pre-line max-w-2xl">
          {text}
        </p>
        {obrazky.length > 1 && (
          <div className="mt-8 flex gap-3">
            {obrazky.slice(1, 5).map((url) => (
              <img
                key={url}
                src={url}
                alt=""
                className="h-16 w-16 rounded-lg object-cover border border-line"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AiPlaceholder({ druh }: { druh: string | null }) {
  return (
    <div className="h-full grid place-items-center text-center px-10 bg-bg">
      <div className="max-w-xl">
        <div className="mx-auto h-20 w-20 rounded-3xl bg-accent-soft border border-accent/20 grid place-items-center">
          <Sparkles className="h-10 w-10 text-accent" strokeWidth={1.5} />
        </div>
        <h2 className="mt-6 font-display text-3xl lg:text-5xl font-bold tracking-tight text-fg">
          Zeptejte se průvodce
        </h2>
        <p className="mt-4 text-lg text-fg-muted">
          {druh
            ? `Brzy se tu budete moci na cokoliv zeptat našeho AI průvodce o druhu ${druh}.`
            : "Brzy se tu budete moci zeptat našeho AI průvodce."}
        </p>
        <span className="inline-block mt-6 chip bg-accent-soft text-accent border border-accent/20">
          AI průvodce · připravujeme
        </span>
      </div>
    </div>
  );
}
