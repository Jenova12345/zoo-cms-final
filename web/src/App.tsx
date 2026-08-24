import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Displays from "./pages/Displays";
import DisplayDetail from "./pages/DisplayDetail";
import Prales from "./pages/Prales";
import Tablet from "./pages/Tablet";
import Audit from "./pages/Audit";

function Protected({ children }: { children: React.ReactNode }) {
  const { username, ready } = useAuth();
  if (!ready) {
    return (
      <div className="min-h-screen grid place-items-center text-fg-dim text-sm">Načítám…</div>
    );
  }
  if (!username) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Náhled tabletu je veřejný (to vidí návštěvník u displeje). */}
      <Route path="/tablet/:id" element={<Tablet />} />

      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/displeje" element={<Displays />} />
        <Route path="/displeje/:id" element={<DisplayDetail />} />
        <Route path="/prales" element={<Prales />} />
        <Route path="/audit" element={<Audit />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
