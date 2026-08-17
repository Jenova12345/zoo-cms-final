import { useEffect, useRef, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

// Potvrzení nevratné akce (mazání slidu, fotky, videa). Záměrně vlastní dialog
// místo window.confirm: kurátor má vidět srozumitelnou českou hlášku ve stylu
// zbytku CMS, ne systémové okno prohlížeče s adresou.
//
// Escape a klik do pozadí = zrušit. Výchozí fokus je na „Zrušit", ať se
// nevratná akce nedá odklepnout omylem klávesou Enter.
export default function Confirm({
  open,
  titulek,
  text,
  potvrdit = "Smazat",
  onPotvrdit,
  onZrusit,
}: {
  open: boolean;
  titulek: string;
  text: ReactNode;
  potvrdit?: string;
  onPotvrdit: () => void;
  onZrusit: () => void;
}) {
  const zrusitRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    zrusitRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onZrusit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onZrusit]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-fg/25 px-4"
      onClick={onZrusit}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulek}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-cardHover animate-fadeIn"
      >
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-danger-soft">
            <AlertTriangle className="h-5 w-5 text-danger" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold text-fg">{titulek}</h2>
            <div className="mt-1.5 text-sm text-fg-muted">{text}</div>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button ref={zrusitRef} onClick={onZrusit} className="btn-ghost">
            Zrušit
          </button>
          <button onClick={onPotvrdit} className="btn-danger">
            {potvrdit}
          </button>
        </div>
      </div>
    </div>
  );
}
