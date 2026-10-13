import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import PlansPage from "./PlansPage";

vi.mock("../components/VipShell", () => ({
  VipShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

describe("VIP public prices, always from Admin source", () => {
  it("renders live plan counts and prices instead of obsolete hardcoded benefits", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60000 } } });
    client.setQueryData(["public", "plan-offers"], [
      { slug: "pro-mensual", title: "1 MES", price: "59.99", period: "/ mes", description: "Renueva tu karaoke", items: ["Elige 3 actualizaciones de 2026", "1 karaoke a pedido GRATIS cada mes"], annualBonus: null, freeRequestsPerMonth: 1 },
      { slug: "pro-semestral", title: "6 MESES", price: "149.99", period: "/ 6 meses", description: "Novedades VIP", items: ["Acceso Carpeta VIP 2026", "2 karaokes a pedido GRATIS cada mes"], annualBonus: null, freeRequestsPerMonth: 2 },
      { slug: "pro-anual", title: "1 AÑO", price: "189.99", period: "/ año", description: "Todas nuestras Actualizaciones VIP", items: ["Acceso Carpeta VIP 2026 - 2012", "5 karaokes a pedido GRATIS cada mes"], annualBonus: "¡Hasta 60 karaokes a pedido GRATIS durante tu año VIP!", freeRequestsPerMonth: 5 },
    ]);
    render(<QueryClientProvider client={client}><MemoryRouter><PlansPage /></MemoryRouter></QueryClientProvider>);
    expect(screen.getByText("$59.99")).toBeInTheDocument();
    expect(screen.getByText("$149.99")).toBeInTheDocument();
    expect(screen.getByText("$189.99")).toBeInTheDocument();
    expect(screen.getByText("1 karaoke a pedido GRATIS cada mes")).toBeInTheDocument();
    expect(screen.getByText("2 karaokes a pedido GRATIS cada mes")).toBeInTheDocument();
    expect(screen.getByText("5 karaokes a pedido GRATIS cada mes")).toBeInTheDocument();
    expect(screen.getByText(/Hasta 60 karaokes a pedido GRATIS/)).toBeInTheDocument();
    expect(screen.queryByText(/Hasta 180 karaokes/)).not.toBeInTheDocument();
    expect(screen.getByText(/2 por carpeta al día/)).toBeInTheDocument();
  });
});
