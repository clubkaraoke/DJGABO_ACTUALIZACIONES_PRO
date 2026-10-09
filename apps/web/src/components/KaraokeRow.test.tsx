import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { KaraokeSummaryDTO } from "@djgabo/shared";
import * as authModule from "../lib/authContext";
import * as downloads from "../lib/secureDownloads";
import { KaraokeRow } from "./KaraokeRow";

vi.mock("../lib/secureDownloads", () => ({
  createKaraokeDownloadTicket: vi.fn(),
  openSecureDownload: vi.fn(),
}));

const karaoke: KaraokeSummaryDTO = {
  id: "kar_test", title: "Almohada Karaoke (Coro)", artist: "Majo Aguilar",
  code: "DJG-TEST", genre: null, year: 2026,
  format: "WAV", size: 60_000_000, coverUrl: null, collectionId: "col_test",
  hasPreview: false, demoAvailable: false, hasMaster: true,
  publishedAt: null, sourceGroup: "01_Club_Karaoke",
};
const member = {
  id: "usr_member", email: "vip@example.com", name: "VIP", avatarUrl: null,
  role: "MEMBER", status: "ACTIVE", plan: { id: "plan_anual", name: "Pro Anual" },
  subscriptionStart: null, subscriptionEnd: null, maxDevices: 2, devicesUsed: 0,
} as unknown as NonNullable<ReturnType<typeof authModule.useAuth>["user"]>;

function show(user: ReturnType<typeof authModule.useAuth>["user"], allowed: boolean, folder = vi.fn()) {
  vi.spyOn(authModule, "useAuth").mockReturnValue({
    user, loading: false, loginError: null, login: vi.fn(),
    vipInviteRegister: vi.fn(), logout: vi.fn(), refreshMe: vi.fn(),
  });
  render(
    <MemoryRouter>
      <table><tbody><KaraokeRow karaoke={karaoke} canDownloadCollection={allowed} onDownloadCollection={folder} /></tbody></table>
    </MemoryRouter>,
  );
  return folder;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("Commercial-only karaoke download button", () => {
  it("shows buttons without granting an individual ticket to a visitor", () => {
    show(null, false);
    expect(screen.getAllByRole("button", { name: /Descargar/i }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: /Descargar/i })[0]);
    expect(screen.getByRole("dialog")).toHaveTextContent("Acceso VIP requerido");
    expect(screen.getByText("Ver planes")).toBeInTheDocument();
    expect(downloads.createKaraokeDownloadTicket).not.toHaveBeenCalled();
  });
  it("sends an authorized VIP to download the complete folder, not a song", () => {
    const folder = show(member, true);
    fireEvent.click(screen.getAllByRole("button", { name: /Descargar/i })[0]);
    expect(screen.getByRole("dialog")).toHaveTextContent("Descarga por carpeta completa");
    fireEvent.click(screen.getByRole("button", { name: "Descargar carpeta completa" }));
    expect(folder).toHaveBeenCalledOnce();
    expect(downloads.createKaraokeDownloadTicket).not.toHaveBeenCalled();
  });
  it("does not offer a folder download when the VIP plan excludes it", () => {
    show(member, false);
    fireEvent.click(screen.getAllByRole("button", { name: /Descargar/i })[0]);
    expect(screen.queryByRole("button", { name: "Descargar carpeta completa" })).toBeNull();
    expect(screen.getByRole("dialog")).toHaveTextContent("no está habilitada");
    expect(downloads.createKaraokeDownloadTicket).not.toHaveBeenCalled();
  });
});
