import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
import { NAHRAVANI_MAX_B, NAHRAVANI_MAX_MB, vMB } from "../lib/limity";
import { canonicalizeLatin } from "../lib/latin";
import {
  INFO_POLE,
  NEPRIRAZENO,
  JAZYKY,
  JAZYK_LABEL,
  SEKCE_STARE,
  SEKCE_TEMATA,
  jePrekladane,
  type Jazyk,
  SLIDE_TYPY,
  SLIDE_TYP_LABEL,
  SLIDE_TYP_POPIS,
  ZAJIMAVOST_LIMIT_SLOV,
  type DisplayDetail as Detail,
  type SlideContent,
  type SlideTyp,
} from "../lib/types";
import {
  infoNeulozeno,
  klicPole,
  klicZajimavosti,
  premapujDotcena,
  premapujDrafty,
  slucInfoDrafty,
  slucText,
  slucZajimavosti,
  textZmeneno,
  zapomen,
  zapomenSlide,
  KLIC_CELED,
  KLIC_KB,
  type Dotcena,
} from "../lib/drafty";
import { KB_METODIKA, zbytkySablony } from "../lib/kbSablona";
import { useNeulozeno } from "../lib/neulozeno";
import { useToast } from "../components/Toast";
import Confirm from "../components/Confirm";

// Sdílené věci se ukládají jednou (do češtiny) a ostatní jazyky je čtou
// odtud. Kurátor tak nenahrává 36 snímků třikrát.
const SDILENE_HLASKA = "Společné pro všechny jazyky, nahrává se jednou.";

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
// „co teď" a v záložce oranžová tečka, po přidání slidu je totiž snadné
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

// JAK SE OBSAH DOSTANE NA TABLET (a proč o tom texty mluví takhle):
// Unity klient si obsah načte SÁM ze sdílené složky, po chvíli nečinnosti,
// když displej přepne na spořič. Na žádný povel z CMS nečeká; endpoint
// /refresh je mock, který jen zapíše řádek do auditu. Texty proto nesmí
// slibovat „odeslání" ani „zveřejnění na povel", uložený obsah se na tablet
// dostane tak jako tak.
const VYZVEDNE_SI_SAM =
  "Tablet si uložený obsah vyzvedne sám ze sdílené složky, obvykle do minuty, jakmile u něj nikdo nestojí a přepne se na spořič.";

// Co má kurátor s prázdným slidem udělat. Formulace odpovídá tomu, jak se
// obsah daného typu ukládá: fotky a video hned při nahrání, texty tlačítkem.
const PRAZDNY_NAVOD: Record<SlideTyp, string> = {
  info: "Vyplňte Sekci a Název, nahrajte fotku a uložte. Než slide uložíte, nemá tablet co zobrazit.",
  gal: "Napište text zajímavosti, přidejte k němu fotku a uložte.",
  "3d": "Nahrajte sekvenci snímků modelu. Ukládají se hned po nahrání a tablet si je pak vyzvedne sám.",
  vid: "Nahrajte video ve formátu MP4. Uloží se hned po nahrání a tablet si ho pak vyzvedne sám.",
  ai: "",
};

// Co ve slidu je, do potvrzení mazání, ať kurátor vidí, o co přijde.
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
  // Text zajímavosti drží rodič stejně jako pole info panelu, jako lokální
  // stav editoru se ztrácel při přepnutí záložky.
  const [galDrafts, setGalDrafts] = useState<Record<number, string>>({});
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
  // Zpětná vazba „uloženo" přímo u tlačítka, toast může kurátorovi utéct,
  // tohle zůstane na obrazovce, dokud nepřepne slide.
  const [ulozeno, setUlozeno] = useState<{ klic: string; cas: string } | null>(null);
  // Přetahování záložek: index taženého slidu a místo, kam se pustí
  // (0.počet, tedy „před i-tý" a nakonec „na konec").
  const [taham, setTaham] = useState<number | null>(null);
  const [pustimNa, setPustimNa] = useState<number | null>(null);
  // Klíče polí, do kterých kurátor sáhl. Podle nich se pozná, co je jeho
  // rozepsaná verze (přenačtení ji nesmí přepsat) a co je neuložené.
  const [dotcena, setDotcena] = useState<Dotcena>(() => new Set());
  const [odchodOpen, setOdchodOpen] = useState(false);
  const [revizeOpen, setRevizeOpen] = useState(false);
  const [jazyk, setJazyk] = useState<Jazyk>("cs");
  // Čeština jako reference při překládání (načte se, jen když je potřeba).
  const [referenceCs, setReferenceCs] = useState<Detail | null>(null);
  const [prepinam, setPrepinam] = useState(false);
  // Jazyky, ve kterých kurátor něco rozepsal a přepnul jinam. Musí se
  // počítat do „neuložených změn", jinak by o ně při odchodu tiše přišel.
  const [neulozeneJazyky, setNeulozeneJazyky] = useState<Jazyk[]>([]);
  const navigate = useNavigate();
  const { nastavNeulozeno } = useNeulozeno();

  // load() a další callbacky by ze stavu četly zastaralou hodnotu, proto
  // zrcadlo v ref (přepisuje se při každém renderu).
  const dotcenaRef = useRef(dotcena);
  dotcenaRef.current = dotcena;
  const jazykRef = useRef(jazyk);
  jazykRef.current = jazyk;

  // Rozepsané změny odložené při přepnutí jazyka. Bez toho by kurátor
  // přechodem na EN přišel o rozdělanou češtinu.
  const zasoba = useRef<
    Partial<
      Record<
        Jazyk,
        {
          infoDrafts: Record<number, Record<string, string>>;
          galDrafts: Record<number, string>;
          kbDraft: string;
          sectionDraft: string;
          dotcena: Dotcena;
        }
      >
    >
  >({});

  function oznacDotcene(klic: string) {
    setDotcena((prev) => (prev.has(klic) ? prev : new Set(prev).add(klic)));
  }

  // Po uložení rozepsaná verze odpovídá disku, značky zahodíme hned (i v ref,
  // ať následné load() vezme serverovou podobu, třeba kanonizovanou latinu).
  function ulozeneZahod(uprav: (d: Dotcena) => Dotcena) {
    const nove = uprav(dotcenaRef.current);
    dotcenaRef.current = nove;
    setDotcena(nove);
  }

  // `rezim` říká, co se stane s rozepsaným obsahem:
  //   "slouc": ze serveru se propíšou jen pole, kterých se kurátor
  //                  nedotkl (po uložení a po změně struktury slidů),
  //   "nechDrafty": drafty se nesahá vůbec (nahrání a mazání fotek, videa,
  //                  označení mapy, tam kurátor rozepsaný formulář typicky má).
  const load = useCallback(
    async (rezim: "slouc" | "nechDrafty" = "slouc") => {
      try {
        const d = await api.display(id, jazykRef.current);
        setDetail(d);
        if (rezim === "slouc") {
          const dot = dotcenaRef.current;
          setInfoDrafts((prev) => slucInfoDrafty(prev, d.slides, dot));
          setGalDrafts((prev) => slucZajimavosti(prev, d.slides, dot));
          setKbDraft((prev) => slucText(prev, d.kb, KLIC_KB, dot));
          setSectionDraft((prev) => slucText(prev, d.meta.section ?? "", KLIC_CELED, dot));
        }
        // Pokud aktivní slide po změně struktury zmizel, vrátíme se na první.
        setActive((cur) =>
          cur === "kb" || d.slides.some((s) => s.n === cur) ? cur : d.slides[0]?.n ?? ZADNY_SLIDE,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Načtení selhalo.");
      }
    },
    [id],
  );

  // Přenačtení obsahu po práci se soubory: rozepsaný formulář zůstává.
  const reloadObsah = useCallback(() => load("nechDrafty"), [load]);

  // Přepnutí jazyka: rozepsané změny se odloží stranou a při návratu se
  // vrátí. Na disk se nic nezapisuje, dokud kurátor neklikne na Uložit.
  async function prepniJazyk(cil: Jazyk) {
    if (cil === jazykRef.current || prepinam) return;
    const odkud = jazykRef.current;
    zasoba.current[odkud] = {
      infoDrafts,
      galDrafts,
      kbDraft,
      sectionDraft,
      dotcena: dotcenaRef.current,
    };
    setNeulozeneJazyky((prev) => {
      const bez = prev.filter((j) => j !== odkud && j !== cil);
      return neulozenoCokoliv ? [...bez, odkud] : bez;
    });
    setPrepinam(true);
    try {
      const d = await api.display(id, cil);
      jazykRef.current = cil;
      setJazyk(cil);
      setDetail(d);
      setUlozeno(null);

      const odlozene = zasoba.current[cil];
      if (odlozene) {
        setInfoDrafts(odlozene.infoDrafts);
        setGalDrafts(odlozene.galDrafts);
        setKbDraft(odlozene.kbDraft);
        setSectionDraft(odlozene.sectionDraft);
        dotcenaRef.current = odlozene.dotcena;
        setDotcena(odlozene.dotcena);
      } else {
        const prazdna: Dotcena = new Set();
        dotcenaRef.current = prazdna;
        setDotcena(prazdna);
        setInfoDrafts(slucInfoDrafty({}, d.slides, prazdna));
        setGalDrafts(slucZajimavosti({}, d.slides, prazdna));
        setKbDraft(d.kb);
        setSectionDraft(d.meta.section ?? "");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Přepnutí jazyka selhalo.");
    } finally {
      setPrepinam(false);
    }
  }

  // Čeština jako podklad pro překlad. Načte se jednou při prvním přepnutí.
  useEffect(() => {
    if (jazyk === "cs" || referenceCs) return;
    let platne = true;
    api
      .display(id, "cs")
      .then((d) => platne && setReferenceCs(d))
      .catch(() => undefined);
    return () => {
      platne = false;
    };
  }, [jazyk, referenceCs, id]);

  useEffect(() => {
    load();
  }, [load]);

  // --- Neuložené změny ---------------------------------------------------
  // Neuložené je jen to, čeho se kurátor dotkl a co se zároveň liší od disku.
  const celedNeulozena =
    dotcena.has(KLIC_CELED) && sectionDraft.trim() !== (detail?.meta.section ?? "").trim();
  const kbNeulozena = dotcena.has(KLIC_KB) && textZmeneno(kbDraft, detail?.kb ?? "");

  function slideNeulozen(s: SlideContent): boolean {
    if (s.typ === "info") {
      return infoNeulozeno(s.n, infoDrafts[s.n], s.pole, dotcena) || celedNeulozena;
    }
    if (s.typ === "gal") {
      return dotcena.has(klicZajimavosti(s.n)) && textZmeneno(galDrafts[s.n] ?? s.text, s.text);
    }
    return false;
  }

  const neulozenoCokoliv =
    !!detail && (detail.slides.some(slideNeulozen) || kbNeulozena);

  // Rozepsané je i to, co čeká odložené v jiném jazyce.
  const neulozenoVJazycich = neulozenoCokoliv
    ? [jazyk, ...neulozeneJazyky.filter((j) => j !== jazyk)]
    : neulozeneJazyky;
  const neulozenoKdekoliv = neulozenoVJazycich.length > 0;

  // Levý navigační panel se na neuložené změny ptá sám (odchod přes menu
  // nebo Odhlásit beforeunload nezachytí, uvnitř SPA se nespouští).
  useEffect(() => {
    nastavNeulozeno(neulozenoKdekoliv);
    return () => nastavNeulozeno(false);
  }, [neulozenoKdekoliv, nastavNeulozeno]);

  // Zavření okna nebo záložky s rozepsanými změnami: zeptá se prohlížeč sám.
  useEffect(() => {
    if (!neulozenoKdekoliv) return;
    function varuj(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", varuj);
    return () => window.removeEventListener("beforeunload", varuj);
  }, [neulozenoKdekoliv]);

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
      await api.saveKb(id, kbDraft, jazyk);
      ulozeneZahod((d) => zapomen(d, KLIC_KB));
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
    setNeulozeneJazyky((prev) => prev.filter((j) => j !== jazykRef.current));
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
      const res = await api.saveInfo(id, n, pole, sectionDraft, jazyk);
      if (odeslat) await api.refresh(id);
      // Uloženo = rozepsaná verze odpovídá disku. Značky pryč ještě před
      // přenačtením, ať se ve formuláři objeví serverová podoba (kanonizovaná
      // latina) místo toho, co kurátor napsal.
      ulozeneZahod((d) => zapomen(zapomenSlide(d, n), KLIC_CELED));
      await load();
      oznacUlozeno();
      const zaklad = odeslat
        ? `Uloženo a zapsáno jako hotové (displej ${id}). Tablet si obsah vyzvedne sám.`
        : "Uloženo. Tablet si změnu vyzvedne sám, obvykle do minuty.";
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
            ? "Uložení nebo zápis do auditu selhal."
            : "Uložení selhalo.",
      );
    } finally {
      setSaving(false);
    }
  }

  // Slidy, jejichž obsah se ukládá hned při nahrání (3D, video): tlačítko
  // nic nikam netlačí, jen zapíše do auditu, že je kurátor s obsahem hotový.
  async function sendToDisplay() {
    await withBusy(async () => {
      await api.refresh(id);
      oznacUlozeno();
      toast.success(`Zapsáno jako hotové (displej ${id}). Tablet si obsah vyzvedne sám.`);
    }, "Zápis do auditu selhal.");
  }

  // Vědomé schválení AI textů. Nezapisuje obsah, jen ruší značku „čeká na
  // revizi" a nechá v auditu záznam, kdo za texty ručí.
  async function potvrditRevizi() {
    setRevizeOpen(false);
    await withBusy(async () => {
      await api.potvrditRevizi(id);
      await load();
      toast.success("Schváleno. Do auditu se zapsalo vaše jméno a čas.");
    }, "Potvrzení revize selhalo.");
  }

  async function addSlide(typ: SlideTyp) {
    setAddOpen(false);
    await withBusy(async () => {
      const { n } = await api.addSlide(id, typ);
      await load();
      setActive(n);
      toast.success(`Slide ${SLIDE_TYP_LABEL[typ]} přidán, teď vyplňte obsah a uložte.`);
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
      // Server slidy přečísluje, takže se rozepsaný obsah musí přestěhovat
      // s nimi, jinak by text patřil cizímu slidu.
      const preskladana = premapujDotcena(dotcenaRef.current, poradi);
      dotcenaRef.current = preskladana;
      setDotcena(preskladana);
      const d = await api.display(id);
      setDetail(d);
      setInfoDrafts((prev) => slucInfoDrafty(premapujDrafty(prev, poradi), d.slides, preskladana));
      setGalDrafts((prev) => slucZajimavosti(premapujDrafty(prev, poradi), d.slides, preskladana));
      setKbDraft((prev) => slucText(prev, d.kb, KLIC_KB, preskladana));
      setSectionDraft((prev) => slucText(prev, d.meta.section ?? "", KLIC_CELED, preskladana));
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

  // Přetažení záložky: `zIndexu` se vloží na pozici `naIndex` (0.počet).
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
        <Link
          to="/displeje"
          onClick={(e) => {
            // Odchod ze stránky je jediné místo, kde se rozepsané změny
            // ztratí, přepínání záložek slidů si je drží.
            if (!neulozenoKdekoliv) return;
            e.preventDefault();
            setOdchodOpen(true);
          }}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-fg-muted hover:text-fg"
        >
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
        <p className="mt-2 text-xs text-fg-muted tnum">
          Poslední změna: {formatDateTime(detail.meta.posledniZmena)}
        </p>
      </div>

      {/* Obsah přišel z hromadného importu a je od AI, dokud ho kurátor
          neprojde, má to vědět hned po otevření displeje. */}
      {detail.meta.cekaNaRevizi && (
        <div className="-mt-3 flex flex-wrap items-start justify-between gap-4 rounded-lg border border-amber/40 bg-amber-soft px-4 py-3">
          <div className="flex items-start gap-2.5">
            <Sparkles className="h-5 w-5 shrink-0 text-amber" strokeWidth={1.75} />
            <div className="max-w-2xl text-sm text-fg-muted">
              <span className="font-semibold text-fg">
                Texty jsou od AI a čekají na vaši revizi.
              </span>{" "}
              Přišly hromadným importem. Projděte je (hlavně znalostní bázi, ze které chatbot
              odpovídá návštěvníkům), opravte, co nesedí, a teprve pak schvalte. Samotné uložení
              textu za schválení nepovažujeme.
            </div>
          </div>
          <button onClick={() => setRevizeOpen(true)} disabled={busy} className="btn-amber shrink-0">
            <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} /> Zkontrolováno, schvaluji
          </button>
        </div>
      )}

      {/* Displej má slidy, ale ještě nemá druh, kurátor má vědět, co dodělat. */}
      {!prirazeno && detail.slides.length > 0 && (
        <div className="-mt-3 flex items-start gap-2.5 border-l-2 border-amber pl-4 py-1">
          <Info className="h-5 w-5 text-amber shrink-0 mt-0.5" strokeWidth={1.75} />
          <div className="text-sm text-fg-muted">
            <span className="font-semibold text-fg">Displej ještě nemá přiřazený druh.</span>{" "}
            {detail.slides.some((s) => s.typ === "info")
              ? "Vyplňte Sekci a Název v Infopanelu a uložte. Název se pak objeví i v seznamu displejů."
              : "Přidejte slide Infopanel a vyplňte v něm Sekci a Název. Název se pak objeví i v seznamu displejů."}
          </div>
        </div>
      )}

      {/* Jazyk. U každého je vidět, kolik položek v něm ještě chybí. */}
      <div className="flex flex-wrap items-center gap-5">
        <span className="kicker">Jazyk</span>
        <div className="flex flex-wrap items-center gap-4">
          {JAZYKY.map((kod) => {
            const stav = detail.jazyky?.find((j) => j.jazyk === kod);
            const aktivni = kod === jazyk;
            return (
              <button
                key={kod}
                onClick={() => prepniJazyk(kod)}
                disabled={prepinam}
                className={`flex items-center gap-1.5 text-sm font-semibold transition border-b-2 pb-0.5 disabled:opacity-60 ${
                  aktivni
                    ? "text-accent border-accent"
                    : "text-fg-muted border-transparent hover:text-fg"
                }`}
              >
                {JAZYK_LABEL[kod]}
                {stav && (
                  <span
                    className={`text-[10px] font-medium ${
                      stav.hotovo ? "text-accent" : "text-amber-deep"
                    }`}
                  >
                    {stav.hotovo ? "hotovo" : `chybí ${stav.chybi}`}
                  </span>
                )}
              </button>
            );
          })}
          {prepinam && <Loader2 className="h-4 w-4 animate-spin text-fg-muted" />}
        </div>
        {jazyk !== "cs" && (
          <span className="text-xs text-fg-muted">
            Fotky, video, 3D snímky, mapa, latinský název a čeleď se berou z češtiny.
          </span>
        )}
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
                    title="Prázdný slide, chybí obsah"
                  />
                )}
                {slideNeulozen(s) && (
                  <span
                    className="h-2 w-2 rounded-full border-2 border-accent"
                    title="Neuložené změny"
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
            className="-mb-px pb-3 border-b-2 border-transparent text-sm font-semibold text-fg-muted hover:text-accent transition flex items-center gap-1.5 disabled:opacity-50"
            title="Přidat nový slide"
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} /> Přidat slide
          </button>
          {addOpen && (
            <>
              {/* Klik mimo nabídku ji zavře. */}
              <div className="fixed inset-0 z-10" onClick={() => setAddOpen(false)} />
              <div className="absolute left-0 top-full z-20 mt-1 w-80 rounded-xl border border-line bg-surface p-1.5 shadow-cardHover">
                <p className="px-3 pt-1.5 pb-2 text-[11px] text-fg-muted">
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
                        <span className="block text-xs text-fg-muted">{SLIDE_TYP_POPIS[typ]}</span>
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
            active === "kb" ? "text-amber-deep border-amber" : "text-fg-muted border-transparent hover:text-fg"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
          Znalostní báze (AI)
        </button>
      </div>

      {detail.slides.length > 1 && (
        <p className="-mt-6 flex items-center gap-1.5 text-[11px] text-fg-muted">
          <GripVertical className="h-3.5 w-3.5" strokeWidth={1.75} />
          Přetáhněte pro změnu pořadí, nebo použijte šipky vpravo.
        </p>
      )}

      {/* Lišta správy aktivního slidu: pořadí a odebrání */}
      {slide && (
        <div className="-mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-fg-muted tnum">
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
          cekaNaRevizi={detail.meta.cekaNaRevizi === true}
          jazyk={jazyk}
          referenceCs={jazyk === "cs" ? null : referenceCs?.kb ?? null}
          value={kbDraft}
          onChange={(v) => {
            setUlozeno(null);
            oznacDotcene(KLIC_KB);
            setKbDraft(v);
          }}
          // Předvyplnění šablonou není zásah kurátora, nedělá „neuloženo".
          onPredvyplnit={setKbDraft}
          onSave={saveKb}
          saving={saving}
          neulozeno={kbNeulozena}
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
            Začněte přidáním <strong className="font-semibold text-fg">Infopanelu</strong>: to
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
          pole={infoDrafts[slide.n] ?? slide.pole}
          section={sectionDraft}
          onSectionChange={(v) => {
            setUlozeno(null);
            oznacDotcene(KLIC_CELED);
            setSectionDraft(v);
          }}
          onChange={(patch) => {
            // Rozepsaná změna = už to není stav, který se uložil, a pole se
            // stává kurátorovým: přenačtení ho smí přepsat.
            setUlozeno(null);
            for (const klic of Object.keys(patch)) oznacDotcene(klicPole(slide.n, klic));
            setInfoDrafts((prev) => ({
              ...prev,
              [slide.n]: { ...(prev[slide.n] ?? slide.pole), ...patch },
            }));
          }}
          onSave={(pole, odeslat) => saveInfo(slide.n, pole, odeslat)}
          jazyk={jazyk}
          referenceCs={
            jazyk === "cs"
              ? null
              : referenceCs?.slides.find((x) => x.n === slide.n)?.pole ?? null
          }
          zeptejSe={zeptejSeNaZverejneni}
          neulozeno={slideNeulozen(slide)}
          ulozenoCas={ulozeno?.klic === String(slide.n) ? ulozeno.cas : null}
          saving={saving}
          busy={busy}
          displayId={id}
          reload={reloadObsah}
          withBusy={withBusy}
        />
      ) : slide.typ === "gal" ? (
        <ZajimavostEditor
          key={slide.n}
          slide={slide}
          displayId={id}
          busy={busy}
          reload={reloadObsah}
          withBusy={withBusy}
          zeptejSe={zeptejSeNaZverejneni}
          jazyk={jazyk}
          referenceCs={
            jazyk === "cs"
              ? null
              : referenceCs?.slides.find((x) => x.n === slide.n)?.text ?? null
          }
          text={galDrafts[slide.n] ?? slide.text}
          onZmena={(v) => {
            setUlozeno(null);
            oznacDotcene(klicZajimavosti(slide.n));
            setGalDrafts((prev) => ({ ...prev, [slide.n]: v }));
          }}
          onUlozeno={() => {
            ulozeneZahod((d) => zapomenSlide(d, slide.n));
            oznacUlozeno();
          }}
          neulozeno={slideNeulozen(slide)}
          ulozenoCas={ulozeno?.klic === String(slide.n) ? ulozeno.cas : null}
        />
      ) : slide.typ === "3d" ? (
        <ModelEditor
          key={slide.n}
          slide={slide}
          displayId={id}
          busy={busy}
          reload={reloadObsah}
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
          reload={reloadObsah}
          withBusy={withBusy}
          onSend={sendToDisplay}
          zeptejSe={zeptejSeNaZverejneni}
        />
      ) : (
        <AiSlideInfo onOpenKb={() => setActive("kb")} />
      )}

      {/* Mazání slidu je nevratné, smaže se složka na disku i s obsahem.
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
                - slide {pozice + 1} ({SLIDE_TYP_LABEL[slide.typ]}), složka{" "}
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
            Fotky, video ani text z tohoto slidu už nepůjde vrátit, ani přes audit log.
          </>
        }
        potvrdit="Smazat slide"
        onPotvrdit={removeSlide}
        onZrusit={() => setSmazatOpen(false)}
      />

      {/* Schválení AI textů: kurátor za ně od téhle chvíle ručí, proto se
          ptáme a proto to jde do auditu na jeho jméno. */}
      <Confirm
        open={revizeOpen}
        varianta="publikovat"
        titulek="Schvalujete texty od AI?"
        text={
          <>
            Potvrzujete, že jste texty tohoto druhu prošli a odpovídají skutečnosti. Platí to
            hlavně pro znalostní bázi, ze které chatbot odpovídá návštěvníkům. Do{" "}
            <strong className="font-semibold text-fg">auditu se zapíše vaše jméno a čas</strong>.
            Značka „čeká na revizi" pak zmizí z přehledu displejů.
          </>
        }
        potvrdit="Schvaluji"
        onPotvrdit={potvrditRevizi}
        onZrusit={() => setRevizeOpen(false)}
      />

      {/* Odchod na seznam displejů s rozepsanými změnami. */}
      <Confirm
        open={odchodOpen}
        titulek="Odejít bez uložení?"
        text={
          <>
            Máte rozepsané změny, které nejsou uložené (
            {neulozenoVJazycich.map((j) => JAZYK_LABEL[j]).join(", ")}). Když teď odejdete na
            seznam displejů, přijdete o ně a vrátit to nepůjde.
          </>
        }
        potvrdit="Odejít bez uložení"
        onPotvrdit={() => {
          setOdchodOpen(false);
          navigate("/displeje");
        }}
        onZrusit={() => setOdchodOpen(false)}
      />

      {/* Zveřejnění na tabletu má následek venku: od té chvíle obsah vidí
          návštěvníci u expozice. Ptáme se na něj stejně jako na mazání. */}
      <Confirm
        open={!!zverejnit}
        varianta="publikovat"
        titulek="Označit obsah jako hotový?"
        text={
          <>
            {zverejnit?.popis} Na tablet se obsah dostane sám, obvykle do minuty od uložení, a to
            i bez tohoto kroku. Tímhle se do auditu zapíše, že je hotový a zkontrolovaný. Pokračovat?
          </>
        }
        potvrdit="Označit jako hotové"
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
      {hint ? <p className="text-xs text-fg-muted">{hint}</p> : <span />}
      {pocitadlo && <div className="shrink-0 text-xs tnum">{pocitadlo}</div>}
    </div>
  );
}

// Počítadlo délky. Limit je doporučení (na tabletu se dlouhý text ořízne),
// takže po překročení jen zoranžoví, uložení nikdy neblokuje.
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
    <span className={pres ? "text-amber-deep font-semibold" : "text-fg-muted"}>
      {kolik} / {limit} {jednotka}
      {pres && " · na tabletu se může zkrátit"}
    </span>
  );
}

// Český originál jako podklad k překladu. Ukazuje se jen u prázdného pole
// a schválně se nikam nepředvyplňuje: předvyplněná čeština by se snadno
// uložila jako "překlad".
function CeskyOriginal({ text }: { text: string | null }) {
  if (!text || !text.trim()) return null;
  return (
    <div className="rounded-lg border border-dashed border-line bg-canvas px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
        Česky (podklad k překladu)
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm text-fg-muted">{text}</p>
    </div>
  );
}

// Stav rozepsaného obsahu u tlačítek. Neuložené změny musí být vidět dřív,
// než kurátor odejde, toast na to nestačí, ten mezitím zmizí.
function StavUlozeni({
  neulozeno,
  ulozenoCas,
}: {
  neulozeno: boolean;
  ulozenoCas: string | null;
}) {
  if (neulozeno) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-deep">
        <span className="h-2 w-2 rounded-full bg-amber" />
        Neuloženo, nezapomeňte uložit
      </span>
    );
  }
  if (ulozenoCas) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent">
        <CheckCircle2 className="h-4 w-4" strokeWidth={2} /> Uloženo v {ulozenoCas}
      </span>
    );
  }
  return null;
}

// Jemná nápověda místo prázdného místa: co se sem nahrává. Záměrně bez rámečku
// - stojí pod nahrávacím polem, které rámeček už má.
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
        {hint && <span className="text-fg-muted">, {hint}</span>}
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
  vice = true,
  popis,
}: {
  uploading: boolean;
  onFiles: (files: FileList | File[]) => void;
  vice?: boolean; // false = slide unese jen jednu fotku (zajímavost)
  popis?: string;
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
        multiple={vice}
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
      <p className="mt-2 text-sm font-medium text-fg-muted">
        {vice ? "Přetáhněte fotky sem nebo klikněte" : "Přetáhněte fotku sem nebo klikněte"}
      </p>
      <p className="text-xs text-fg-muted">
        {popis ?? "JPG nebo PNG, systém si formát převede sám"}
      </p>
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
  jenJedna = false,
) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const upload = async (files: FileList | File[]) => {
    let list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) {
      toast.error("Přetáhněte prosím obrázek.");
      return;
    }
    if (seradPodleNazvu) {
      list.sort((a, b) => a.name.localeCompare(b.name, "cs", { numeric: true }));
    }
    // Zajímavost má na disku právě jednu fotku, server by ostatní stejně
    // přepsal, takže je ani nenahráváme a rovnou to řekneme.
    const vicNezUnese = jenJedna && list.length > 1;
    if (jenJedna) list = list.slice(0, 1);
    setUploading(true);
    try {
      for (const file of list) {
        await api.uploadImage(displayId, n, file);
      }
      await reload();
      toast.success(
        vicNezUnese
          ? "Nahrála se první vybraná fotka. Zajímavost jich unese jen jednu."
          : list.length === 1
            ? "Fotka nahrána"
            : `${list.length} fotek nahráno`,
      );
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
  jazyk,
  referenceCs,
  zeptejSe,
  neulozeno,
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
  jazyk: Jazyk;
  referenceCs: Record<string, string> | null; // český originál při překladu
  zeptejSe: (popis: ReactNode, akce: () => Promise<void>) => void;
  neulozeno: boolean;
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

  // Sekce uložená pod starým názvem: v nabídce je jen nové pojmenování, tak
  // kurátorovi ukážeme, čemu ta stará hodnota odpovídá.
  const novyNazevSekce = SEKCE_STARE[pole.Sekce ?? ""];
  const staraSekce = novyNazevSekce
    ? SEKCE_TEMATA.find((sekce) => sekce.cs === novyNazevSekce) ?? null
    : null;

  const chybi = (klic: string) => !(pole[klic] ?? "").trim();
  // V překladu se vyplňuje jen to, co je překládané; sekci a latinu drží
  // čeština, takže je zbytečné je tady vymáhat.
  const chybejici = INFO_POLE.filter(
    (d) => d.povinne && chybi(d.klic) && (jazyk === "cs" || jePrekladane(d.klic)),
  );
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
        Označí se jako hotový <strong className="font-semibold text-fg">Infopanel</strong> displeje{" "}
        {displayId}, údaje o druhu i nahrané fotky.
      </>,
      () => onSave(pole, true),
    );
  }

  // Mazání fotky je nevratné (soubor zmizí z disku), takže se ptáme stejně
  // jako u slidu. Drží se URL fotky, na kterou kurátor klikl.
  const [smazatFotku, setSmazatFotku] = useState<string | null>(null);

  async function removeImage(url: string) {
    setSmazatFotku(null);
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
        {/* Co je povinné, má být vidět předem, ne až z chybové hlášky. */}
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
                  <span className="text-fg-muted font-normal"> · volitelné</span>
                )}
              </label>
              {jazyk !== "cs" && !jePrekladane(def.klic) ? (
                // Sdílené pole: v překladu se needituje, mění se v češtině.
                <div className="input bg-canvas text-fg-muted">{hodnota || "nevyplněno"}</div>
              ) : def.klic === "Sekce" ? (
                <select
                  id={`pole-${def.klic}`}
                  className={`input ${nevyplneno ? "border-danger" : ""}`}
                  value={hodnota}
                  onChange={(e) => onChange({ Sekce: e.target.value })}
                >
                  <option value="">vyberte sekci</option>
                  {SEKCE_TEMATA.map((sekce) => (
                    <option key={sekce.cs} value={sekce.cs}>
                      {sekce.cislo}. {sekce.cs}
                    </option>
                  ))}
                  {/* Displej uložený dřív má starý název sekce. Necháme ho
                      v nabídce, ať kurátor vidí, co v souboru opravdu je. */}
                  {staraSekce && (
                    <option value={hodnota}>{hodnota} (starý název)</option>
                  )}
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
              {jazyk !== "cs" && !jePrekladane(def.klic) && (
                <p className="mt-1 text-xs text-fg-muted">
                  Společné pro všechny jazyky, mění se v češtině.
                </p>
              )}
              {/* Český originál jako podklad k překladu. Schválně se
                  nepředvyplňuje, aby se čeština omylem neuložila jako
                  angličtina. */}
              {jazyk !== "cs" && jePrekladane(def.klic) && !hodnota.trim() &&
                (referenceCs?.[def.klic] ?? "").trim() && (
                  <p className="mt-1 text-xs text-fg-muted">
                    <span className="font-semibold">Česky:</span> {referenceCs?.[def.klic]}
                  </p>
                )}
              {def.klic === "Sekce" && staraSekce && (
                <p className="mt-1 text-xs text-amber-deep">
                  „{hodnota}" je starý název. Podle tabule v pavilonu je to teď{" "}
                  <span className="font-semibold">
                    {staraSekce.cislo}. {staraSekce.cs}
                  </span>
                  , vyberte ho, ať sedí čísla na podlaze.
                </p>
              )}
              {def.klic === "Latinsky" && latinSeZmeni && (
                <p className="mt-1 text-xs text-amber-deep">
                  Uloží se v kanonickém tvaru: <span className="font-mono">{latinNahled}</span>
                </p>
              )}
            </div>
          );
        })}

        {/* Taxonomická čeleď: jde jen do meta.json (identifikace pro chatbota). */}
        <div>
          <label className="label">
            Čeleď (taxonomická)<span className="text-fg-muted font-normal"> · volitelné</span>
          </label>
          {jazyk === "cs" ? (
            <>
              <input
                className="input"
                value={section}
                onChange={(e) => onSectionChange(e.target.value)}
                placeholder="Např. Dendrobatidae"
              />
              <PodPolem hint="Na tabletu se nezobrazuje, slouží jen chatbotovi k rozpoznání druhu." />
            </>
          ) : (
            <>
              <div className="input bg-canvas text-fg-muted">{section || "nevyplněno"}</div>
              <PodPolem hint="Společné pro všechny jazyky, mění se v češtině." />
            </>
          )}
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
              Uložit a označit jako hotové
            </button>
            <StavUlozeni neulozeno={neulozeno} ulozenoCas={ulozenoCas} />
          </div>
          {/* Rozdíl mezi tlačítky musí být čitelný bez školení, a hlavně
              pravdivý: uložený obsah jde na tablet tak jako tak. */}
          <div className="space-y-1 text-xs text-fg-muted">
            <p>
              <strong className="font-semibold text-fg">Uložit</strong>: zapíše obsah na disk.{" "}
              {VYZVEDNE_SI_SAM}
            </p>
            <p>
              <strong className="font-semibold text-fg">Uložit a označit jako hotové</strong>: uloží a navíc zapíše do auditu (jako „odesláno na displej"), že je obsah hotový a
              zkontrolovaný. Na to, kdy se objeví na tabletu, to vliv nemá.
            </p>
            <p>
              Fotky a video se ukládají hned při nahrání. Tablet si je vyzvedne stejně jako
              zbytek.
            </p>
          </div>
        </div>
      </div>

      {/* Fotky info panelu + mapa výskytu */}
      <div className="space-y-4 lg:border-l lg:border-line lg:pl-10">
        <div>
          <span className="label">Fotky info panelu</span>
          <p className="text-xs text-fg-muted -mt-1">
            Hlavní vizuál druhu. Jednu fotku můžete označit jako mapu výskytu ikonkou mapy,
            která se objeví po najetí na fotku. {SDILENE_HLASKA}
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
                    onClick={() => setSmazatFotku(url)}
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
                    onClick={() => setSmazatFotku(slide.mapa!)}
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
          <span className="label">Video info panelu <span className="text-fg-muted font-normal">· volitelné</span></span>
          <p className="text-xs text-fg-muted -mt-1 mb-3">
            Volitelné krátké video do galerie tohoto panelu. Pro velké video přes celou obrazovku
            použijte samostatný slide <strong className="font-semibold text-fg-muted">Video</strong>.{" "}
            {SDILENE_HLASKA}
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

      <Confirm
        open={!!smazatFotku}
        titulek={smazatFotku === slide.mapa ? "Smazat mapu výskytu?" : "Smazat fotku?"}
        text={
          smazatFotku === slide.mapa ? (
            <>
              Mapa výskytu se smaže z disku. Vrátit to nepůjde, bude ji potřeba nahrát a znovu
              označit.
            </>
          ) : (
            <>Fotka se smaže z disku. Vrátit to nepůjde, bude ji potřeba nahrát znovu.</>
          )
        }
        potvrdit={smazatFotku === slide.mapa ? "Smazat mapu" : "Smazat fotku"}
        onPotvrdit={() => smazatFotku && removeImage(smazatFotku)}
        onZrusit={() => setSmazatFotku(null)}
      />
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
  jazyk,
  referenceCs,
  text,
  onUlozeno,
  onZmena,
  neulozeno,
  ulozenoCas,
}: {
  slide: SlideContent;
  displayId: string;
  busy: boolean;
  reload: () => Promise<void>;
  withBusy: (fn: () => Promise<void>, fail: string) => Promise<void>;
  zeptejSe: (popis: ReactNode, akce: () => Promise<void>) => void;
  jazyk: Jazyk;
  referenceCs: string | null;
  text: string;
  onUlozeno: () => void;
  onZmena: (v: string) => void;
  neulozeno: boolean;
  ulozenoCas: string | null;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  // Zajímavost má na disku právě jednu fotku, tak ji ani nenabízíme víc.
  const { uploading, upload } = usePhotoUpload(displayId, slide.n, reload, false, true);
  const fotka = slide.obrazky[0] ?? null;

  // `odeslat` = navíc zapsat do auditu, že je kurátor s textem hotový.
  async function ulozit(odeslat: boolean) {
    setSaving(true);
    try {
      await api.saveSlideText(displayId, slide.n, text, jazyk);
      if (odeslat) await api.refresh(displayId);
      onUlozeno();
      await reload();
      toast.success(
        odeslat
          ? `Zajímavost uložena a zapsána jako hotová (displej ${displayId}).`
          : "Zajímavost uložena. Tablet si ji vyzvedne sám, obvykle do minuty.",
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
        Označí se jako hotový slide <strong className="font-semibold text-fg">Zajímavost</strong>{" "}
        displeje {displayId}, text i fotka.
      </>,
      () => ulozit(true),
    );
  }

  const [smazatFotku, setSmazatFotku] = useState(false);

  async function removeImage(url: string) {
    setSmazatFotku(false);
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
            Popis <span className="text-fg-muted font-normal">· text zajímavosti</span>
          </label>
          <textarea
            id={`popis-${slide.n}`}
            className="input min-h-[320px] resize-y leading-relaxed"
            value={text}
            onChange={(e) => onZmena(e.target.value)}
            placeholder="Např. Pralesnička harlekýn je drobná jedovatá žába obývající podrost tropických pralesů…"
          />
          {!text.trim() && <CeskyOriginal text={referenceCs} />}
          <PodPolem
            hint={`Delší text, ideálně do ${ZAJIMAVOST_LIMIT_SLOV} slov. Delší text se na tabletu ořízne.`}
            pocitadlo={
              text.trim() ? (
                <Pocitadlo kolik={pocetSlov(text)} limit={ZAJIMAVOST_LIMIT_SLOV} jednotka="slov" />
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
            Uložit a označit jako hotové
          </button>
          <StavUlozeni neulozeno={neulozeno} ulozenoCas={ulozenoCas} />
        </div>
        <p className="text-xs text-fg-muted">
          <strong className="font-semibold text-fg">Uložit</strong> zapíše text na disk.{" "}
          {VYZVEDNE_SI_SAM} Druhé tlačítko navíc zapíše do auditu, že je text hotový.
        </p>
      </div>

      {/* Jedna fotka vpravo */}
      <div className="space-y-4 lg:border-l lg:border-line lg:pl-10">
        <div>
          <span className="label">Fotka zajímavosti</span>
          <p className="text-xs text-fg-muted -mt-1">
            Jedna fotka, na zařízení vpravo vedle textu. Nová nahraná ji nahradí. {SDILENE_HLASKA}
          </p>
        </div>

        <PhotoDropzone
          uploading={uploading}
          onFiles={upload}
          vice={false}
          popis="Jedna fotka (JPG nebo PNG), nová nahradí tu předchozí."
        />

        {fotka ? (
          <div className="group relative aspect-[4/3] max-w-sm rounded-lg overflow-hidden bg-canvas ring-1 ring-line">
            <img src={fotka} alt="Fotka zajímavosti" className="h-full w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-end bg-black/45 px-1.5 py-1 opacity-0 group-hover:opacity-100 transition">
              <button
                onClick={() => setSmazatFotku(true)}
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
            hint="Nahrajte jednu fotku k textu, na tabletu bude vpravo vedle něj."
          />
        )}
      </div>

      <Confirm
        open={smazatFotku}
        titulek="Smazat fotku?"
        text={<>Fotka se smaže z disku. Vrátit to nepůjde, bude ji potřeba nahrát znovu.</>}
        potvrdit="Smazat fotku"
        onPotvrdit={() => fotka && removeImage(fotka)}
        onZrusit={() => setSmazatFotku(false)}
      />
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

  // U jednoho snímku z dlouhé sekvence stačí lehčí potvrzení: krátká otázka
  // bez varování o nevratnosti (snímek se dá znovu nahrát z renderu).
  const [smazatSnimek, setSmazatSnimek] = useState<string | null>(null);

  async function removeFrame(url: string) {
    setSmazatSnimek(null);
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
        <p className="text-xs text-fg-muted -mt-1">
          {SDILENE_HLASKA} Sekvence fotek, jak se model otáčí, tablet mezi nimi přepíná. Vyberte všechny snímky
          najednou, seřadí se podle názvu souboru a uloží pod čísly{" "}
          <span className="font-mono">001.png</span>, <span className="font-mono">002.png</span>…
          Po smazání snímku se zbytek sám přečísluje, v sekvenci nezůstane díra.
        </p>
      </div>

      <PhotoDropzone uploading={uploading} onFiles={upload} />

      {slide.obrazky.length > 0 ? (
        <>
          <div className="text-xs text-fg-muted tnum">{pocetSnimku(slide.obrazky.length)} v sekvenci</div>
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
                    onClick={() => setSmazatSnimek(url)}
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
                {displayId} je <strong className="font-semibold text-fg">prázdný</strong>: na
                tabletu se místo modelu ukáže prázdné místo.
              </>
            ) : (
              <>
                Označí se jako hotový slide{" "}
                <strong className="font-semibold text-fg">3D model</strong> displeje {displayId}
                {", "}
                {pocetSnimku(slide.obrazky.length)}.
              </>
            ),
            onSend,
          )
        }
        className="btn-primary w-fit"
        disabled={busy}
      >
        <Send className="h-4 w-4" strokeWidth={1.75} /> Označit jako hotové
      </button>
      <p className="text-xs text-fg-muted">
        Snímky jsou uložené hned po nahrání. {VYZVEDNE_SI_SAM} Tlačítkem se do auditu zapíše, že
        je slide hotový.
      </p>

      <Confirm
        open={!!smazatSnimek}
        titulek="Smazat snímek?"
        text={
          <>
            Snímek <span className="font-mono">{smazatSnimek && nazevSouboru(smazatSnimek)}</span>{" "}
            se smaže a sekvence se přečísluje.
          </>
        }
        potvrdit="Smazat snímek"
        onPotvrdit={() => smazatSnimek && removeFrame(smazatSnimek)}
        onZrusit={() => setSmazatSnimek(null)}
      />
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
    // Limit hlídáme ještě před odesláním, ať kurátor nečeká na upload, který
    // server stejně utne (a nedostane jen obecné 413).
    if (file.size > NAHRAVANI_MAX_B) {
      toast.error(
        `Video má ${vMB(file.size)}, maximum je ${NAHRAVANI_MAX_MB} MB. Zmenšete ho a zkuste to znovu.`,
      );
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

  const [smazatVideo, setSmazatVideo] = useState(false);

  async function removeVideo() {
    setSmazatVideo(false);
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
              onClick={() => setSmazatVideo(true)}
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
          <p className="text-xs text-fg-muted">
            Klikněte a vyberte soubor. MP4 do {NAHRAVANI_MAX_MB} MB
          </p>
        </button>
      )}

      <Confirm
        open={smazatVideo}
        titulek="Smazat video?"
        text={
          <>
            Video se smaže z disku. Vrátit to nepůjde, bude ho potřeba nahrát znovu a znovu počkat
            na upload.
          </>
        }
        potvrdit="Smazat video"
        onPotvrdit={removeVideo}
        onZrusit={() => setSmazatVideo(false)}
      />
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
        <p className="text-xs text-fg-muted -mt-1">
          Jedno velké video na celou obrazovku tabletu. Formát MP4, uloží se hned po nahrání.
          {" "}{SDILENE_HLASKA}
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
                Označí se jako hotový slide{" "}
                <strong className="font-semibold text-fg">Video</strong> displeje {displayId},
                nahrané video na celou obrazovku.
              </>
            ) : (
              <>
                Slide <strong className="font-semibold text-fg">Video</strong> displeje {displayId}{" "}
                je <strong className="font-semibold text-fg">prázdný</strong>: na tabletu se místo
                videa ukáže prázdné místo.
              </>
            ),
            onSend,
          )
        }
        className="btn-primary w-fit"
        disabled={busy}
      >
        <Send className="h-4 w-4" strokeWidth={1.75} /> Označit jako hotové
      </button>
      <p className="text-xs text-fg-muted">
        Video je uložené hned po nahrání. {VYZVEDNE_SI_SAM} Tlačítkem se do auditu zapíše, že je
        slide hotový.
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
          <span className="font-semibold text-fg">AI slide.</span> Na disku je jen prázdná složka,
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
  cekaNaRevizi,
  jazyk,
  referenceCs,
  value,
  onChange,
  onPredvyplnit,
  onSave,
  saving,
  neulozeno,
  ulozenoCas,
}: {
  cekaNaRevizi: boolean;
  jazyk: Jazyk;
  referenceCs: string | null;
  value: string;
  onChange: (v: string) => void;
  onPredvyplnit: (v: string) => void; // šablona: není to zásah kurátora
  onSave: () => void;
  saving: boolean;
  neulozeno: boolean;
  ulozenoCas: string | null;
}) {
  const toast = useToast();
  const [template, setTemplate] = useState<string | null>(null);
  const [zbytkyOpen, setZbytkyOpen] = useState<string[] | null>(null);
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
    // Kostru předvyplňujeme jen v češtině: v překladu by se česká šablona
    // snadno uložila jako anglický text.
    if (jazyk !== "cs") return;
    if (template && prazdne && !prefilled.current) {
      prefilled.current = true;
      onPredvyplnit(template);
    }
  }, [template, prazdne, onPredvyplnit, jazyk]);

  // Před uložením zkontroluj, jestli v textu nezůstaly kusy šablony. Chatbot
  // by je vydával za fakta o druhu, takže na ně upozorníme, ale uložení
  // neblokujeme, kurátor může mít důvod.
  function ulozitSKontrolou() {
    const zbytky = zbytkySablony(value);
    if (zbytky.length > 0) {
      setZbytkyOpen(zbytky);
      return;
    }
    onSave();
  }

  function vlozitSablonu() {
    if (!template) return;
    if (!prazdne && !window.confirm("Přepsat současný text šablonou? Neuložené změny se ztratí.")) {
      return;
    }
    prefilled.current = true;
    onChange(template);
    toast.success("Kostra vložena. Doplňte text pod nadpisy a uložte.");
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-start gap-2.5 border-l-2 border-amber pl-4 py-1">
        <Sparkles className="h-5 w-5 text-amber shrink-0 mt-0.5" strokeWidth={1.75} />
        <div className="text-sm text-fg-muted">
          <span className="font-semibold text-fg">Znalostní báze displeje.</span> Edituje soubor
          kb.md v kořeni složky displeje. Není to slide, čte ji AI průvodce (chatbot) na tabletu.
          U nového druhu je předvyplněná kostra nadpisů; text pod ně dopište sami.
          {cekaNaRevizi && (
            <>
              {" "}
              <strong className="font-semibold text-fg">
                Tenhle text napsala AI a nikdo ho zatím nezkontroloval.
              </strong>{" "}
              Přečtěte ho celý, návštěvníkům se z něj odpovídá na dotazy o živém zvířeti. Až
              budete hotoví, schvalte ho tlačítkem nahoře u displeje; uložení textu samo o sobě
              za schválení neplatí.
            </>
          )}
        </div>
      </div>
      {/* Metodika je schválně mimo textové pole: co je v poli, to se uloží do
          kb.md a chatbot to vydá za fakta o druhu. */}
      <details className="rounded-lg border border-line bg-canvas px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-fg">
          Jak psát znalostní bázi (nápověda)
        </summary>
        <div className="mt-3 space-y-3">
          {KB_METODIKA.map((sekce) => (
            <div key={sekce.nadpis}>
              <div className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
                {sekce.nadpis}
              </div>
              <ul className="mt-1 space-y-1">
                {sekce.body.map((radek) => (
                  <li key={radek} className="flex gap-2 text-sm text-fg-muted">
                    <span className="text-fg-dim">•</span>
                    <span>{radek}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>

      {jazyk !== "cs" && !value.trim() && <CeskyOriginal text={referenceCs} />}

      <div>
        <div className="flex items-center justify-between gap-3">
          <label className="label">
            Znalostní báze ({jazyk === "cs" ? "kb.md" : `kb.${jazyk}.md`})
          </label>
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
        <button onClick={ulozitSKontrolou} className="btn-primary w-fit" disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" strokeWidth={1.75} />
          )}
          Uložit znalostní bázi
        </button>
        <StavUlozeni neulozeno={neulozeno} ulozenoCas={ulozenoCas} />
      </div>
      <p className="text-xs text-fg-muted">
        Znalostní bázi si načítá chatbot sám, na tablet nejde, proto tu druhé tlačítko není.
      </p>

      {/* Zbytky šablony v textu: chatbot je nerozliší od faktů o druhu. */}
      <Confirm
        open={!!zbytkyOpen}
        titulek="V textu zůstaly kusy šablony"
        text={
          <>
            Chatbot bere obsah kb.md jako fakta o tomhle druhu, takže by pokyny i ukázky
            vydával za pravdu. Našli jsme:
            <ul className="mt-2 list-disc space-y-0.5 pl-5">
              {zbytkyOpen?.map((z) => (
                <li key={z}>{z}</li>
              ))}
            </ul>
          </>
        }
        potvrdit="Uložit i tak"
        onPotvrdit={() => {
          setZbytkyOpen(null);
          onSave();
        }}
        onZrusit={() => setZbytkyOpen(null)}
      />
    </div>
  );
}
