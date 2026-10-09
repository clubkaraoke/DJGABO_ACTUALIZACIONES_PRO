import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { RequireAuth, RequireAdmin } from "./RouteGuards";
import * as authModule from "../lib/authContext";

function renderWithAuth(mockAuth: Partial<ReturnType<typeof authModule.useAuth>>, initialPath: string) {
  vi.spyOn(authModule, "useAuth").mockReturnValue({
    user: null,
    loading: false,
    loginError: null,
    login: vi.fn(),
    vipInviteRegister: vi.fn(),
    logout: vi.fn(),
    refreshMe: vi.fn(),
    ...mockAuth,
  });

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>Pantalla de login</div>} />
        <Route path="/" element={<div>Home del cliente</div>} />
        <Route element={<RequireAuth />}>
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<div>Panel admin</div>} />
          </Route>
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("RouteGuards", () => {
  it("sin sesión, /admin redirige a /login", () => {
    renderWithAuth({ user: null }, "/admin");
    expect(screen.getByText("Pantalla de login")).toBeInTheDocument();
  });

  it("un MEMBER autenticado que visita /admin es redirigido al home del cliente, no ve el panel", () => {
    renderWithAuth(
      { user: { id: "1", email: "m@test.com", name: "M", avatarUrl: null, role: "MEMBER", status: "ACTIVE", plan: null, subscriptionStart: null, subscriptionEnd: null, maxDevices: 2, devicesUsed: 0 } },
      "/admin",
    );
    expect(screen.getByText("Home del cliente")).toBeInTheDocument();
    expect(screen.queryByText("Panel admin")).not.toBeInTheDocument();
  });

  it("un ADMIN autenticado sí ve el panel admin", () => {
    renderWithAuth(
      { user: { id: "2", email: "a@test.com", name: "A", avatarUrl: null, role: "ADMIN", status: "ACTIVE", plan: null, subscriptionStart: null, subscriptionEnd: null, maxDevices: 2, devicesUsed: 0 } },
      "/admin",
    );
    expect(screen.getByText("Panel admin")).toBeInTheDocument();
  });
});
