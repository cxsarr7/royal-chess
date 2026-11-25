import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { AuthProvider } from "./lib/auth";
import { LiveProvider } from "./lib/live";
import { Analyze, AnalyzeGame } from "./pages/Analyze";
import { LoginPage, RecoverPage, RegisterPage } from "./pages/AuthPages";
import { Dashboard } from "./pages/Dashboard";
import { Friends } from "./pages/Friends";
import { Game } from "./pages/Game";
import { Landing } from "./pages/Landing";
import { Play } from "./pages/Play";
import { Profile } from "./pages/Profile";
import { Ranking } from "./pages/Ranking";
import { Settings } from "./pages/Settings";

export function App() {
  return (
    <AuthProvider>
      <LiveProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/entrar" element={<LoginPage />} />
            <Route path="/cadastro" element={<RegisterPage />} />
            <Route path="/recuperar" element={<RecoverPage />} />
            <Route element={<Shell />}>
              <Route path="/painel" element={<Dashboard />} />
              <Route path="/jogar" element={<Play />} />
              <Route path="/jogar/partida/:id" element={<Game />} />
              <Route path="/analisar" element={<Analyze />} />
              <Route path="/analisar/:id" element={<AnalyzeGame />} />
              <Route path="/ranking" element={<Ranking />} />
              <Route path="/amigos" element={<Friends />} />
              <Route path="/perfil" element={<Profile />} />
              <Route path="/perfil/:publicId" element={<Profile />} />
              <Route path="/configuracoes" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </LiveProvider>
    </AuthProvider>
  );
}
