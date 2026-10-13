import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAdmin, RequireAuth } from "./components/RouteGuards";
import { AdminShell } from "./components/AdminShell";
import LoginPage from "./pages/LoginPage";
import VipInvitePage from "./pages/VipInvitePage";
import ActivateManualClientPage from "./pages/ActivateManualClientPage";
import AdminNewClientPage from "./pages/admin/AdminNewClientPage";
import HomePage from "./pages/HomePage";
import UpdatesPage from "./pages/UpdatesPage";
import CollectionDetailPage from "./pages/CollectionDetailPage";
import PackagesPage from "./pages/PackagesPage";
import PlansPage from "./pages/PlansPage";
import OrderPage from "./pages/OrderPage";
import SearchPage from "./pages/SearchPage";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import AdminClientsPage from "./pages/admin/AdminClientsPage";
import AdminClientDetailPage from "./pages/admin/AdminClientDetailPage";
import AdminPlansPage from "./pages/admin/AdminPlansPage";
import AdminVipInvitationsPage from "./pages/admin/AdminVipInvitationsPage";
import AdminCollectionsPage from "./pages/admin/AdminCollectionsPage";
import AdminKaraokesPage from "./pages/admin/AdminKaraokesPage";
import AdminDownloadsPage from "./pages/admin/AdminDownloadsPage";
import AdminRequestsPage from "./pages/admin/AdminRequestsPage";
import AdminSyncPage from "./pages/admin/AdminSyncPage";
import AdminDemoPlayerPage from "./pages/admin/AdminDemoPlayerPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/acceso-vip/:inviteCode" element={<VipInvitePage />} />
      <Route path="/activar-cuenta" element={<ActivateManualClientPage />} />

      {/* Web pública: catálogo completo visible sin login. */}
      <Route path="/" element={<Navigate to="/panel" replace />} />
      <Route path="/panel" element={<HomePage />} />
      <Route path="/panel/actualizaciones" element={<UpdatesPage />} />
      <Route path="/panel/actualizaciones/:id" element={<CollectionDetailPage />} />
      <Route path="/panel/paquetes" element={<PackagesPage />} />
      <Route path="/panel/a-pedido" element={<OrderPage />} />
      <Route path="/panel/buscar" element={<SearchPage />} />
      <Route path="/planes" element={<PlansPage />} />

      {/* Admin sigue protegido por sesión + rol. */}
      <Route element={<RequireAuth />}>
        <Route element={<RequireAdmin />}>
          <Route path="/admin" element={<AdminShell />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="clientes" element={<AdminClientsPage />} />
            <Route path="clientes/nuevo" element={<AdminNewClientPage />} />
            <Route path="clientes/:id" element={<AdminClientDetailPage />} />
            <Route path="pedidos" element={<AdminRequestsPage />} />
            <Route path="planes" element={<AdminPlansPage />} />
            <Route path="invitaciones" element={<AdminVipInvitationsPage />} />
            <Route path="colecciones" element={<AdminCollectionsPage />} />
            <Route path="karaokes" element={<AdminKaraokesPage />} />
            <Route path="descargas" element={<AdminDownloadsPage />} />
            <Route path="reproductor" element={<AdminDemoPlayerPage />} />
            <Route path="sincronizacion" element={<AdminSyncPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/panel" replace />} />
    </Routes>
  );
}
