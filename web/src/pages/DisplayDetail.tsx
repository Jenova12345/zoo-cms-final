import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Save, Send, Sparkles, UploadCloud, Loader2, Monitor, ImageIcon } from "lucide-react";
import { api, formatDateTime } from "../lib/api";
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
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.display(id);
      setDetail(d);
      setDrafts(Object.fromEntries(d.slides.map((s) => [s.n, { nadpis: s.nadpis, text: s.text }])));
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

  const slide = detail.slides.find((s) => s.n === active) as SlideContent;
  const draft = drafts[active] ?? { nadpis: "", text: "" };
  const prirazeno = detail.meta.druh !== NEPRIRAZENO;

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

  async function handleSend() {
    setSending(true);
    try {
      await api.refresh(id);
      toast.success(`Obsah odeslán na displej ${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Odeslání selhalo.");
    } finally {
      setSending(false);
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

      {/* Záložky slidů jako podtržené taby */}
      <div className="flex flex-wrap gap-6 border-b border-line">
        {detail.slides.map((s) => {
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
              {s.jeAi ? "AI slide" : `Slide ${s.n}`}
            </button>
          );
        })}
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
              <button onClick={handleSave} className="btn-primary" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" strokeWidth={1.75} />}
                Uložit
              </button>
              <button onClick={handleSend} className="btn-amber" disabled={sending}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" strokeWidth={1.75} />}
                Odeslat na displej
              </button>
            </div>
          </div>

          {/* Upload a náhled fotek */}
          <div className="space-y-4 lg:border-l lg:border-line lg:pl-10">
            <div>
              <span className="label">Fotky slidu</span>
              <p className="text-xs text-fg-dim -mt-1">Ukládají se do složky slidu na disku.</p>
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
              <p className="mt-2 text-sm font-medium text-fg-muted">Přetáhněte fotku sem nebo klikněte</p>
              <p className="text-xs text-fg-dim">PNG, JPG, SVG</p>
            </div>

            {slide.obrazky.length > 0 ? (
              <div className="grid grid-cols-3 gap-3">
                {slide.obrazky.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="block aspect-square rounded-lg overflow-hidden bg-canvas ring-1 ring-line hover:ring-accent/50 transition"
                  >
                    <img src={url} alt="Fotka slidu" className="h-full w-full object-cover" />
                  </a>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-fg-dim">
                <ImageIcon className="h-4 w-4" strokeWidth={1.5} /> Zatím žádné fotky
              </div>
            )}
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
          (kb.md) pro budoucího chatbota. Na tabletu se zatím zobrazí placeholder asistenta.
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
