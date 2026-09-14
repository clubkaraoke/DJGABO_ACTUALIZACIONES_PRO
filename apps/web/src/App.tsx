import { Routes, Route, Navigate } from "react-router-dom";
import { RequireAuth, RequireAdmin } from "./components/RouteGuards";
import { AdminShell } from "./components/AdminShell";
import LoginPage from "./pages/LoginPage";
import HomePage from "./pages/HomePage";
import CollectionDetailPage from "./pages/CollectionDetailPage";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import AdminClientsPage from "./pages/admin/AdminClientsPage";
import AdminClientDetailPage from "./pages/admin/AdminClientDetailPage";
import AdminPlansPage from "./pages/admin/AdminPlansPage";
import AdminCollectionsPage from "./pages/admin/AdminCollectionsPage";
import AdminKaraokesPage from "./pages/admin/AdminKaraokesPage";
import AdminDownloadsPage from "./pages/admin/AdminDownloadsPage";
import AdminSyncPage from "./pages/admin/AdminSyncPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/colecciones/:id" element={<CollectionDetailPage />} />

        <Route element={<RequireAdmin />}>
          <Route path="/admin" element={<AdminShell />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="clientes" element={<AdminClientsPage />} />
            <Route path="clientes/:id" element={<AdminClientDetailPage />} />
            <Route path="planes" element={<AdminPlansPage />} />
            <Route path="colecciones" element={<AdminCollectionsPage />} />
            <Route path="karaokes" element={<AdminKaraokesPage />} />
            <Route path="descargas" element={<AdminDownloadsPage />} />
            <Route path="sincronizacion" element={<AdminSyncPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
