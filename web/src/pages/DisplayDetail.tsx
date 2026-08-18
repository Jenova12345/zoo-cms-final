import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Save,
  Send,
  Sparkles,
  UploadCloud,
  Loader2,
  Monitor,
  ImageIcon,
  Box,
  Lightbulb,
  Info,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Film,
  FileText,
  GripVertical,
  Map,
  X,
} from "lucide-react";
import { api, formatDateTime, nazevSouboru } from "../lib/api";
import { canonicalizeLatin } from "../lib/latin";
import {
  INFO_POLE,
  NEPRIRAZENO,
  SEKCE,
  SLIDE_TYPY,
  SLIDE_TYP_LABEL,
  SLIDE_TYP_POPIS,
  ZAJIMAVOST_LIMIT_SLOV,
  type DisplayDetail as Detail,
  type SlideContent,
  type SlideTyp,
} from "../lib/types";
import { useToast } from "../components/Toast";
import Confirm from "../components/Confirm";

const LANGS = [
  { code: "cs", label: "Čeština", active: true },
  { code: "en", label: "EN", active: false },
  { code: "pl", label: "PL", active: false },
  { code: "de", label: "DE", active: false },
  { code: "sk", label: "SK", active: false },
];

const TYP_IKONA: Record<SlideTyp, typeof Info> = {
  info: Info,
  ai: Sparkles,
  "3d": Box,
  vid: Film,
  gal: Lightbulb, // _gal = zajímavost (text + jedna fotka)
};

// Záložka "kb" = znalostní báze (kb.md v kořeni displeje), mimo slidy.
type ActiveTab = number | "kb";

// Displej bez slidů: žádné číslo slidu neexistuje, tak držíme 0 a vykreslí se
// prázdný stav s výzvou přidat první panel. (Dřív se skákalo na znalostní bázi,
// takže kurátor na prázdném displeji vůbec nepoznal, že má začít Infopanelem.)
const ZADNY_SLIDE = 0;

// Slide, do kterého kurátor ještě nic nevyplnil. Podle toho se ukáže výzva
// „co teď" a v záložce oranžová tečka — po přidání slidu je totiž snadné
// odejít v domnění, že přidáním je hotovo.
function jePrazdny(s: SlideContent): boolean {
  switch (s.typ) {
    case "info":
      return !(s.pole.Nazev ?? "").trim() && s.obrazky.length === 0 && !s.mapa && !s.video;
    case "gal":
      return !s.text.trim() && s.obrazky.length === 0;
    case "3d":
      return s.obrazky.length === 0;
    case "vid":
      return !s.video;
    default:
      return false; // AI slide se nevyplňuje, prázdná složka je správný stav
  }
}

// Co má kurátor s prázdným slidem udělat. Formulace odpovídá tomu, jak se
// obsah daného typu ukládá: fotky a video hned při nahrání, texty tlačítkem.
const PRAZDNY_NAVOD: Record<SlideTyp, string> = {
  info: "Vyplňte Sekci a Název, nahrajte fotku a klikněte na Uložit. Dokud slide neuložíte, nemá tablet co zobrazit.",
  gal: "Napište text zajímavosti, přidejte k němu fotku a klikněte na Uložit.",
  "3d": "Nahrajte sekvenci snímků modelu — ukládají se hned po nahrání.",
  vid: "Nahrajte video ve formátu MP4 — uloží se hned po nahrání.",
  ai: "",
};

// Co ve slidu je — do potvrzení mazání, ať kurátor vidí, o co přijde.
function obsahSlidu(s: SlideContent): string[] {
  const kusy: string[] = [];
  if (s.obrazky.length) {
    kusy.push(s.typ === "3d" ? pocetSnimku(s.obrazky.length) : pocetFotek(s.obrazky.length));
  }
  if (s.mapa) kusy.push("mapa výskytu");
  if (s.video) kusy.push("video");
  if (s.text.trim()) kusy.push("text zajímavosti");
  if (s.typ === "info" && Object.values(s.pole).some((v) => v.trim())) {
    kusy.push("vyplněné údaje o druhu");
  }
  return kusy;
}

function pocetFotek(n: number): string {
  if (n === 1) return "1 fotka";
  if (n >= 2 && n <= 4) return `${n} fotky`;
  return `${n} fotek`;
}

// Aktuální čas pro potvrzení „Uloženo v HH:MM".
function ted(): string {
  return new Date().toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

export default function DisplayDetail() {
  const { id = "" } = useParams();
  const toast = useToast();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveTab>(1);
  const [infoDrafts, setInfoDrafts] = useState<Record<number, Record<string, string>>>({});
  const [kbDraft, setKbDraft] = useState("");
  const [sectionDraft, setSectionDraft] = useState(""); // meta.section (čeleď), na úrovni displeje
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [smazatOpen, setSmazatOpen] = useState(false);
  // Zveřejnění na tabletu se ptá jedním společným dialogem: co se zveřejní
  // (popis) a co se po potvrzení spustí (akce).
  const [zverejnit, setZverejnit] = useState<{
    popis: ReactNode;
    akce: () => Promise<void>;
  } | null>(null);
  // Zpětná vazba „uloženo" přímo u tlačítka — toast může kurátorovi utéct,
  // tohle zůstane na obrazovce, dokud nepřepne slide.
  const [ulozeno, setUlozeno] = useState<{ klic: string; cas: string } | null>(null);
  // Přetahování záložek: index taženého slidu a místo, kam se pustí
  // (0..počet, tedy „před i-tý" a nakonec „na konec").
  const [taham, setTaham] = useState<number | null>(null);
  const [pustimNa, setPustimNa] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.display(id);
      setDetail(d);
      setInfoDrafts(
        Object.fromEntries(d.slides.filter((s) => s.typ === "info").map((s) => [s.n, { ...s.pole }])),
      );
      setKbDraft(d.kb);
      setSectionDraft(d.meta.section ?? "");
      // Pokud aktivní slide po změně struktury zmizel, vrátíme se na první.
      setActive((cur) =>
        cur === "kb" || d.slides.some((s) => s.n === cur) ? cur : d.slides[0]?.n ?? ZADNY_SLIDE,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Načtení selhalo.");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="space-y-4">
        <Link to="/displeje" className="inline-flex items-center gap-1.5 text-sm font-medium text-fg-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} /> Zpět na displeje
        </Link>
        <div className="text-sm text-danger">{error}</div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="grid place-items-center py-20 text-fg-dim">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const slide = active === "kb" ? null : detail.slides.find((s) => s.n === active) ?? null;
  const prirazeno = detail.meta.druh !== NEPRIRAZENO;
  const pozice = slide ? detail.slides.findIndex((s) => s.n === slide.n) : -1;

  async function withBusy(fn: () => Promise<void>, fail: string) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : fail);
    } finally {
      setBusy(false);
    }
  }

  async function saveKb() {
    setSaving(true);
    try {
      await api.saveKb(id, kbDraft);
      await load();
      oznacUlozeno();
      toast.success("Znalostní báze uložena. Načte si ji chatbot, na tablet se neposílá.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Uložení selhalo.");
    } finally {
      setSaving(false);
    }
  }

  // Potvrzení „uloženo" u tlačítka aktivní záložky.
  function oznacUlozeno() {
    setUlozeno({ klic: String(active), cas: ted() });
  }

  // Zveřejnění na tabletu vidí návštěvníci u expozice, proto se na něj vždycky
  // ptáme. Editory sem posílají popis toho, co se zveřejní, a vlastní akci.
  function zeptejSeNaZverejneni(popis: ReactNode, akce: () => Promise<void>) {
    setZverejnit({ popis, akce });
  }

  // Uloží pole info panelu (text.txt + identita do meta.json). `odeslat`
  // rozhoduje, jestli se obsah jen zapíše na disk, nebo se rovnou zveřejní
  // na tabletu. Latinské jméno server očistí na kanonický tvar.
  async function saveInfo(n: number, pole: Record<string, string>, odeslat: boolean) {
    setSaving(true);
    try {
      const res = await api.saveInfo(id, n, pole, sectionDraft);
      if (odeslat) await api.refresh(id);
      await load();
      oznacUlozeno();
      const zaklad = odeslat
        ? `Uloženo a zveřejněno na tabletu (displej ${id}).`
        : "Uloženo. Na tabletu se objeví až po zveřejnění.";
      if (res.latinCorrected && res.latin) {
        toast.success(`${zaklad} Latinské jméno upraveno na kanonický tvar: ${res.latin}`);
      } else {
        toast.success(zaklad);
      }
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : odeslat
            ? "Uložení nebo zveřejnění selhalo."
            : "Uložení selhalo.",
      );
    } finally {
      setSaving(false);
    }
  }

  // Zveřejnění slidů, jejichž obsah se ukládá hned při nahrání (3D, video).
  async function sendToDisplay() {
    await withBusy(async () => {
      await api.refresh(id);
      oznacUlozeno();
      toast.success(`Zveřejněno na tabletu (displej ${id}). Návštěvníci to už vidí.`);
    }, "Zveřejnění selhalo.");
  }

  async function addSlide(typ: SlideTyp) {
    setAddOpen(false);
    await withBusy(async () => {
      const { n } = await api.addSlide(id, typ);
      await load();
      setActive(n);
      toast.success(`Slide ${SLIDE_TYP_LABEL[typ]} přidán — teď vyplňte obsah a uložte.`);
    }, "Přidání slidu selhalo.");
  }

  async function removeSlide() {
    if (!slide) return;
    setSmazatOpen(false);
    await withBusy(async () => {
      await api.deleteSlide(id, slide.n);
      await load();
      toast.success("Slide smazán");
    }, "Smazání slidu selhalo.");
  }

  // Uloží nové pořadí (server přečísluje prefixy složek na disku) a zůstane na
  // přesunutém slidu, který má po přečíslování jiné číslo. Používají to šipky
  // i přetahování záložek.
  async function ulozPoradi(poradi: number[], indexPoZmene: number) {
    await withBusy(async () => {
      await api.reorderSlides(id, poradi);
      const d = await api.display(id);
      setDetail(d);
      setInfoDrafts(
        Object.fromEntries(d.slides.filter((s) => s.typ === "info").map((s) => [s.n, { ...s.pole }])),
      );
      setKbDraft(d.kb);
      setSectionDraft(d.meta.section ?? "");
      setActive(d.slides[indexPoZmene]?.n ?? d.slides[0]?.n ?? ZADNY_SLIDE);
    }, "Změna pořadí selhala.");
  }

  // Prohodí slide se sousedem (šipky v liště slidu).
  async function moveSlide(dir: -1 | 1) {
    if (!slide) return;
    const order = detail!.slides.map((s) => s.n);
    const j = pozice + dir;
    if (j < 0 || j >= order.length) return;
    [order[pozice], order[j]] = [order[j], order[pozice]];
    await ulozPoradi(order, j);
  }

  // Přetažení záložky: `zIndexu` se vloží na pozici `naIndex` (0..počet).
  async function pustSlide(zIndexu: number, naIndex: number) {
    setTaham(null);
    setPustimNa(null);
    // Puštění na vlastní místo (před sebe i za sebe) nic nemění.
    if (naIndex === zIndexu || naIndex === zIndexu + 1) return;
    const order = detail!.slides.map((s) => s.n);
    const [presouvany] = order.splice(zIndexu, 1);
    const cil = naIndex > zIndexu ? naIndex - 1 : naIndex;
    order.splice(cil, 0, presouvany);
    await ulozPoradi(order, cil);
  }

  return (
    <div className="space-y-8">
      {/* Hlavička */}
      <div className="border-b border-line pb-6">
        <Link to="/displeje" className="inline-flex items-center gap-1.5 text-sm font-medium text-fg-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} /> Displeje
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-2xl font-bold text-fg-dim tnum">
              {detail.id.padStart(2, "0")}
            </span>
            <h1 className={`font-display text-3xl font-bold tracking-tight ${prirazeno ? "text-fg" : "text-fg-dim italic"}`}>
              {detail.meta.druh}
            </h1>
            <span className="inline-flex items-center gap-1.5 text-sm text-fg-muted">
              <span className={detail.meta.stav === "online" ? "dot-online" : "dot-offline"} />
              {detail.meta.stav}
            </span>
          </div>
          <Link to={`/tablet/${id}`} target="_blank" className="btn-ghost">
            <Monitor className="h-4 w-4" strokeWidth={1.75} /> Náhled tabletu
          </Link>
        </div>
        <p className="mt-2 text-xs text-fg-dim tnum">
          Poslední změna: {formatDateTime(detail.meta.posledniZmena)}
        </p>
      </div>

      {/* Displej má slidy, ale ještě nemá druh — kurátor má vědět, co dodělat. */}
      {!prirazeno && detail.slides.length > 0 && (
        <div className="-mt-3 flex items-start gap-2.5 border-l-2 border-amber pl-4 py-1">
          <Info className="h-5 w-5 text-amber shrink-0 mt-0.5" strokeWidth={1.75} />
          <div className="text-sm text-fg-muted">
            <span className="font-semibold text-fg">Displej ještě nemá přiřazený druh.</span>{" "}
            {detail.slides.some((s) => s.typ === "info")
              ? "Vyplňte Sekci a Název v Infopanelu a uložte — název se pak objeví i v seznamu displejů."
              : "Přidejte slide Infopanel a vyplňte v něm Sekci a Název — název se pak objeví i v seznamu displejů."}
          </div>
        </div>
      )}

      {/* Jazyk */}
      <div className="flex items-center gap-5">
        <span className="kicker">Jazyk</span>
        <div className="flex items-center gap-4">
          {LANGS.map((l) => (
            <button
              key={l.code}
              disabled={!l.active}
              className={`text-sm font-semibold transition border-b-2 pb-0.5 ${
                l.active
                  ? "text-accent border-accent"
                  : "text-fg-dim border-transparent cursor-not-allowed"
              }`}
            >
              {l.label}
              {!l.active && <span className="ml-1 text-[10px] font-normal">brzy</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Záložky: slidy podle složek na disku + znalostní báze + přidání slidu.
          Záložku slidu lze chytit myší a přetáhnout na jinou pozici; svislá
          zelená čárka ukazuje, kam se pustí. Šipky v liště níž dělají totéž. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line">
        {detail.slides.map((s, i) => {
          const isActive = active === s.n;
          const Ikona = TYP_IKONA[s.typ];
          const tahano = taham === i;
          return (
            <div
              key={s.n}
              className="relative flex items-center"
              onDragOver={(e) => {
                if (taham === null) return;
                e.preventDefault();
                // Před záložku, nebo za ni? Podle toho, kde je kurzor v její šířce.
                const r = e.currentTarget.getBoundingClientRect();
                setPustimNa(e.clientX < r.left + r.width / 2 ? i : i + 1);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (taham !== null && pustimNa !== null) void pustSlide(taham, pustimNa);
              }}
            >
              {/* Ukazatel místa vpuštění (v mezeře mezi záložkami) */}
              {taham !== null && pustimNa === i && (
                <span className="absolute -left-3 top-0 bottom-2.5 w-0.5 rounded-full bg-accent" />
              )}
              {taham !== null && pustimNa === i + 1 && i === detail.slides.length - 1 && (
                <span className="absolute -right-3 top-0 bottom-2.5 w-0.5 rounded-full bg-accent" />
              )}
              <button
                draggable={!busy && detail.slides.length > 1}
                onDragStart={(e) => {
                  setTaham(i);
                  e.dataTransfer.effectAllowed = "move";
                  // Firefox táhne jen s vyplněnými daty.
                  e.dataTransfer.setData("text/plain", String(s.n));
                }}
                onDragEnd={() => {
                  setTaham(null);
                  setPustimNa(null);
                }}
                onClick={() => setActive(s.n)}
                title={
                  detail.slides.length > 1
                    ? "Přetáhněte pro změnu pořadí"
                    : SLIDE_TYP_LABEL[s.typ]
                }
                className={`-mb-px pb-3 border-b-2 text-sm font-semibold transition flex items-center gap-1.5 ${
                  detail.slides.length > 1 ? "cursor-grab active:cursor-grabbing" : ""
                } ${tahano ? "opacity-40" : ""} ${
                  isActive ? "text-accent border-accent" : "text-fg-muted border-transparent hover:text-fg"
                }`}
              >
                <Ikona className="h-3.5 w-3.5" strokeWidth={1.75} />
                {i + 1} · {SLIDE_TYP_LABEL[s.typ]}
                {jePrazdny(s) && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-amber"
                    title="Prázdný slide — chybí obsah"
                  />
                )}
              </button>
            </div>
          );
        })}
        <div className="relative">
          <button
            onClick={() => setAddOpen((o) => !o)}
            disabled={busy}
            className="-mb-px pb-3 border-b-2 border-transparent text-sm font-semibold text-fg-dim hover:text-accent transition flex items-center gap-1.5 disabled:opacity-50"
            title="Přidat nový slide"
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} /> Přidat slide
          </button>
          {addOpen && (
            <>
              {/* Klik mimo nabídku ji zavře. */}
              <div className="fixed inset-0 z-10" onClick={() => setAddOpen(false)} />
              <div className="absolute left-0 top-full z-20 mt-1 w-80 rounded-xl border border-line bg-surface p-1.5 shadow-cardHover">
                <p className="px-3 pt-1.5 pb-2 text-[11px] text-fg-dim">
                  Nový slide se přidá na konec, pak ho můžete přetáhnout.
                </p>
                {SLIDE_TYPY.map((typ) => {
                  const Ikona = TYP_IKONA[typ];
                  return (
                    <button
                      key={typ}
                      onClick={() => addSlide(typ)}
                      className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-canvas transition group/typ"
                    >
                      <Ikona
                        className="h-4 w-4 mt-0.5 shrink-0 text-fg-dim group-hover/typ:text-accent transition"
                        strokeWidth={1.75}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-fg">
                          {SLIDE_TYP_LABEL[typ]}
                        </span>
                        <span className="block text-xs text-fg-dim">{SLIDE_TYP_POPIS[typ]}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <button
          onClick={() => setActive("kb")}
          className={`-mb-px pb-3 border-b-2 text-sm font-semibold transition flex items-center gap-1.5 ml-auto ${
            active === "kb" ? "text-amber border-amber" : "text-fg-muted border-transparent hover:text-fg"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
          Znalostní báze (AI)
        </button>
      </div>

      {detail.slides.length > 1 && (
        <p className="-mt-6 flex items-center gap-1.5 text-[11px] text-fg-dim">
          <GripVertical className="h-3.5 w-3.5" strokeWidth={1.75} />
          Přetáhněte pro změnu pořadí — nebo použijte šipky vpravo.
        </p>
      )}

      {/* Lišta správy aktivního slidu: pořadí a odebrání */}
      {slide && (
        <div className="-mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-fg-dim tnum">
            Slide {pozice + 1} z {detail.slides.length} · {SLIDE_TYP_LABEL[slide.typ]} · složka{" "}
            {slide.slozka}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => moveSlide(-1)}
              disabled={busy || pozice === 0}
              className="btn-ghost px-2.5 py-1.5"
              title="Posunout slide doleva"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <button
              onClick={() => moveSlide(1)}
              disabled={busy || pozice === detail.slides.length - 1}
              className="btn-ghost px-2.5 py-1.5"
              title="Posunout slide doprava"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <button
              onClick={() => setSmazatOpen(true)}
              disabled={busy}
              className="btn-ghost px-2.5 py-1.5 text-danger hover:text-danger hover:border-danger/40"
              title="Smazat slide"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      )}

      {/* Prázdný (typicky právě přidaný) slide: co teď. Bez toho kurátor
          slide přidá a odejde v domnění, že tím je hotovo. */}
      {slide && jePrazdny(slide) && (
        <div className="-mt-4 flex items-start gap-2.5 rounded-lg border border-amber/40 bg-amber-soft px-4 py-3">
          <Lightbulb className="h-5 w-5 shrink-0 text-amber" strokeWidth={1.75} />
          <div className="text-sm text-fg-muted">
            <span className="font-semibold text-fg">Tento slide je zatím prázdný.</span>{" "}
            {PRAZDNY_NAVOD[slide.typ]}
          </div>
        </div>
      )}

      {/* Obsah záložky */}
      {active === "kb" ? (
        <KbEditor
          value={kbDraft}
          onChange={(v) => {
            setUlozeno(null);
            setKbDraft(v);
          }}
          onSave={saveKb}
          saving={saving}
          ulozenoCas={ulozeno?.klic === "kb" ? ulozeno.cas : null}
        />
      ) : !slide ? (
        <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-canvas">
            <Info className="h-6 w-6 text-fg-dim" strokeWidth={1.5} />
          </span>
          <h2 className="mt-4 font-display text-lg font-bold text-fg">
            Tento displej zatím nemá obsah
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-fg-muted">
            Začněte přidáním <strong className="font-semibold text-fg">Infopanelu</strong> — to
            je základní panel s názvem druhu, údaji o něm a fotkami. Další typy slidů (video,
            zajímavost, 3D model, AI otázky) můžete přidat kdykoliv potom.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button onClick={() => addSlide("info")} disabled={busy} className="btn-primary">
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" strokeWidth={1.75} />
              )}
              Přidat Infopanel
            </button>
            <button onClick={() => setAddOpen(true)} disabled={busy} className="btn-ghost">
              Vybrat jiný typ
            </button>
          </div>
        </div>
      ) : slide.typ === "info" ? (
        <InfoEditor
          key={slide.n}
          slide={slide}
          pole={infoDrafts[slide.n] ?? {}}
          section={sectionDraft}
          onSectionChange={(v) => {
            setUlozeno(null);
            setSectionDraft(v);
          }}
          onChange={(patch) => {
            // Rozepsaná změna = už to není stav, který se uložil.
            setUlozeno(null);
            setInfoDrafts((prev) => ({ ...prev, [slide.n]: { ...(prev[slide.n] ?? {}), ...patch } }));
          }}
          onSave={(pole, odeslat) => saveInfo(slide.n, pole, odeslat)}
          zeptejSe={zeptejSeNaZverejneni}
          ulozenoCas={ulozeno?.klic === String(slide.n) ? ulozeno.cas : null}
          saving={saving}
          busy={busy}
          displayId={id}
          reload={load}
          withBusy={withBusy}
        />
      ) : slide.typ === "gal" ? (
        <ZajimavostEditor
          key={slide.n}
          slide={slide}
          displayId={id}
          busy={busy}
          reload={load}
          withBusy={withBusy}
          zeptejSe={zeptejSeNaZverejneni}
          onUlozeno={oznacUlozeno}
          onZmena={() => setUlozeno(null)}
          ulozenoCas={ulozeno?.klic === String(slide.n) ? ulozeno.cas : null}
        />
      ) : slide.typ === "3d" ? (
        <ModelEditor
          key={slide.n}
          slide={slide}
          displayId={id}
          busy={busy}
          reload={load}
          withBusy={withBusy}
          onSend={sendToDisplay}
          zeptejSe={zeptejSeNaZverejneni}
        />
      ) : slide.typ === "vid" ? (
        <VidEditor
          key={slide.n}
          slide={slide}
          displayId={id}
          busy={busy}
          reload={load}
          withBusy={withBusy}
          onSend={sendToDisplay}
          zeptejSe={zeptejSeNaZverejneni}
        />
      ) : (
        <AiSlideInfo onOpenKb={() => setActive("kb")} />
      )}

      {/* Mazání slidu je nevratné — smaže se složka na disku i s obsahem.
          Když ve slidu něco je, vyjmenujeme to a potvrzovací tlačítko se na
          chvíli zamkne, ať se nevratná akce nedá odklepnout překlikem. */}
      <Confirm
        open={smazatOpen && !!slide}
        titulek="Opravdu smazat?"
        prodlevaMs={slide && obsahSlidu(slide).length > 0 ? 3000 : 0}
        text={
          <>
            Tato akce je <strong className="font-semibold text-fg">nevratná</strong> a smaže obsah
            slidu z disku
            {slide && (
              <>
                {" "}
                — slide {pozice + 1} ({SLIDE_TYP_LABEL[slide.typ]}), složka{" "}
                <span className="font-mono">{slide.slozka}</span>
              </>
            )}
            .{" "}
            {slide && obsahSlidu(slide).length > 0 && (
              <>
                Přijdete o:{" "}
                <strong className="font-semibold text-fg">{obsahSlidu(slide).join(", ")}</strong>.{" "}
              </>
            )}
            Fotky, video ani text z tohoto slidu už nepůjde vrátit — ani přes audit log.
          </>
        }
        potvrdit="Smazat slide"
        onPotvrdit={removeSlide}
        onZrusit={() => setSmazatOpen(false)}
      />

      {/* Zveřejnění na tabletu má následek venku: od té chvíle obsah vidí
          návštěvníci u expozice. Ptáme se na něj stejně jako na mazání. */}
      <Confirm
        open={!!zverejnit}
        varianta="publikovat"
        titulek="Zveřejnit na tabletu?"
        text={
          <>
            {zverejnit?.popis} Tímto se obsah zveřejní na tabletu pro návštěvníky. Pokračovat?
          </>
        }
        potvrdit="Zveřejnit na tabletu"
        onPotvrdit={() => {
          const akce = zverejnit?.akce;
          setZverejnit(null);
          if (akce) void akce();
        }}
        onZrusit={() => setZverejnit(null)}
      />
    </div>
  );
}

// --- Sdílené: nápovědy, počítadla, prázdné stavy ---

// Nápověda pod polem: co tam patří a jaký je limit. Vlevo text, vpravo
// počítadlo (když má pole limit), ať kurátor vidí, že přetahuje.
function PodPolem({ hint, pocitadlo }: { hint?: string; pocitadlo?: ReactNode }) {
  if (!hint && !pocitadlo) return null;
  return (
    <div className="mt-1 flex items-start justify-between gap-3">
      {hint ? <p className="text-xs text-fg-dim">{hint}</p> : <span />}
      {pocitadlo && <div className="shrink-0 text-xs tnum">{pocitadlo}</div>}
    </div>
  );
}

// Počítadlo délky. Limit je doporučení (na tabletu se dlouhý text ořízne),
// takže po překročení jen zoranžoví — uložení nikdy neblokuje.
function Pocitadlo({
  kolik,
  limit,
  jednotka,
}: {
  kolik: number;
  limit: number;
  jednotka: "znaků" | "slov";
}) {
  const pres = kolik > limit;
  return (
    <span className={pres ? "text-amber font-semibold" : "text-fg-dim"}>
      {kolik} / {limit} {jednotka}
      {pres && " · na tabletu se může zkrátit"}
    </span>
  );
}

// Jemná nápověda místo prázdného místa: co se sem nahrává. Záměrně bez rámečku
// — stojí pod nahrávacím polem, které rámeček už má.
function PrazdnyStav({
  ikona: Ikona,
  text,
  hint,
}: {
  ikona: typeof Info;
  text: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <Ikona className="h-4 w-4 shrink-0 text-fg-dim" strokeWidth={1.5} />
      <p>
        <span className="font-medium text-fg-muted">{text}</span>
        {hint && <span className="text-fg-dim"> — {hint}</span>}
      </p>
    </div>
  );
}

function pocetSlov(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

// --- Sdílené: upload fotek + mřížka ---

function PhotoDropzone({
  uploading,
  onFiles,
}: {
  uploading: boolean;
  onFiles: (files: FileList | File[]) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onFiles(e.dataTransfer.files);
      }}
      onClick={() => fileInput.current?.click()}
      className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition ${
        dragOver ? "border-accent bg-accent-soft" : "border-line hover:border-accent/60 hover:bg-canvas"
      }`}
    >
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {uploading ? (
        <Loader2 className="h-7 w-7 mx-auto text-accent animate-spin" />
      ) : (
        <UploadCloud className={`h-7 w-7 mx-auto ${dragOver ? "text-accent" : "text-fg-dim"}`} strokeWidth={1.5} />
      )}
      <p className="mt-2 text-sm font-medium text-fg-muted">Přetáhněte fotky sem nebo klikněte</p>
      <p className="text-xs text-fg-dim">JPG nebo PNG, systém si formát převede sám</p>
    </div>
  );
}

// `seradPodleNazvu` je pro 3D sekvenci: pořadí souborů z prohlížeče není
// zaručené, ale snímky z renderu jsou pojmenované po sobě (frame_001…),
// takže seřazení podle názvu odpovídá pořadí v modelu.
function usePhotoUpload(
  displayId: string,
  n: number,
  reload: () => Promise<void>,
  seradPodleNazvu = false,
) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) {
      toast.error("Přetáhněte prosím obrázek.");
      return;
    }
    if (seradPodleNazvu) {
      list.sort((a, b) => a.name.localeCompare(b.name, "cs", { numeric: true }));
    }
    setUploading(true);
    try {
      for (const file of list) {
        await api.uploadImage(displayId, n, file);
      }
      await reload();
      toast.success(list.length === 1 ? "Fotka nahrána" : `${list.length} fotek nahráno`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload selhal.");
    } finally {
      setUploading(false);
    }
  };
  return { uploading, upload };
}

// --- Info panel: formulář polí + fotky + mapa výskytu ---

function InfoEditor({
  slide,
  pole,
  section,
  onSectionChange,
  onChange,
  onSave,
  zeptejSe,
  ulozenoCas,
  saving,
  busy,
  displayId,
  reload,
  withBusy,
}: {
  slide: SlideContent;
  pole: Record<string, string>;
  section: string;
  onSectionChange: (v: string) => void;
  onChange: (patch: Record<string, string>) => void;
  onSave: (pole: Record<string, string>, odeslat: boolean) => Promise<void>;
  zeptejSe: (popis: ReactNode, akce: () => Promise<void>) => void;
  ulozenoCas: string | null;
  saving: boolean;
  busy: boolean;
  displayId: string;
  reload: () => Promise<void>;
  withBusy: (fn: () => Promise<void>, fail: string) => Promise<void>;
}) {
  const toast = useToast();
  const [showErrors, setShowErrors] = useState(false);
  const { uploading, upload } = usePhotoUpload(displayId, slide.n, reload);

  const chybi = (klic: string) => !(pole[klic] ?? "").trim();
  const chybejici = INFO_POLE.filter((d) => d.povinne && chybi(d.klic));
  const valid = chybejici.length === 0;

  // Živý náhled kanonického tvaru latinského jména (autoritativně čistí server).
  const latinRaw = pole.Latinsky ?? "";
  const latinNahled = canonicalizeLatin(latinRaw);
  const latinSeZmeni = !!latinNahled && latinNahled !== latinRaw.trim();

  // `odeslat` = uložit a rovnou zveřejnit na tabletu. Zveřejnění se ještě
  // potvrzuje dialogem, protože od té chvíle obsah vidí návštěvníci.
  function handleSave(odeslat: boolean) {
    if (!valid) {
      setShowErrors(true);
      // Vyjmenujeme přesně to, co chybí, ne obecnou technickou chybu.
      const jmena = chybejici.map((d) => d.label);
      const vyctem =
        jmena.length === 1 ? jmena[0] : `${jmena.slice(0, -1).join(", ")} a ${jmena.at(-1)}`;
      toast.error(`Ještě chybí vyplnit: ${vyctem}.`);
      // Kurátora pošleme přímo na první nevyplněné pole.
      document.getElementById(`pole-${chybejici[0].klic}`)?.focus();
      return;
    }
    if (!odeslat) {
      void onSave(pole, false);
      return;
    }
    zeptejSe(
      <>
        Zveřejní se <strong className="font-semibold text-fg">Infopanel</strong> displeje{" "}
        {displayId} — údaje o druhu i nahrané fotky.
      </>,
      () => onSave(pole, true),
    );
  }

  async function removeImage(url: string) {
    await withBusy(async () => {
      await api.deleteImage(displayId, slide.n, nazevSouboru(url));
      await reload();
      toast.success("Fotka odebrána");
    }, "Odebrání fotky selhalo.");
  }

  async function markMapa(url: string | null) {
    await withBusy(async () => {
      await api.setMapa(displayId, slide.n, url ? nazevSouboru(url) : null);
      await reload();
      toast.success(url ? "Fotka označena jako mapa výskytu (mapa.png)" : "Značení mapy zrušeno");
    }, "Změna mapy výskytu selhala.");
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
      {/* Formulář polí (na disk jde text.txt jako "Klic: Hodnota") */}
      <div className="space-y-4">
        {/* Co je povinné, má být vidět předem — ne až z chybové hlášky. */}
        <p className="text-xs text-fg-muted">
          Pole označená <span className="font-bold text-danger">*</span> jsou povinná, bez nich
          panel neuložíte. Ostatní můžete nechat prázdná.
        </p>
        {INFO_POLE.map((def) => {
          const hodnota = pole[def.klic] ?? "";
          const nevyplneno = showErrors && def.povinne && chybi(def.klic);
          return (
            <div key={def.klic}>
              <label className="label" htmlFor={`pole-${def.klic}`}>
                {def.label}
                {def.povinne ? (
                  <>
                    <span className="font-bold text-danger" aria-hidden="true">
                      {" *"}
                    </span>
                    <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-danger">
                      povinné
                    </span>
                  </>
                ) : (
                  <span className="text-fg-dim font-normal"> · volitelné</span>
                )}
              </label>
              {def.klic === "Sekce" ? (
                <select
                  id={`pole-${def.klic}`}
                  className={`input ${nevyplneno ? "border-danger" : ""}`}
                  value={hodnota}
                  onChange={(e) => onChange({ Sekce: e.target.value })}
                >
                  <option value="">— vyberte sekci —</option>
                  {SEKCE.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={`pole-${def.klic}`}
                  className={`input ${nevyplneno ? "border-danger" : ""}`}
                  value={hodnota}
                  onChange={(e) => onChange({ [def.klic]: e.target.value })}
                  placeholder={def.povinne ? "" : "Nepovinné, prázdné se neukládá"}
                />
              )}
              <PodPolem
                hint={def.hint}
                pocitadlo={
                  def.limitZnaku && hodnota.trim() ? (
                    <Pocitadlo kolik={hodnota.trim().length} limit={def.limitZnaku} jednotka="znaků" />
                  ) : undefined
                }
              />
              {nevyplneno && (
                <p className="mt-1 text-xs text-danger">Tohle pole je potřeba vyplnit.</p>
              )}
              {def.klic === "Latinsky" && latinSeZmeni && (
                <p className="mt-1 text-xs text-amber">
                  Uloží se v kanonickém tvaru: <span className="font-mono">{latinNahled}</span>
                </p>
              )}
            </div>
          );
        })}

        {/* Taxonomická čeleď: jde jen do meta.json (identifikace pro chatbota). */}
        <div>
          <label className="label">
            Čeleď (taxonomická)<span className="text-fg-dim font-normal"> · volitelné</span>
          </label>
          <input
            className="input"
            value={section}
            onChange={(e) => onSectionChange(e.target.value)}
            placeholder="Např. Dendrobatidae"
          />
          <PodPolem hint="Na tabletu se nezobrazuje, slouží jen chatbotovi k rozpoznání druhu." />
        </div>

        <div className="space-y-3 pt-1">
          {/* Souhrn chybějících polí zůstane na obrazovce (na rozdíl od toastu). */}
          {showErrors && !valid && (
            <p className="text-sm text-danger">
              Ještě chybí vyplnit:{" "}
              <span className="font-semibold">{chybejici.map((d) => d.label).join(", ")}</span>. Bez
              nich se panel neuloží.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => handleSave(false)} className="btn-primary" disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" strokeWidth={1.75} />
              )}
              Uložit
            </button>
            <button onClick={() => handleSave(true)} className="btn-ghost" disabled={saving}>
              <Send className="h-4 w-4" strokeWidth={1.75} />
              Uložit a zveřejnit na tabletu
            </button>
            {ulozenoCas && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent">
                <CheckCircle2 className="h-4 w-4" strokeWidth={2} /> Uloženo v {ulozenoCas}
              </span>
            )}
          </div>
          {/* Rozdíl mezi tlačítky musí být čitelný bez školení: jedno je
              bezpečné, druhé má následek venku u expozice. */}
          <div className="space-y-1 text-xs text-fg-muted">
            <p>
              <strong className="font-semibold text-fg">Uložit</strong> — zapíše rozpracovaný obsah
              na disk. Návštěvníci u expozice zatím nic nového nevidí.
            </p>
            <p>
              <strong className="font-semibold text-fg">Uložit a zveřejnit na tabletu</strong> —
              uloží a zároveň dá displeji pokyn, aby si nový obsah načetl. Od té chvíle ho vidí
              návštěvníci.
            </p>
            <p className="text-fg-muted">
              Fotky a video se ukládají hned při nahrání; na tabletu se objeví až po zveřejnění.
            </p>
          </div>
        </div>
      </div>

      {/* Fotky info panelu + mapa výskytu */}
      <div className="space-y-4 lg:border-l lg:border-line lg:pl-10">
        <div>
          <span className="label">Fotky info panelu</span>
          <p className="text-xs text-fg-dim -mt-1">
            Hlavní vizuál druhu. Jednu fotku můžete označit jako mapu výskytu — ikonkou mapy,
            která se objeví po najetí na fotku.
          </p>
        </div>

        <PhotoDropzone uploading={uploading} onFiles={upload} />

        {slide.obrazky.length === 0 && !slide.mapa ? (
          <PrazdnyStav
            ikona={ImageIcon}
            text="Zatím žádná fotka"
            hint="Nahrajte hlavní fotku druhu. Když nahrajete víc fotek, tablet je bude střídat."
          />
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {slide.obrazky.map((url) => (
              <div key={url} className="group relative aspect-square rounded-lg overflow-hidden bg-canvas ring-1 ring-line">
                <img src={url} alt="Fotka info panelu" className="h-full w-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/45 px-1.5 py-1 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={() => markMapa(url)}
                    disabled={busy}
                    className="grid h-6 w-6 place-items-center rounded text-white/90 hover:bg-white/20 disabled:opacity-30"
                    title="Označit jako mapu výskytu"
                  >
                    <Map className="h-4 w-4" strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => removeImage(url)}
                    disabled={busy}
                    className="grid h-6 w-6 place-items-center rounded text-white/90 hover:bg-danger disabled:opacity-30"
                    title="Smazat fotku"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={2} />
                  </button>
                </div>
              </div>
            ))}
            {slide.mapa && (
              <div key="mapa" className="group relative aspect-square rounded-lg overflow-hidden bg-canvas ring-2 ring-amber">
                <img src={slide.mapa} alt="Mapa výskytu" className="h-full w-full object-cover" />
                <span className="absolute left-1.5 top-1.5 chip bg-amber text-white text-[10px] px-1.5 py-0.5">
                  mapa výskytu
                </span>
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/45 px-1.5 py-1 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={() => markMapa(null)}
                    disabled={busy}
                    className="grid h-6 w-6 place-items-center rounded text-white/90 hover:bg-white/20 disabled:opacity-30"
                    title="Zrušit značení mapy (stane se běžnou fotkou)"
                  >
                    <X className="h-4 w-4" strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => removeImage(slide.mapa!)}
                    disabled={busy}
                    className="grid h-6 w-6 place-items-center rounded text-white/90 hover:bg-danger disabled:opacity-30"
                    title="Smazat mapu"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={2} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Volitelné video info panelu (finální struktura od Michala).
            Na zařízení ho Michal zařadí na začátek galerie fotek. */}
        <div className="pt-2 border-t border-lineSoft">
          <span className="label">Video info panelu <span className="text-fg-dim font-normal">· volitelné</span></span>
          <p className="text-xs text-fg-dim -mt-1 mb-3">
            Volitelné krátké video do galerie tohoto panelu. Pro velké video přes celou obrazovku
            použijte samostatný slide <strong className="font-semibold text-fg-muted">Video</strong>.
          </p>
          <VideoBlok
            slide={slide}
            displayId={displayId}
            busy={busy}
            reload={reload}
            withBusy={withBusy}
          />
        </div>
      </div>
    </div>
  );
}

// --- Zajímavost (_gal): dlouhý text vlevo, jedna fotka vpravo ---

function ZajimavostEditor({
  slide,
  displayId,
  busy,
  reload,
  withBusy,
  zeptejSe,
  onUlozeno,
  onZmena,
  ulozenoCas,
}: {
  slide: SlideContent;
  displayId: string;
  busy: boolean;
  reload: () => Promise<void>;
  withBusy: (fn: () => Promise<void>, fail: string) => Promise<void>;
  zeptejSe: (popis: ReactNode, akce: () => Promise<void>) => void;
  onUlozeno: () => void;
  onZmena: () => void;
  ulozenoCas: string | null;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState(slide.text);
  const [saving, setSaving] = useState(false);
  const { uploading, upload } = usePhotoUpload(displayId, slide.n, reload);
  const fotka = slide.obrazky[0] ?? null;

  // `odeslat` = po uložení dát displeji pokyn, aby si obsah načetl.
  async function ulozit(odeslat: boolean) {
    setSaving(true);
    try {
      await api.saveSlideText(displayId, slide.n, draft);
      if (odeslat) await api.refresh(displayId);
      await reload();
      onUlozeno();
      toast.success(
        odeslat
          ? `Zajímavost uložena a zveřejněna na tabletu (displej ${displayId}).`
          : "Zajímavost uložena. Na tabletu se objeví až po zveřejnění.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Uložení selhalo.");
    } finally {
      setSaving(false);
    }
  }

  function zverejnit() {
    zeptejSe(
      <>
        Zveřejní se slide <strong className="font-semibold text-fg">Zajímavost</strong> displeje{" "}
        {displayId} — text i fotka.
      </>,
      () => ulozit(true),
    );
  }

  async function removeImage(url: string) {
    await withBusy(async () => {
      await api.deleteImage(displayId, slide.n, nazevSouboru(url));
      await reload();
      toast.success("Fotka odebrána");
    }, "Odebrání fotky selhalo.");
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
      {/* Text zajímavosti (na disk jde text.txt jako "Popis: …") */}
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor={`popis-${slide.n}`}>
            Popis <span className="text-fg-dim font-normal">· text zajímavosti</span>
          </label>
          <textarea
            id={`popis-${slide.n}`}
            className="input min-h-[320px] resize-y leading-relaxed"
            value={draft}
            onChange={(e) => {
              onZmena();
              setDraft(e.target.value);
            }}
            placeholder="Např. Pralesnička harlekýn je drobná jedovatá žába obývající podrost tropických pralesů…"
          />
          <PodPolem
            hint={`Delší text, ideálně do ${ZAJIMAVOST_LIMIT_SLOV} slov. Delší text se na tabletu ořízne.`}
            pocitadlo={
              draft.trim() ? (
                <Pocitadlo kolik={pocetSlov(draft)} limit={ZAJIMAVOST_LIMIT_SLOV} jednotka="slov" />
              ) : undefined
            }
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => ulozit(false)} className="btn-primary" disabled={saving || busy}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" strokeWidth={1.75} />
            )}
            Uložit
          </button>
          <button onClick={zverejnit} className="btn-ghost" disabled={saving || busy}>
            <Send className="h-4 w-4" strokeWidth={1.75} />
            Uložit a zveřejnit na tabletu
          </button>
          {ulozenoCas && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent">
              <CheckCircle2 className="h-4 w-4" strokeWidth={2} /> Uloženo v {ulozenoCas}
            </span>
          )}
        </div>
        <p className="text-xs text-fg-muted">
          <strong className="font-semibold text-fg">Uložit</strong> zapíše text na disk;
          návštěvníci ho ještě nevidí.{" "}
          <strong className="font-semibold text-fg">Zveřejnit</strong> ho pustí na tablet u
          expozice.
        </p>
      </div>

      {/* Jedna fotka vpravo */}
      <div className="space-y-4 lg:border-l lg:border-line lg:pl-10">
        <div>
          <span className="label">Fotka zajímavosti</span>
          <p className="text-xs text-fg-dim -mt-1">
            Jedna fotka, na zařízení vpravo vedle textu. Nová nahraná fotku nahradí.
          </p>
        </div>

        <PhotoDropzone uploading={uploading} onFiles={upload} />

        {fotka ? (
          <div className="group relative aspect-[4/3] max-w-sm rounded-lg overflow-hidden bg-canvas ring-1 ring-line">
            <img src={fotka} alt="Fotka zajímavosti" className="h-full w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-end bg-black/45 px-1.5 py-1 opacity-0 group-hover:opacity-100 transition">
              <button
                onClick={() => removeImage(fotka)}
                disabled={busy}
                className="grid h-6 w-6 place-items-center rounded text-white/90 hover:bg-danger disabled:opacity-30"
                title="Smazat fotku"
              >
                <Trash2 className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          </div>
        ) : (
          <PrazdnyStav
            ikona={ImageIcon}
            text="Zatím žádná fotka"
            hint="Nahrajte jednu fotku k textu — na tabletu bude vpravo vedle něj."
          />
        )}
      </div>
    </div>
  );
}

// --- 3D model (_3d): sekvence snímků 001.png, 002.png… ---

function pocetSnimku(n: number): string {
  if (n === 1) return "1 snímek";
  if (n >= 2 && n <= 4) return `${n} snímky`;
  return `${n} snímků`;
}

function ModelEditor({
  slide,
  displayId,
  busy,
  reload,
  withBusy,
  onSend,
  zeptejSe,
}: {
  slide: SlideContent;
  displayId: string;
  busy: boolean;
  reload: () => Promise<void>;
  withBusy: (fn: () => Promise<void>, fail: string) => Promise<void>;
  onSend: () => Promise<void>;
  zeptejSe: (popis: ReactNode, akce: () => Promise<void>) => void;
}) {
  const toast = useToast();
  // Snímky se nahrávají seřazené podle názvu, ať sekvence sedí na render.
  const { uploading, upload } = usePhotoUpload(displayId, slide.n, reload, true);

  async function removeFrame(url: string) {
    await withBusy(async () => {
      await api.deleteImage(displayId, slide.n, nazevSouboru(url));
      await reload();
      toast.success("Snímek odebrán, sekvence přečíslována");
    }, "Odebrání snímku selhalo.");
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <span className="label">Snímky 3D modelu</span>
        <p className="text-xs text-fg-dim -mt-1">
          Sekvence fotek, jak se model otáčí — tablet mezi nimi přepíná. Vyberte všechny snímky
          najednou, seřadí se podle názvu souboru a uloží pod čísly{" "}
          <span className="font-mono">001.png</span>, <span className="font-mono">002.png</span>…
          Po smazání snímku se zbytek sám přečísluje, v sekvenci nezůstane díra.
        </p>
      </div>

      <PhotoDropzone uploading={uploading} onFiles={upload} />

      {slide.obrazky.length > 0 ? (
        <>
          <div className="text-xs text-fg-dim tnum">{pocetSnimku(slide.obrazky.length)} v sekvenci</div>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
            {slide.obrazky.map((url, i) => (
              <div
                key={url}
                className="group relative aspect-square rounded-lg overflow-hidden bg-canvas ring-1 ring-line"
              >
                <img src={url} alt={`Snímek ${i + 1}`} className="h-full w-full object-cover" />
                <span className="absolute left-1 top-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white tnum">
                  {nazevSouboru(url)}
                </span>
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-end bg-black/45 px-1.5 py-1 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={() => removeFrame(url)}
                    disabled={busy}
                    className="grid h-6 w-6 place-items-center rounded text-white/90 hover:bg-danger disabled:opacity-30"
                    title="Smazat snímek"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={2} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <PrazdnyStav
          ikona={Box}
          text="Zatím žádné snímky"
          hint="Nahrajte sekvenci fotek, jak se model postupně otáčí (např. 36 snímků). Vyberte je všechny najednou."
        />
      )}

      <button
        onClick={() =>
          zeptejSe(
            slide.obrazky.length === 0 ? (
              <>
                Slide <strong className="font-semibold text-fg">3D model</strong> displeje{" "}
                {displayId} je <strong className="font-semibold text-fg">prázdný</strong> — na
                tabletu se místo modelu ukáže prázdné místo.
              </>
            ) : (
              <>
                Zveřejní se slide <strong className="font-semibold text-fg">3D model</strong>{" "}
                displeje {displayId} — {pocetSnimku(slide.obrazky.length)}.
              </>
            ),
            onSend,
          )
        }
        className="btn-primary w-fit"
        disabled={busy}
      >
        <Send className="h-4 w-4" strokeWidth={1.75} /> Zveřejnit na tabletu
      </button>
      <p className="text-xs text-fg-muted">
        Snímky jsou uložené hned po nahrání. Zveřejněním dáte displeji pokyn, aby si je načetl —
        od té chvíle je vidí návštěvníci.
      </p>
    </div>
  );
}

// --- Video: jedno MP4 (video slide i volitelné video na info panelu) ---

// Sdílený blok pro nahrání/nahrazení/odebrání jednoho MP4. Používá ho video
// slide i info panel (tam je video volitelné, Michal ho na zařízení řadí na
// začátek galerie fotek).
function VideoBlok({
  slide,
  displayId,
  busy,
  reload,
  withBusy,
}: {
  slide: SlideContent;
  displayId: string;
  busy: boolean;
  reload: () => Promise<void>;
  withBusy: (fn: () => Promise<void>, fail: string) => Promise<void>;
}) {
  const toast = useToast();
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const videoInput = useRef<HTMLInputElement>(null);

  async function uploadVideoFile(file: File) {
    if (file.type !== "video/mp4" && !/\.mp4$/i.test(file.name)) {
      toast.error("Nahrajte prosím video ve formátu MP4.");
      return;
    }
    setUploadingVideo(true);
    try {
      await api.uploadVideo(displayId, slide.n, file);
      await reload();
      toast.success("Video nahráno");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload videa selhal.");
    } finally {
      setUploadingVideo(false);
    }
  }

  async function removeVideo() {
    await withBusy(async () => {
      await api.deleteVideo(displayId, slide.n);
      await reload();
      toast.success("Video odebráno");
    }, "Odebrání videa selhalo.");
  }

  return (
    <div className="space-y-4">
      <input
        ref={videoInput}
        type="file"
        accept="video/mp4"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadVideoFile(f);
          e.target.value = "";
        }}
      />

      {slide.video ? (
        <div className="space-y-3">
          <video key={slide.video} src={slide.video} controls className="w-full rounded-lg border border-line bg-black" />
          <div className="flex items-center gap-3">
            <button onClick={() => videoInput.current?.click()} disabled={uploadingVideo || busy} className="btn-ghost">
              {uploadingVideo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" strokeWidth={1.75} />}
              Nahradit video
            </button>
            <button
              onClick={removeVideo}
              disabled={busy}
              className="btn-ghost text-danger hover:text-danger hover:border-danger/40"
            >
              <X className="h-4 w-4" strokeWidth={1.75} /> Odebrat video
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => videoInput.current?.click()}
          disabled={uploadingVideo}
          className="w-full rounded-xl border-2 border-dashed border-line p-8 text-center hover:border-accent/60 hover:bg-canvas transition disabled:opacity-60"
        >
          {uploadingVideo ? (
            <Loader2 className="h-7 w-7 mx-auto text-accent animate-spin" />
          ) : (
            <Film className="h-7 w-7 mx-auto text-fg-dim" strokeWidth={1.5} />
          )}
          <p className="mt-2 text-sm font-medium text-fg-muted">Nahrát video (MP4)</p>
          <p className="text-xs text-fg-dim">Klikněte a vyberte soubor</p>
        </button>
      )}
    </div>
  );
}

function VidEditor({
  slide,
  displayId,
  busy,
  reload,
  withBusy,
  onSend,
  zeptejSe,
}: {
  slide: SlideContent;
  displayId: string;
  busy: boolean;
  reload: () => Promise<void>;
  withBusy: (fn: () => Promise<void>, fail: string) => Promise<void>;
  onSend: () => Promise<void>;
  zeptejSe: (popis: ReactNode, akce: () => Promise<void>) => void;
}) {
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <span className="label">Video slidu</span>
        <p className="text-xs text-fg-dim -mt-1">
          Jedno velké video na celou obrazovku tabletu. Formát MP4, uloží se hned po nahrání.
          Krátké video do galerie info panelu patří naopak k Infopanelu.
        </p>
      </div>

      <VideoBlok
        slide={slide}
        displayId={displayId}
        busy={busy}
        reload={reload}
        withBusy={withBusy}
      />

      <button
        onClick={() =>
          zeptejSe(
            slide.video ? (
              <>
                Zveřejní se slide <strong className="font-semibold text-fg">Video</strong> displeje{" "}
                {displayId} — nahrané video na celou obrazovku.
              </>
            ) : (
              <>
                Slide <strong className="font-semibold text-fg">Video</strong> displeje {displayId}{" "}
                je <strong className="font-semibold text-fg">prázdný</strong> — na tabletu se místo
                videa ukáže prázdné místo.
              </>
            ),
            onSend,
          )
        }
        className="btn-primary w-fit"
        disabled={busy}
      >
        <Send className="h-4 w-4" strokeWidth={1.75} /> Zveřejnit na tabletu
      </button>
      <p className="text-xs text-fg-muted">
        Video je uložené hned po nahrání. Zveřejněním dáte displeji pokyn, aby si ho načetl — od té
        chvíle ho vidí návštěvníci.
      </p>
    </div>
  );
}

// --- AI slide: prázdná složka, obsah se needituje ---

function AiSlideInfo({ onOpenKb }: { onOpenKb: () => void }) {
  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-start gap-2.5 border-l-2 border-amber pl-4 py-1">
        <Sparkles className="h-5 w-5 text-amber shrink-0 mt-0.5" strokeWidth={1.75} />
        <div className="text-sm text-fg-muted">
          <span className="font-semibold text-fg">AI slide.</span> Na disku je jen prázdná složka —
          její existence říká tabletu, že má na tomto místě zobrazit AI průvodce. Žádný obsah se sem
          neukládá; podklady pro odpovědi průvodce se editují ve znalostní bázi displeje.
        </div>
      </div>
      <button onClick={onOpenKb} className="btn-amber w-fit">
        <Sparkles className="h-4 w-4" strokeWidth={1.75} /> Otevřít znalostní bázi (AI)
      </button>
    </div>
  );
}

// --- Znalostní báze: kb.md v kořeni displeje, mimo slidy ---

function KbEditor({
  value,
  onChange,
  onSave,
  saving,
  ulozenoCas,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  ulozenoCas: string | null;
}) {
  const toast = useToast();
  const [template, setTemplate] = useState<string | null>(null);
  const prefilled = useRef(false);
  const prazdne = value.trim() === "";

  // Šablonu si načteme jednou; slouží k předvyplnění i pro tlačítko.
  useEffect(() => {
    api.kbTemplate().then(setTemplate).catch(() => setTemplate(null));
  }, []);

  // Nový/prázdný druh: předvyplň editor šablonou, ať kurátor nezačíná z prázdna.
  // Jen do rozepsaného konceptu (na disk se zapíše až po Uložit); existující
  // vyplněný kb.md se nikdy nepřepíše.
  useEffect(() => {
    if (template && prazdne && !prefilled.current) {
      prefilled.current = true;
      onChange(template);
    }
  }, [template, prazdne, onChange]);

  function vlozitSablonu() {
    if (!template) return;
    if (!prazdne && !window.confirm("Přepsat současný text šablonou? Neuložené změny se ztratí.")) {
      return;
    }
    prefilled.current = true;
    onChange(template);
    toast.success("Šablona vložena. Přepište nápovědy vlastním obsahem a uložte.");
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-start gap-2.5 border-l-2 border-amber pl-4 py-1">
        <Sparkles className="h-5 w-5 text-amber shrink-0 mt-0.5" strokeWidth={1.75} />
        <div className="text-sm text-fg-muted">
          <span className="font-semibold text-fg">Znalostní báze displeje.</span> Edituje soubor
          kb.md v kořeni složky displeje. Není to slide — čte ji AI průvodce (chatbot) na tabletu.
          U nového druhu je předvyplněná šablonou od chatbota; přepište nápovědy vlastním obsahem.
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between gap-3">
          <label className="label">Znalostní báze (kb.md)</label>
          <button
            onClick={vlozitSablonu}
            disabled={!template}
            className="btn-ghost px-2.5 py-1 text-xs disabled:opacity-50"
            title="Vložit výchozí šablonu znalostní báze"
          >
            <FileText className="h-3.5 w-3.5" strokeWidth={1.75} /> Vložit šablonu
          </button>
        </div>
        <textarea
          className="input min-h-[340px] resize-y font-mono text-[13px] leading-relaxed"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Podklady pro AI průvodce: fakta, časté otázky, tón odpovědí…"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onSave} className="btn-primary w-fit" disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" strokeWidth={1.75} />
          )}
          Uložit znalostní bázi
        </button>
        {ulozenoCas && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent">
            <CheckCircle2 className="h-4 w-4" strokeWidth={2} /> Uloženo v {ulozenoCas}
          </span>
        )}
      </div>
      <p className="text-xs text-fg-muted">
        Znalostní báze se na tablet neposílá — čte si ji chatbot. Tlačítko „Zveřejnit na tabletu"
        tu proto není.
      </p>
    </div>
  );
}
