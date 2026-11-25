import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import type { Preferences, User } from "./types";

type AuthState = {
  user: User | null;
  preferences: Preferences | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setSession: (user: User, preferences?: Preferences | null) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const data = await api<{ user: User | null; preferences?: Preferences }>("/api/auth/me");
    setUser(data.user);
    setPreferences(data.preferences ?? null);
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        preferences,
        loading,
        refresh,
        setSession: (next, prefs) => {
          setUser(next);
          if (prefs) setPreferences(prefs);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("Auth ausente");
  return value;
}
