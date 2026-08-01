import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, STORAGE_KEY } from "./api";

interface AuthApi {
  username: string | null;
  ready: boolean;
  setUsername: (name: string | null) => void;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsernameState] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY),
  );
  const [ready, setReady] = useState(false);

  // Sjednotíme stav s cookie na serveru (po refreshi stránky).
  useEffect(() => {
    let active = true;
    api
      .me()
      .then((res) => {
        if (!active) return;
        if (res.username) {
          setUsernameState(res.username);
          localStorage.setItem(STORAGE_KEY, res.username);
        } else {
          setUsernameState(null);
          localStorage.removeItem(STORAGE_KEY);
        }
      })
      .catch(() => {})
      .finally(() => active && setReady(true));
    return () => {
      active = false;
    };
  }, []);

  const setUsername = (name: string | null) => {
    setUsernameState(name);
    if (name) localStorage.setItem(STORAGE_KEY, name);
    else localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <AuthContext.Provider value={{ username, ready, setUsername }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth musí být uvnitř AuthProvider");
  return ctx;
}
