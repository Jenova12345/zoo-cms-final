import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Sparkles, RefreshCw, X } from "lucide-react";
import { api } from "../lib/api";
import { NEPRIRAZENO, type DisplayDetail, type SlideContent } from "../lib/types";
import { LogoMark } from "../components/Logo";

const AUTO_ADVANCE_MS = 8000;
const MEDIA_ADVANCE_MS = 5000;

interface MediaItem {
  typ: "video" | "foto";
  url: string;
}

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

  // Drž index v rozsahu, když se po načtení změní počet slidů.
  useEffect(() => {
    if (total && index >= total) setIndex(0);
  }, [total, index]);

  const slideHasVideo = !!detail?.slides[index]?.video;

  // Auto-advance. U slidu s videem nepřepínáme, ať se video stihne přehrát.
  useEffect(() => {
    if (!total || paused || slideHasVideo) return;
    const t = setInterval(next, AUTO_ADVANCE_MS);
    return () => clearInterval(t);
  }, [total, paused, slideHasVideo, next, index]);

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

  const slide = detail.slides[index] ?? detail.slides[0];
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
          <ContentSlide slide={slide} prirazeno={prirazeno} />
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
            aria-label={`Slide ${i + 1}`}
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

function ContentSlide({ slide, prirazeno }: { slide: SlideContent; prirazeno: boolean }) {
  const { nadpis, text, obrazky, video } = slide;
  const media = useMemo<MediaItem[]>(() => {
    const items: MediaItem[] = [];
    if (video) items.push({ typ: "video", url: video });
    for (const url of obrazky) items.push({ typ: "foto", url });
    return items;
  }, [video, obrazky]);

  const hasContent = prirazeno && (nadpis || text || media.length > 0);
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
      {/* Média: carousel fotek a video */}
      <div className="relative bg-bg grid place-items-center overflow-hidden">
        {media.length > 0 ? (
          <MediaCarousel key={slide.n} items={media} alt={nadpis} />
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
      </div>
    </div>
  );
}

// Carousel přes média jednoho slidu: video (pokud je) a všechny fotky.
function MediaCarousel({ items, alt }: { items: MediaItem[]; alt: string }) {
  const [i, setI] = useState(0);
  const safe = Math.min(i, items.length - 1);
  const current = items[safe];

  // Automatické přepínání fotek. U videa se nepřepíná, ať dohraje.
  useEffect(() => {
    if (items.length <= 1 || current?.typ === "video") return;
    const t = setInterval(() => setI((x) => (x + 1) % items.length), MEDIA_ADVANCE_MS);
    return () => clearInterval(t);
  }, [items.length, current?.typ, safe]);

  if (!current) return null;

  return (
    <div className="relative h-full w-full">
      {current.typ === "video" ? (
        <video
          key={current.url}
          src={current.url}
          className="h-full w-full object-contain bg-black"
          autoPlay
          muted
          loop
          playsInline
          controls
        />
      ) : (
        <img src={current.url} alt={alt} className="h-full w-full object-cover" />
      )}

      {/* Tečky médií */}
      {items.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
          {items.map((m, idx) => (
            <button
              key={m.url}
              onClick={(e) => {
                e.stopPropagation();
                setI(idx);
              }}
              className={`h-2 rounded-full transition-all ${
                idx === safe ? "w-6 bg-white" : "w-2 bg-white/50 hover:bg-white/80"
              }`}
              aria-label={m.typ === "video" ? "Video" : `Fotka ${idx + 1}`}
            />
          ))}
        </div>
      )}
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
