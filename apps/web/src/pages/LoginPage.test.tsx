import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LoginPage from "./LoginPage";
import * as authModule from "../lib/authContext";

describe("LoginPage", () => {
  it("llama a login con el email y contraseña ingresados al enviar el formulario", async () => {
    const login = vi.fn().mockResolvedValue(true);
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      user: null,
      loading: false,
      loginError: null,
      login,
      logout: vi.fn(),
      refreshMe: vi.fn(),
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/correo electrónico/i), { target: { value: "carlos@demo.com" } });
    fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: "Djgabo2026!" } });
    fireEvent.click(screen.getByRole("button", { name: /ingresar/i }));

    await waitFor(() => expect(login).toHaveBeenCalledWith("carlos@demo.com", "Djgabo2026!"));
  });

  it("muestra el mensaje de error cuando loginError está presente", () => {
    vi.spyOn(authModule, "useAuth").mockReturnValue({
      user: null,
      loading: false,
      loginError: "Tu cuenta está suspendida.",
      login: vi.fn(),
      logout: vi.fn(),
      refreshMe: vi.fn(),
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Tu cuenta está suspendida.");
  });
});
