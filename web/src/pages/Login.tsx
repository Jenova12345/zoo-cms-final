import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../components/Toast";
import { LogoMark } from "../components/Logo";

export default function Login() {
  const [username, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { setUsername } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      toast.error("Vyplňte přihlašovací jméno i heslo.");
      return;
    }
    setBusy(true);
    try {
      // Heslo se záměrně neořezává, mezera na kraji je jeho součástí.
      const res = await api.login(username.trim(), password);
      setUsername(res.username);
      navigate("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Přihlášení selhalo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3">
          <LogoMark size={44} />
          <div>
            <div className="font-display text-lg font-bold tracking-tight text-fg">Amphibiárium</div>
            <div className="text-xs text-fg-muted">Vzdálený přístup · ZOO Ostrava</div>
          </div>
        </div>

        <h1 className="mt-10 font-display text-2xl font-bold tracking-tight text-fg">Přihlášení</h1>
        <p className="mt-1.5 text-sm text-fg-muted">Správa obsahu displejů pavilonu.</p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
          <div>
            <label className="label">Přihlašovací jméno</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="napr. spravce"
              autoFocus
            />
          </div>
          <div>
            <label className="label">Heslo</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" strokeWidth={1.75} />}
            Přihlásit se
          </button>
        </form>

        <p className="mt-6 text-xs text-fg-dim border-t border-line pt-5">
          Přístup zřizuje správce systému.
        </p>
      </div>
    </div>
  );
}
