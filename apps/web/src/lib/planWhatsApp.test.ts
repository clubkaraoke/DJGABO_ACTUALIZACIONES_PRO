import { describe,it,expect } from "vitest";
import { planSubscriptionWhatsappUrl } from "./planWhatsApp";
describe("WhatsApp plans are always based on live admin prices",()=>{
 it("creates a link to the configured DJGABO number with dynamic plan and price",()=>{
   const url=new URL(planSubscriptionWhatsappUrl({name:"1 AÑO",price:"219.99"}));
   expect(url.origin).toBe("https://wa.me");
   expect(url.pathname).toBe("/51921675846");
   expect(url.searchParams.get("text")).toContain("1 AÑO (US$219.99)");
   expect(url.searchParams.get("text")).toContain("pago");
 });
});
