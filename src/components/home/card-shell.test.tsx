import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CardShell } from "./card-shell";

const NOW = new Date("2026-11-09T10:00:00Z");
const render = (state: Parameters<typeof CardShell>[0]["state"], off?: { big: string; text: string; cta?: string }) =>
  renderToStaticMarkup(<CardShell<{ n: number }> title="Sonos" icon="spk" state={state as never} now={NOW} off={off} render={(d) => ({ pill: { text: "Spelar", tone: "ok" }, body: <p>värde {d.n}</p> })} />);

describe("CardShell lägen", () => {
  it("ok: data, pill från kortet och 'Uppdaterad'", () => {
    const h = render({ status: "ok", data: { n: 7 }, fetchedAt: "2026-11-09T09:59:00Z" });
    expect(h).toContain("värde 7");
    expect(h).toContain("Spelar");
    expect(h).toContain("Uppdaterad");
    expect(h).not.toContain("Gammal data");
  });
  it("stale: datan visas med gul pill 'Gammal data', inte röd 'Ej tillgänglig'", () => {
    const h = render({ status: "stale", data: { n: 7 }, fetchedAt: "2026-11-09T09:13:00Z", reason: "x" });
    expect(h).toContain("värde 7");
    expect(h).toContain('class="pill warn">Gammal data');
    expect(h).not.toContain("Ej tillgänglig");
    expect(h).toContain("Visar senast kända data");
  });
  it("unavailable: vänligt budskap, aldrig den tekniska orsaken i texten", () => {
    const h = render({ status: "unavailable", reason: "fetch failed" });
    expect(h).toContain("Tjänsten svarar inte just nu.");
    expect(h).toContain("Försöker igen om en stund.");
    expect(h).toMatch(/title="fetch failed"/);
    expect(h).not.toMatch(/>fetch failed</);
  });
  it("ej ansluten: kortets egna ord och knapp, annars standardtext", () => {
    const own = render({ status: "not_connected" }, { big: "Rummen", text: "Styr högtalarna i huset.", cta: "Anslut Sonos nu" });
    expect(own).toContain("Rummen");
    expect(own).toContain("Styr högtalarna i huset.");
    expect(own).toContain("Anslut Sonos nu");
    const dflt = render(undefined);
    expect(dflt).toContain(">Anslut<");
    expect(dflt).toContain("Visa Sonos här.");
    expect(dflt).toContain("Anslut Sonos</a>");
    expect(dflt).toContain('href="/installningar"');
  });
});
