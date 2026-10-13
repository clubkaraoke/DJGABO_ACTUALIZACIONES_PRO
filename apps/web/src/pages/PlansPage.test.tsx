import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PlansPage from "./PlansPage";

vi.mock("../components/VipShell", () => ({
  VipShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

describe("VIP published pricing and free karaoke request benefits", () => {
  it("shows the three approved prices, up to 180 orders yearly and download limits note", () => {
    render(<MemoryRouter><PlansPage /></MemoryRouter>);
    expect(screen.getByText("$59.99")).toBeInTheDocument();
    expect(screen.getByText("$149.99")).toBeInTheDocument();
    expect(screen.getByText("$189.99")).toBeInTheDocument();
    expect(screen.getByText("3 karaokes a pedido GRATIS")).toBeInTheDocument();
    expect(screen.getByText("5 karaokes a pedido GRATIS cada mes")).toBeInTheDocument();
    expect(screen.getByText("15 karaokes a pedido GRATIS cada mes")).toBeInTheDocument();
    expect(screen.getByText(/Hasta 180 karaokes a pedido GRATIS/)).toBeInTheDocument();
    expect(screen.getByText(/2 por carpeta al día/)).toBeInTheDocument();
  });
});
