import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, RefreshCw, X } from "lucide-react";
import { api } from "../lib/api";
import { INFO_POLE, NEPRIRAZENO, type DisplayDetail, type SlideContent } from "../lib/types";
import { LogoMark } from "../components/Logo";

const AUTO_ADVANCE_MS = 8000;
const MEDIA_ADVANCE_MS = 5000;

// Reálné zařízení u expozice: Unity běží na fixním rozlišení 1200 × 800 (3:2).
// Náhled proto sázíme přesně do těchto rozměrů a celý rám jen zmenšíme, aby se
// vešel do okna prohlížeče (letterbox okolo). Kurátor tak vidí i to, jestli se
// text na displej vejde — ne layout, který se přizpůsobí jeho monitoru.
//
// Uvnitř rámu se proto zásadně nepoužívají responzivní varianty (lg:...): ty
// reagují na šířku okna, ne na šířku rámu, a náhled by se rozešel se zařízením.
// Ze stejného důvodu jsou rozměry uvnitř rámu v pevných pixelech.
const SIRKA = 1200;
const VYSKA = 800;

// --- Grafika od Michala (web/public/michal, servíruje se lokálně) ---
//
// Rozměry a pozice níž jsou odměřené z předlohy "Informace – 3.png"
// (1701 × 1101) a přepočtené do rámu 1200 × 800 poměrem 0,705 / 0,727.
const G = "/michal";
const ZLUTA = "#F8CA00"; // odměřeno z předlohy (nadtitulek i rámečky tlačítek)
const AKTIVNI = "#695600"; // výplň aktivního tlačítka ve spodní liště
const PRUH = 32; // šířka svislého vzoru vlevo (45 px v předloze)
const OKRAJ = 64; // levý okraj textu (90 px v předloze)

// Ikony polí info panelu podle klíče v text.txt.
const IKONY_POLI: Record<string, string> = {
  Strava: `${G}/ikona-strava.png`,
  Velikost: `${G}/ikona-velikost.png`,
  DobaLihnuti: `${G}/ikona-doba-lihnuti.png`,
  Ohrozeni: `${G}/ikona-ohrozeni.png`,
  DelkaZivota: `${G}/ikona-delka-zivota.png`,
};

interface MediaItem {
  typ: "video" | "foto" | "mapa";
  url: string;
}

// Měřítko, ve kterém se rám 1200 × 800 vejde do dostupné plochy. Nikdy
// nezvětšujeme nad 100 %, ať zůstane náhled ostrý a odpovídá zařízení 1:1.
//
// Element bereme přes callback ref (ne useRef): plocha náhledu se vykreslí až
// po načtení dat, takže v okamžiku prvního efektu ještě neexistuje. Se stavem
// se efekt spustí znovu, jakmile se element objeví.
function useMeritko(obal: HTMLDivElement | null): number {
  const [meritko, setMeritko] = useState(1);
  useEffect(() => {
    if (!obal) return;
    const prepocti = () => {
      const { width, height } = obal.getBoundingClientRect();
      if (!width || !height) return;
      setMeritko(Math.min(width / SIRKA, height / VYSKA, 1));
    };
    prepocti();
    const ro = new ResizeObserver(prepocti);
    ro.observe(obal);
    return () => ro.disconnect();
  }, [obal]);
  return meritko;
}

export default function Tablet() {
  const { id = "" } = useParams();
  const [detail, setDetail] = useState<DisplayDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [obal, setObal] = useState<HTMLDivElement | null>(null);
  const meritko = useMeritko(obal);

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

  const slideHasVideo = detail?.slides[index]?.typ === "vid" && !!detail?.slides[index]?.video;

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

  const slide = detail.slides[index] ?? detail.slides[0] ?? null;
  const druh = detail.meta.druh;
  const prirazeno = druh !== NEPRIRAZENO;

  return (
    <div className="fixed inset-0 bg-canvas text-fg flex flex-col select-none">
      {/* Lišta náhledu (nástroje CMS, na zařízení není) */}
      <div className="shrink-0 flex items-center justify-between px-8 py-4 border-b border-line bg-surface">
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

      {/* Letterbox: rám zařízení 3:2 vycentrovaný na volné ploše */}
      <div ref={setObal} className="flex-1 min-h-0 relative grid place-items-center px-20 py-6">
        <div className="relative" style={{ width: SIRKA * meritko, height: VYSKA * meritko }}>
          <div
            onClick={() => setPaused((p) => !p)}
            className="absolute left-0 top-0 origin-top-left overflow-hidden shadow-cardHover"
            style={{
              width: SIRKA,
              height: VYSKA,
              transform: `scale(${meritko})`,
              background: "#000",
            }}
          >
            <Zarizeni detail={detail} slide={slide} onPrev={prev} onNext={next} onEnded={next} />
          </div>
        </div>

        {/* Navigace mezi slidy je záměrně mimo rám, ať nepřekrývá obsah displeje.
            Uvnitř rámu jsou navíc Michalovy kulaté šipky (ty jsou součástí
            layoutu zařízení, tyhle jsou nástroj CMS). */}
        {total > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-5 top-1/2 -translate-y-1/2 h-14 w-14 grid place-items-center rounded-full border border-line bg-surface text-fg-muted hover:text-fg hover:border-accent/40 shadow-card transition"
              aria-label="Předchozí"
            >
              <ChevronLeft className="h-7 w-7" strokeWidth={1.5} />
            </button>
            <button
              onClick={next}
              className="absolute right-5 top-1/2 -translate-y-1/2 h-14 w-14 grid place-items-center rounded-full border border-line bg-surface text-fg-muted hover:text-fg hover:border-accent/40 shadow-card transition"
              aria-label="Další"
            >
              <ChevronRight className="h-7 w-7" strokeWidth={1.5} />
            </button>
          </>
        )}
      </div>

      {/* Indikátory slidů a údaj o měřítku náhledu */}
      <div className="shrink-0 flex flex-col items-center gap-2.5 py-4 border-t border-line bg-surface">
        <div className="flex items-center justify-center gap-2.5">
          {detail.slides.map((s, i) => (
            <button
              key={s.n}
              onClick={() => setIndex(i)}
              className={`h-2.5 rounded-full transition-all ${
                i === index ? (s.typ === "ai" ? "w-8 bg-amber" : "w-8 bg-accent") : "w-2.5 bg-line hover:bg-fg-dim"
              }`}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
        <div className="text-[11px] text-fg-dim tnum">
          {paused ? (
            <span className="text-fg-muted">Pozastaveno · klikněte do náhledu pro pokračování</span>
          ) : (
            <>
              Náhled zařízení {SIRKA} × {VYSKA} px (3:2) · zobrazeno na {Math.round(meritko * 100)} %
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Zařízení: společná kostra všech slidů podle Michalových předloh ---

// Spodní lišta má na zařízení pevnou sadu tlačítek. Naše typy slidů se na ně
// mapují takto; "3D model" v CMS protějšek nemá a je vždy neaktivní.
type Tlacitko = "domu" | "ai" | "3d" | "video" | "zajimavost";

function tlacitkoProSlide(typ: SlideContent["typ"] | null): Tlacitko {
  if (typ === "ai") return "ai";
  if (typ === "vid") return "video";
  if (typ === "gal") return "zajimavost";
  return "domu";
}

// Identita druhu pro hlavičku. Na zařízení je hlavička stejná na všech slidech
// (viz předlohy Informace / Video / Text + schéma), ale text.txt má jen info
// panel — na ostatních slidech proto bereme totéž z meta.json, kam se identita
// při uložení info panelu propisuje.
interface Identita {
  sekce?: string;
  nazev?: string;
  latinsky?: string;
}

function identita(detail: DisplayDetail): Identita {
  const info = detail.slides.find((s) => s.typ === "info");
  return {
    sekce: info?.pole.Sekce || detail.meta.category,
    nazev: info?.pole.Nazev || detail.meta.name || (detail.meta.druh !== NEPRIRAZENO ? detail.meta.druh : ""),
    latinsky: info?.pole.Latinsky || detail.meta.latin_name,
  };
}

function Zarizeni({
  detail,
  slide,
  onPrev,
  onNext,
  onEnded,
}: {
  detail: DisplayDetail;
  slide: SlideContent | null;
  onPrev: () => void;
  onNext: () => void;
  onEnded: () => void;
}) {
  const aktivni = tlacitkoProSlide(slide?.typ ?? null);
  const id = identita(detail);

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ background: "#000", fontFamily: '"Rustica", system-ui, sans-serif' }}
    >
      {/* Obsah slidu (kreslí i vlastní pozadí / fotku) */}
      {!slide ? (
        <PrazdnyObsah />
      ) : slide.typ === "info" ? (
        <ObsahInfo slide={slide} onPrev={onPrev} onNext={onNext} />
      ) : slide.typ === "gal" ? (
        <ObsahGalerie slide={slide} identita={id} />
      ) : slide.typ === "vid" ? (
        <ObsahVideo slide={slide} identita={id} onEnded={onEnded} />
      ) : (
        <ObsahAi identita={id} />
      )}

      {/* Svislý vzor vlevo — přes celou výšku, nad obsahem.
          V předloze se vzor neroztahuje na výšku displeje, ale opakuje se:
          odměřeno, že jedna perioda je 624 px při šířce vzoru 83 px (v měřítku
          předlohy). Po přepočtu do rámu 1200 × 800 je to šířka 59 px, z níž je
          vidět levých 32 px. */}
      <div
        className="absolute left-0 top-0 h-full"
        style={{
          width: PRUH,
          backgroundImage: `url(${G}/vzor.png)`,
          backgroundSize: "59px auto",
          backgroundRepeat: "repeat-y",
          backgroundPosition: "left top",
        }}
      />

      {/* Logo ZOO vpravo nahoře */}
      <img
        src={`${G}/logo-zoo.png`}
        alt=""
        className="absolute"
        style={{ right: 32, top: 33, height: 69 }}
      />

      <Vlajky />
      <SpodniLista aktivni={aktivni} />
    </div>
  );
}

// Hlavička (nadtitulek + název + latinsky) je stejná na všech typech slidů.
function Hlavicka({
  sekce,
  nazev,
  latinsky,
  cara = true,
}: {
  sekce?: string;
  nazev?: string;
  latinsky?: string;
  cara?: boolean;
}) {
  return (
    <div className="relative" style={{ paddingTop: 34 }}>
      <div
        style={{
          fontFamily: '"Grad", Georgia, serif',
          fontWeight: 700,
          fontSize: 34,
          lineHeight: 1.1,
          color: ZLUTA,
        }}
      >
        {sekce || " "}
      </div>
      <div
        style={{
          fontFamily: '"Grad", Georgia, serif',
          fontWeight: 700,
          fontSize: 58,
          lineHeight: 1.08,
          color: "#fff",
          marginTop: 2,
        }}
      >
        {nazev || " "}
      </div>
      {latinsky && (
        <div style={{ fontSize: 18, fontStyle: "italic", color: "#fff", marginTop: 12 }}>
          {latinsky}
        </div>
      )}
      {cara && <div style={{ width: 238, height: 2, background: "#fff", marginTop: 18 }} />}
    </div>
  );
}

// Info panel podle předlohy "Informace – 3.png".
function ObsahInfo({
  slide,
  onPrev,
  onNext,
}: {
  slide: SlideContent;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { Sekce: sekce, Nazev: nazev, Latinsky: latinsky } = slide.pole;

  // Prázdná pole se nevykreslují — kurátor hned vidí, co ještě chybí.
  const detaily = INFO_POLE.filter(
    (d) => !["Sekce", "Nazev", "Latinsky"].includes(d.klic) && (slide.pole[d.klic] ?? "").trim(),
  );

  const fotky = useMemo<MediaItem[]>(
    () => slide.obrazky.map((url) => ({ typ: "foto" as const, url })),
    [slide.obrazky],
  );

  return (
    <>
      {/* Fotka druhu vpravo. Sahá pod organický tvar, ten ji zleva ořízne. */}
      <div className="absolute top-0 bottom-0" style={{ left: 430, right: 0 }}>
        {fotky.length > 0 ? (
          <Carousel key={slide.n} items={fotky} alt={nazev ?? "Fotka"} />
        ) : (
          <div className="h-full w-full grid place-items-center" style={{ background: "#111" }}>
            <span style={{ color: "#666", fontSize: 20 }}>Bez fotky</span>
          </div>
        )}
      </div>

      {/* Organický černý tvar od Michala — vytváří vlnitou hranu fotky */}
      <img
        src={`${G}/liana.png`}
        alt=""
        className="absolute inset-0 pointer-events-none"
        style={{ width: "100%", height: "100%" }}
      />

      {/* Kulaté průhledné šipky po stranách fotky (součást zařízení) */}
      <SipkaZarizeni smer="vlevo" onClick={onPrev} style={{ left: 572, top: 369 }} />
      <SipkaZarizeni smer="vpravo" onClick={onNext} style={{ right: 22, top: 369 }} />

      {/* Levý sloupec: text, mapa, pole.
          Obsah je v toku (ne na pevných souřadnicích jako v Unity): když
          kurátor napíše delší název nebo hodnotu, zbytek se posune dolů místo
          aby se překryl. Rozestupy jsou nastavené tak, aby při běžně dlouhém
          obsahu seděly na předlohu. */}
      {/* Šířka 496 px = po hranu organického tvaru ve výšce řádků s poli, ať
          se dlouhá hodnota zalomí a nevleze do fotky. */}
      <div className="absolute top-0" style={{ left: OKRAJ, width: 496 }}>
        <Hlavicka sekce={sekce} nazev={nazev} latinsky={latinsky} />

        {/* Mapa výskytu z dat displeje (cs/<slide>/mapa.png).
            Vykresluje se tak, jak ji kurátor nahrál — když nahraje tmavou mapu,
            musí to na náhledu poznat, ne aby mu ji náhled přebarvil. */}
        {slide.mapa && (
          <img
            src={slide.mapa}
            alt="Mapa výskytu"
            style={{
              marginTop: 14,
              marginLeft: 17,
              width: 378,
              height: 182,
              objectFit: "contain",
              objectPosition: "left center",
            }}
          />
        )}

        {detaily.length > 0 && (
          <div
            style={{
              marginTop: slide.mapa ? 24 : 30,
              display: "grid",
              // Druhý sloupec začíná v předloze na x = 395 px rámu.
              gridTemplateColumns: "331px 1fr",
              rowGap: 30,
            }}
          >
            {detaily.map((d) => (
              <div key={d.klic} className="flex items-start" style={{ gap: 14 }}>
                <img src={IKONY_POLI[d.klic]} alt="" style={{ width: 38, height: 38, flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 15,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "#fff",
                      lineHeight: 1.2,
                    }}
                  >
                    {d.label}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginTop: 4, lineHeight: 1.3 }}>
                    {slide.pole[d.klic]}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// Galerie: fotka přes celou plochu, hlavička přes ni (jako předloha "Video – 1").
function ObsahGalerie({ slide, identita }: { slide: SlideContent; identita: Identita }) {
  const fotky = useMemo<MediaItem[]>(
    () => slide.obrazky.map((url) => ({ typ: "foto" as const, url })),
    [slide.obrazky],
  );
  if (fotky.length === 0) return <PrazdnyObsah />;
  return (
    <>
      <div className="absolute inset-0">
        <Carousel key={slide.n} items={fotky} alt="Fotka galerie" />
      </div>
      <div className="absolute top-0" style={{ left: OKRAJ, width: 620 }}>
        <Hlavicka {...identita} cara={false} />
      </div>
    </>
  );
}

// Video: MP4 přes celou plochu, hlavička přes něj, uprostřed tlačítko přehrát.
function ObsahVideo({
  slide,
  identita,
  onEnded,
}: {
  slide: SlideContent;
  identita: Identita;
  onEnded: () => void;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [bezi, setBezi] = useState(true);

  if (!slide.video) return <PrazdnyObsah />;

  return (
    <>
      <video
        ref={ref}
        key={slide.video}
        src={slide.video}
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        muted
        playsInline
        onEnded={onEnded}
        onPlay={() => setBezi(true)}
        onPause={() => setBezi(false)}
      />
      {/* Tlačítko přehrát je i v Michalově předloze; tady navíc pauzuje,
          ať se kurátor může na konkrétní záběr v klidu podívat. */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          const v = ref.current;
          if (!v) return;
          if (v.paused) void v.play();
          else v.pause();
        }}
        className="absolute"
        style={{ left: 600 - 61, top: 400 - 61, width: 122, height: 122, opacity: bezi ? 0 : 1 }}
        aria-label={bezi ? "Pozastavit video" : "Přehrát video"}
      >
        <img src={`${G}/play.png`} alt="" style={{ width: 122, height: 122 }} />
      </button>
      <div className="absolute top-0" style={{ left: OKRAJ, width: 620 }}>
        <Hlavicka {...identita} cara={false} />
      </div>
    </>
  );
}

// AI slide: styl předlohy "Text + schéma" (černá plocha, svislá bílá linka).
function ObsahAi({ identita: id }: { identita: Identita }) {
  return (
    <div className="absolute inset-0">
      <div className="absolute top-0" style={{ left: OKRAJ, width: 600 }}>
        <Hlavicka {...id} cara={false} />
        <div style={{ fontSize: 19, color: "#fff", marginTop: 30, lineHeight: 1.55, opacity: 0.85 }}>
          {id.nazev
            ? `Zeptejte se AI průvodce na cokoliv o druhu ${id.nazev}. Odpovídat bude podle znalostní báze, kterou vyplníte v záložce „Znalostní báze (AI)".`
            : "Zeptejte se AI průvodce. Nejdřív displeji přiřaďte druh a vyplňte znalostní bázi."}
        </div>
      </div>
      {/* Svislá linka jako v předloze "Text + schéma – 1.png" */}
      <div className="absolute" style={{ left: 700, top: 210, bottom: 190, width: 2, background: "#fff" }} />
      <div className="absolute grid place-items-center" style={{ left: 760, top: 210, right: 90, bottom: 190 }}>
        <div className="text-center">
          <img src={`${G}/ikona-ai.png`} alt="" style={{ width: 120, height: 120, margin: "0 auto" }} />
          <div style={{ fontSize: 22, color: "#fff", marginTop: 22, opacity: 0.75 }}>
            Připravujeme
          </div>
        </div>
      </div>
    </div>
  );
}

function PrazdnyObsah() {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="text-center" style={{ color: "#8a8a8a" }}>
        <div style={{ fontFamily: '"Grad", Georgia, serif', fontSize: 34, color: "#d8d8d8" }}>
          Displej zatím nemá obsah
        </div>
        <div style={{ fontSize: 19, marginTop: 10 }}>Obsah doplníte ve správě displejů.</div>
      </div>
    </div>
  );
}

// --- Prvky zařízení ---

function SipkaZarizeni({
  smer,
  onClick,
  style,
}: {
  smer: "vlevo" | "vpravo";
  onClick: () => void;
  style: React.CSSProperties;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="absolute grid place-items-center rounded-full"
      style={{
        width: 62,
        height: 62,
        background: "rgba(255,255,255,0.22)",
        backdropFilter: "blur(2px)",
        ...style,
      }}
      aria-label={smer === "vlevo" ? "Předchozí" : "Další"}
    >
      {smer === "vlevo" ? (
        <ChevronLeft style={{ width: 30, height: 30, color: "#fff" }} strokeWidth={2.2} />
      ) : (
        <ChevronRight style={{ width: 30, height: 30, color: "#fff" }} strokeWidth={2.2} />
      )}
    </button>
  );
}

// Vlajky jazyků vlevo dole. V podkladech nebyly jako soubory, kreslíme je
// jako SVG podle předlohy (CZ aktivní se žlutým kroužkem). Středy jsou pevně
// na 87,5 / 152,5 / 217 px, jak je odměřeno z předlohy.
function Vlajky() {
  return (
    <>
      <Vlajka kod="cz" stred={87.5} aktivni />
      <Vlajka kod="pl" stred={152.5} />
      <Vlajka kod="en" stred={217} />
    </>
  );
}

function Vlajka({
  kod,
  stred,
  aktivni = false,
}: {
  kod: "cz" | "pl" | "en";
  stred: number;
  aktivni?: boolean;
}) {
  const d = 40;
  const vnejsi = aktivni ? 57 : d;
  return (
    <div
      className="absolute grid place-items-center rounded-full"
      style={{
        left: stred - vnejsi / 2,
        bottom: 33 - (vnejsi - d) / 2,
        width: vnejsi,
        height: vnejsi,
        border: aktivni ? `3px solid ${ZLUTA}` : undefined,
      }}
    >
      <svg width={d} height={d} viewBox="0 0 60 60" aria-label={kod.toUpperCase()}>
        <defs>
          <clipPath id={`kruh-${kod}`}>
            <circle cx="30" cy="30" r="30" />
          </clipPath>
        </defs>
        <g clipPath={`url(#kruh-${kod})`}>
          {kod === "cz" && (
            <>
              <rect width="60" height="30" fill="#fff" />
              <rect y="30" width="60" height="30" fill="#D7141A" />
              <path d="M0 0 L30 30 L0 60 Z" fill="#11457E" />
            </>
          )}
          {kod === "pl" && (
            <>
              <rect width="60" height="30" fill="#fff" />
              <rect y="30" width="60" height="30" fill="#DC143C" />
            </>
          )}
          {kod === "en" && (
            <>
              <rect width="60" height="60" fill="#012169" />
              <path d="M0 0 L60 60 M60 0 L0 60" stroke="#fff" strokeWidth="12" />
              <path d="M0 0 L60 60 M60 0 L0 60" stroke="#C8102E" strokeWidth="7" />
              <path d="M30 0 V60 M0 30 H60" stroke="#fff" strokeWidth="20" />
              <path d="M30 0 V60 M0 30 H60" stroke="#C8102E" strokeWidth="12" />
            </>
          )}
        </g>
      </svg>
    </div>
  );
}

// Spodní lišta zařízení: domeček + čtyři tlačítka se žlutým rámečkem.
// Šířky jsou pevné (odměřené z předlohy), ne podle délky textu — v Unity jsou
// to hotové obrázky pevné velikosti a lišta musí končit 32 px od pravého kraje.
function SpodniLista({ aktivni }: { aktivni: Tlacitko }) {
  const tlacitka: { id: Tlacitko; popisek: string; ikona: string; sirka: number }[] = [
    { id: "ai", popisek: "AI otázky", ikona: `${G}/ikona-ai.png`, sirka: 154 },
    { id: "3d", popisek: "3D model", ikona: `${G}/ikona-3d.png`, sirka: 172 },
    { id: "video", popisek: "Video", ikona: `${G}/ikona-video.png`, sirka: 172 },
    { id: "zajimavost", popisek: "Zajímavost", ikona: `${G}/ikona-zajimavost.png`, sirka: 172 },
  ];

  return (
    <div className="absolute flex items-center" style={{ left: 398, bottom: 32, gap: 11 }}>
      {/* Domeček */}
      <div
        className="grid place-items-center"
        style={{
          width: 56,
          height: 57,
          borderRadius: 17,
          border: `2.5px solid ${ZLUTA}`,
          background: aktivni === "domu" ? AKTIVNI : "rgba(0,0,0,0.45)",
        }}
      >
        <img
          src={`${G}/ikona-domecek.png`}
          alt="Domů"
          style={{
            width: 25,
            height: 25,
            // V předloze je domeček na aktivním tlačítku žlutý, jinak bílý.
            filter: aktivni === "domu" ? "brightness(0) invert(78%) sepia(94%) saturate(1400%) hue-rotate(2deg)" : undefined,
          }}
        />
      </div>

      {tlacitka.map((t) => (
        <div
          key={t.id}
          className="flex items-center justify-center"
          style={{
            width: t.sirka,
            height: 57,
            gap: 10,
            borderRadius: 999,
            border: `2.5px solid ${ZLUTA}`,
            background: aktivni === t.id ? AKTIVNI : "rgba(0,0,0,0.45)",
          }}
        >
          <img src={t.ikona} alt="" style={{ width: 28, height: 28, flexShrink: 0 }} />
          <span style={{ fontSize: 19, color: "#fff", whiteSpace: "nowrap" }}>{t.popisek}</span>
        </div>
      ))}
    </div>
  );
}

// Carousel fotek jednoho slidu (autoplay jako na reálném tabletu).
function Carousel({ items, alt }: { items: MediaItem[]; alt: string }) {
  const [i, setI] = useState(0);
  const safe = Math.min(i, items.length - 1);
  const current = items[safe];

  useEffect(() => {
    if (items.length <= 1) return;
    const t = setInterval(() => setI((x) => (x + 1) % items.length), MEDIA_ADVANCE_MS);
    return () => clearInterval(t);
  }, [items.length, safe]);

  if (!current) return null;

  return (
    <div className="relative h-full w-full">
      <img src={current.url} alt={alt} className="h-full w-full object-cover" />
      {/* Tečky fotek uvnitř slidu. Na zařízení se fotky střídají samy, tohle je
          drobná pomůcka navíc, ať kurátor doklikne na konkrétní fotku. */}
      {items.length > 1 && (
        <div className="absolute flex items-center" style={{ bottom: 104, right: 40, gap: 8 }}>
          {items.map((m, idx) => (
            <button
              key={m.url}
              onClick={(e) => {
                e.stopPropagation();
                setI(idx);
              }}
              style={{
                height: 8,
                width: idx === safe ? 24 : 8,
                borderRadius: 999,
                background: idx === safe ? "#fff" : "rgba(255,255,255,0.45)",
              }}
              aria-label={`Fotka ${idx + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
