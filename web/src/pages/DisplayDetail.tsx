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
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Film,
  X,
} from "lucide-react";
import { api, formatDateTime, nazevSouboru } from "../lib/api";
import { NEPRIRAZENO, type DisplayDetail as Detail, type SlideContent } from "../lib/types";
import { useToast } from "../components/Toast";

const LANGS = [
  { code: "cs", label: "Čeština", active: true },
  { code: "en", label: "EN", active: false },
  { code: "pl", label: "PL", active: false },
  { code: "de", label: "DE", active: false },
  { code: "sk", label: "SK", active: false },
];

interface Draft {
  nadpis: string;
  text: string;
}

export default function DisplayDetail() {
  const { id = "" } = useParams();
  const toast = useToast();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(1);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.display(id);
      setDetail(d);
      setDrafts(Object.fromEntries(d.slides.map((s) => [s.n, { nadpis: s.nadpis, text: s.text }])));
      // Pokud aktivní slide po změně struktury zmizel, vrátíme se na první.
      setActive((cur) => (d.slides.some((s) => s.n === cur) ? cur : d.slides[0]?.n ?? 1));
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

  const slide = (detail.slides.find((s) => s.n === active) ?? detail.slides[0]) as SlideContent;
  const draft = drafts[active] ?? { nadpis: "", text: "" };
  const prirazeno = detail.meta.druh !== NEPRIRAZENO;
  const pozice = detail.slides.findIndex((s) => s.n === slide.n);

  function updateDraft(patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [active]: { ...draft, ...patch } }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.saveSlide(id, active, draft.nadpis, draft.text);
      await load();
      toast.success("Změny uloženy");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Uložení selhalo.");
    } finally {
      setSaving(false);
    }
  }

  // Jeden klik: uloží obsah slidu na disk (audit "úprava") a hned ho odešle na
  // displej (audit "odesláno na displej").
  async function handleSaveAndSend() {
    setSaving(true);
    try {
      await api.saveSlide(id, active, draft.nadpis, draft.text);
      await api.refresh(id);
      await load();
      toast.success(`Uloženo a odesláno na displej ${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Uložení nebo odeslání selhalo.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) {
      toast.error("Přetáhněte prosím obrázek.");
      return;
    }
    setUploading(true);
    try {
      for (const file of list) {
        await api.uploadImage(id, active, file);
      }
      await load();
      toast.success(list.length === 1 ? "Fotka nahrána" : `${list.length} fotek nahráno`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload selhal.");
    } finally {
      setUploading(false);
    }
  }

  async function uploadVideoFile(file: File) {
    if (!file.type.startsWith("video/") && !/\.(mp4|webm|m4v|mov|ogg)$/i.test(file.name)) {
      toast.error("Nahrajte prosím video (MP4).");
      return;
    }
    setUploadingVideo(true);
    try {
      await api.uploadVideo(id, active, file);
      await load();
      toast.success("Video nahráno");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload videa selhal.");
    } finally {
      setUploadingVideo(false);
    }
  }

  async function removeVideo() {
    setBusy(true);
    try {
      await api.deleteVideo(id, active);
      await load();
      toast.success("Video odebráno");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Odebrání videa selhalo.");
    } finally {
      setBusy(false);
    }
  }

  async function removeImage(url: string) {
    setBusy(true);
    try {
      await api.deleteImage(id, active, nazevSouboru(url));
      await load();
      toast.success("Fotka odebrána");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Odebrání fotky selhalo.");
    } finally {
      setBusy(false);
    }
  }

  async function moveImage(index: number, dir: -1 | 1) {
    const order = slide.obrazky.map(nazevSouboru);
    const j = index + dir;
    if (j < 0 || j >= order.length) return;
    [order[index], order[j]] = [order[j], order[index]];
    setBusy(true);
    try {
      await api.reorderImages(id, active, order);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Změna pořadí selhala.");
    } finally {
      setBusy(false);
    }
  }

  async function addSlide() {
    setBusy(true);
    try {
      const { n } = await api.addSlide(id);
      await load();
      setActive(n);
      toast.success("Slide přidán");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Přidání slidu selhalo.");
    } finally {
      setBusy(false);
    }
  }

  async function removeSlide() {
    if (slide.jeAi) return;
    if (!window.confirm(`Opravdu odebrat slide ${pozice + 1}? Smaže se i jeho složka s fotkami a videem.`)) {
      return;
    }
    setBusy(true);
    try {
      await api.deleteSlide(id, slide.n);
      await load();
      toast.success("Slide odebrán");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Odebrání slidu selhalo.");
    } finally {
      setBusy(false);
    }
  }

  async function moveSlide(dir: -1 | 1) {
    const order = detail!.slides.map((s) => s.n);
    const j = pozice + dir;
    if (j < 0 || j >= order.length) return;
    [order[pozice], order[j]] = [order[j], order[pozice]];
    setBusy(true);
    try {
      await api.reorderSlides(id, order);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Změna pořadí selhala.");
    } finally {
      setBusy(false);
    }
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

      {/* Záložky slidů jako podtržené taby + přidání slidu */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line">
        {detail.slides.map((s, i) => {
          const isActive = active === s.n;
          return (
            <button
              key={s.n}
              onClick={() => setActive(s.n)}
              className={`-mb-px pb-3 border-b-2 text-sm font-semibold transition flex items-center gap-1.5 ${
                isActive
                  ? s.jeAi
                    ? "text-amber border-amber"
                    : "text-accent border-accent"
                  : "text-fg-muted border-transparent hover:text-fg"
              }`}
            >
              {s.jeAi && <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />}
              {s.jeAi ? "AI slide" : `Slide ${i + 1}`}
            </button>
          );
        })}
        <button
          onClick={addSlide}
          disabled={busy}
          className="-mb-px pb-3 border-b-2 border-transparent text-sm font-semibold text-fg-dim hover:text-accent transition flex items-center gap-1.5 disabled:opacity-50"
          title="Přidat nový slide"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} /> Přidat slide
        </button>
      </div>

      {/* Lišta správy aktivního slidu: pořadí a odebrání */}
      <div className="-mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-fg-dim tnum">
          {slide.jeAi ? "AI slide" : `Slide ${pozice + 1}`} z {detail.slides.length}
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
          {!slide.jeAi && (
            <button
              onClick={removeSlide}
              disabled={busy || detail.slides.length <= 1}
              className="btn-ghost px-2.5 py-1.5 text-danger hover:text-danger hover:border-danger/40"
              title="Odebrat slide"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      {/* Obsah slidu */}
      {slide.jeAi ? (
        <AiSlideEditor draft={draft} onChange={updateDraft} onSave={handleSave} saving={saving} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Editor textu */}
          <div className="space-y-4">
            <div>
              <label className="label">Nadpis</label>
              <input
                className="input"
                value={draft.nadpis}
                onChange={(e) => updateDraft({ nadpis: e.target.value })}
                placeholder="Např. Popis"
              />
            </div>
            <div>
              <label className="label">Text</label>
              <textarea
                className="input min-h-[260px] resize-y leading-relaxed"
                value={draft.text}
                onChange={(e) => updateDraft({ text: e.target.value })}
                placeholder="Text slidu, který uvidí návštěvník na tabletu."
              />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button onClick={handleSaveAndSend} className="btn-primary" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" strokeWidth={1.75} />}
                Uložit a odeslat na displej
              </button>
            </div>
          </div>

          {/* Média: fotky a video */}
          <div className="space-y-6 lg:border-l lg:border-line lg:pl-10">
            {/* Fotky */}
            <div className="space-y-4">
              <div>
                <span className="label">Fotky slidu</span>
                <p className="text-xs text-fg-dim -mt-1">
                  Galerie. Ukládají se do složky slidu na disku, pořadí drží meta.
                </p>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  uploadFiles(e.dataTransfer.files);
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
                    if (e.target.files) uploadFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                {uploading ? (
                  <Loader2 className="h-7 w-7 mx-auto text-accent animate-spin" />
                ) : (
                  <UploadCloud className={`h-7 w-7 mx-auto ${dragOver ? "text-accent" : "text-fg-dim"}`} strokeWidth={1.5} />
                )}
                <p className="mt-2 text-sm font-medium text-fg-muted">Přetáhněte fotky sem nebo klikněte</p>
                <p className="text-xs text-fg-dim">PNG, JPG, SVG, můžete vybrat víc najednou</p>
              </div>

              {slide.obrazky.length > 0 ? (
                <div className="grid grid-cols-3 gap-3">
                  {slide.obrazky.map((url, i) => (
                    <div
                      key={url}
                      className="group relative aspect-square rounded-lg overflow-hidden bg-canvas ring-1 ring-line"
                    >
                      <img src={url} alt="Fotka slidu" className="h-full w-full object-cover" />
                      {i === 0 && (
                        <span className="absolute left-1.5 top-1.5 chip bg-accent text-white text-[10px] px-1.5 py-0.5">
                          hlavní
                        </span>
                      )}
                      {/* Ovládání fotky */}
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/45 px-1.5 py-1 opacity-0 group-hover:opacity-100 transition">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => moveImage(i, -1)}
                            disabled={busy || i === 0}
                            className="grid h-6 w-6 place-items-center rounded text-white/90 hover:bg-white/20 disabled:opacity-30"
                            title="Posunout dopředu"
                          >
                            <ChevronLeft className="h-4 w-4" strokeWidth={2} />
                          </button>
                          <button
                            onClick={() => moveImage(i, 1)}
                            disabled={busy || i === slide.obrazky.length - 1}
                            className="grid h-6 w-6 place-items-center rounded text-white/90 hover:bg-white/20 disabled:opacity-30"
                            title="Posunout dozadu"
                          >
                            <ChevronRight className="h-4 w-4" strokeWidth={2} />
                          </button>
                        </div>
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
            </div>

            {/* Video */}
            <div className="space-y-4 border-t border-line pt-6">
              <div>
                <span className="label">Video slidu</span>
                <p className="text-xs text-fg-dim -mt-1">Jedno MP4 video na slide. Přehraje se i v náhledu tabletu.</p>
              </div>

              <input
                ref={videoInput}
                type="file"
                accept="video/mp4,video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadVideoFile(f);
                  e.target.value = "";
                }}
              />

              {slide.video ? (
                <div className="space-y-3">
                  <video
                    key={slide.video}
                    src={slide.video}
                    controls
                    className="w-full rounded-lg border border-line bg-black"
                  />
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => videoInput.current?.click()}
                      disabled={uploadingVideo || busy}
                      className="btn-ghost"
                    >
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
          </div>
        </div>
      )}
    </div>
  );
}

function AiSlideEditor({
  draft,
  onChange,
  onSave,
  saving,
}: {
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-start gap-2.5 border-l-2 border-amber pl-4 py-1">
        <Sparkles className="h-5 w-5 text-amber shrink-0 mt-0.5" strokeWidth={1.75} />
        <div className="text-sm text-fg-muted">
          <span className="font-semibold text-fg">AI slide.</span> Edituje se znalostní báze
          (kb.md), kterou bude číst chatbot. Uložením se přepíše soubor kb.md ve složce slidu.
        </div>
      </div>
      <div>
        <label className="label">Znalostní báze (kb.md)</label>
        <textarea
          className="input min-h-[340px] resize-y font-mono text-[13px] leading-relaxed"
          value={draft.text}
          onChange={(e) => onChange({ text: e.target.value })}
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
