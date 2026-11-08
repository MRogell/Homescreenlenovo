import "server-only";
import { sameOrigin } from "./connect-flow";
import { getAccessToken } from "./connections";
import { SONOS_API } from "./providers/sonos";

// Läser bara (inga kommandon). Ger en ärlig bild av vad som fungerar mot tjänsten just nu.
export interface DiagStep {
  name: string;
  ok: boolean;
  detail: string;
}
export interface Diagnosis {
  ok: boolean;
  steps: DiagStep[];
}
export interface DiagDeps {
  getToken: () => Promise<string>;
  fetchFn?: typeof fetch;
}

const SPOTIFY_API = "https://api.spotify.com/v1";
const done = (steps: DiagStep[]): Diagnosis => ({ ok: steps.every((s) => s.ok), steps });

/** Steg 1 för alla tjänster: går det att få en giltig token? Annars stannar testet här. */
async function tokenStep(service: string, getToken: () => Promise<string>): Promise<{ step: DiagStep; token?: string }> {
  try {
    return { step: { name: "Inloggning", ok: true, detail: `${service} är ansluten och inloggningen gäller.` }, token: await getToken() };
  } catch (e) {
    const reconnect = e instanceof Error && e.name === "ReauthRequired";
    return { step: { name: "Inloggning", ok: false, detail: reconnect ? `Anslutningen till ${service} behöver göras om: tryck Anslut igen.` : `Det gick inte att hämta inloggningen till ${service}.` } };
  }
}

type Got = { status: number; json: unknown } | null;

async function getJson(url: string, token: string, fetchFn: typeof fetch): Promise<Got> {
  try {
    const res = await fetchFn(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    let json: unknown = null;
    if (res.status !== 204) {
      try {
        json = await res.json();
      } catch {
        // Inte JSON.
      }
    }
    return { status: res.status, json };
  } catch {
    return null;
  }
}

const obj = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export async function diagnoseSpotify(deps: DiagDeps): Promise<Diagnosis> {
  const fetchFn = deps.fetchFn ?? fetch;
  const t = await tokenStep("Spotify", deps.getToken);
  if (!t.token) return done([t.step]);
  const steps: DiagStep[] = [t.step];

  const player = await getJson(`${SPOTIFY_API}/me/player`, t.token, fetchFn);
  if (!player) steps.push({ name: "Spotify svarar", ok: false, detail: "Nådde inte Spotify. Försök igen om en stund." });
  else if (player.status === 204) steps.push({ name: "Spotify svarar", ok: true, detail: "Spotify svarar. Ingen enhet är aktiv just nu (det är normalt när inget spelas)." });
  else if (player.status === 200) {
    const p = obj(player.json);
    const device = typeof obj(p?.device)?.name === "string" ? (obj(p?.device)!.name as string) : null;
    steps.push({ name: "Spotify svarar", ok: true, detail: `Spotify svarar. ${p?.is_playing === true ? "Spelar" : "Pausad"}${device ? ` på ${device}` : ""}.` });
  } else if (player.status === 401) steps.push({ name: "Spotify svarar", ok: false, detail: "Spotify godkände inte inloggningen: tryck Anslut igen." });
  else if (player.status === 403) steps.push({ name: "Spotify svarar", ok: false, detail: "Spotify nekade åtkomst. Kontrollera att ditt konto är tillagt under User Management i Spotify-appen, och att du har Premium." });
  else if (player.status === 429) steps.push({ name: "Spotify svarar", ok: false, detail: "Spotify begränsar anropen just nu. Vänta en stund." });
  else steps.push({ name: "Spotify svarar", ok: false, detail: `Spotify svarade oväntat (${player.status}).` });

  const list = await getJson(`${SPOTIFY_API}/me/player/devices`, t.token, fetchFn);
  if (!list || list.status !== 200) steps.push({ name: "Enheter", ok: false, detail: list ? `Enhetslistan gav fel (${list.status}).` : "Nådde inte Spotify för enhetslistan." });
  else {
    const devices = (Array.isArray(obj(list.json)?.devices) ? (obj(list.json)!.devices as unknown[]) : []).map(obj).filter((d): d is Record<string, unknown> => !!d && typeof d.name === "string");
    const restricted = devices.filter((d) => d.is_restricted === true || typeof d.id !== "string" || !d.id);
    const controllable = devices.length - restricted.length;
    const nameList = devices.map((d) => `${d.name}${restricted.includes(d) ? " (begränsad)" : ""}`).join(", ");
    steps.push({
      name: "Enheter",
      ok: true,
      detail: devices.length === 0
        ? "Spotify visar inga enheter just nu. Öppna Spotify-appen på telefonen eller datorn och försök igen."
        : `${plural(devices.length, "enhet", "enheter")}: ${plural(controllable, "styrbar", "styrbara")}, ${plural(restricted.length, "begränsad", "begränsade")}. ${nameList}`,
    });
  }
  return done(steps);
}

export async function diagnoseSonos(deps: DiagDeps): Promise<Diagnosis> {
  const fetchFn = deps.fetchFn ?? fetch;
  const t = await tokenStep("Sonos", deps.getToken);
  if (!t.token) return done([t.step]);
  const steps: DiagStep[] = [t.step];

  const homes = await getJson(`${SONOS_API}/households`, t.token, fetchFn);
  const household = Array.isArray(obj(homes?.json)?.households) ? obj((obj(homes!.json)!.households as unknown[])[0])?.id : undefined;
  if (!homes) steps.push({ name: "Hushåll", ok: false, detail: "Nådde inte Sonos. Försök igen om en stund." });
  else if (homes.status === 401) steps.push({ name: "Hushåll", ok: false, detail: "Sonos godkände inte inloggningen: tryck Anslut igen." });
  else if (homes.status !== 200) steps.push({ name: "Hushåll", ok: false, detail: `Sonos svarade oväntat (${homes.status}).` });
  else if (typeof household !== "string") steps.push({ name: "Hushåll", ok: false, detail: "Sonos hittar inget hushåll på kontot. Kontrollera att du loggade in med det Sonos-konto som högtalarna är kopplade till." });
  else {
    steps.push({ name: "Hushåll", ok: true, detail: "Sonos-hushållet hittades." });
    const groups = await getJson(`${SONOS_API}/households/${encodeURIComponent(household)}/groups`, t.token, fetchFn);
    if (!groups || groups.status !== 200) steps.push({ name: "Rum", ok: false, detail: groups ? `Rumslistan gav fel (${groups.status}).` : "Nådde inte Sonos för rumslistan." });
    else {
      const rooms = (Array.isArray(obj(groups.json)?.groups) ? (obj(groups.json)!.groups as unknown[]) : []).map(obj).filter((g): g is Record<string, unknown> => !!g && typeof g.name === "string");
      steps.push({
        name: "Rum",
        ok: true,
        detail: rooms.length === 0 ? "Inga rum hittades. Kontrollera att högtalarna är påslagna och på samma nät." : `${plural(rooms.length, "rum", "rum")}: ${rooms.map((g) => g.name).join(", ")}.`,
      });
    }
  }
  return done(steps);
}

export interface DiagnoseRequest {
  provider: string;
  origin: string | null;
  host: string | null;
  userId: string | null;
}

/** Ordning: tjänst, session, Origin, och först därefter något anrop. */
export async function handleDiagnose(req: DiagnoseRequest, deps: Partial<DiagDeps> = {}): Promise<{ status: number; json: Diagnosis | { error: string } }> {
  if (req.provider !== "spotify" && req.provider !== "sonos") return { status: 404, json: { error: "Okänd tjänst" } };
  if (!req.userId) return { status: 401, json: { error: "Inte inloggad" } };
  if (!sameOrigin(req.origin, req.host)) return { status: 403, json: { error: "Ogiltigt ursprung" } };
  const d: DiagDeps = { getToken: deps.getToken ?? (() => getAccessToken(req.provider as "spotify" | "sonos")), fetchFn: deps.fetchFn };
  return { status: 200, json: await (req.provider === "spotify" ? diagnoseSpotify(d) : diagnoseSonos(d)) };
}
