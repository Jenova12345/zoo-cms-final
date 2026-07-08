import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  Send,
  Sparkles,
  UploadCloud,
  Loader2,
  Monitor,
  ImageIcon,
  Images,
  Info,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Film,
  Map,
  X,
} from "lucide-react";
import { api, formatDateTime, nazevSouboru } from "../lib/api";
import {
  INFO_POLE,
  NEPRIRAZENO,
  SEKCE,
  SLIDE_TYP_LABEL,
  type DisplayDetail as Detail,
  type SlideContent,
  type SlideTyp,
} from "../lib/types";
import { useToast } from "../components/Toast";

const LANGS = [
  { code: "cs", label: "Čeština", active: true },
  { code: "en", label: "EN", active: false },
  { code: "pl", label: "PL", active: false },
  { code: "de", label: "DE", active: false },
  { code: "sk", label: "SK", active: false },
];

const TYP_IKONA: Record<SlideTyp, typeof Info> = {
  info: Info,
  vid: Film,
  gal: Images,
  ai: Sparkles,
};

// Záložka "kb" = znalostní báze (kb.md v kořeni displeje), mimo slidy.
type ActiveTab = number | "kb";

export default function DisplayDetail() {
  const { id = "" } = useParams();
  const toast = useToast();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveTab>(1);
  const [infoDrafts, setInfoDrafts] = useState<Record<number, Record<string, string>>>({});
  const [kbDraft, setKbDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.display(id);
      setDetail(d);
      setInfoDrafts(
        Object.fromEntries(d.slides.filter((s) => s.typ === "info").map((s) => [s.n, { ...s.pole }])),
      );
      setKbDraft(d.kb);
      // Pokud aktivní slide po změně struktury zmizel, vrátíme se na první.
      setActive((cur) =>
        cur === "kb" || d.slides.some((s) => s.n === cur) ? cur : d.slides[0]?.n ?? "kb",
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
      toast.success("Znalostní báze uložena");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Uložení selhalo.");
    } finally {
      setSaving(false);
    }
  }

  // Jeden klik: uloží pole info panelu na disk (text.txt) a odešle na displej.
  async function saveInfoAndSend(n: number, pole: Record<string, string>) {
    setSaving(true);
    try {
      await api.saveInfo(id, n, pole);
      await api.refresh(id);
      await load();
      toast.success(`Uloženo a odesláno na displej ${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Uložení nebo odeslání selhalo.");
    } finally {
      setSaving(false);
    }
  }

  async function sendToDisplay() {
    await withBusy(async () => {
      await api.refresh(id);
      toast.success(`Odesláno na displej ${id}`);
    }, "Odeslání selhalo.");
  }

  async function addSlide(typ: SlideTyp) {
    setAddOpen(false);
    await withBusy(async () => {
      const { n } = await api.addSlide(id, typ);
      await load();
      setActive(n);
      toast.success(`Slide (${SLIDE_TYP_LABEL[typ]}) přidán`);
    }, "Přidání slidu selhalo.");
  }

  async function removeSlide() {
    if (!slide) return;
    if (!window.confirm(`Opravdu odebrat slide ${pozice + 1} (${SLIDE_TYP_LABEL[slide.typ]})? Smaže se i jeho složka s obsahem.`)) {
      return;
    }
    await withBusy(async () => {
      await api.deleteSlide(id, slide.n);
      await load();
      toast.success("Slide odebrán");
    }, "Odebrání slidu selhalo.");
  }

  // Prohodí slide se sousedem; server přečísluje prefixy složek na disku.
  async function moveSlide(dir: -1 | 1) {
    if (!slide) return;
    const order = detail!.slides.map((s) => s.n);
    const j = pozice + dir;
    if (j < 0 || j >= order.length) return;
    [order[pozice], order[j]] = [order[j], order[pozice]];
    const cilova = j;
    await withBusy(async () => {
      await api.reorderSlides(id, order);
      const d = await api.display(id);
      setDetail(d);
      setInfoDrafts(
        Object.fromEntries(d.slides.filter((s) => s.typ === "info").map((s) => [s.n, { ...s.pole }])),
      );
      setKbDraft(d.kb);
      // Po přečíslování zůstaň na přesunutém slidu (má nové číslo).
      setActive(d.slides[cilova]?.n ?? d.slides[0]?.n ?? "kb");
    }, "Změna pořadí selhala.");
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

      {/* Záložky: slidy podle složek na disku + znalostní báze + přidání slidu */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line">
        {detail.slides.map((s, i) => {
          const isActive = active === s.n;
          const Ikona = TYP_IKONA[s.typ];
          return (
            <button
              key={s.n}
              onClick={() => setActive(s.n)}
              className={`-mb-px pb-3 border-b-2 text-sm font-semibold transition flex items-center gap-1.5 ${
                isActive ? "text-accent border-accent" : "text-fg-muted border-transparent hover:text-fg"
              }`}
            >
              <Ikona className="h-3.5 w-3.5" strokeWidth={1.75} />
              {i + 1} · {SLIDE_TYP_LABEL[s.typ]}
            </button>
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
            <div className="absolute left-0 top-full z-20 mt-1 w-48 rounded-xl border border-line bg-surface p-1.5 shadow-cardHover">
              {(Object.keys(SLIDE_TYP_LABEL) as SlideTyp[]).map((typ) => {
                const Ikona = TYP_IKONA[typ];
                return (
                  <button
                    key={typ}
                    onClick={() => addSlide(typ)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-fg-muted hover:bg-canvas hover:text-fg transition"
                  >
                    <Ikona className="h-4 w-4" strokeWidth={1.75} />
                    {SLIDE_TYP_LABEL[typ]}
                  </button>
                );
              })}
            </div>
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

      {/* Lišta správy aktivního slidu: pořadí a odebrání */}
      {slide && (
        <div className="-mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-fg-dim tnum">
            Slide {pozice + 1} z {detail.slides.length} · {SLIDE_TYP_LABEL[slide.typ]} · složka {slide.n}_{slide.typ}
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
              onClick={removeSlide}
              disabled={busy}
              className="btn-ghost px-2.5 py-1.5 text-danger hover:text-danger hover:border-danger/40"
              title="Odebrat slide"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      )}

      {/* Obsah záložky */}
      {active === "kb" ? (
        <KbEditor value={kbDraft} onChange={setKbDraft} onSave={saveKb} saving={saving} />
      ) : !slide ? (
        <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-fg-muted">
          Displej zatím nemá žádný slide. Přidejte první přes „Přidat slide".
        </div>
      ) : slide.typ === "info" ? (
        <InfoEditor
          key={slide.n}
          slide={slide}
          pole={infoDrafts[slide.n] ?? {}}
          onChange={(patch) =>
            setInfoDrafts((prev) => ({ ...prev, [slide.n]: { ...(prev[slide.n] ?? {}), ...patch } }))
          }
          onSave={(pole) => saveInfoAndSend(slide.n, pole)}
          saving={saving}
          busy={busy}
          displayId={id}
          reload={load}
          withBusy={withBusy}
        />
      ) : slide.typ === "gal" ? (
        <GalEditor
          key={slide.n}
          slide={slide}
          displayId={id}
          busy={busy}
          reload={load}
          withBusy={withBusy}
          onSend={sendToDisplay}
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
        />
      ) : (
        <AiSlideInfo onOpenKb={() => setActive("kb")} />
      )}
    </div>
  );
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
      <p className="text-xs text-fg-dim">JPG nebo PNG, na disk se ukládá vždy PNG</p>
    </div>
  );
}

function usePhotoUpload(displayId: string, n: number, reload: () => Promise<void>) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) {
      toast.error("Přetáhněte prosím obrázek.");
      return;
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
  onChange,
  onSave,
  saving,
  busy,
  displayId,
  reload,
  withBusy,
}: {
  slide: SlideContent;
  pole: Record<string, string>;
  onChange: (patch: Record<string, string>) => void;
  onSave: (pole: Record<string, string>) => void;
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
  const valid = !chybi("Sekce") && !chybi("Nazev");

  function handleSave() {
    if (!valid) {
      setShowErrors(true);
      toast.error("Vyplňte prosím povinná pole: Sekce a Název.");
      return;
    }
    onSave(pole);
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
        {INFO_POLE.map((def) => (
          <div key={def.klic}>
            <label className="label">
              {def.label}
              {def.povinne ? <span className="text-danger"> *</span> : <span className="text-fg-dim font-normal"> · volitelné</span>}
            </label>
            {def.klic === "Sekce" ? (
              <select
                className={`input ${showErrors && chybi("Sekce") ? "border-danger" : ""}`}
                value={pole.Sekce ?? ""}
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
                className={`input ${showErrors && def.povinne && chybi(def.klic) ? "border-danger" : ""}`}
                value={pole[def.klic] ?? ""}
                onChange={(e) => onChange({ [def.klic]: e.target.value })}
                placeholder={def.povinne ? "" : "Nepovinné, prázdné se neukládá"}
              />
            )}
            {showErrors && def.povinne && chybi(def.klic) && (
              <p className="mt-1 text-xs text-danger">Povinné pole.</p>
            )}
          </div>
        ))}
        <div className="flex items-center gap-3 pt-1">
          <button onClick={handleSave} className="btn-primary" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" strokeWidth={1.75} />}
            Uložit a odeslat na displej
          </button>
        </div>
      </div>

      {/* Fotky info panelu + mapa výskytu */}
      <div className="space-y-4 lg:border-l lg:border-line lg:pl-10">
        <div>
          <span className="label">Fotky info panelu</span>
          <p className="text-xs text-fg-dim -mt-1">
            Hlavní vizuál druhu. Jednu fotku můžete označit jako mapu výskytu, uloží se jako mapa.png.
          </p>
        </div>

        <PhotoDropzone uploading={uploading} onFiles={upload} />

        {slide.obrazky.length === 0 && !slide.mapa ? (
          <div className="flex items-center gap-2 text-xs text-fg-dim">
            <ImageIcon className="h-4 w-4" strokeWidth={1.5} /> Zatím žádné fotky
          </div>
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
              <div className="group relative aspect-square rounded-lg overflow-hidden bg-canvas ring-2 ring-amber">
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
      </div>
    </div>
  );
}

// --- Galerie: víc PNG fotek, upload a mazání ---

function GalEditor({
  slide,
  displayId,
  busy,
  reload,
  withBusy,
  onSend,
}: {
  slide: SlideContent;
  displayId: string;
  busy: boolean;
  reload: () => Promise<void>;
  withBusy: (fn: () => Promise<void>, fail: string) => Promise<void>;
  onSend: () => Promise<void>;
}) {
  const toast = useToast();
  const { uploading, upload } = usePhotoUpload(displayId, slide.n, reload);

  async function removeImage(url: string) {
    await withBusy(async () => {
      await api.deleteImage(displayId, slide.n, nazevSouboru(url));
      await reload();
      toast.success("Fotka odebrána");
    }, "Odebrání fotky selhalo.");
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <span className="label">Galerie fotek</span>
        <p className="text-xs text-fg-dim -mt-1">
          Fotky se ukládají jako PNG do složky {slide.n}_gal. Změny se projeví hned.
        </p>
      </div>

      <PhotoDropzone uploading={uploading} onFiles={upload} />

      {slide.obrazky.length > 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {slide.obrazky.map((url) => (
            <div key={url} className="group relative aspect-square rounded-lg overflow-hidden bg-canvas ring-1 ring-line">
              <img src={url} alt="Fotka galerie" className="h-full w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-end bg-black/45 px-1.5 py-1 opacity-0 group-hover:opacity-100 transition">
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
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-fg-dim">
          <ImageIcon className="h-4 w-4" strokeWidth={1.5} /> Zatím žádné fotky
        </div>
      )}

      <button onClick={onSend} className="btn-primary w-fit" disabled={busy}>
        <Send className="h-4 w-4" strokeWidth={1.75} /> Odeslat na displej
      </button>
    </div>
  );
}

// --- Video: jedno MP4 ---

function VidEditor({
  slide,
  displayId,
  busy,
  reload,
  withBusy,
  onSend,
}: {
  slide: SlideContent;
  displayId: string;
  busy: boolean;
  reload: () => Promise<void>;
  withBusy: (fn: () => Promise<void>, fail: string) => Promise<void>;
  onSend: () => Promise<void>;
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
    <div className="max-w-3xl space-y-4">
      <div>
        <span className="label">Video slidu</span>
        <p className="text-xs text-fg-dim -mt-1">
          Jedno MP4 video, ukládá se do složky {slide.n}_vid. Změny se projeví hned.
        </p>
      </div>

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

      <button onClick={onSend} className="btn-primary w-fit" disabled={busy}>
        <Send className="h-4 w-4" strokeWidth={1.75} /> Odeslat na displej
      </button>
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
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-start gap-2.5 border-l-2 border-amber pl-4 py-1">
        <Sparkles className="h-5 w-5 text-amber shrink-0 mt-0.5" strokeWidth={1.75} />
        <div className="text-sm text-fg-muted">
          <span className="font-semibold text-fg">Znalostní báze displeje.</span> Edituje soubor
          kb.md v kořeni složky displeje. Není to slide — čte ji AI průvodce (chatbot) na tabletu.
        </div>
      </div>
      <div>
        <label className="label">Znalostní báze (kb.md)</label>
        <textarea
          className="input min-h-[340px] resize-y font-mono text-[13px] leading-relaxed"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Podklady pro AI průvodce: fakta, časté otázky, tón odpovědí…"
        />
      </div>
      <button onClick={onSave} className="btn-primary w-fit" disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" strokeWidth={1.75} />}
        Uložit znalostní bázi
      </button>
    </div>
  );
}
