import "server-only";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { sameOrigin } from "./connect-flow";
import { getAccessToken, ReauthRequired } from "./connections";
import { db as defaultDb } from "./db";
import { getSpotifyDefaultDevice, type DefaultDevice } from "./spotify-prefs";
import { ControlError, SPOTIFY_ACTIONS, controlSpotify, listSpotifyDevices, transferSpotify, type ControlErrorCode, type SpotifyAction, type SpotifyDevice } from "./providers/spotify-control";

export interface ControlRequest {
  provider: string;
  body: unknown;
  origin: string | null;
  host: string | null;
  /** Null när ingen giltig session finns. */
  userId: string | null;
}

export interface ControlResult {
  status: number;
  json?: { error?: string; code?: string; devices?: SpotifyDevice[] };
}

export interface ControlFlowDeps {
  getToken?: () => Promise<string>;
  fetchFn?: typeof fetch;
  db?: PrismaClient;
  getPreferred?: () => Promise<DefaultDevice | null>;
}

// Spotifys enhets-id: bara bokstäver och siffror.
const deviceId = z.string().regex(/^[A-Za-z0-9]{1,128}$/);
const bodySchema = z.union([
  // Vanliga kommandon. deviceId bara för "play" (val av enhet när ingen är aktiv).
  z
    .object({ action: z.enum(SPOTIFY_ACTIONS as unknown as [SpotifyAction, ...SpotifyAction[]]), deviceId: deviceId.optional() })
    .strict()
    .refine((v) => v.deviceId === undefined || v.action === "play"),
  z.object({ action: z.literal("devices") }).strict(),
  z.object({ action: z.literal("transfer"), deviceId, play: z.boolean() }).strict(),
]);

const STATUS: Record<ControlErrorCode, number> = { reauth: 409, scope: 409, no_device: 409, choose_device: 409, premium: 403, rate_limit: 429, failed: 502 };
const GENERIC = new ControlError("failed");

/**
 * Styr uppspelning. Ordning: tjänst, session, Origin, indata, och först därefter något anrop till tjänsten.
 * Etapp: bara Spotify. Efter ett lyckat kommando rensas tjänstens cache så att nästa hämtning ger färsk status.
 */
export async function handleControl(req: ControlRequest, deps: ControlFlowDeps = {}): Promise<ControlResult> {
  if (req.provider !== "spotify") return { status: 404, json: { error: "Okänd tjänst", code: "unknown" } };
  if (!req.userId) return { status: 401, json: { error: "Inte inloggad", code: "unauthenticated" } };
  if (!sameOrigin(req.origin, req.host)) return { status: 403, json: { error: "Ogiltigt ursprung", code: "origin" } };
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return { status: 400, json: { error: "Ogiltigt kommando", code: "invalid" } };

  const spotify = { getToken: deps.getToken ?? (() => getAccessToken("spotify")), fetchFn: deps.fetchFn };
  const body = parsed.data;
  try {
    if (body.action === "devices") return { status: 200, json: { devices: await listSpotifyDevices(spotify) } };
    if (body.action === "transfer") await transferSpotify(body.deviceId, body.play, spotify);
    else {
      const preferred = body.action === "play" && !body.deviceId ? await (deps.getPreferred ?? (() => getSpotifyDefaultDevice(deps.db ?? defaultDb)))() : null;
      await controlSpotify(body.action, spotify, body.deviceId, preferred);
    }
  } catch (e) {
    const err = e instanceof ReauthRequired ? new ControlError("reauth") : e instanceof ControlError ? e : GENERIC;
    return { status: STATUS[err.code], json: { error: err.message, code: err.code, ...(err.devices ? { devices: err.devices } : {}) } };
  }
  const db = deps.db ?? defaultDb;
  await db.snapshot.deleteMany({ where: { provider: "spotify" } });
  await db.providerBackoff.deleteMany({ where: { provider: "spotify" } });
  return { status: 204 };
}
