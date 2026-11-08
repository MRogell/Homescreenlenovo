import { z } from "zod";

export const skodaSchema = z.object({
  rangeKm: z.number().nullable(),
  levelPct: z.number().min(0).max(100).nullable(),
  levelKind: z.enum(["battery", "fuel"]),
  locked: z.boolean().nullable(),
  charging: z.boolean(),
  parked: z.string().nullable(),
});
export const sonosSchema = z.object({
  groups: z.array(z.object({ id: z.string(), room: z.string(), members: z.array(z.string()), playing: z.boolean(), title: z.string(), artist: z.string(), volume: z.number().nullable() })),
});
export const spotifySchema = z.object({
  playing: z.boolean(),
  title: z.string(),
  artist: z.string(),
  device: z.string().nullable(),
  lastPlayedAt: z.string().nullable(),
  /** Spotify tar inte emot kommandon till den aktiva enheten (t.ex. vissa telefoner och Sonos). */
  deviceRestricted: z.boolean(),
  /** Spotify tillåter volymstyrning av den aktiva enheten. */
  supportsVolume: z.boolean(),
  volume: z.number().min(0).max(100).nullable(),
});
export const aegSchema = z.object({
  appliance: z.string(),
  state: z.string(),
  stateText: z.string(),
  program: z.string().nullable(),
  phase: z.string().nullable(),
  minutesLeft: z.number().nullable(),
  doneAt: z.string().nullable(),
  connected: z.boolean(),
  /** Electrolux `remoteControl`, t.ex. "ENABLED" (fjärrstart tillåten). Null om okänt. */
  remoteControl: z.string().nullable(),
});

export type SkodaData = z.infer<typeof skodaSchema>;
export type SonosData = z.infer<typeof sonosSchema>;
export type SpotifyData = z.infer<typeof spotifySchema>;
export type AegData = z.infer<typeof aegSchema>;

export const weatherSchema = z.object({
  place: z.string(),
  tempC: z.number(),
  code: z.number(),
  text: z.string(),
  windMs: z.number().nullable(),
  aqi: z.number().nullable(),
  aqiLabel: z.string().nullable(),
});
export type WeatherData = z.infer<typeof weatherSchema>;

export const tadoSchema = z.object({
  rooms: z.array(z.object({ name: z.string(), tempC: z.number().nullable(), humidity: z.number().nullable(), targetC: z.number().nullable(), heating: z.boolean() })),
});
export type TadoData = z.infer<typeof tadoSchema>;
