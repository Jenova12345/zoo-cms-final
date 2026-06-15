import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";

type ToastKind = "success" | "error";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = ++counter;
      setToasts((prev) => [...prev, { id, kind, message }]);
      setTimeout(() => remove(id), 3500);
    },
    [remove],
  );

  const apiValue: ToastApi = {
    success: (m) => push("success", m),
    error: (m) => push("error", m),
  };

  return (
    <ToastContext.Provider value={apiValue}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2.5">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-3 rounded-xl bg-elevated px-4 py-3 shadow-cardHover border min-w-[260px] animate-fadeIn ${
              t.kind === "success" ? "border-accent/30" : "border-danger/40"
            }`}
            role="status"
          >
            {t.kind === "success" ? (
              <CheckCircle2 className="h-5 w-5 text-accent shrink-0" strokeWidth={1.75} />
            ) : (
              <AlertCircle className="h-5 w-5 text-danger shrink-0" strokeWidth={1.75} />
            )}
            <span className="text-sm font-medium text-fg flex-1">{t.message}</span>
            <button
              onClick={() => remove(t.id)}
              className="text-fg-dim hover:text-fg"
              aria-label="Zavřít"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast musí být uvnitř ToastProvider");
  return ctx;
}
