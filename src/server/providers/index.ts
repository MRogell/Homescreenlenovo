import { getAccessToken, getConnectionStatus } from "../connections";
import { demoProviders } from "./demo";
import { createSonosProvider } from "./sonos";
import { createSpotifyProvider } from "./spotify";
import type { Provider, ProviderId } from "./types";

const sonos = createSonosProvider({ getToken: () => getAccessToken("sonos"), isConnected: async () => (await getConnectionStatus("sonos")) === "ok" });
const spotify = createSpotifyProvider({ getToken: () => getAccessToken("spotify"), isConnected: async () => (await getConnectionStatus("spotify")) === "ok" });

const ALL: Record<ProviderId, Provider<unknown>> = { ...demoProviders, sonos: sonos as Provider<unknown>, spotify: spotify as Provider<unknown> };
export const PROVIDERS: Provider<unknown>[] = (["skoda", "sonos", "spotify", "plejd", "tado", "tapo", "aeg", "arlo"] as const).map((id) => ALL[id]);
export { demoProviders };
