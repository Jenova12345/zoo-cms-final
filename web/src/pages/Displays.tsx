import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ImageOff, Loader2, Search, Sparkles } from "lucide-react";
import { api, formatDateTime } from "../lib/api";
import { NEPRIRAZENO, type DisplaySummary } from "../lib/types";

export default function Displays() {
  const [displays, setDisplays] = useState<DisplaySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    api
      .displays()
      .then(setDisplays)
      .catch((e) => setError(e instanceof Error ? e.message : "Načtení selhalo."));
  }, []);

  const filtered = displays?.filter((d) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return d.id.includes(q) || d.druh.toLowerCase().includes(q);
  });

  const prirazenoCount = displays?.filter((d) => d.druh !== NEPRIRAZENO).length ?? 0;
  const kRevizi = displays?.filter((d) => d.cekaNaRevizi).length ?? 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-fg">Displeje</h1>
          <p className="text-sm text-fg-muted mt-1.5">
            {displays
              ? `${displays.length} displejů, ${prirazenoCount} přiřazeno. Obsah se ukládá přímo na disk.`
              : "Obsah se ukládá přímo na disk."}
          </p>
          {kRevizi > 0 && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-amber-deep">
              <Sparkles className="h-4 w-4" strokeWidth={1.75} />
              {kRevizi === 1
                ? "1 druh čeká na revizi textů od AI"
                : `${kRevizi} druhů čeká na revizi textů od AI`}
            </p>
          )}
        </div>
        <div className="relative">
          <Search className="h-4 w-4 text-fg-dim absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.75} />
          <input
            className="input pl-9 w-64"
            placeholder="Hledat číslo nebo druh"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {error && <div className="text-sm text-danger">{error}</div>}

      {!displays && !error && (
        <div className="grid place-items-center py-20 text-fg-dim">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {filtered && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-8">
          {filtered.map((d) => {
            const prirazeno = d.druh !== NEPRIRAZENO;
            return (
              <Link key={d.id} to={`/displeje/${d.id}`} className="group">
                <div className="relative aspect-[4/3] rounded-lg overflow-hidden bg-canvas">
                  {d.thumbnail ? (
                    <img
                      src={d.thumbnail}
                      alt={d.druh}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                    />
                  ) : (
                    <div className="h-full w-full grid place-items-center text-fg-dim/60 border border-dashed border-line rounded-lg">
                      <ImageOff className="h-6 w-6" strokeWidth={1.5} />
                    </div>
                  )}
                  {/* AI koncept z hromadného importu — kurátor ho ještě neviděl. */}
                  {d.cekaNaRevizi && (
                    <span className="absolute left-2 top-2 chip bg-amber-soft text-amber-deep shadow-card">
                      <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
                      čeká na revizi
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-xs font-bold text-fg-dim tnum">
                        {d.id.padStart(2, "0")}
                      </span>
                      <span
                        className={`text-sm font-semibold truncate ${
                          prirazeno
                            ? "text-fg group-hover:text-accent transition-colors"
                            : "text-fg-dim italic font-normal"
                        }`}
                      >
                        {d.druh}
                      </span>
                    </div>
                    <div className="text-[11px] text-fg-dim mt-0.5 tnum">
                      {formatDateTime(d.posledniZmena)}
                    </div>
                  </div>
                  <span
                    className={`mt-1 shrink-0 ${d.stav === "online" ? "dot-online" : "dot-offline"}`}
                    title={d.stav}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
