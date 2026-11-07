import "server-only";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { sameOrigin } from "./connect-flow";
import { getAccessToken, ReauthRequired } from "./connections";
import { db as defaultDb } from "./db";
import { ControlError, SPOTIFY_ACTIONS, controlSpotify, type ControlErrorCode } from "./providers/spotify-control";

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
  json?: { error: string; code: string; devices?: { id: string; name: string; type: string }[] };
}

export interface ControlFlowDeps {
  getToken?: () => Promise<string>;
  fetchFn?: typeof fetch;
  db?: PrismaClient;
}

const bodySchema = z
  .object({
    action: z.enum(SPOTIFY_ACTIONS as unknown as [string, ...string[]]),
    // Spotifys enhets-id: bara bokstäver och siffror. Endast för "play" (val av enhet när ingen är aktiv).
    deviceId: z.string().regex(/^[A-Za-z0-9]{1,128}$/).optional(),
  })
  .strict()
  .refine((v) => v.deviceId === undefined || v.action === "play");

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

  try {
    await controlSpotify(parsed.data.action as (typeof SPOTIFY_ACTIONS)[number], { getToken: deps.getToken ?? (() => getAccessToken("spotify")), fetchFn: deps.fetchFn }, parsed.data.deviceId);
  } catch (e) {
    const err = e instanceof ReauthRequired ? new ControlError("reauth") : e instanceof ControlError ? e : GENERIC;
    return { status: STATUS[err.code], json: { error: err.message, code: err.code, ...(err.devices ? { devices: err.devices } : {}) } };
  }
  await (deps.db ?? defaultDb).snapshot.deleteMany({ where: { provider: "spotify" } });
  return { status: 204 };
}
