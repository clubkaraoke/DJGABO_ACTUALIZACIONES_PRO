import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PackagesPage from "./PackagesPage";

vi.mock("../components/VipShell",()=>({VipShell:({children}:{children:React.ReactNode})=><main>{children}</main>}));

describe("Packages that include VIP access",()=>{
  it("shows VIP bonuses from the configured semestral/annual plan, not fixed copy",()=>{
    const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:60000}}});
    client.setQueryData(["public","plan-offers"],[
      {slug:"pro-mensual",freeRequestsPerMonth:1},
      {slug:"pro-semestral",freeRequestsPerMonth:2},
      {slug:"pro-anual",freeRequestsPerMonth:5}
    ]);
    render(<QueryClientProvider client={client}><PackagesPage/></QueryClientProvider>);
    expect(screen.getByText("2 karaokes a pedido GRATIS al mes")).toBeInTheDocument();
    expect(screen.getByText("5 karaokes a pedido GRATIS al mes")).toBeInTheDocument();
    expect(screen.queryByText("15 karaokes a pedido por mes")).not.toBeInTheDocument();
  });
});
