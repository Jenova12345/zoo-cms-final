import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, MonitorPlay, Projector, ScrollText, TreePalm, LogOut } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useNeulozeno } from "../lib/neulozeno";
import { LogoMark } from "./Logo";
import Confirm from "./Confirm";

const NAV = [
  { to: "/dashboard", label: "Přehled", icon: LayoutDashboard },
  { to: "/displeje", label: "Displeje", icon: MonitorPlay },
  // Samostatný displej u deštného pralesa: prostředí pavilonu a odpočet do
  // bouřky, ne obsah druhu. Proto vlastní položka, ne řádek v Displejích.
  { to: "/prales", label: "Deštný prales", icon: TreePalm },
  // Ovládání videomappingu v pavilonu (OSC přes UDP), ne obsah displejů.
  { to: "/videomapping", label: "Videomapping", icon: Projector },
  { to: "/audit", label: "Audit log", icon: ScrollText },
];

export default function Layout() {
  const { username, setUsername } = useAuth();
  const navigate = useNavigate();
  // Odchod z rozdělané stránky: kam kurátor mířil, než jsme ho zastavili.
  // "__odhlasit" je zvláštní cíl, na konci odhlášení se stejně mění stránka.
  const { jeNeulozeno } = useNeulozeno();
  const [odchodNa, setOdchodNa] = useState<string | null>(null);

  function chraneny(cil: string) {
    return (e: { preventDefault: () => void }) => {
      if (!jeNeulozeno) return;
      e.preventDefault();
      setOdchodNa(cil);
    };
  }

  async function handleLogout() {
    try {
      await api.logout();
    } catch {
      // i tak odhlásíme lokálně
    }
    setUsername(null);
    navigate("/login");
  }

  const initials = (username ?? "?").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen flex">
      {/* Levý navigační sloupec */}
      <aside className="w-56 shrink-0 border-r border-line flex flex-col">
        <div className="h-16 flex items-center gap-2.5 px-6">
          <LogoMark size={30} />
          <span className="font-display text-[15px] font-bold tracking-tight text-fg">
            Amphibiárium
          </span>
        </div>

        <nav className="flex-1 px-3 pt-4 space-y-0.5">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={chraneny(to)}
              className={({ isActive }) =>
                `relative flex items-center gap-3 rounded-md pl-4 pr-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "text-accent font-semibold"
                    : "text-fg-muted font-medium hover:text-fg"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent" />
                  )}
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <button
          onClick={() => (jeNeulozeno ? setOdchodNa("__odhlasit") : handleLogout())}
          className="flex items-center gap-3 px-6 py-4 text-sm font-medium text-fg-muted hover:text-fg transition-colors"
        >
          <LogOut className="h-[18px] w-[18px]" strokeWidth={1.75} />
          Odhlásit
        </button>
      </aside>

      {/* Hlavní obsah */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 shrink-0 border-b border-line flex items-center justify-between px-9">
          <div className="flex items-center gap-2.5 text-fg-muted">
            <span className="dot-online" />
            <span className="text-sm">
              Pavilon Amphibiárium, ZOO Ostrava
              <span className="text-fg-dim"> · 37 displejů</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-sm font-semibold text-fg">{username ?? "Uživatel"}</div>
              <div className="text-[11px] text-fg-dim">Správce obsahu</div>
            </div>
            <div className="h-8 w-8 rounded-full bg-accent text-white grid place-items-center text-xs font-bold">
              {initials}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-9 py-10">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Rozepsané změny mizí i odchodem přes menu, ne jen zavřením okna. */}
      <Confirm
        open={!!odchodNa}
        titulek="Odejít bez uložení?"
        text={
          <>
            Na stránce máte rozepsané změny, které nejsou uložené. Když teď odejdete, přijdete
            o ně a vrátit to nepůjde.
          </>
        }
        potvrdit="Odejít bez uložení"
        onPotvrdit={() => {
          const cil = odchodNa;
          setOdchodNa(null);
          if (cil === "__odhlasit") void handleLogout();
          else if (cil) navigate(cil);
        }}
        onZrusit={() => setOdchodNa(null)}
      />
    </div>
  );
}
